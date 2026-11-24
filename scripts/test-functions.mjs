// Update 49 and 52: the Netlify Functions (two for WhatsApp sending, one scheduled email) exactly as Netlify will build and run them,
// and the setup guides matching the code.
//   * each file in netlify/functions is bundled with esbuild (what Netlify does at deploy time), so a missing import or a
//     piece of browser-only code fails HERE and not on the live site;
//   * the bundle is then loaded as a separate program and called with real Request objects, with pretend versions of
//     WhatsApp and the database behind fetch, to show that the settings are read from the environment and that the whole
//     path works from the front door;
//   * netlify.toml, .env.example, WHATSAPP-SETUP.md and EMAIL-ALERT-SETUP.md are compared with the code, so the instructions
//     cannot drift from what the server really asks for.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RECEIPT_TEMPLATE } from '../src/lib/whatsappTemplate.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const here = (p) => fileURLToPath(new URL('../' + p, import.meta.url))
const read = (p) => readFileSync(here(p), 'utf8')

let build
try { ({ build } = await import('esbuild')) } catch (e) { console.error('FAIL esbuild is needed to build the functions (it comes with Vite):', e.message); process.exit(1) }

// ---- bundle every function, the way Netlify does ------------------------------------------------------------------------
const files = readdirSync(here('netlify/functions')).filter((f) => f.endsWith('.mjs')).sort()
const bundles = {}
await ok('there are exactly the three functions: the 5:31 pm email and the two WhatsApp ones', () => assert.deepEqual(files, ['late-payments-alert.mjs', 'whatsapp-send.mjs', 'whatsapp-webhook.mjs']))
for (const file of files) {
  await ok(`${file} bundles, and stays small (it does not pull in the app)`, async () => {
    const out = await build({ entryPoints: [here(`netlify/functions/${file}`)], bundle: true, platform: 'node', format: 'esm', target: 'node20', write: false, logLevel: 'silent' })
    const text = out.outputFiles[0].text
    bundles[file] = text
    assert.ok(text.length < 150000, `bundle is ${text.length} bytes`)
    assert.ok(!/from\s*["'](react|react-dom|exceljs|recharts|@supabase\/supabase-js|lucide-react)["']/.test(text), 'a browser library was pulled in')
    assert.ok(!/\bdocument\.|\bwindow\./.test(text), 'browser-only code was pulled in')
    assert.ok(/export\s*\{[^}]*\bdefault\b/.test(text) || /export default/.test(text), 'the function must export a default handler')
  })
}
const load = (file) => import(`data:text/javascript;base64,${Buffer.from(bundles[file]).toString('base64')}`)
const send = await load('whatsapp-send.mjs')
const hook = await load('whatsapp-webhook.mjs')
const alert = await load('late-payments-alert.mjs')

// ---- pretend WhatsApp and database, behind fetch ---------------------------------------------------------------------------
const ENV = {
  VITE_SUPABASE_URL: 'https://proj.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key-123', SUPABASE_SERVICE_ROLE_KEY: 'service-key-SECRET',
  WHATSAPP_ACCESS_TOKEN: 'EAAG-token-SECRET', WHATSAPP_PHONE_NUMBER_ID: '1055555555', WHATSAPP_BUSINESS_ACCOUNT_ID: '2066666666',
  WHATSAPP_APP_SECRET: 'app-secret-SECRET', WHATSAPP_VERIFY_TOKEN: 'verify-me-SECRET',
  RESEND_API_KEY: 're_resend-key-SECRET', ALERT_APP_URL: 'https://snsjobcard.netlify.app',
}
Object.assign(process.env, ENV)
const SITE = 'https://sns.example.netlify.app'
const FILE = '0123456789abcdef0123456789abcdef/Receipt-SNS-26-1008.pdf'
const PDF = new Uint8Array([...Buffer.from('%PDF-1.4\n'), ...Buffer.alloc(600, 32)])
const RECEIPT = { id: 5, customer_id: 1, customer_name: 'Amina Hassan', customer_contact: '0700 000 000', receipt_no: 'SNS/26/1008', mpesa_code: 'UKL41383DB', amount: 2000, paid_at: '2026-11-21T14:50:00+00:00', expires_on: '2026-12-21', days_covered: 30 }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
// what is unpaid, for the 5:31 pm email: two people owed transport (1,200 in all) and one purchase waiting for payment (3,500)
let ALERT_JOBS = [{ id: 1, member_id: 'm1', transport_amount: 500, transport_paid_at: null }, { id: 2, member_id: 'm1', transport_amount: 200, transport_paid_at: null }, { id: 3, member_id: 'm2', transport_amount: 500, transport_paid_at: null }]
let ALERT_EXPENSES = [{ id: 1, entry_type: 'purchase', status: 'Purchased', amount: 3500, paid_at: null }]

let calls = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, method: init.method || 'GET', body: init.body, headers: init.headers || {} })
  if (u.endsWith('/auth/v1/user')) return json({ id: 'user-1' })
  if (u.endsWith('/rest/v1/rpc/is_admin')) return json(true)
  if (u.includes('/rest/v1/customer_receipts?id=eq.5')) return json([RECEIPT])
  if (u.includes('/rest/v1/customers?id=eq.1')) return json([{ first_name: 'Amina', contact: '0712 345 678' }])
  if (u.includes('/rest/v1/receipt_messages?select=id')) return json([])
  if (u.endsWith('/rest/v1/rpc/begin_receipt_message')) return json({ ok: true, id: '11111111-1111-4111-8111-111111111111' })
  if (u.endsWith('/rest/v1/rpc/finish_receipt_message')) return new Response(null, { status: 204 })
  if (u.endsWith('/rest/v1/rpc/record_whatsapp_status')) return json('applied')
  if (u.includes('/storage/v1/object/public/customer-receipts/')) return new Response(PDF, { status: 200 })
  if (u === 'https://graph.facebook.com/v24.0/1055555555/media') return json({ id: 'MEDIA-1' })
  if (u === 'https://graph.facebook.com/v24.0/1055555555/messages') return json({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.TESTID' }] })
  if (u.startsWith('https://graph.facebook.com/v24.0/1055555555?')) return json({ display_phone_number: '+254 700 000 000', verified_name: 'Swahili Net Solution', quality_rating: 'GREEN' })
  if (u.startsWith('https://graph.facebook.com/v24.0/2066666666/message_templates')) return json({ data: [{ name: 'sns_payment_receipt', status: 'APPROVED', language: 'en', category: 'UTILITY' }] })
  if (u.startsWith('https://proj.supabase.co/rest/v1/non_working_days?')) return json([])
  if (u.startsWith('https://proj.supabase.co/rest/v1/jobs?select=id,member_id,transport_amount')) return json(ALERT_JOBS)
  if (u.startsWith('https://proj.supabase.co/rest/v1/expenses?select=id,entry_type,status,amount')) return json(ALERT_EXPENSES)
  if (u.startsWith('https://proj.supabase.co/rest/v1/profiles?select=full_name,email')) return json([{ full_name: 'Naibei Gathuita', email: 'naibei@example.com' }])
  if (u === 'https://api.resend.com/emails') return json({ id: 'RESEND-1' })
  return json({ message: `unexpected request: ${u}` }, 500)
}
const request = (path, { method = 'GET', body, headers = {} } = {}) => new Request(`${SITE}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
const signed = (raw, secret = ENV.WHATSAPP_APP_SECRET) => ({ 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex') })
const admin = { Authorization: 'Bearer jwt-of-an-admin' }

// ---- the send function, from the front door ----------------------------------------------------------------------------------
await ok('send: nobody signed in is turned away before anything is read', async () => {
  calls = []
  const res = await send.default(request('/.netlify/functions/whatsapp-send?action=status'))
  assert.equal(res.status, 401)
  assert.equal(calls.length, 0)
})
await ok('send: the settings come from the environment (the VITE_ database settings are reused)', async () => {
  const res = await send.default(request('/.netlify/functions/whatsapp-send?action=status', { headers: admin }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.configured, true); assert.equal(body.webhookReady, true); assert.deepEqual(body.missing, [])
})
await ok('send: a receipt goes to WhatsApp with its PDF, in the approved template, with the right words', async () => {
  calls = []
  const res = await send.default(request('/.netlify/functions/whatsapp-send', { method: 'POST', headers: admin, body: { receiptId: 5, filePath: FILE } }))
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
  const body = await res.json()
  assert.equal(body.ok, true); assert.equal(body.wamid, 'wamid.TESTID'); assert.equal(body.to, '254712345678'); assert.equal(body.status, 'accepted')
  const upload = calls.find((c) => c.url.endsWith('/1055555555/media'))
  assert.ok(upload && upload.body instanceof FormData, 'the PDF is uploaded to WhatsApp first')
  const message = calls.find((c) => c.url.endsWith('/1055555555/messages'))
  const payload = JSON.parse(message.body)
  assert.equal(payload.to, '254712345678'); assert.equal(payload.type, 'template')
  assert.equal(payload.template.name, 'sns_payment_receipt'); assert.equal(payload.template.language.code, 'en')
  const [header, text] = payload.template.components
  assert.equal(header.parameters[0].document.id, 'MEDIA-1'); assert.equal(header.parameters[0].document.filename, 'Receipt-SNS-26-1008.pdf')
  assert.deepEqual(text.parameters.map((p) => p.text), ['Amina', 'Ksh 2,000.00', 'UKL41383DB', '21 Nov 2026 at 05:50 PM', 'SNS/26/1008', '21 Dec 2026'])
  assert.ok(message.headers.Authorization === `Bearer ${ENV.WHATSAPP_ACCESS_TOKEN}`, 'the access token is only ever sent to WhatsApp')
  assert.ok(calls.some((c) => c.url.endsWith('/rpc/begin_receipt_message')) && calls.some((c) => c.url.endsWith('/rpc/finish_receipt_message')), 'the message is logged before and after')
})
await ok('send: the answer never contains a secret', async () => {
  const res = await send.default(request('/.netlify/functions/whatsapp-send', { method: 'POST', headers: admin, body: { receiptId: 5, filePath: FILE } }))
  const text = await res.text()
  for (const secret of ['service-key-SECRET', 'EAAG-token-SECRET', 'app-secret-SECRET', 'verify-me-SECRET']) assert.ok(!text.includes(secret), secret)
})
await ok('send: the set-up check goes through every step and is ready', async () => {
  const res = await send.default(request('/.netlify/functions/whatsapp-send?action=check', { headers: admin }))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.checks.map((c) => c.id), ['settings', 'webhook_settings', 'database', 'number', 'template'])
  assert.deepEqual(body.checks.map((c) => c.state), ['ok', 'ok', 'ok', 'ok', 'ok'])
  assert.equal(body.ready, true)
})
await ok('send: with a setting missing the check says which, and nothing can be sent', async () => {
  const saved = process.env.WHATSAPP_ACCESS_TOKEN
  delete process.env.WHATSAPP_ACCESS_TOKEN
  try {
    const status = await (await send.default(request('/.netlify/functions/whatsapp-send?action=status', { headers: admin }))).json()
    assert.equal(status.configured, false); assert.deepEqual(status.missing, ['WHATSAPP_ACCESS_TOKEN'])
    const res = await send.default(request('/.netlify/functions/whatsapp-send', { method: 'POST', headers: admin, body: { receiptId: 5, filePath: FILE } }))
    assert.equal(res.status, 503)
  } finally { process.env.WHATSAPP_ACCESS_TOKEN = saved }
})

// ---- the webhook, from the front door ----------------------------------------------------------------------------------------
await ok('webhook: Meta\'s handshake is answered with its number, and only for the right verify token', async () => {
  const good = await hook.default(request(`/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${ENV.WHATSAPP_VERIFY_TOKEN}&hub.challenge=1158201444`))
  assert.equal(good.status, 200); assert.equal(await good.text(), '1158201444')
  const bad = await hook.default(request('/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1158201444'))
  assert.equal(bad.status, 403)
})
const news = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '2066666666', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: [{ id: 'wamid.TESTID', status: 'delivered', timestamp: '1795000000', recipient_id: '254712345678' }] } }] }] })
await ok('webhook: news with a wrong or missing signature is refused and writes nothing', async () => {
  calls = []
  const wrong = await hook.default(request('/.netlify/functions/whatsapp-webhook', { method: 'POST', body: news, headers: signed(news, 'not-the-secret') }))
  assert.equal(wrong.status, 401)
  const none = await hook.default(request('/.netlify/functions/whatsapp-webhook', { method: 'POST', body: news }))
  assert.equal(none.status, 401)
  assert.equal(calls.length, 0)
})
await ok('webhook: signed news moves the message on in the log', async () => {
  calls = []
  const res = await hook.default(request('/.netlify/functions/whatsapp-webhook', { method: 'POST', body: news, headers: signed(news) }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, applied: 1, ignored: 0, unknown: 0 })
  const rpc = calls.find((c) => c.url.endsWith('/rpc/record_whatsapp_status'))
  assert.deepEqual(JSON.parse(rpc.body), { p_wamid: 'wamid.TESTID', p_status: 'delivered', p_at: '2026-11-18T11:06:40.000Z', p_code: null, p_text: null })
  assert.ok(rpc.headers.apikey === ENV.SUPABASE_SERVICE_ROLE_KEY, 'the log is written with the service key, which only the server holds')
})

// ---- the 5:31 pm late-payment email, from the front door ----------------------------------------------------------------------
// the function writes one line to Netlify's log; catch it here so the test output stays clean, and so it can be checked for secrets
const captureLog = async (fn) => {
  const lines = [], saved = console.log
  console.log = (...args) => lines.push(args.join(' '))
  try { return { value: await fn(), lines } } finally { console.log = saved }
}
await ok('late payments: Netlify reads the schedule from the built function: 14:31 UTC, which is 5:31 pm in Nairobi, Monday to Saturday', async () => {
  const mod = await load('late-payments-alert.mjs')
  assert.deepEqual(mod.config, { schedule: '31 14 * * 1-6' })
  assert.equal(typeof mod.default, 'function')
})
await ok('late payments: when it runs, the Director is emailed through Resend with what is unpaid, and the answer holds no secret', async () => {
  calls = []
  const { value: res, lines } = await captureLog(() => alert.default())
  assert.equal(res.status, 200)
  assert.equal(lines.length, 1); assert.match(lines[0], /^late-payments-alert: email sent to 1 address: KSh 4,700 unpaid/)
  for (const secret of [ENV.SUPABASE_SERVICE_ROLE_KEY, ENV.RESEND_API_KEY]) assert.ok(!lines[0].includes(secret), 'the log line holds no secret')
  const text = await res.text()
  const body = JSON.parse(text)
  assert.equal(body.ok, true); assert.equal(body.sent, true); assert.equal(body.totalCents, 470000); assert.equal(body.id, 'RESEND-1')
  const mail = calls.filter((c) => c.url === 'https://api.resend.com/emails')
  assert.equal(mail.length, 1)
  const payload = JSON.parse(mail[0].body)
  assert.deepEqual(payload.to, ['naibei@example.com'])
  assert.match(payload.subject, /Late payments: KSh 4,700 unpaid after closing$/)
  assert.match(payload.text, /Hello Naibei,\n\nThese payments are still unpaid after the 5:30 pm closing time:\n\n- Transport: KSh 1,200 \(2 staff members\)\n- Expenses \/ purchases: KSh 3,500 \(1 request\)\n\nOpen Job Cards to pay: https:\/\/snsjobcard\.netlify\.app\n/)
  assert.equal(mail[0].headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`)
  const database = calls.filter((c) => c.url.startsWith('https://proj.supabase.co/rest/v1/'))
  assert.ok(database.length >= 4 && database.every((c) => c.headers.apikey === ENV.SUPABASE_SERVICE_ROLE_KEY), 'what is unpaid is read with the server key')
  assert.ok(!calls.some((c) => c.url.startsWith('https://graph.facebook.com')), 'the email never touches WhatsApp')
  for (const secret of [ENV.SUPABASE_SERVICE_ROLE_KEY, ENV.RESEND_API_KEY, ENV.WHATSAPP_ACCESS_TOKEN]) assert.ok(!text.includes(secret), secret)
})
await ok('late payments: with everything paid no email is sent', async () => {
  const saved = [ALERT_JOBS, ALERT_EXPENSES]
  ALERT_JOBS = []; ALERT_EXPENSES = []
  try {
    calls = []
    const { value: res, lines } = await captureLog(() => alert.default())
    assert.deepEqual(await res.json(), { ok: true, sent: false, reason: 'nothing_unpaid' })
    assert.deepEqual(lines, ['late-payments-alert: nothing is unpaid, so no email.'])
    assert.ok(!calls.some((c) => c.url === 'https://api.resend.com/emails'))
  } finally { [ALERT_JOBS, ALERT_EXPENSES] = saved }
})
await ok('late payments: without its Resend key it stops and says which setting to add (the function fails, so Netlify logs it)', async () => {
  const saved = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    calls = []
    await assert.rejects(() => alert.default(), /Add RESEND_API_KEY under Netlify/)
    assert.equal(calls.length, 0)
  } finally { process.env.RESEND_API_KEY = saved }
})

// ---- the files around the code ---------------------------------------------------------------------------------------------------
await ok('netlify.toml builds the functions from netlify/functions and still has the single-page redirect', () => {
  const toml = read('netlify.toml')
  assert.match(toml, /\[functions\][^[]*directory\s*=\s*"netlify\/functions"/)
  assert.match(toml, /node_bundler\s*=\s*"esbuild"/)
  assert.match(toml, /\[\[redirects\]\][^[]*from\s*=\s*"\/\*"/)
  assert.match(toml, /command\s*=\s*"npm run build"/); assert.match(toml, /publish\s*=\s*"dist"/)
})
const readNames = [...new Set([...read('netlify/lib/config.mjs').matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))].sort()
await ok('every setting the server reads is in .env.example and explained in WHATSAPP-SETUP.md', () => {
  assert.ok(readNames.includes('WHATSAPP_ACCESS_TOKEN') && readNames.includes('SUPABASE_SERVICE_ROLE_KEY') && readNames.length >= 10, readNames.join(', '))
  const example = read('.env.example'); const guide = read('WHATSAPP-SETUP.md')
  for (const name of readNames) {
    assert.ok(new RegExp(`^#?\\s*${name}=`, 'm').test(example), `${name} is not in .env.example`)
    assert.ok(guide.includes(name), `${name} is not in WHATSAPP-SETUP.md`)
  }
})
const alertNames = [...new Set([...read('netlify/lib/alertConfig.mjs').matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))].sort()
await ok('every setting the late-payment email reads is in .env.example and explained in EMAIL-ALERT-SETUP.md (except Netlify\'s own URL)', () => {
  assert.ok(alertNames.includes('RESEND_API_KEY') && alertNames.includes('SUPABASE_SERVICE_ROLE_KEY') && alertNames.length >= 8, alertNames.join(', '))
  const example = read('.env.example'); const guide = read('EMAIL-ALERT-SETUP.md')
  for (const name of alertNames.filter((x) => x !== 'URL')) {
    assert.ok(new RegExp(`^#?\\s*${name}=`, 'm').test(example), `${name} is not in .env.example`)
    assert.ok(guide.includes(name), `${name} is not in EMAIL-ALERT-SETUP.md`)
  }
})
await ok('the secrets are never given a VITE_ name (that would put them in the page everyone downloads)', () => {
  for (const name of [...readNames, ...alertNames]) assert.ok(!(/^VITE_/.test(name) && /SERVICE|TOKEN|SECRET|KEY/.test(name) && !/ANON/.test(name)), name)
  const example = read('.env.example')
  assert.ok(!/^\s*VITE_[A-Z_]*(SERVICE|SECRET|TOKEN)/m.test(example))
  assert.ok(!/^[A-Z_]+=\S*(EAAG|sb_secret_|eyJ)/m.test(example), 'no real-looking value in the example file')
})
await ok('the template in WHATSAPP-SETUP.md is word for word the one the app sends', () => {
  const guide = read('WHATSAPP-SETUP.md')
  const body = /\*\*Body\*\*[^`]*```\n([\s\S]*?)\n```/.exec(guide)
  assert.ok(body, 'the body block is in the guide')
  assert.equal(body[1], RECEIPT_TEMPLATE.body)
  assert.ok(guide.includes(`\`${RECEIPT_TEMPLATE.name}\``)); assert.ok(guide.includes(`\`${RECEIPT_TEMPLATE.footer}\``))
  assert.ok(/\|\s*Category\s*\|\s*\*\*Utility\*\*/.test(guide)); assert.ok(/\|\s*Language\s*\|\s*\*\*English\*\*\s*\(`en`\)/.test(guide))
  RECEIPT_TEMPLATE.samples.forEach((sample, i) => assert.ok(guide.includes(`| \`{{${i + 1}}}\` |`) && guide.includes(`\`${sample}\``), `sample ${i + 1}: ${sample}`))
})
await ok('the guide and the README point at the delivery address the function really has', () => {
  assert.ok(read('WHATSAPP-SETUP.md').includes('/.netlify/functions/whatsapp-webhook'))
  assert.ok(read('README.md').includes('/.netlify/functions/whatsapp-webhook'))
  assert.ok(read('.env.example').includes('/.netlify/functions/whatsapp-webhook'))
  assert.ok(read('WHATSAPP-SETUP.md').includes(`\`${RECEIPT_TEMPLATE.name}\``))
})
await ok('the test chain runs this file', () => {
  assert.match(JSON.parse(read('package.json')).scripts.test, /node scripts\/test-functions\.mjs/)
})

console.log(`\n${n} function checks passed`)
