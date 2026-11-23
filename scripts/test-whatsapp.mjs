// Update 49: sending receipts through the WhatsApp Business API.
// The real server code (netlify/lib, the same code the Netlify functions run) is run against PRETEND versions of WhatsApp and of
// the database, so every step can be checked without a phone number, a token or a network: who may send, what is asked of
// WhatsApp and in what order, what is written to the message log, what happens when WhatsApp says no, and how WhatsApp's news
// about delivery is checked and recorded. The database rules themselves are in supabase/update-49-migration.sql (checked
// here for the names the server relies on, and run against a real PostgreSQL by the maintainer's database tests).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RECEIPT_TEMPLATE, blankNumbers, cleanParam, renderTemplate, templateParams, templatePayload } from '../src/lib/whatsappTemplate.js'
import { explainWhatsappError } from '../src/lib/whatsappErrors.js'
import { makeReceiptPdf, receiptModel } from '../src/lib/receipts.js'
import { DEFAULT_API_VERSION, readConfig } from '../netlify/lib/config.mjs'
import { keyHeaders } from '../netlify/lib/supabaseRest.mjs'
import { PDF_PATH, TIME_BUDGET_MS, handleSend } from '../netlify/lib/receiptSend.mjs'
import { extractStatuses, handleWebhook, sign, verifySignature } from '../netlify/lib/webhook.mjs'
import { CHECK_TIMEOUT_MS, QUICK_TIMEOUT_MS, SEND_ENDPOINT, SEND_TIMEOUT_MS, getWhatsappStatus, runWhatsappCheck, sendReceiptViaApi } from '../src/lib/whatsappApi.js'
import { QUEUED_GIVE_UP_MS, describeMessage, messagesByReceipt } from '../src/lib/receiptMessages.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

const SITE = 'https://sns.example.netlify.app'
const PAID = '2026-11-21T14:50:00.000Z'
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key-123', SUPABASE_SERVICE_ROLE_KEY: 'service-key-SECRET',
  WHATSAPP_ACCESS_TOKEN: 'EAAG-token-SECRET', WHATSAPP_PHONE_NUMBER_ID: '1055555555', WHATSAPP_BUSINESS_ACCOUNT_ID: '2066666666',
  WHATSAPP_APP_SECRET: 'app-secret-SECRET', WHATSAPP_VERIFY_TOKEN: 'verify-me-SECRET',
}
const SECRETS = ['service-key-SECRET', 'EAAG-token-SECRET', 'app-secret-SECRET', 'verify-me-SECRET']
const FILE = '0123456789abcdef0123456789abcdef/Receipt-SNS-26-1008.pdf'
const RECEIPT = { id: 5, customer_id: 1, customer_name: 'Amina Hassan', customer_contact: '0700 000 000', receipt_no: 'SNS/26/1008', mpesa_code: 'UKL41383DB', amount: 2000, paid_at: PAID, expires_on: '2026-12-21', days_covered: 30 }
const CUSTOMER = { first_name: 'Amina', contact: '0712 345 678' }
const PDF = await makeReceiptPdf(receiptModel({ customerName: 'Amina Hassan', paidAt: PAID, amount: 2000, code: 'UKL41383DB', receiptNo: 'SNS/26/1008' }), { createdAt: new Date('2026-11-23T08:00:00Z') })

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const metaError = (code, message, details, status = 400) => jsonResponse({ error: { message, type: 'OAuthException', code, error_data: details ? { messaging_product: 'whatsapp', details } : undefined, fbtrace_id: 'abc' } }, status)

// ---- a pretend WhatsApp + a pretend database ---------------------------------------------------------------------------------
function makeWorld(opts = {}) {
  const w = {
    env: { ...ENV, ...(opts.env || {}) },
    users: { 'jwt-admin': { id: 'u-admin', admin: true }, 'jwt-tech': { id: 'u-tech', admin: false }, ...(opts.users || {}) },
    receipt: opts.receipt === undefined ? { ...RECEIPT } : opts.receipt,
    customer: opts.customer === undefined ? { ...CUSTOMER } : opts.customer,
    files: new Map(opts.files || [[FILE, PDF]]),
    begin: opts.begin || 'ok',                  // 'ok' | 'busy' | 'rate' | 'error'
    finishFails: Boolean(opts.finishFails),
    dbMissing: Boolean(opts.dbMissing),
    graph: { upload: null, send: null, number: null, templates: null, ...(opts.graph || {}) },
    statusAnswers: [...(opts.statusAnswers || [])],
    calls: [], logs: [], uploads: [], sends: [], rpc: [], errors: [],
  }
  w.log = (...args) => w.errors.push(args.join(' '))
  w.fetch = async (url, init = {}) => {
    const u = new URL(url)
    const headers = Object.fromEntries(new Headers(init.headers || {}))
    const method = init.method || 'GET'
    w.calls.push({ method, host: u.host, path: u.pathname, search: u.search, headers, body: init.body })
    const bearer = (headers.authorization || '').replace(/^Bearer /, '')
    // ---- WhatsApp (Meta's Graph API) ----
    if (u.host === 'graph.facebook.com') {
      const [, ver, id, tail] = u.pathname.split('/')
      assert.equal(ver, w.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION, 'the version in the address')
      if (bearer !== ENV.WHATSAPP_ACCESS_TOKEN) return metaError(190, 'Invalid OAuth access token - Cannot parse access token')
      if (w.graph.hang && (w.graph.hang === true || w.graph.hang === tail)) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
      if (w.graph.networkDown) throw new TypeError('fetch failed')
      if (id === ENV.WHATSAPP_PHONE_NUMBER_ID && tail === 'media' && method === 'POST') {
        const form = init.body
        assert.ok(form instanceof FormData, 'the PDF is sent as a form')
        const file = form.get('file')
        w.uploads.push({ fields: { messaging_product: form.get('messaging_product'), type: form.get('type') }, name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()), contentType: headers['content-type'] })
        return w.graph.upload ? w.graph.upload(w) : jsonResponse({ id: 'MEDIA-777' })
      }
      if (id === ENV.WHATSAPP_PHONE_NUMBER_ID && tail === 'messages' && method === 'POST') {
        assert.equal(headers['content-type'], 'application/json')
        const sent = JSON.parse(init.body); w.sends.push(sent)
        return w.graph.send ? w.graph.send(w, sent) : jsonResponse({ messaging_product: 'whatsapp', contacts: [{ input: sent.to, wa_id: sent.to }], messages: [{ id: 'wamid.HBgM-TEST-1' }] })
      }
      if (id === ENV.WHATSAPP_PHONE_NUMBER_ID && !tail && method === 'GET') return w.graph.number ? w.graph.number(w) : jsonResponse({ display_phone_number: '+254 700 111 222', verified_name: 'Swahili Net Solution', quality_rating: 'GREEN', id })
      if (id === ENV.WHATSAPP_BUSINESS_ACCOUNT_ID && tail === 'message_templates' && method === 'GET') {
        return w.graph.templates ? w.graph.templates(w, u) : jsonResponse({ data: [{ name: 'sns_payment_receipt', status: 'APPROVED', language: 'en', category: 'UTILITY', id: 't1' }] })
      }
      return jsonResponse({ error: { message: `Unknown path ${u.pathname}`, code: 100 } }, 404)
    }
    // ---- the database ----
    if (u.host === 'proj.supabase.co') {
      const p = u.pathname
      if (p === '/auth/v1/user') {
        if (headers.apikey !== ENV.SUPABASE_ANON_KEY) return jsonResponse({ msg: 'No API key found in request' }, 401)
        const user = w.users[bearer]
        return user ? jsonResponse({ id: user.id, email: 'a@b.c' }) : jsonResponse({ msg: 'invalid JWT' }, 401)
      }
      if (p.startsWith('/rest/v1/rpc/')) {
        const name = p.slice('/rest/v1/rpc/'.length)
        if (name === 'is_admin') { const user = w.users[bearer]; return jsonResponse(user ? user.admin : false) }
        // everything else is the server's own call: it must come with the service key
        if (headers.apikey !== ENV.SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ message: 'permission denied for function ' + name, code: '42501' }, 401)
        const args = JSON.parse(init.body || '{}'); w.rpc.push({ name, args, headers })
        if (name === 'begin_receipt_message') {
          if (w.begin === 'error') return jsonResponse({ message: 'boom' }, 500)
          if (w.begin !== 'ok') return jsonResponse({ ok: false, reason: w.begin })
          const row = { id: `log-${w.logs.length + 1}`, receipt_id: args.p_receipt_id, recipient: args.p_recipient, status: 'queued', wa_message_id: null, error_code: null, error_text: null }
          w.logs.push(row); return jsonResponse({ ok: true, id: row.id })
        }
        if (name === 'finish_receipt_message') {
          if (w.finishFails) return jsonResponse({ message: 'boom' }, 500)
          const row = w.logs.find((l) => l.id === args.p_id)
          if (args.p_wamid) { row.wa_message_id = args.p_wamid; row.status = 'accepted' } else { row.status = 'failed'; row.error_code = args.p_code; row.error_text = args.p_text }
          return new Response(null, { status: 204 })
        }
        if (name === 'record_whatsapp_status') {
          if (w.statusAnswers.length) { const a = w.statusAnswers.shift(); return a === 'error' ? jsonResponse({ message: 'boom' }, 500) : jsonResponse(a) }
          return jsonResponse('applied')
        }
        return jsonResponse({ message: 'no such function' }, 404)
      }
      if (p === '/rest/v1/customer_receipts') {
        const user = w.users[bearer]
        const id = Number(/^eq\.(\d+)$/.exec(u.searchParams.get('id') || '')?.[1])
        return jsonResponse(user && user.admin && w.receipt && w.receipt.id === id ? [w.receipt] : [])
      }
      if (p === '/rest/v1/customers') return jsonResponse(w.users[bearer] && w.customer && Number(/^eq\.(\d+)$/.exec(u.searchParams.get('id') || '')?.[1]) === 1 ? [w.customer] : [])
      if (p === '/rest/v1/receipt_messages') {
        if (headers.apikey !== ENV.SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ message: 'permission denied' }, 401)
        return w.dbMissing ? jsonResponse({ code: '42P01', message: 'relation "public.receipt_messages" does not exist' }, 404) : jsonResponse([])
      }
      if (p.startsWith('/storage/v1/object/public/customer-receipts/')) {
        const bytes = w.files.get(p.slice('/storage/v1/object/public/customer-receipts/'.length))
        return bytes ? new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } }) : jsonResponse({ message: 'Object not found' }, 404)
      }
    }
    throw new Error(`unexpected request: ${method} ${url}`)
  }
  w.deps = (extra = {}) => ({ env: w.env, fetch: w.fetch, log: w.log, ...extra })
  return w
}
const sendRequest = (body, { jwt = 'jwt-admin', method = 'POST', query = '' } = {}) => new Request(`${SITE}/.netlify/functions/whatsapp-send${query}`, {
  method, headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
})
const send = async (w, body = { receiptId: 5, filePath: FILE }, opts) => { const res = await handleSend(sendRequest(body, opts), w.deps()); return { status: res.status, body: await res.json() } }
const graphCalls = (w) => w.calls.filter((c) => c.host === 'graph.facebook.com')
// a server that waits for ever on a silent WhatsApp must FAIL the test, not hang it
const realSetTimeout = globalThis.setTimeout
const within = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => realSetTimeout(() => reject(new Error(what)), ms).unref())])
// Runs `fn` while noting how long every wait was set to, and lets each wait run out after 20 ms, so a silent WhatsApp can be tested without waiting.
async function recordingWaits(fn) {
  const asked = []
  globalThis.setTimeout = (callback, ms, ...rest) => { asked.push(ms); return realSetTimeout(callback, Math.min(ms, 20), ...rest) }
  try { return { result: await fn(), asked } } finally { globalThis.setTimeout = realSetTimeout }
}
const noSecrets = (value) => { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const s of SECRETS) assert.ok(!text.includes(s), `the response must never contain a secret (${s})`) }

// ======================================================================================================================
// 1. The message template and the words of WhatsApp's errors
// ======================================================================================================================
await ok('the receipt template: a UTILITY template with the PDF in the header and six numbered blanks, none at the very start or end', () => {
  const t = RECEIPT_TEMPLATE
  assert.equal(t.name, 'sns_payment_receipt'); assert.equal(t.language, 'en'); assert.equal(t.category, 'UTILITY'); assert.equal(t.header, 'DOCUMENT')
  assert.deepEqual(blankNumbers(t.body), [1, 2, 3, 4, 5, 6])
  assert.equal(t.samples.length, 6); assert.equal(t.fields.length, 6)
  assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*\.?\s*$/.test(t.body), 'WhatsApp refuses a blank at the very start or end')
  assert.ok(t.body.length < 1024 && t.footer.length <= 60)
  assert.ok(/valid for 30 days and expires on \{\{6\}\}/.test(t.body))
  assert.ok(!/fast\. reliable|always connected|offer|discount|promo/i.test(t.body + t.footer), 'plain and transactional, so Meta files it as UTILITY')
  assert.ok(!/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(t.body), 'no two blanks side by side')
})

await ok('the six blanks are filled with the receipt\'s facts, and the sentence reads right', () => {
  const p = templateParams({ firstName: 'Amina', amount: 2000, code: 'UKL41383DB', paidAt: PAID, receiptNo: 'SNS/26/1008', expiresOn: '2026-12-21' })
  assert.deepEqual(p, ['Amina', 'Ksh 2,000.00', 'UKL41383DB', '21 Nov 2026 at 05:50 PM', 'SNS/26/1008', '21 Dec 2026'])
  assert.equal(renderTemplate(p), [
    'Hello Amina, thank you for your payment of Ksh 2,000.00 (M-Pesa ref UKL41383DB), received on 21 Nov 2026 at 05:50 PM.', '',
    'Your receipt, invoice no. SNS/26/1008, is attached. Your internet subscription is valid for 30 days and expires on 21 Dec 2026.', '', 'Thank you.',
  ].join('\n'))
  assert.equal(renderTemplate(p, RECEIPT_TEMPLATE.body), renderTemplate(p))
  assert.equal(renderTemplate(['x'], 'a {{1}} b {{2}}'), 'a x b {{2}}')
  // the sample values Meta is shown are the same shape as real ones
  assert.equal(renderTemplate(RECEIPT_TEMPLATE.samples).includes('{{'), false)
  assert.deepEqual(templateParams({ firstName: '  ', amount: 1, code: 'X', paidAt: PAID, receiptNo: '1', expiresOn: '2026-12-21' })[0], 'there')
  assert.equal(templateParams({ firstName: 'Zuri', amount: 1, code: 'X', paidAt: '2026-12-31T21:30:00Z', receiptNo: '1', expiresOn: '2027-01-30' })[3], '1 Jan 2027 at 12:30 AM')
})

await ok('a value that goes into a blank never has a line break, a tab, a run of spaces, or nothing at all (WhatsApp refuses those)', () => {
  assert.equal(cleanParam('  Ami\nna\t Hassan  '), 'Ami na Hassan')
  assert.equal(cleanParam('a    b'), 'a b')
  assert.equal(cleanParam(''), '-'); assert.equal(cleanParam(null), '-'); assert.equal(cleanParam(undefined), '-'); assert.equal(cleanParam('  \n '), '-')
  assert.equal(cleanParam('', { fallback: 'there' }), 'there')
  assert.equal(cleanParam('x'.repeat(500)).length, 120)
  assert.equal(cleanParam('ab cd', { max: 3 }), 'ab')
  assert.equal(cleanParam(`a b`), 'a b')
  const p = templateParams({ firstName: 'Bob\nMwangi', amount: 5, code: 'AB\tC', paidAt: PAID, receiptNo: 'SNS/26/1', expiresOn: '2026-12-21' })
  for (const v of p) assert.ok(v.length > 0 && !/[\n\t\r]/.test(v) && !/ {2}/.test(v), JSON.stringify(v))
})

await ok('the request to WhatsApp names the template, the PDF (by its uploaded id, with the receipt\'s file name) and the six values', () => {
  const params = RECEIPT_TEMPLATE.samples
  assert.deepEqual(templatePayload({ to: '254712345678', mediaId: 'M1', receiptNo: 'SNS/26/1008', params }), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '254712345678', type: 'template',
    template: { name: 'sns_payment_receipt', language: { code: 'en' }, components: [
      { type: 'header', parameters: [{ type: 'document', document: { id: 'M1', filename: 'Receipt-SNS-26-1008.pdf' } }] },
      { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
    ] },
  })
  const other = templatePayload({ to: '1', mediaId: 'M', receiptNo: 'x', params, name: 'my_template', language: 'en_US' })
  assert.equal(other.template.name, 'my_template'); assert.equal(other.template.language.code, 'en_US')
})

await ok('WhatsApp\'s error codes become plain sentences that say who has to do something', () => {
  const kind = (code) => explainWhatsappError(code).kind
  for (const c of [190, 102, 0]) assert.equal(kind(c), 'setup', String(c))
  for (const c of [3, 10, 200, 250, 299]) assert.equal(kind(c), 'setup', String(c))
  assert.equal(kind(131026), 'number'); assert.equal(explainWhatsappError(131026).retry, false)
  assert.equal(kind(131030), 'setup'); assert.match(explainWhatsappError(131030).text, /test mode/)
  assert.equal(kind(131042), 'billing'); assert.match(explainWhatsappError(131042).text, /payment method/)
  for (const c of [132000, 132001, 132012, 132015, 132016]) assert.equal(kind(c), 'setup', String(c))
  for (const c of [131049, 131056, 130429, 80007]) { assert.equal(kind(c), 'wait', String(c)); assert.equal(explainWhatsappError(c).retry, true) }
  for (const c of [131000, 131016, 133004, 131057]) { assert.equal(kind(c), 'temporary', String(c)); assert.equal(explainWhatsappError(c).retry, true) }
  assert.equal(kind(133010), 'setup')
  // anything else still says something useful, with WhatsApp's own detail
  const odd = explainWhatsappError(999001, 'Something   new\nhappened')
  assert.equal(odd.kind, 'other'); assert.equal(odd.text, 'WhatsApp could not send the message (error 999001). Something new happened')
  assert.equal(explainWhatsappError(null).text, 'WhatsApp could not send the message.')              // no code is not "code 0"
  assert.equal(explainWhatsappError(undefined, 'x').text, 'WhatsApp could not send the message. x')
  assert.equal(explainWhatsappError('131026').kind, 'number')                                          // a code that arrives as text
  assert.ok(explainWhatsappError(1, 'y'.repeat(900)).kind && explainWhatsappError(999001, 'y'.repeat(900)).text.length <= 400)
  for (const c of [190, 3, 131026, 131030, 131042, 131049, 131056, 132001, 132015, 133010, 131000, 100, 999]) assert.ok(explainWhatsappError(c).text.length > 20 && !/undefined|null/.test(explainWhatsappError(c).text))
})

// ======================================================================================================================
// 2. The settings
// ======================================================================================================================
await ok('the settings are read from the environment, trimmed, with the app\'s own database address as a fallback', () => {
  const c = readConfig({ ...ENV, WHATSAPP_ACCESS_TOKEN: '  EAAG-token-SECRET\n', SUPABASE_URL: 'https://proj.supabase.co/' })
  assert.equal(c.token, 'EAAG-token-SECRET'); assert.equal(c.supabaseUrl, 'https://proj.supabase.co')
  assert.deepEqual(c.missingForSend, []); assert.deepEqual(c.missingForWebhook, [])
  assert.equal(c.apiVersion, 'v24.0'); assert.equal(DEFAULT_API_VERSION, 'v24.0')
  assert.equal(c.templateName, 'sns_payment_receipt'); assert.equal(c.templateLanguage, 'en')
  const fallback = readConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })
  assert.equal(fallback.supabaseUrl, 'https://x.supabase.co'); assert.equal(fallback.anonKey, 'k')
  assert.deepEqual(readConfig({}).missingForSend, ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'])
  assert.deepEqual(readConfig({}).missingForWebhook, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'])
  assert.deepEqual(readConfig({ ...ENV, WHATSAPP_APP_SECRET: '   ' }).missingForWebhook, ['WHATSAPP_APP_SECRET'])
  assert.deepEqual(readConfig({ ...ENV, WHATSAPP_APP_SECRET: '' }).missingForSend, [])                  // the app secret is for delivery news only
  assert.equal(readConfig({ ...ENV, WHATSAPP_API_VERSION: 'v26.0' }).apiVersion, 'v26.0')
  assert.equal(readConfig({ ...ENV, WHATSAPP_API_VERSION: 'latest; drop' }).apiVersion, 'v24.0')          // a mistyped version is not used in an address
  assert.equal(readConfig({ ...ENV, WHATSAPP_TEMPLATE_NAME: 'receipt_v2', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US' }).templateName, 'receipt_v2')
})

await ok('both kinds of Supabase key are sent the way Supabase wants them', () => {
  assert.deepEqual(keyHeaders('sb_secret_abc'), { apikey: 'sb_secret_abc' })
  assert.deepEqual(keyHeaders('sb_publishable_abc'), { apikey: 'sb_publishable_abc' })
  assert.deepEqual(keyHeaders('eyJhbGciOi.payload.sig'), { apikey: 'eyJhbGciOi.payload.sig', Authorization: 'Bearer eyJhbGciOi.payload.sig' })
})

// ======================================================================================================================
// 3. Who may ask, and what the screen is told about the setup
// ======================================================================================================================
await ok('nobody who is not signed in can use it: no token, or a token the database does not know', async () => {
  const w = makeWorld()
  for (const jwt of ['', 'jwt-unknown']) {
    const r = await send(w, { receiptId: 5, filePath: FILE }, { jwt }); assert.equal(r.status, 401, jwt); assert.equal(r.body.reason, 'unauthorized')
  }
  assert.equal((await send(w, undefined, { method: 'GET', jwt: '', query: '?action=status' })).status, 401)
  assert.deepEqual(graphCalls(w), []); assert.deepEqual(w.rpc, []); assert.deepEqual(w.logs, [])
  // with no token at all, nothing is sent to anyone: not WhatsApp, and not even the database
  const nobody = makeWorld()
  assert.equal((await send(nobody, { receiptId: 5, filePath: FILE }, { jwt: '' })).status, 401); assert.deepEqual(nobody.calls, [])
  assert.equal((await handleSend(new Request(`${SITE}/x`, { method: 'POST', headers: { authorization: 'Bearer' }, body: '{}' }), nobody.deps())).status, 401)      // "Bearer" with no token after it
  assert.equal((await handleSend(new Request(`${SITE}/x`, { method: 'POST', headers: { authorization: 'Basic abc' }, body: '{}' }), nobody.deps())).status, 401)
  assert.deepEqual(nobody.calls, [])
  // other kinds of request are not used
  const res = await handleSend(new Request(`${SITE}/x`, { method: 'DELETE', headers: { authorization: 'Bearer jwt-admin' } }), w.deps())
  assert.equal(res.status, 405)
})

await ok('"status" tells the screen whether sending is set up, and which settings are missing, never their values', async () => {
  const good = await send(makeWorld(), undefined, { method: 'GET', query: '?action=status' })
  assert.equal(good.status, 200); assert.deepEqual(good.body, { ok: true, configured: true, missing: [], webhookReady: true, template: 'sns_payment_receipt' }); noSecrets(good.body)
  const w = makeWorld({ env: { WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_APP_SECRET: '' } })
  const part = await send(w, undefined, { method: 'GET', query: '?action=status', jwt: 'jwt-tech' })           // any signed-in person may ask
  assert.deepEqual(part.body, { ok: true, configured: false, missing: ['WHATSAPP_ACCESS_TOKEN'], webhookReady: false, template: 'sns_payment_receipt' }); noSecrets(part.body)
  assert.deepEqual(graphCalls(w), [], 'asking costs nothing and touches nothing at WhatsApp')
  // not even the database address: the server cannot tell who is asking, so it just says it is not set up
  const bare = makeWorld({ env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' } })
  const none = await send(bare, undefined, { method: 'GET', query: '?action=status' })
  assert.equal(none.status, 200); assert.equal(none.body.configured, false); assert.ok(none.body.missing.includes('SUPABASE_URL'))
  assert.equal((await send(bare, { receiptId: 5, filePath: FILE })).body.reason, 'not_configured')
})

await ok('only an admin can send a receipt or run the check', async () => {
  const w = makeWorld()
  const r = await send(w, { receiptId: 5, filePath: FILE }, { jwt: 'jwt-tech' })
  assert.equal(r.status, 403); assert.equal(r.body.reason, 'not_allowed'); assert.equal(r.body.message, 'Only an admin can send receipts.')
  assert.equal((await send(w, undefined, { method: 'GET', query: '?action=check', jwt: 'jwt-tech' })).status, 403)
  assert.deepEqual(graphCalls(w), []); assert.deepEqual(w.rpc, []); assert.deepEqual(w.logs, [])
  assert.equal(w.calls.some((c) => c.path.startsWith('/storage')), false)
})

await ok('if the database cannot say whether the person is an admin, they are not treated as one', async () => {
  const w = makeWorld(); const real = w.fetch
  w.fetch = async (url, init) => (String(url).includes('/rpc/is_admin') ? jsonResponse({ message: 'down' }, 500) : real(url, init))
  const res = await handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ fetch: w.fetch }))
  assert.equal(res.status, 403); assert.deepEqual(w.sends, []); assert.deepEqual(w.rpc, [])
})

await ok('when sending is not set up, nothing is sent and the screen is told which settings are missing', async () => {
  const w = makeWorld({ env: { WHATSAPP_PHONE_NUMBER_ID: '', SUPABASE_SERVICE_ROLE_KEY: '' } })
  const r = await send(w)
  assert.equal(r.status, 503); assert.equal(r.body.reason, 'not_configured'); assert.deepEqual(r.body.missing, ['SUPABASE_SERVICE_ROLE_KEY', 'WHATSAPP_PHONE_NUMBER_ID'])
  assert.deepEqual(graphCalls(w), []); noSecrets(r.body)
})

// ======================================================================================================================
// 4. Sending a receipt
// ======================================================================================================================
await ok('sending: the right steps in the right order, with exactly the right things said to WhatsApp and written to the log', async () => {
  const w = makeWorld()
  const r = await send(w)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { ok: true, messageId: 'log-1', wamid: 'wamid.HBgM-TEST-1', to: '254712345678', status: 'accepted', recorded: true })
  noSecrets(r.body)
  // the order: who is asking, are they an admin, the receipt, the customer, the log, the PDF, upload, send, the log again
  assert.deepEqual(w.calls.map((c) => `${c.method} ${c.host}${c.path}`), [
    'GET proj.supabase.co/auth/v1/user', 'POST proj.supabase.co/rest/v1/rpc/is_admin', 'GET proj.supabase.co/rest/v1/customer_receipts', 'GET proj.supabase.co/rest/v1/customers',
    'POST proj.supabase.co/rest/v1/rpc/begin_receipt_message', `GET proj.supabase.co/storage/v1/object/public/customer-receipts/${FILE}`,
    'POST graph.facebook.com/v24.0/1055555555/media', 'POST graph.facebook.com/v24.0/1055555555/messages', 'POST proj.supabase.co/rest/v1/rpc/finish_receipt_message',
  ])
  // the receipt and the customer are read as the signed-in admin (the database's own rules apply), never with the service key
  for (const c of w.calls.filter((c) => /customer_receipts|\/customers|auth\/v1|is_admin/.test(c.path))) { assert.equal(c.headers.authorization, 'Bearer jwt-admin', c.path); assert.equal(c.headers.apikey, 'anon-key-123', c.path) }
  // the log is written with the service key
  for (const c of w.calls.filter((c) => /begin_|finish_/.test(c.path))) assert.equal(c.headers.apikey, 'service-key-SECRET')
  assert.deepEqual(w.rpc[0], { name: 'begin_receipt_message', args: { p_receipt_id: 5, p_recipient: '254712345678', p_user: 'u-admin', p_channel: 'whatsapp', p_template: 'sns_payment_receipt' }, headers: w.rpc[0].headers })
  assert.deepEqual(w.rpc[1].args, { p_id: 'log-1', p_wamid: 'wamid.HBgM-TEST-1', p_code: null, p_text: null })
  assert.deepEqual(w.logs[0], { id: 'log-1', receipt_id: 5, recipient: '254712345678', status: 'accepted', wa_message_id: 'wamid.HBgM-TEST-1', error_code: null, error_text: null })
  // the PDF that was kept is the PDF that goes to the customer
  assert.equal(w.uploads.length, 1)
  assert.deepEqual(w.uploads[0].fields, { messaging_product: 'whatsapp', type: 'application/pdf' })
  assert.equal(w.uploads[0].name, 'Receipt-SNS-26-1008.pdf'); assert.equal(w.uploads[0].mime, 'application/pdf')
  assert.equal(Buffer.compare(Buffer.from(w.uploads[0].bytes), Buffer.from(PDF)), 0)
  assert.equal(w.calls.find((c) => c.path.endsWith('/media')).headers['content-type'], undefined, 'the form\'s own boundary must not be overridden')
  // the token goes in the header, never in the address
  for (const c of graphCalls(w)) { assert.equal(c.headers.authorization, 'Bearer EAAG-token-SECRET'); assert.ok(!c.search.includes('SECRET')) }
  assert.deepEqual(w.sends, [templatePayload({ to: '254712345678', mediaId: 'MEDIA-777', receiptNo: 'SNS/26/1008', params: ['Amina', 'Ksh 2,000.00', 'UKL41383DB', '21 Nov 2026 at 05:50 PM', 'SNS/26/1008', '21 Dec 2026'] })])
  assert.equal(w.errors.length, 0)
})

await ok('the customer\'s number as it is now is used; the receipt\'s own copy only when the customer is gone; a number typed on the screen wins', async () => {
  let w = makeWorld(); await send(w); assert.equal(w.sends[0].to, '254712345678')                                  // from the customer: 0712 345 678
  w = makeWorld({ customer: null }); let r = await send(w); assert.equal(r.status, 200); assert.equal(w.sends[0].to, '254700000000')          // the receipt's own copy
  assert.equal(w.sends[0].template.components[1].parameters[0].text, 'Amina')                                    // first name from the receipt
  w = makeWorld({ customer: { first_name: 'Amina', contact: 'Wife: 0722 111 222 (WhatsApp)' } }); await send(w); assert.equal(w.sends[0].to, '254722111222')
  w = makeWorld(); r = await send(w, { receiptId: 5, filePath: FILE, to: '+254 733 999 888' }); assert.equal(r.body.to, '254733999888'); assert.equal(w.rpc[0].args.p_recipient, '254733999888')
  w = makeWorld(); r = await send(w, { receiptId: 5, filePath: FILE, to: '447911123456' }); assert.equal(r.status, 200); assert.equal(w.sends[0].to, '447911123456')          // abroad
  w = makeWorld({ customer: { first_name: '', contact: '0712 345 678' } }); await send(w); assert.equal(w.sends[0].template.components[1].parameters[0].text, 'Amina')     // no first name: the receipt's
})

await ok('the first name in the message is the customer\'s as it is now, else the first word on the receipt, else "there"', async () => {
  const name = (w) => w.sends[0].template.components[1].parameters[0].text
  let w = makeWorld({ customer: { first_name: ' Zawadi ', contact: '0712 345 678' } }); await send(w); assert.equal(name(w), 'Zawadi')                    // renamed since the receipt was made, and tidied
  w = makeWorld({ customer: { first_name: 'Zawadi', contact: '0712 345 678' }, receipt: { ...RECEIPT, customer_name: '' } }); await send(w); assert.equal(name(w), 'Zawadi')
  w = makeWorld({ customer: null, receipt: { ...RECEIPT, customer_name: '  Juma   Otieno ' } }); await send(w); assert.equal(name(w), 'Juma')
  w = makeWorld({ customer: { first_name: ' ', contact: '0712 345 678' }, receipt: { ...RECEIPT, customer_name: '' } }); await send(w); assert.equal(name(w), 'there')
  w = makeWorld({ customer: { first_name: '   ', contact: '0712 345 678' } }); await send(w); assert.equal(name(w), 'Amina')                         // a name of only spaces is no name: the receipt's is used
})

await ok('a number that is not a number is refused before anything is recorded or sent', async () => {
  for (const to of ['0712 345', 'abc', '254999999999', '12345', '0712345678901234567890']) {
    const w = makeWorld(); const r = await send(w, { receiptId: 5, filePath: FILE, to })
    assert.equal(r.status, 400, to); assert.equal(r.body.reason, 'no_number', to); assert.deepEqual(w.rpc, [], to); assert.deepEqual(graphCalls(w), [], to)
  }
  const w = makeWorld({ customer: { first_name: 'Amina', contact: 'no phone' }, receipt: { ...RECEIPT, customer_contact: '' } })
  const r = await send(w)
  assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_number'); assert.match(r.body.message, /no usable WhatsApp number/)
  assert.deepEqual(w.rpc, []); assert.deepEqual(w.logs, []); assert.deepEqual(graphCalls(w), [])
})

await ok('a request that is not right is refused before anything is recorded or sent', async () => {
  const bad = [
    ['not JSON', 'not json at all'], ['no receipt', { filePath: FILE }], ['receipt 0', { receiptId: 0, filePath: FILE }], ['receipt text', { receiptId: 'abc', filePath: FILE }], ['receipt decimal', { receiptId: 1.5, filePath: FILE }], ['negative', { receiptId: -2, filePath: FILE }],
    ['no file', { receiptId: 5 }], ['a path that climbs out', { receiptId: 5, filePath: '../../etc/passwd' }], ['another folder', { receiptId: 5, filePath: 'other/Receipt-1.pdf' }],
    ['not a pdf', { receiptId: 5, filePath: '0123456789abcdef0123456789abcdef/Receipt-1.exe' }], ['an address', { receiptId: 5, filePath: 'https://evil.example/Receipt-1.pdf' }],
    ['capital letters in the folder', { receiptId: 5, filePath: '0123456789ABCDEF0123456789ABCDEF/Receipt-1.pdf' }], ['a short folder', { receiptId: 5, filePath: '0123/Receipt-1.pdf' }],
    ['a slash in the name', { receiptId: 5, filePath: '0123456789abcdef0123456789abcdef/x/Receipt-1.pdf' }], ['a query string', { receiptId: 5, filePath: FILE + '?download=1' }],
  ]
  for (const [what, body] of bad) {
    const w = makeWorld(); const r = await send(w, body)
    assert.equal(r.status, 400, what); assert.equal(r.body.reason, 'bad_request', what); assert.deepEqual(w.rpc, [], what); assert.deepEqual(graphCalls(w), [], what)
    assert.equal(w.calls.some((c) => c.path.startsWith('/storage')), false, what)
  }
  assert.ok(PDF_PATH.test(FILE) && PDF_PATH.test('0123456789abcdef0123456789abcdef/Receipt-11-1008.pdf'))
})

await ok('a receipt that does not exist, or that this person may not see, is "not found" and nothing is sent', async () => {
  let w = makeWorld({ receipt: null }); let r = await send(w); assert.equal(r.status, 404); assert.equal(r.body.reason, 'receipt_not_found'); assert.deepEqual(graphCalls(w), []); assert.deepEqual(w.rpc, [])
  w = makeWorld(); r = await send(w, { receiptId: 6, filePath: FILE }); assert.equal(r.status, 404)
})

await ok('a receipt for a different number of days than the approved message says is not sent this way', async () => {
  const w = makeWorld({ receipt: { ...RECEIPT, days_covered: 60 } })
  const r = await send(w)
  assert.equal(r.status, 409); assert.equal(r.body.reason, 'days_mismatch'); assert.match(r.body.message, /covers 60 days.*says 30/)
  assert.deepEqual(w.rpc, []); assert.deepEqual(graphCalls(w), [])
})

await ok('a double press and too many sends are stopped by the database\'s own rules, before WhatsApp is touched', async () => {
  let w = makeWorld({ begin: 'busy' }); let r = await send(w)
  assert.equal(r.status, 409); assert.equal(r.body.reason, 'busy'); assert.match(r.body.message, /less than a minute ago/); assert.deepEqual(graphCalls(w), [])
  w = makeWorld({ begin: 'rate' }); r = await send(w)
  assert.equal(r.status, 429); assert.equal(r.body.reason, 'rate'); assert.match(r.body.message, /Too many receipts/); assert.deepEqual(graphCalls(w), [])
  w = makeWorld({ begin: 'error' }); r = await send(w)
  assert.equal(r.status, 503); assert.equal(r.body.reason, 'server_error'); assert.match(r.body.message, /update-49-migration/); assert.deepEqual(graphCalls(w), [])
})

await ok('if the PDF cannot be read from storage, nothing is sent and the log says so', async () => {
  const w = makeWorld({ files: [] })
  const r = await send(w)
  assert.equal(r.status, 502); assert.equal(r.body.reason, 'pdf_unavailable'); assert.deepEqual(graphCalls(w), [])
  assert.equal(w.logs[0].status, 'failed'); assert.match(w.logs[0].error_text, /could not be read from storage/)
  const pdfOfSize = (size) => { const b = new Uint8Array(size).fill(32); b.set([37, 80, 68, 70]); return b }                       // starts with %PDF
  for (const [what, bytes] of [['an empty file', new Uint8Array(0)], ['a file that is not a PDF', new Uint8Array(500).fill(65)], ['a file that is far too big', pdfOfSize(1048577)],
    ['only the PDF marker', pdfOfSize(4)], ['a file too small to be a receipt', pdfOfSize(99)], ['a PDF marker in the wrong place', (() => { const b = pdfOfSize(500); b.set([32, 37, 80, 68, 70]); return b })()]]) {
    const x = makeWorld({ files: [[FILE, bytes]] }); const y = await send(x)
    assert.equal(y.status, 502, what); assert.equal(y.body.reason, 'pdf_unavailable', what); assert.deepEqual(graphCalls(x), [], what); assert.equal(x.logs[0].status, 'failed', what)
  }
  // the edges of what is accepted: 100 bytes up to 1 MB
  for (const size of [100, 1048576]) { const x = makeWorld({ files: [[FILE, pdfOfSize(size)]] }); assert.equal((await send(x)).status, 200, String(size)); assert.equal(x.uploads[0].bytes.length, size) }
})

await ok('when WhatsApp refuses the PDF or the message, nothing pretends it was sent: the log says failed, with the reason in plain words', async () => {
  const cases = [
    ['the token has expired', { upload: () => metaError(190, 'Error validating access token: Session has expired', 'expired', 401) }, 190, 'setup', false, /access token/],
    ['the number is not on WhatsApp', { send: () => metaError(131026, 'Message undeliverable', 'Unable to deliver message. Reason: recipient is not a valid WhatsApp user') }, 131026, 'number', false, /not on WhatsApp/],
    ['held back', { send: () => metaError(131049, 'This message was not delivered to maintain healthy ecosystem engagement.') }, 131049, 'wait', true, /held this message back/],
    ['test mode', { send: () => metaError(131030, 'Recipient phone number not in allowed list') }, 131030, 'setup', false, /test mode/],
    ['payment method', { send: () => metaError(131042, 'Business eligibility payment issue') }, 131042, 'billing', false, /payment/],
    ['template missing', { send: () => metaError(132001, 'Template name does not exist in the translation') }, 132001, 'setup', false, /template/],
    ['too fast', { send: () => metaError(130429, 'Rate limit hit') }, 130429, 'wait', true, /too quickly/],
    ['a hiccup', { upload: () => metaError(131000, 'Something went wrong', '', 500) }, 131000, 'temporary', true, /temporary problem/],
  ]
  for (const [what, graph, code, kind, retry, pattern] of cases) {
    const w = makeWorld({ graph }); const r = await send(w)
    assert.equal(r.status, 502, what); assert.equal(r.body.ok, false, what); assert.equal(r.body.reason, 'whatsapp_failed', what)
    assert.equal(r.body.code, code, what); assert.equal(r.body.kind, kind, what); assert.equal(r.body.retry, retry, what); assert.match(r.body.message, pattern, what)
    assert.equal(r.body.messageId, 'log-1', what)
    assert.equal(w.logs[0].status, 'failed', what); assert.equal(w.logs[0].error_code, code, what); assert.equal(w.logs[0].error_text, r.body.message, what)
    assert.equal(w.logs[0].wa_message_id, null, what)
    assert.equal(w.sends.length, graph.send ? 1 : 0, what)                                  // a refused upload sends no message
    noSecrets(r.body); noSecrets(w.logs); noSecrets(w.errors)
  }
})

await ok('WhatsApp\'s error code is passed on and stored as a number, even if it arrives as text', async () => {
  const w = makeWorld({ graph: { send: () => jsonResponse({ error: { message: 'Message undeliverable', code: '131026', error_subcode: '2494073', error_data: { details: 'x' } } }, 400) } })
  const r = await send(w)
  assert.equal(r.status, 502); assert.strictEqual(r.body.code, 131026); assert.strictEqual(w.logs[0].error_code, 131026); assert.equal(r.body.kind, 'number')
})

await ok('a refused upload stops there: no message is sent without its PDF', async () => {
  const w = makeWorld({ graph: { upload: () => metaError(131053, 'Media upload error', 'unsupported file type') } })
  const r = await send(w)
  assert.equal(r.status, 502); assert.equal(w.sends.length, 0); assert.equal(w.logs[0].status, 'failed')
  const noId = makeWorld({ graph: { upload: () => jsonResponse({}) } })
  assert.equal((await send(noId)).status, 502); assert.equal(noId.sends.length, 0)
})

await ok('the template name and language in the settings are the ones used, and the log records which template was used', async () => {
  const w = makeWorld({ env: { WHATSAPP_TEMPLATE_NAME: 'receipt_v2', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US' } })
  assert.equal((await send(w)).status, 200)
  assert.equal(w.sends[0].template.name, 'receipt_v2'); assert.equal(w.sends[0].template.language.code, 'en_US'); assert.equal(w.rpc[0].args.p_template, 'receipt_v2')
  const v = makeWorld({ env: { WHATSAPP_API_VERSION: 'v26.0' } }); await send(v)
  assert.ok(graphCalls(v).length === 2 && graphCalls(v).every((c) => c.path.startsWith('/v26.0/')), 'the version in the settings is the one in the address')
})

await ok('an answer from WhatsApp that carries an error is a failure even when the HTTP status says OK', async () => {
  const w = makeWorld({ graph: { send: () => jsonResponse({ error: { message: 'Something went wrong', code: 131000 } }, 200) } })
  const r = await send(w)
  assert.equal(r.status, 502); assert.equal(r.body.code, 131000); assert.equal(w.logs[0].status, 'failed'); assert.equal(w.logs[0].wa_message_id, null)
})

await ok('an answer from WhatsApp with no message id is a failure, not a success', async () => {
  const w = makeWorld({ graph: { send: () => jsonResponse({ messaging_product: 'whatsapp', messages: [] }) } })
  const r = await send(w)
  assert.equal(r.status, 502); assert.equal(w.logs[0].status, 'failed'); assert.equal(w.logs[0].wa_message_id, null)
  const html = makeWorld({ graph: { send: () => new Response('<html>Bad gateway</html>', { status: 502 }) } })
  const h = await send(html); assert.equal(h.status, 502); assert.equal(h.body.ok, false); assert.equal(html.logs[0].status, 'failed')
})

await ok('when WhatsApp cannot be reached or is too slow, the person is told to check before trying again, and the log is closed', async () => {
  let w = makeWorld({ graph: { networkDown: true } }); let r = await send(w)
  assert.equal(r.status, 502); assert.equal(r.body.kind, 'wait'); assert.equal(r.body.retry, true); assert.match(r.body.message, /check the customer's WhatsApp before trying again/)
  assert.equal(w.logs[0].status, 'failed')
  // a clock that says the time is nearly up makes every wait short, and a WhatsApp that never answers is given up on
  let calls = 0
  w = makeWorld({ graph: { hang: true } })
  const res = await within(handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ now: () => (calls++ === 0 ? 0 : TIME_BUDGET_MS - 400) })), 3000, 'the server must give up on a WhatsApp that stays silent')
  r = { status: res.status, body: await res.json() }
  assert.equal(r.status, 502); assert.equal(r.body.reason, 'whatsapp_failed'); assert.match(r.body.message, /could not be reached in time/); assert.equal(w.logs[0].status, 'failed')
  assert.ok(TIME_BUDGET_MS < 10000, 'Netlify stops a function after 10 seconds')
})

await ok('the waits for WhatsApp fit inside the time Netlify gives: the PDF may use all but 1.5 s of what is left, the message all but 0.3 s', async () => {
  const afterStart = (ms) => { let first = true; return () => { if (first) { first = false; return 0 } return ms } }               // the clock: 0 at the start, then `ms` spent
  for (const [spent, upload, message] of [[0, 7500, 8000], [3000, 4500, 5700], [8000, 1, 700]]) {
    const w = makeWorld()
    const { result, asked } = await recordingWaits(() => handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ now: afterStart(spent) })))
    assert.equal(result.status, 200, `after ${spent} ms`); assert.deepEqual(asked, [upload, message], `after ${spent} ms`)
  }
})

await ok('a WhatsApp that takes the PDF but never answers the message is given up on in time, with the log closed and no second try', async () => {
  let calls = 0
  const w = makeWorld({ graph: { hang: 'messages' } })
  const clock = () => (calls++ === 0 ? 0 : TIME_BUDGET_MS - 350)                  // 350 ms of the time are left, so the wait for the answer is about 50 ms
  const res = await within(handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ now: clock })), 3000, 'the server must give up on a WhatsApp that stays silent')
  const body = await res.json()
  assert.equal(res.status, 502); assert.equal(body.reason, 'whatsapp_failed'); assert.equal(body.retry, true); assert.match(body.message, /check the customer's WhatsApp before trying again/)
  assert.equal(w.uploads.length, 1, 'the PDF was taken'); assert.equal(graphCalls(w).filter((c) => c.path.endsWith('/messages')).length, 1, 'the message was tried once, not again')
  assert.equal(w.logs[0].status, 'failed'); assert.equal(w.logs[0].wa_message_id, null)
})

await ok('if the database cannot be reached, nothing is sent', async () => {
  const w = makeWorld(); const real = w.fetch
  w.fetch = async (url, init) => { if (String(url).includes('/auth/v1/user')) throw new TypeError('fetch failed'); return real(url, init) }
  const res = await handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ fetch: w.fetch }))
  assert.equal(res.status, 503); assert.equal((await res.json()).reason, 'server_error')
  const w2 = makeWorld(); const real2 = w2.fetch
  w2.fetch = async (url, init) => (String(url).includes('/customer_receipts') ? jsonResponse({ message: 'down' }, 500) : real2(url, init))
  const res2 = await handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w2.deps({ fetch: w2.fetch }))
  assert.equal(res2.status, 503); assert.deepEqual(w2.sends, [])
})

await ok('if WhatsApp took the message but the log could not be updated, the receipt still counts as sent, and the person is told it is untracked', async () => {
  const w = makeWorld({ finishFails: true })
  const r = await send(w)
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.recorded, false); assert.equal(r.body.wamid, 'wamid.HBgM-TEST-1')
  assert.ok(w.errors.some((e) => /sent, but could not record the id/.test(e)))
  assert.ok(!w.errors.join(' ').includes('SECRET'))
})

await ok('the new Supabase secret key is sent in the apikey header only, the old one in both', async () => {
  const w = makeWorld({ env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc123' } })
  const real = w.fetch
  w.fetch = async (url, init = {}) => {
    const h = Object.fromEntries(new Headers(init.headers || {}))
    if (/begin_|finish_/.test(String(url))) { assert.equal(h.apikey, 'sb_secret_abc123'); assert.equal(h.authorization, undefined, 'a new-style secret key is not a login token') }
    return real(url, { ...init, headers: h.apikey === 'sb_secret_abc123' ? { ...h, apikey: ENV.SUPABASE_SERVICE_ROLE_KEY } : h })
  }
  const res = await handleSend(sendRequest({ receiptId: 5, filePath: FILE }), w.deps({ fetch: w.fetch }))
  assert.equal(res.status, 200)
})

await ok('settings with stray spaces or line breaks (a classic copy-and-paste slip) still work', async () => {
  const w = makeWorld({ env: { WHATSAPP_ACCESS_TOKEN: ENV.WHATSAPP_ACCESS_TOKEN + '\n', WHATSAPP_PHONE_NUMBER_ID: ' 1055555555 ' } })
  assert.equal((await send(w)).status, 200)
})

// ======================================================================================================================
// 5. The setup check
// ======================================================================================================================
const check = async (w) => (await send(w, undefined, { method: 'GET', query: '?action=check' })).body
const stateOf = (r, id) => r.checks.find((c) => c.id === id)

await ok('the check gives WhatsApp six seconds per question and reports a silent WhatsApp instead of waiting for it', async () => {
  const quick = await recordingWaits(() => check(makeWorld()))
  assert.deepEqual(quick.asked, [6000, 6000]); assert.equal(quick.result.ready, true)
  const silent = await within(recordingWaits(() => check(makeWorld({ graph: { hang: true } }))), 3000, 'the check must give up on a WhatsApp that stays silent')
  assert.deepEqual(silent.asked, [6000, 6000]); assert.equal(silent.result.ready, false)
  for (const id of ['number', 'template']) { assert.equal(stateOf(silent.result, id).state, 'bad', id); assert.match(stateOf(silent.result, id).detail, /could not be reached in time/, id) }
})

await ok('the check: everything in order says ready, and says what it found', async () => {
  const w = makeWorld(); const r = await check(w)
  assert.equal(r.ok, true); assert.equal(r.ready, true); assert.deepEqual(r.checks.map((c) => c.id), ['settings', 'webhook_settings', 'database', 'number', 'template'])
  assert.ok(r.checks.every((c) => c.state === 'ok'), JSON.stringify(r.checks))
  assert.equal(stateOf(r, 'number').detail, '+254 700 111 222 · Swahili Net Solution · quality green')
  assert.match(stateOf(r, 'template').detail, /"sns_payment_receipt" \(en\) is approved/)
  noSecrets(r)
  assert.equal(w.sends.length + w.uploads.length, 0, 'checking sends nothing')
})

await ok('the check: each thing that can be wrong is named, in words', async () => {
  let r = await check(makeWorld({ env: { WHATSAPP_ACCESS_TOKEN: '' } }))
  assert.equal(r.ready, false); assert.equal(stateOf(r, 'settings').state, 'bad'); assert.match(stateOf(r, 'settings').detail, /WHATSAPP_ACCESS_TOKEN/)
  assert.equal(stateOf(r, 'number').state, 'skip'); assert.equal(stateOf(r, 'template').state, 'skip')
  r = await check(makeWorld({ env: { WHATSAPP_APP_SECRET: '' } }))
  assert.equal(r.ready, true, 'delivery news is a nice-to-have'); assert.equal(stateOf(r, 'webhook_settings').state, 'warn'); assert.match(stateOf(r, 'webhook_settings').detail, /WHATSAPP_APP_SECRET.*Delivered or Read/)
  r = await check(makeWorld({ dbMissing: true }))
  assert.equal(stateOf(r, 'database').state, 'bad'); assert.match(stateOf(r, 'database').detail, /update-49-migration\.sql/); assert.equal(r.ready, false)
  r = await check(makeWorld({ graph: { number: () => metaError(190, 'Invalid OAuth access token', '', 401) } }))
  assert.equal(stateOf(r, 'number').state, 'bad'); assert.match(stateOf(r, 'number').detail, /access token/)
  r = await check(makeWorld({ graph: { number: () => metaError(100, 'Unsupported get request. Object with ID does not exist') } }))
  assert.match(stateOf(r, 'number').detail, /phone number ID/)
  r = await check(makeWorld({ env: { WHATSAPP_BUSINESS_ACCOUNT_ID: '' } }))
  assert.equal(stateOf(r, 'template').state, 'skip'); assert.equal(r.ready, true)
  noSecrets(r)
})

await ok('the check: the template\'s status in Meta decides what the screen says', async () => {
  const tpl = (t) => ({ templates: () => jsonResponse({ data: t }) })
  let r = await check(makeWorld({ graph: tpl([]) }))
  assert.equal(stateOf(r, 'template').state, 'bad'); assert.match(stateOf(r, 'template').detail, /No template called "sns_payment_receipt"/)
  r = await check(makeWorld({ graph: tpl([{ name: 'sns_payment_receipt', status: 'PENDING', language: 'en', category: 'UTILITY' }]) }))
  assert.equal(stateOf(r, 'template').state, 'warn'); assert.match(stateOf(r, 'template').detail, /waiting for Meta/); assert.equal(r.ready, true)
  r = await check(makeWorld({ graph: tpl([{ name: 'sns_payment_receipt', status: 'REJECTED', language: 'en', category: 'UTILITY', rejected_reason: 'INVALID_FORMAT' }]) }))
  assert.equal(stateOf(r, 'template').state, 'bad'); assert.match(stateOf(r, 'template').detail, /rejected \(INVALID_FORMAT\)/)
  r = await check(makeWorld({ graph: tpl([{ name: 'sns_payment_receipt', status: 'PAUSED', language: 'en', category: 'UTILITY', rejected_reason: 'NONE' }]) }))
  assert.match(stateOf(r, 'template').detail, /paused\./); assert.equal(stateOf(r, 'template').state, 'bad')
  r = await check(makeWorld({ graph: tpl([{ name: 'sns_payment_receipt', status: 'APPROVED', language: 'en', category: 'MARKETING' }]) }))
  assert.equal(stateOf(r, 'template').state, 'warn'); assert.match(stateOf(r, 'template').detail, /filed it as MARKETING, which costs more/)
  r = await check(makeWorld({ graph: tpl([{ name: 'other_one', status: 'APPROVED', language: 'en', category: 'UTILITY' }]) }))
  assert.equal(stateOf(r, 'template').state, 'bad')
  r = await check(makeWorld({ graph: tpl([{ name: 'sns_payment_receipt', status: 'APPROVED', language: 'sw', category: 'UTILITY' }, { name: 'sns_payment_receipt', status: 'PENDING', language: 'en', category: 'UTILITY' }]) }))
  assert.equal(stateOf(r, 'template').state, 'warn', 'the language that is used is the one that counts')
  r = await check(makeWorld({ graph: { templates: () => metaError(100, 'Unsupported get request') } }))
  assert.equal(stateOf(r, 'template').state, 'bad')
})

// ======================================================================================================================
// 6. WhatsApp's news about each message (the webhook)
// ======================================================================================================================
const statusPayload = (statuses) => ({ object: 'whatsapp_business_account', entry: [{ id: '2066666666', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '254700111222', phone_number_id: '1055555555' }, statuses } }] }] })
const webhookRequest = (payload, { secret = ENV.WHATSAPP_APP_SECRET, signature, method = 'POST' } = {}) => {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const headers = { 'content-type': 'application/json' }
  const sig = signature === undefined ? sign(raw, secret) : signature
  if (sig !== null) headers['x-hub-signature-256'] = sig
  return new Request(`${SITE}/.netlify/functions/whatsapp-webhook`, { method, headers, body: raw })
}
const hook = async (w, req, extra = {}) => { const res = await handleWebhook(req, w.deps({ sleep: async (ms) => { w.slept = (w.slept || []).concat(ms) }, ...extra })); return { status: res.status, text: await res.text() } }

await ok('the handshake when the address is saved in Meta: only the right verify token gets the number back', async () => {
  const w = makeWorld()
  const ask = (q) => handleWebhook(new Request(`${SITE}/.netlify/functions/whatsapp-webhook?${q}`), w.deps())
  const good = await ask('hub.mode=subscribe&hub.verify_token=verify-me-SECRET&hub.challenge=1158201444')
  assert.equal(good.status, 200); assert.equal(await good.text(), '1158201444'); assert.match(good.headers.get('content-type'), /text\/plain/)
  for (const q of ['hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1', 'hub.mode=subscribe&hub.verify_token=verify-me-SECRET', 'hub.mode=unsubscribe&hub.verify_token=verify-me-SECRET&hub.challenge=1', 'hub.challenge=1', '']) assert.equal((await ask(q)).status, 403, q)
  // with no verify token set, an empty one must not match an empty one
  const bare = makeWorld({ env: { WHATSAPP_VERIFY_TOKEN: '' } })
  assert.equal((await handleWebhook(new Request(`${SITE}/x?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`), bare.deps())).status, 403)
  assert.equal((await handleWebhook(new Request(`${SITE}/x`, { method: 'PUT' }), w.deps())).status, 405)
})

await ok('the signature: made with the app secret over the exact bytes, compared safely, and nothing else is believed', () => {
  const raw = '{"a":1}'
  assert.match(sign(raw, 'secret'), /^sha256=[0-9a-f]{64}$/)
  assert.equal(verifySignature(raw, sign(raw, 'secret'), 'secret'), true)
  assert.equal(verifySignature(raw, sign(raw, 'secret'), 'other'), false)
  assert.equal(verifySignature(raw + ' ', sign(raw, 'secret'), 'secret'), false)                                     // one byte different
  assert.equal(verifySignature(raw, sign(raw, 'secret').toUpperCase(), 'secret'), false)
  assert.equal(verifySignature(raw, sign(raw, 'secret').slice(0, -1), 'secret'), false)                              // shorter
  assert.equal(verifySignature(raw, sign(raw, 'secret') + '0', 'secret'), false)                                     // longer
  for (const header of [null, undefined, '', 'sha256=', 'sha1=abc']) assert.equal(verifySignature(raw, header, 'secret'), false, String(header))
  assert.equal(verifySignature(raw, sign(raw, ''), ''), false, 'with no secret nothing is believed')
  assert.equal(verifySignature(raw, sign(raw, 'secret'), undefined), false)
  // a published test value, so the signing method itself is pinned: HMAC-SHA256, hex, in lower case, with "sha256=" in front
  assert.equal(sign('The quick brown fox jumps over the lazy dog', 'key'), 'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  assert.equal(verifySignature('The quick brown fox jumps over the lazy dog', 'sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8', 'key'), true)
})

await ok('news about a message is checked, then recorded in the log with the right id, status and time', async () => {
  const w = makeWorld()
  const body = statusPayload([
    { id: 'wamid.A', status: 'sent', timestamp: '1763736600', recipient_id: '254712345678' },
    { id: 'wamid.A', status: 'delivered', timestamp: '1763736605', recipient_id: '254712345678', pricing: { billable: true, category: 'utility' } },
    { id: 'wamid.A', status: 'read', timestamp: '1763736700', recipient_id: '254712345678' },
  ])
  const r = await hook(w, webhookRequest(body))
  assert.equal(r.status, 200); assert.deepEqual(JSON.parse(r.text), { ok: true, applied: 3, ignored: 0, unknown: 0 })
  assert.deepEqual(w.rpc.map((x) => x.name), Array(3).fill('record_whatsapp_status'))
  assert.deepEqual(w.rpc.map((x) => x.args), [
    { p_wamid: 'wamid.A', p_status: 'sent', p_at: '2025-11-21T14:50:00.000Z', p_code: null, p_text: null },
    { p_wamid: 'wamid.A', p_status: 'delivered', p_at: '2025-11-21T14:50:05.000Z', p_code: null, p_text: null },
    { p_wamid: 'wamid.A', p_status: 'read', p_at: '2025-11-21T14:51:40.000Z', p_code: null, p_text: null },
  ])
  for (const x of w.rpc) assert.equal(x.headers.apikey, 'service-key-SECRET')
  assert.equal(w.calls.some((c) => c.host === 'graph.facebook.com'), false)
})

await ok('a failure reaches the log with its code and a plain-language reason', async () => {
  const w = makeWorld()
  const r = await hook(w, webhookRequest(statusPayload([{ id: 'wamid.B', status: 'failed', timestamp: '1763736600', errors: [{ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable', error_data: { details: 'Unable to deliver message. Reason: recipient is not a valid WhatsApp user' } }] }])))
  assert.equal(r.status, 200)
  assert.equal(w.rpc[0].args.p_status, 'failed'); assert.equal(w.rpc[0].args.p_code, 131026); assert.match(w.rpc[0].args.p_text, /not on WhatsApp|cannot receive the message/)
  // a failure with no details still records that it failed
  const w2 = makeWorld(); await hook(w2, webhookRequest(statusPayload([{ id: 'wamid.C', status: 'failed', timestamp: '1763736600' }])))
  assert.equal(w2.rpc[0].args.p_status, 'failed'); assert.equal(w2.rpc[0].args.p_code, null); assert.match(w2.rpc[0].args.p_text, /could not send the message/)
})

await ok('news with a wrong, missing or forged signature is thrown away before it is even read, and nothing is recorded', async () => {
  const body = statusPayload([{ id: 'wamid.A', status: 'read', timestamp: '1763736700' }])
  const real = JSON.stringify(body)
  for (const [what, req] of [
    ['no signature', webhookRequest(body, { signature: null })], ['an empty signature', webhookRequest(body, { signature: '' })], ['signed with another secret', webhookRequest(body, { secret: 'not-the-secret' })],
    ['a signature for different content', webhookRequest(body, { signature: sign(real.replace('read', 'sent'), ENV.WHATSAPP_APP_SECRET) })], ['no sha256= part', webhookRequest(body, { signature: sign(real, ENV.WHATSAPP_APP_SECRET).slice(7) })],
  ]) {
    const w = makeWorld(); const r = await hook(w, req)
    assert.equal(r.status, 401, what); assert.deepEqual(w.rpc, [], what); assert.equal(w.calls.length, 0, what)
  }
})

await ok('if the app secret is not set up, the news is refused (never believed unchecked), so Meta tries again later', async () => {
  const w = makeWorld({ env: { WHATSAPP_APP_SECRET: '' } })
  const r = await hook(w, webhookRequest(statusPayload([{ id: 'wamid.A', status: 'read', timestamp: '1763736700' }]), { secret: '' }))
  assert.equal(r.status, 503); assert.deepEqual(w.rpc, []); assert.ok(w.errors.some((e) => /WHATSAPP_APP_SECRET/.test(e)))
  const v = makeWorld({ env: { SUPABASE_SERVICE_ROLE_KEY: '' } })
  assert.equal((await hook(v, webhookRequest(statusPayload([])))).status, 503)
})

await ok('news that arrives before the message\'s id was written to the log is looked at again a moment later, once', async () => {
  let w = makeWorld({ statusAnswers: ['unknown', 'applied'] })
  let r = await hook(w, webhookRequest(statusPayload([{ id: 'wamid.EARLY', status: 'sent', timestamp: '1763736600' }])))
  assert.deepEqual(JSON.parse(r.text), { ok: true, applied: 1, ignored: 0, unknown: 0 }); assert.deepEqual(w.slept, [1500]); assert.equal(w.rpc.length, 2)
  w = makeWorld({ statusAnswers: ['unknown', 'unknown'] })
  r = await hook(w, webhookRequest(statusPayload([{ id: 'wamid.NEVER', status: 'sent', timestamp: '1763736600' }])))
  assert.equal(r.status, 200, 'WhatsApp is told it arrived, or it would keep sending it'); assert.deepEqual(JSON.parse(r.text), { ok: true, applied: 0, ignored: 0, unknown: 1 }); assert.equal(w.rpc.length, 2)
  w = makeWorld({ statusAnswers: ['applied', 'ignored'] })
  r = await hook(w, webhookRequest(statusPayload([{ id: 'a', status: 'sent', timestamp: '1' }, { id: 'a', status: 'sent', timestamp: '2' }])))
  assert.deepEqual(JSON.parse(r.text), { ok: true, applied: 1, ignored: 1, unknown: 0 }); assert.equal(w.slept, undefined, 'no waiting when nothing is unknown')
})

await ok('if the log cannot be written, WhatsApp is told to send the news again later', async () => {
  let w = makeWorld({ statusAnswers: ['error'] })
  assert.equal((await hook(w, webhookRequest(statusPayload([{ id: 'wamid.A', status: 'read', timestamp: '1763736700' }])))).status, 500)
  w = makeWorld({ statusAnswers: ['unknown', 'error'] })
  assert.equal((await hook(w, webhookRequest(statusPayload([{ id: 'wamid.A', status: 'read', timestamp: '1763736700' }])))).status, 500)
})

await ok('things that are not news about our messages are acknowledged and ignored: customers\' replies, other kinds of status, other objects', async () => {
  const w = makeWorld()
  const reply = { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: [{ from: '254712345678', id: 'wamid.IN', timestamp: '1763736700', type: 'text', text: { body: 'Thanks!' } }], contacts: [{ profile: { name: 'Amina' }, wa_id: '254712345678' }] } }] }] }
  assert.equal((await hook(w, webhookRequest(reply))).status, 200)
  assert.equal((await hook(w, webhookRequest(statusPayload([{ id: 'x', status: 'deleted', timestamp: '1' }, { id: 'y', status: 'warning', timestamp: '1' }, { status: 'sent', timestamp: '1' }, null])))).status, 200)
  assert.equal((await hook(w, webhookRequest({ object: 'page', entry: [] }))).status, 200)
  assert.equal((await hook(w, webhookRequest({ ...statusPayload([{ id: 'wamid.Z', status: 'read', timestamp: '1763736700' }]), object: 'instagram' }))).status, 200)         // news from another product is not ours
  assert.equal((await hook(w, webhookRequest({ object: 'whatsapp_business_account' }))).status, 200)
  assert.equal((await hook(w, webhookRequest({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: 'nope' } }, null, {}] }, null] }))).status, 200)
  assert.deepEqual(w.rpc, [])
  assert.deepEqual(extractStatuses(statusPayload([{ id: 'a', status: 'sent', timestamp: 'soon' }, { id: 'b', status: 'read', timestamp: '0' }])).map((s) => s.at), [null, null])
})

await ok('a signed message that is not JSON, or is far too big, is refused (and the signature is checked first)', async () => {
  const w = makeWorld()
  assert.equal((await hook(w, webhookRequest('not json', {}))).status, 400)
  assert.equal((await hook(w, webhookRequest('not json', { secret: 'wrong' }))).status, 401, 'a forged message is told nothing about what was wrong with it')
  assert.equal((await hook(w, webhookRequest('x'.repeat(1048577), { secret: 'wrong' }))).status, 413)
  assert.equal((await hook(w, webhookRequest('x'.repeat(1048577)))).status, 413)
  assert.deepEqual(w.rpc, [])
})

// ======================================================================================================================
// 7. The database side and the app carry it
// ======================================================================================================================
await ok('the server asks the database for exactly the functions and fields that the migration defines', () => {
  const mig = read('supabase/update-49-migration.sql')
  const sig = (name) => { const m = new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)`).exec(mig); assert.ok(m, name); return m[1] }
  assert.deepEqual(sig('begin_receipt_message').split(',').map((s) => s.trim().split(/\s+/)[0]), ['p_receipt_id', 'p_recipient', 'p_user', 'p_channel', 'p_template'])
  assert.deepEqual(sig('finish_receipt_message').split(',').map((s) => s.trim().split(/\s+/)[0]), ['p_id', 'p_wamid', 'p_code', 'p_text'])
  assert.deepEqual(sig('record_whatsapp_status').split(',').map((s) => s.trim().split(/\s+/)[0]), ['p_wamid', 'p_status', 'p_at', 'p_code', 'p_text'])
  const begin = mig.slice(mig.indexOf('function public.begin_receipt_message'), mig.indexOf('function public.finish_receipt_message'))
  assert.match(begin, /'reason', 'busy'/); assert.match(begin, /'reason', 'rate'/); assert.match(begin, /jsonb_build_object\('ok', true, 'id', v_id\)/)
  assert.match(mig, /returns text language plpgsql[\s\S]*return 'unknown'/)
  // the statuses the server passes on are the ones the database accepts
  assert.match(mig, /p_status not in \('sent', 'delivered', 'read', 'failed'\)/)
  // the columns the server reads from the receipt exist
  const rec = read('supabase/update-48-migration.sql') + mig
  for (const col of ['customer_id', 'customer_name', 'customer_contact', 'receipt_no', 'mpesa_code', 'amount', 'paid_at', 'expires_on', 'days_covered']) assert.match(rec, new RegExp(`\\b${col}\\b`), col)
  assert.match(read('supabase/job-card-rebuild.sql'), /create table if not exists public\.receipt_messages/)
})

await ok('the two functions are what Netlify expects: one file each, a default function, sharing the code in netlify/lib', async () => {
  const send = read('netlify/functions/whatsapp-send.mjs'), hookFile = read('netlify/functions/whatsapp-webhook.mjs')
  assert.match(send, /import \{ handleSend \} from '\.\.\/lib\/receiptSend\.mjs'/); assert.match(send, /export default async \(request\) =>/)
  assert.match(hookFile, /import \{ handleWebhook \} from '\.\.\/lib\/webhook\.mjs'/); assert.match(hookFile, /export default async \(request\) =>/)
  // they run with the real environment, and answer sensibly with nothing set up
  const saved = {}
  for (const k of Object.keys(process.env)) if (/^(VITE_)?SUPABASE|^WHATSAPP/.test(k)) { saved[k] = process.env[k]; delete process.env[k] }
  try {
    const fnSend = (await import('../netlify/functions/whatsapp-send.mjs')).default
    const res = await fnSend(new Request(`${SITE}/.netlify/functions/whatsapp-send?action=status`, { headers: { authorization: 'Bearer anything' } }))
    assert.equal(res.status, 200); assert.equal((await res.json()).configured, false)
    const fnHook = (await import('../netlify/functions/whatsapp-webhook.mjs')).default
    assert.equal((await fnHook(new Request(`${SITE}/.netlify/functions/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=5`))).status, 403)
  } finally { Object.assign(process.env, saved) }
  assert.deepEqual(JSON.parse(read('package.json')).dependencies && Object.keys(JSON.parse(read('package.json')).dependencies).filter((d) => /facebook|whatsapp|axios|node-fetch/.test(d)), [], 'no extra packages: the built-in fetch is enough')
})

// ======================================================================================================================
// 7. The screen's side: asking the function, and putting the log in words
// ======================================================================================================================
// the browser's fetch, wired straight to the real server code and the pretend WhatsApp and database
const clientFor = (jwt) => ({ auth: { getSession: async () => ({ data: { session: jwt ? { access_token: jwt } : null } }) } })
const toServer = (w) => async (url, init) => handleSend(new Request(`${SITE}${url}`, { method: init.method, headers: init.headers, body: init.body }), w.deps())

await ok('the screen asks whether sending is set up: yes, which settings are missing, or "not available here"', async () => {
  assert.equal(SEND_ENDPOINT, '/.netlify/functions/whatsapp-send')
  let w = makeWorld()
  assert.deepEqual(await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: toServer(w) }), { available: true, configured: true, missing: [], webhookReady: true, template: 'sns_payment_receipt' })
  w = makeWorld({ env: { WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_APP_SECRET: '' } })
  assert.deepEqual(await getWhatsappStatus(clientFor('jwt-tech'), { fetchImpl: toServer(w) }), { available: true, configured: false, missing: ['WHATSAPP_ACCESS_TOKEN'], webhookReady: false, template: 'sns_payment_receipt' })
  // the site has no function (a plain web host, or running on a laptop): not available, and the screen uses the manual way
  const notThere = await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: async () => new Response('<html>Not Found</html>', { status: 404 }) })
  assert.equal(notThere.available, false); assert.equal(notThere.configured, false); assert.equal(notThere.problem, 'unavailable'); assert.deepEqual(notThere.missing, [])
  assert.equal((await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: async () => { throw new TypeError('Failed to fetch') } })).problem, 'network')
  assert.equal((await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: async () => new Response('{"ok":false}', { status: 401 }) })).problem, 'signin')
  assert.equal((await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: async () => new Response('[1,2]', { status: 200 }) })).available, false)
  // signed out: nothing is even asked
  let asked = 0
  const none = await getWhatsappStatus(clientFor(null), { fetchImpl: async () => { asked++; return new Response('{}') } })
  assert.equal(none.available, false); assert.equal(none.problem, 'signin'); assert.equal(asked, 0)
  assert.equal((await getWhatsappStatus({ auth: { getSession: async () => { throw new Error('storage blocked') } } }, { fetchImpl: async () => { asked++ } })).problem, 'signin')
})

await ok('what the screen sends: the person\'s own login, only the three facts, and the number only when there is one', async () => {
  const seen = []
  const spy = async (url, init) => { seen.push({ url, init }); return jsonResponse({ ok: true, wamid: 'wamid.X', to: '254712345678', messageId: 'log-9' }) }
  await sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 5, filePath: FILE, to: '254712345678' }, { fetchImpl: spy })
  await sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 6, filePath: FILE }, { fetchImpl: spy })
  assert.equal(seen[0].url, '/.netlify/functions/whatsapp-send'); assert.equal(seen[0].init.method, 'POST'); assert.equal(seen[0].init.cache, 'no-store')
  assert.equal(seen[0].init.headers.Authorization, 'Bearer jwt-admin'); assert.equal(seen[0].init.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(seen[0].init.body), { receiptId: 5, filePath: FILE, to: '254712345678' })
  assert.deepEqual(JSON.parse(seen[1].init.body), { receiptId: 6, filePath: FILE })
  assert.ok(seen[0].init.signal instanceof AbortSignal, 'a time limit is set')
  await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: spy })
  assert.equal(seen[2].url, '/.netlify/functions/whatsapp-send?action=status'); assert.equal(seen[2].init.method, 'GET'); assert.equal(seen[2].init.body, undefined); assert.equal(seen[2].init.headers['Content-Type'], undefined)
})

await ok('sending from the screen, all the way through the real server: a good send, and every way it can be refused, in words the screen can use', async () => {
  const sendFrom = (w, jwt = 'jwt-admin', body = { receiptId: 5, filePath: FILE, to: '254712345678' }) => sendReceiptViaApi(clientFor(jwt), body, { fetchImpl: toServer(w) })
  let w = makeWorld(); let r = await sendFrom(w)
  assert.deepEqual(r, { ok: true, wamid: 'wamid.HBgM-TEST-1', to: '254712345678', messageId: 'log-1', recorded: true })
  w = makeWorld({ finishFails: true }); r = await sendFrom(w); assert.equal(r.ok, true); assert.equal(r.recorded, false)

  const cases = [
    ['another send a moment ago', makeWorld({ begin: 'busy' }), 409, 'busy', true, false],
    ['too many sends', makeWorld({ begin: 'rate' }), 429, 'rate', true, false],
    ['not set up', makeWorld({ env: { WHATSAPP_ACCESS_TOKEN: '' } }), 503, 'not_configured', false, false],
    ['the receipt is for 60 days', makeWorld({ receipt: { ...RECEIPT, days_covered: 60 } }), 409, 'days_mismatch', false, false],
    ['the PDF is gone', makeWorld({ files: [] }), 502, 'pdf_unavailable', true, false],
    ['a number WhatsApp does not know', makeWorld({ graph: { send: () => metaError(131026, 'undeliverable') } }), 502, 'whatsapp_failed', false, false],
    ['held back', makeWorld({ graph: { send: () => metaError(131049, 'held') } }), 502, 'whatsapp_failed', true, false],
    ['the token expired', makeWorld({ graph: { upload: () => metaError(190, 'expired', '', 401) } }), 502, 'whatsapp_failed', false, false],
    ['no such receipt', makeWorld({ receipt: null }), 404, 'receipt_not_found', false, false],
  ]
  for (const [what, world, status, reason, retry, unknown] of cases) {
    const out = await sendFrom(world)
    assert.equal(out.ok, false, what); assert.equal(out.status, status, what); assert.equal(out.reason, reason, what); assert.equal(out.retry, retry, what); assert.equal(out.unknown, unknown, what)
    assert.equal(typeof out.message, 'string', what); assert.ok(out.message.length > 15, what); noSecrets(out)
  }
  const refused = await sendFrom(makeWorld({ graph: { send: () => metaError(131026, 'undeliverable') } }))
  assert.equal(refused.code, 131026); assert.equal(refused.kind, 'number'); assert.equal(refused.messageId, 'log-1'); assert.match(refused.message, /not on WhatsApp/)
  assert.equal((await sendFrom(makeWorld({ graph: { send: () => metaError(131030, 'allowed list') } }))).kind, 'setup')
  // not an admin, not signed in
  const tech = await sendFrom(makeWorld(), 'jwt-tech'); assert.equal(tech.reason, 'not_allowed'); assert.equal(tech.retry, false)
  const out = await sendFrom(makeWorld(), null); assert.equal(out.reason, 'unauthorized'); assert.equal(out.retry, true); assert.match(out.message, /sign in again/i)
  const bad = await sendFrom(makeWorld(), 'jwt-admin', { receiptId: 5, filePath: 'nope', to: '254712345678' }); assert.equal(bad.reason, 'bad_request'); assert.equal(bad.retry, false)
})

await ok('when no answer comes back, the screen is told it is NOT KNOWN whether the message went, and never "it was not sent"', async () => {
  const asSent = (fetchImpl, extra = {}) => sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 5, filePath: FILE }, { fetchImpl, ...extra })
  const silent = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  let r = await within(asSent(silent, { timeoutMs: 30 }), 3000, 'the screen must give up on a server that stays silent')
  assert.equal(r.ok, false); assert.equal(r.reason, 'timeout'); assert.equal(r.unknown, true); assert.equal(r.retry, true); assert.match(r.message, /not known whether the message was sent/)
  r = await asSent(async () => { throw new TypeError('Failed to fetch') })
  assert.equal(r.reason, 'network'); assert.equal(r.unknown, true); assert.match(r.message, /connection dropped/)
  // the platform stopped the function (an HTML error page, no JSON)
  for (const status of [500, 502, 503, 504]) { r = await asSent(async () => new Response('<html>Gateway Timeout</html>', { status })); assert.equal(r.unknown, true, String(status)); assert.equal(r.status, status); assert.match(r.message, /not known whether the message was sent/) }
  // WhatsApp itself was silent: the server says so, and the screen treats it as not known too
  const w = makeWorld({ graph: { hang: 'messages' } }); let calls = 0
  const hung = await within(sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 5, filePath: FILE }, { fetchImpl: async (url, init) => handleSend(new Request(`${SITE}${url}`, init), w.deps({ now: () => (calls++ === 0 ? 0 : TIME_BUDGET_MS - 350) })) }), 3000, 'must give up')
  assert.equal(hung.reason, 'whatsapp_failed'); assert.equal(hung.unknown, true); assert.equal(hung.code, null)
  // a plain "no" from WhatsApp is NOT an unknown
  assert.equal((await sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 5, filePath: FILE }, { fetchImpl: toServer(makeWorld({ graph: { send: () => metaError(131026, 'x') } })) })).unknown, false)
  // no function on this site / odd answers
  r = await asSent(async () => new Response('Not Found', { status: 404 })); assert.equal(r.reason, 'unavailable'); assert.equal(r.retry, false); assert.equal(r.unknown, false)
  r = await asSent(async () => new Response('"yes"', { status: 200 })); assert.equal(r.ok, false); assert.equal(r.unknown, false)
  r = await asSent(async () => jsonResponse({ ok: true }, 200)); assert.equal(r.ok, false, 'an answer with no message id is not a success')
  r = await asSent(async () => jsonResponse({ message: 'weird' }, 418)); assert.equal(r.ok, false); assert.equal(r.status, 418); assert.equal(r.reason, 'server_error'); assert.equal(r.unknown, false); assert.equal(r.retry, true)
})

await ok('the setup check as the screen gets it', async () => {
  let w = makeWorld(); let r = await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: toServer(w) })
  assert.equal(r.ok, true); assert.equal(r.ready, true); assert.deepEqual(r.checks.map((c) => [c.id, c.state]), [['settings', 'ok'], ['webhook_settings', 'ok'], ['database', 'ok'], ['number', 'ok'], ['template', 'ok']])
  assert.ok(r.checks.every((c) => c.label && c.detail))
  w = makeWorld({ graph: { templates: () => jsonResponse({ data: [{ name: 'sns_payment_receipt', status: 'REJECTED', language: 'en', rejected_reason: 'INVALID_FORMAT' }] }) } })
  r = await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: toServer(w) }); assert.equal(r.ready, false); assert.equal(r.checks.find((c) => c.id === 'template').state, 'bad')
  assert.equal((await runWhatsappCheck(clientFor('jwt-tech'), { fetchImpl: toServer(makeWorld()) })).message, 'Only an admin can run the check.')
  assert.equal((await runWhatsappCheck(clientFor(null), { fetchImpl: toServer(makeWorld()) })).message, 'Please sign in again.')
  assert.match((await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: async () => new Response('Not Found', { status: 404 }) })).message, /not available on this site/)
  assert.match((await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: async () => new Response('<html>timeout</html>', { status: 504 }) })).message, /took too long/)
  assert.match((await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: async () => { throw new TypeError('x') } })).message, /could not reach the server/)
  const odd = await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: async () => jsonResponse({ ok: true, ready: true, checks: [{ id: 'a', label: 'A', state: 'strange', detail: 5 }] }) })
  assert.deepEqual(odd.checks, [{ id: 'a', label: 'A', state: 'warn', detail: '5' }])                       // an unknown state is shown as a warning, never as "ok"
})

await ok('a message in words: every stage, its time, and the reason when it failed', () => {
  const base = { id: 'm1', receiptId: 5, createdAt: '2026-11-23T08:00:00+00:00', updatedAt: '2026-11-23T08:00:05+00:00' }
  const d = (extra, opts) => describeMessage({ ...base, ...extra }, { now: new Date('2026-11-23T08:00:30Z'), ...opts })
  assert.deepEqual(pick(d({ status: 'queued' })), ['queued', 'Sending…', 'wait', false])
  assert.deepEqual(pick(d({ status: 'accepted' })), ['accepted', 'Accepted by WhatsApp', 'info', false])
  assert.deepEqual(pick(d({ status: 'sent', sentAt: '2026-11-23T08:00:02+00:00' })), ['sent', 'Sent', 'info', false])
  assert.deepEqual(pick(d({ status: 'delivered', deliveredAt: '2026-11-23T08:00:05+00:00' })), ['delivered', 'Delivered', 'ok', true])
  assert.deepEqual(pick(d({ status: 'read', readAt: '2026-11-23T08:05:00+00:00' })), ['read', 'Read', 'ok', true])
  assert.deepEqual(pick(d({ status: 'failed', failedAt: '2026-11-23T08:00:09+00:00', errorText: 'This number cannot receive the message.' })), ['failed', 'Not delivered', 'bad', true])
  function pick(x) { return [x.key, x.label, x.tone, x.final] }
  // the time shown is the time of THAT stage, in Kenya time
  assert.equal(d({ status: 'delivered', deliveredAt: '2026-11-23T08:00:05+00:00' }).text, 'Delivered · 23 Nov 2026, 11:00 AM')
  assert.equal(d({ status: 'read', readAt: '2026-11-23T08:05:00+00:00', deliveredAt: '2026-11-23T08:00:05+00:00' }).text, 'Read · 23 Nov 2026, 11:05 AM')
  assert.equal(d({ status: 'sent', sentAt: '2026-11-23T08:00:02+00:00' }).text, 'Sent · 23 Nov 2026, 11:00 AM')
  assert.equal(d({ status: 'failed', failedAt: '2026-11-23T15:30:00+00:00' }).text, 'Not delivered · 23 Nov 2026, 06:30 PM')
  assert.equal(d({ status: 'delivered', deliveredAt: null }).at.toISOString(), '2026-11-23T08:00:05.000Z')                  // no stage time: the last update
  // the reason is the one WhatsApp gave, or a general one
  assert.equal(d({ status: 'failed', errorText: 'This number cannot receive the message.' }).detail, 'This number cannot receive the message.')
  assert.equal(d({ status: 'failed', errorText: '' }).detail, 'WhatsApp could not deliver the message.')
  assert.equal(d({ status: 'failed', errorText: '   ' }).detail, 'WhatsApp could not deliver the message.')              // only spaces is no reason at all
  assert.equal(d({ status: 'failed', errorText: '  Too many messages.  ' }).detail, 'Too many messages.')
  // "accepted" only moves on with delivery updates, and the screen says so when they are off
  assert.match(d({ status: 'accepted' }).detail, /Waiting for WhatsApp/); assert.match(d({ status: 'accepted' }, { webhookReady: false }).detail, /not switched on/); assert.match(d({ status: 'sent' }, { webhookReady: false }).detail, /not switched on/)
  assert.equal(d({ status: 'delivered', deliveredAt: '2026-11-23T08:00:05+00:00' }, { webhookReady: false }).detail, '')
  // a message that never left "queued" is not shown as still on its way for ever
  const stuck = describeMessage({ ...base, status: 'queued' }, { now: new Date(new Date(base.createdAt).getTime() + QUEUED_GIVE_UP_MS + 1000) })
  assert.deepEqual(pick(stuck), ['queued', 'Not confirmed', 'bad', true]); assert.match(stuck.detail, /Check the customer's WhatsApp before sending it again/)
  assert.equal(describeMessage({ ...base, status: 'queued' }, { now: new Date(new Date(base.createdAt).getTime() + QUEUED_GIVE_UP_MS - 1000) }).label, 'Sending…')
  // exactly two minutes is not "stuck" yet (the database, too, waits for MORE than two minutes before it gives up on one)
  assert.equal(describeMessage({ ...base, status: 'queued' }, { now: new Date(new Date(base.createdAt).getTime() + QUEUED_GIVE_UP_MS) }).label, 'Sending…')
  assert.equal(describeMessage({ ...base, status: 'queued' }, { now: new Date(new Date(base.createdAt).getTime() + QUEUED_GIVE_UP_MS + 1) }).label, 'Not confirmed')
  // anything unexpected reads as "sending", never crashes
  assert.equal(d({ status: 'weird' }).key, 'queued'); assert.equal(describeMessage({ status: 'accepted' }).at, null); assert.equal(describeMessage({ status: 'accepted' }).text, 'Accepted by WhatsApp')
})

await ok('the screen\'s helpers are strict about what counts as an answer', async () => {
  const admin = clientFor('jwt-admin')
  const reply = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  // "is sending set up?": only a plain 200 that says ok is an answer
  for (const body of [{ configured: true }, { ok: false, configured: true }, { ok: 'yes', configured: true }]) {
    const r = await getWhatsappStatus(admin, { fetchImpl: reply(200, body) })
    assert.equal(r.available, false, JSON.stringify(body)); assert.equal(r.problem, 'unavailable')
  }
  // the check: "ready" is true only when the server said true, and an answer without its list of steps is not a check
  const loose = await runWhatsappCheck(admin, { fetchImpl: reply(200, { ok: true, ready: 'false', checks: [] }) })
  assert.equal(loose.ok, true); assert.equal(loose.ready, false)
  assert.equal((await runWhatsappCheck(admin, { fetchImpl: reply(200, { ok: true, ready: true, checks: [] }) })).ready, true)
  assert.deepEqual(await runWhatsappCheck(admin, { fetchImpl: reply(200, { ok: true, ready: true }) }), { ok: false, message: 'The check could not be run.' })
  // a send worked only when the function answered 200 with ok and WhatsApp's own id for the message
  const send = (status, body) => sendReceiptViaApi(admin, { receiptId: 5, filePath: FILE }, { fetchImpl: reply(status, body) })
  const accepted = await send(202, { ok: true, wamid: 'wamid.X', to: '254712345678' })
  assert.equal(accepted.ok, false); assert.equal(accepted.reason, 'server_error')
  assert.equal((await send(200, { ok: true, to: '254712345678' })).ok, false)                    // no id from WhatsApp: nothing is known to have gone out
  assert.equal((await send(200, { ok: true, wamid: 'wamid.X', to: '254712345678' })).ok, true)
  // a refusal that gives no reason is a general server problem that may pass
  const noReason = await send(400, { ok: false, message: 'Something odd.' })
  assert.equal(noReason.reason, 'server_error'); assert.equal(noReason.retry, true); assert.equal(noReason.message, 'Something odd.')
  // WhatsApp's code is kept as a number (0 included); a word is not a code
  assert.equal((await send(422, { ok: false, reason: 'whatsapp_failed', kind: 'setup', code: 0, message: 'x' })).code, 0)
  assert.equal((await send(422, { ok: false, reason: 'whatsapp_failed', kind: 'setup', code: '131026', message: 'x' })).code, 131026)
  const word = await send(422, { ok: false, reason: 'whatsapp_failed', kind: 'wait', code: 'abc', message: 'x' })
  assert.equal(word.code, null); assert.equal(word.unknown, true)
})

await ok('a finished request leaves no timer running behind it', async () => {
  const live = new Set(); const realSet = globalThis.setTimeout; const realClear = globalThis.clearTimeout
  globalThis.setTimeout = (fn, ms, ...rest) => { const t = realSet(fn, ms, ...rest); live.add(t); return t }
  globalThis.clearTimeout = (t) => { live.delete(t); return realClear(t) }
  try {
    const answer = async () => jsonResponse({ ok: true, configured: true, missing: [], webhookReady: true, template: 'sns_payment_receipt', ready: true, checks: [], wamid: 'wamid.X' })
    await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: answer })
    await runWhatsappCheck(clientFor('jwt-admin'), { fetchImpl: answer })
    await sendReceiptViaApi(clientFor('jwt-admin'), { receiptId: 5, filePath: FILE }, { fetchImpl: answer })
    await getWhatsappStatus(clientFor('jwt-admin'), { fetchImpl: async () => { throw new TypeError('Failed to fetch') } })        // and when the answer is a failure
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear }
  assert.equal(live.size, 0, `${live.size} timer(s) left running`)
})

await ok('messages are grouped by receipt, newest first, and a message with no receipt is left out', () => {
  const m = (id, receiptId, createdAt) => ({ id, receiptId, createdAt })
  const by = messagesByReceipt([m('a', 5, '2026-11-23T08:00:00Z'), m('b', 6, '2026-11-23T09:00:00Z'), m('c', 5, '2026-11-23T10:00:00Z'), m('d', null, '2026-11-23T11:00:00Z'), null])
  assert.deepEqual([...by.keys()].sort(), [5, 6]); assert.deepEqual(by.get(5).map((x) => x.id), ['c', 'a']); assert.deepEqual(by.get(6).map((x) => x.id), ['b'])
  assert.equal(messagesByReceipt(undefined).size, 0)
})

await ok('the screen waits longer than the server does, so a slow but successful send is not reported as "not certain"', () => {
  assert.ok(SEND_TIMEOUT_MS >= TIME_BUDGET_MS + 5000, `a send must be given more than the server's ${TIME_BUDGET_MS} ms plus a slow connection (${SEND_TIMEOUT_MS})`)
  assert.ok(CHECK_TIMEOUT_MS >= TIME_BUDGET_MS + 5000, 'the setup check must be given more than the server\'s own limit')
  assert.ok(QUICK_TIMEOUT_MS >= 5000, 'asking whether sending is set up must not give up on a normal connection')
  for (const t of [SEND_TIMEOUT_MS, QUICK_TIMEOUT_MS, CHECK_TIMEOUT_MS]) assert.ok(t <= 60000, 'but nothing waits for ever')
})

await ok('the test chain runs this file', () => {
  assert.match(JSON.parse(read('package.json')).scripts.test, /node scripts\/test-whatsapp\.mjs/)
})

console.log(`\n${n} WhatsApp checks passed`)
