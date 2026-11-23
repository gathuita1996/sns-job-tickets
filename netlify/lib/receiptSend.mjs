// Sends a receipt that is already saved to the customer through the WhatsApp Business API, and answers the screen's questions
// about whether sending is set up. Written as a plain function of (request, deps) so it can be tested against pretend
// versions of WhatsApp and the database; the Netlify function (netlify/functions/whatsapp-send.mjs) only passes the real ones in.
//
//   GET  ?action=status   is automatic sending set up?                         (any signed-in person)
//   GET  ?action=check    a step-by-step check of the whole setup              (admins)
//   POST { receiptId, filePath, to? }   send that receipt's PDF to the customer (admins)
import { SUBSCRIPTION_DAYS } from '../../src/lib/subscription.js'
import { RECEIPT_TEMPLATE, templateParams } from '../../src/lib/whatsappTemplate.js'
import { explainWhatsappError } from '../../src/lib/whatsappErrors.js'
import { whatsappNumber } from '../../src/lib/phone.js'
import { receiptFileName } from '../../src/lib/receiptText.js'
import { readConfig } from './config.mjs'
import { supabaseApi } from './supabaseRest.mjs'
import { graphRequest, sendReceiptTemplate, uploadMedia } from './graph.mjs'

// Netlify stops a function after 10 seconds, so the whole job has to fit in a little less than that.
export const TIME_BUDGET_MS = 9000
// where a receipt PDF may be read from: the receipts folder only (a random folder, then Receipt-<number>.pdf)
export const PDF_PATH = /^[0-9a-f]{32}\/Receipt-[A-Za-z0-9-]{1,60}\.pdf$/
const MAX_PDF_BYTES = 1048576

const fail = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra })
export function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
function bearerToken(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')
  return m ? m[1] : ''
}
const validNumber = (d) => /^\d{9,15}$/.test(d) && (!d.startsWith('254') || /^254[17]\d{8}$/.test(d))

// what to tell the person when WhatsApp (or the connection to it) said no
function whatsappFailure(r) {
  if (r.timeout || r.network) {
    return { code: null, kind: 'wait', retry: true, text: 'WhatsApp could not be reached in time. The message may or may not have gone out, so check the customer\'s WhatsApp before trying again.' }
  }
  const e = explainWhatsappError(r.code, r.details || (r.code == null ? r.message : ''))
  return { code: r.code, kind: e.kind, retry: e.retry, text: e.text }
}

export async function handleSend(request, deps) {
  const clock = deps.now || Date.now
  const started = clock()
  const left = () => TIME_BUDGET_MS - (clock() - started)
  const log = deps.log || ((...args) => console.error(...args))
  const cfg = readConfig(deps.env || {})
  const action = new URL(request.url).searchParams.get('action') || ''

  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, fail('bad_request', 'That kind of request is not used here.'))
  const jwt = bearerToken(request)
  if (!jwt) return reply(401, fail('unauthorized', 'Please sign in again.'))
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    // without the database's address the server cannot even tell who is asking
    return action === 'status' && request.method === 'GET'
      ? reply(200, { ok: true, configured: false, missing: cfg.missingForSend, webhookReady: false, template: cfg.templateName })
      : reply(503, fail('not_configured', 'WhatsApp sending is not set up yet.', { missing: cfg.missingForSend }))
  }

  const db = supabaseApi({ url: cfg.supabaseUrl, anonKey: cfg.anonKey, serviceKey: cfg.serviceKey, fetch: deps.fetch })
  const who = await db.getUser(jwt)
  if (who.unreachable) return reply(503, fail('server_error', 'The database could not be reached. Please try again.'))
  if (!who.user) return reply(401, fail('unauthorized', 'Please sign in again.'))

  if (request.method === 'GET' && action === 'status') {
    return reply(200, { ok: true, configured: cfg.missingForSend.length === 0, missing: cfg.missingForSend, webhookReady: cfg.missingForWebhook.length === 0, template: cfg.templateName })
  }
  if ((await db.isAdmin(jwt)) !== true) return reply(403, fail('not_allowed', 'Only an admin can send receipts.'))
  if (request.method === 'GET' && action === 'check') return reply(200, await runSetupCheck(cfg, db, deps))
  if (request.method !== 'POST') return reply(400, fail('bad_request', 'That request is not understood.'))
  if (cfg.missingForSend.length > 0) return reply(503, fail('not_configured', 'WhatsApp sending is not set up yet.', { missing: cfg.missingForSend }))

  // ---- what to send ------------------------------------------------------------------------------------------------
  let body
  try { body = await request.json() } catch { body = null }
  const receiptId = Number(body && body.receiptId)
  const filePath = String((body && body.filePath) || '')
  if (!Number.isInteger(receiptId) || receiptId <= 0) return reply(400, fail('bad_request', 'Which receipt? The request did not say.'))
  if (!PDF_PATH.test(filePath)) return reply(400, fail('bad_request', 'The receipt file is missing or its name is not valid.'))
  const asked = body && body.to != null && body.to !== '' ? String(body.to).replace(/[\s+]/g, '') : ''
  if (asked && !validNumber(asked)) return reply(400, fail('no_number', 'That does not look like a WhatsApp number.'))

  // the receipt: read as the signed-in admin, so the database's rules decide whether it may be seen at all
  const found = await db.userGet(jwt, `customer_receipts?id=eq.${receiptId}&select=id,customer_id,customer_name,customer_contact,receipt_no,mpesa_code,amount,paid_at,expires_on,days_covered`)
  if (found.unreachable || !found.ok || !Array.isArray(found.data)) return reply(503, fail('server_error', 'The receipt could not be read. Please try again.'))
  const receipt = found.data[0]
  if (!receipt) return reply(404, fail('receipt_not_found', 'That receipt was not found.'))
  if (Number(receipt.days_covered) !== SUBSCRIPTION_DAYS) {
    return reply(409, fail('days_mismatch', `This receipt covers ${receipt.days_covered} days, but the approved WhatsApp message says ${SUBSCRIPTION_DAYS}. Send it by opening WhatsApp yourself.`))
  }

  // the customer: their first name and their number as they are now (the receipt keeps the number it had when it was made)
  let customer = null
  if (receipt.customer_id != null) {
    const c = await db.userGet(jwt, `customers?id=eq.${Number(receipt.customer_id)}&select=first_name,contact`)
    if (c.ok && Array.isArray(c.data) && c.data[0]) customer = c.data[0]
  }
  const firstName = (customer && String(customer.first_name || '').trim()) || String(receipt.customer_name || '').trim().split(/\s+/)[0] || ''
  const to = asked || whatsappNumber(customer && customer.contact) || whatsappNumber(receipt.customer_contact)
  if (!to || !validNumber(to)) return reply(422, fail('no_number', 'This customer has no usable WhatsApp number. Add one on the customer, then try again.'))

  // ---- one send at a time, and a record of it --------------------------------------------------------------------
  const begun = await db.serviceRpc('begin_receipt_message', { p_receipt_id: receiptId, p_recipient: to, p_user: who.user.id, p_channel: 'whatsapp', p_template: cfg.templateName })
  if (!begun.ok || !begun.data || typeof begun.data !== 'object') {
    log('whatsapp-send: begin_receipt_message failed', begun.status, JSON.stringify(begun.data || {}).slice(0, 300))
    return reply(503, fail('server_error', 'The message could not be recorded. Has update-49-migration.sql been run?'))
  }
  if (begun.data.ok !== true) {
    return begun.data.reason === 'rate'
      ? reply(429, fail('rate', 'Too many receipts were sent in the last hour. Please wait a little and try again.'))
      : reply(409, fail('busy', 'A message for this receipt was sent less than a minute ago. Please wait a minute before sending it again.'))
  }
  const logId = begun.data.id
  const finish = (wamid, code, text) => db.serviceRpc('finish_receipt_message', { p_id: logId, p_wamid: wamid, p_code: code, p_text: text })
  const stop = async (status, reason, text, code = null, extra = {}) => {
    const recorded = await finish(null, code, text)
    if (!recorded.ok) log('whatsapp-send: could not record the failure', recorded.status)
    return reply(status, fail(reason, text, { messageId: logId, ...extra }))
  }

  // ---- the PDF, then WhatsApp --------------------------------------------------------------------------------------
  const pdf = await db.publicFile(filePath)
  if (!pdf.ok || pdf.bytes.length < 100 || pdf.bytes.length > MAX_PDF_BYTES || String.fromCharCode(...pdf.bytes.slice(0, 4)) !== '%PDF') {
    return stop(502, 'pdf_unavailable', 'The receipt PDF could not be read from storage, so nothing was sent. Please try again.')
  }
  const graph = { fetch: deps.fetch, apiVersion: cfg.apiVersion }
  const filename = receiptFileName(receipt.receipt_no)
  const up = await uploadMedia(graph, { phoneNumberId: cfg.phoneNumberId, token: cfg.token, bytes: pdf.bytes, filename, timeoutMs: Math.min(8000, left() - 1500) })
  if (!up.ok) {
    log('whatsapp-send: upload failed', up.status, up.code, up.message)
    const why = whatsappFailure(up)
    return stop(502, 'whatsapp_failed', why.text, why.code, { code: why.code, kind: why.kind, retry: why.retry })
  }
  const params = templateParams({ firstName, amount: receipt.amount, code: receipt.mpesa_code, paidAt: receipt.paid_at, receiptNo: receipt.receipt_no, expiresOn: receipt.expires_on })
  const sent = await sendReceiptTemplate(graph, { phoneNumberId: cfg.phoneNumberId, token: cfg.token, to, mediaId: up.id, receiptNo: receipt.receipt_no, params, name: cfg.templateName, language: cfg.templateLanguage, timeoutMs: Math.min(8000, left() - 300) })
  if (!sent.ok) {
    log('whatsapp-send: send failed', sent.status, sent.code, sent.message)
    const why = whatsappFailure(sent)
    return stop(502, 'whatsapp_failed', why.text, why.code, { code: why.code, kind: why.kind, retry: why.retry })
  }
  const recorded = await finish(sent.wamid, null, null)
  if (!recorded.ok) log('whatsapp-send: sent, but could not record the id', sent.wamid, recorded.status)
  return reply(200, { ok: true, messageId: logId, wamid: sent.wamid, to, status: 'accepted', recorded: recorded.ok })
}

// ---- the step-by-step setup check ------------------------------------------------------------------------------------
// -> { ok: true, ready, checks: [{ id, label, state: 'ok' | 'warn' | 'bad' | 'skip', detail }] }
export async function runSetupCheck(cfg, db, deps) {
  const checks = []
  const add = (id, label, state, detail) => checks.push({ id, label, state, detail })
  const graph = { fetch: deps.fetch, apiVersion: cfg.apiVersion }

  add('settings', 'Settings in Netlify', cfg.missingForSend.length ? 'bad' : 'ok',
    cfg.missingForSend.length ? `Missing: ${cfg.missingForSend.join(', ')}.` : 'Everything needed for sending is filled in.')
  add('webhook_settings', 'Settings for delivery updates', cfg.missingForWebhook.length ? 'warn' : 'ok',
    cfg.missingForWebhook.length ? `Missing: ${cfg.missingForWebhook.join(', ')}. Receipts can still be sent, but they will not show Delivered or Read.` : 'The app secret and verify token are filled in.')

  if (cfg.serviceKey) {
    const logCheck = await db.serviceGet('receipt_messages?select=id&limit=1')
    add('database', 'Message log in the database', logCheck.ok ? 'ok' : 'bad',
      logCheck.ok ? 'The message log is ready.' : `The message log could not be read (${logCheck.status || 'no answer'}). Check that update-49-migration.sql has been run and that the service key is the right one.`)
  } else add('database', 'Message log in the database', 'skip', 'Needs SUPABASE_SERVICE_ROLE_KEY.')

  if (cfg.token && cfg.phoneNumberId) {
    const r = await graphRequest(graph, { path: cfg.phoneNumberId, query: { fields: 'display_phone_number,verified_name,quality_rating' }, token: cfg.token, timeoutMs: 6000 })
    if (r.ok) add('number', 'WhatsApp number', 'ok', [r.data.display_phone_number, r.data.verified_name, r.data.quality_rating ? `quality ${String(r.data.quality_rating).toLowerCase()}` : ''].filter(Boolean).join(' · ') || 'The number was found.')
    else add('number', 'WhatsApp number', 'bad', whatsappFailure(r).text)
  } else add('number', 'WhatsApp number', 'skip', 'Needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.')

  if (cfg.token && cfg.wabaId) {
    const r = await graphRequest(graph, { path: `${cfg.wabaId}/message_templates`, query: { name: cfg.templateName, fields: 'name,status,language,category,rejected_reason', limit: '20' }, token: cfg.token, timeoutMs: 6000 })
    if (!r.ok) add('template', 'Message template', 'bad', whatsappFailure(r).text)
    else {
      const all = (r.data && Array.isArray(r.data.data) ? r.data.data : []).filter((t) => t.name === cfg.templateName)
      const t = all.find((x) => x.language === cfg.templateLanguage) || all[0]
      if (!t) add('template', 'Message template', 'bad', `No template called "${cfg.templateName}" was found. Create it as described in the setup guide.`)
      else if (t.status === 'APPROVED') {
        add('template', 'Message template', t.category && t.category !== RECEIPT_TEMPLATE.category ? 'warn' : 'ok',
          t.category && t.category !== RECEIPT_TEMPLATE.category ? `"${t.name}" is approved, but Meta filed it as ${t.category}, which costs more per message than ${RECEIPT_TEMPLATE.category}.` : `"${t.name}" (${t.language}) is approved.`)
      } else if (t.status === 'PENDING' || t.status === 'IN_REVIEW') add('template', 'Message template', 'warn', `"${t.name}" is waiting for Meta's approval. Receipts cannot be sent until it is approved.`)
      else add('template', 'Message template', 'bad', `"${t.name}" is ${String(t.status || 'not usable').toLowerCase()}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ` (${t.rejected_reason})` : ''}. Fix or recreate it in WhatsApp Manager.`)
    }
  } else add('template', 'Message template', 'skip', 'Needs WHATSAPP_BUSINESS_ACCOUNT_ID to look up the template.')

  return { ok: true, ready: checks.every((c) => c.state !== 'bad') && cfg.missingForSend.length === 0, checks }
}
