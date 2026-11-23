// The screen's side of sending a receipt through the WhatsApp Business API. It talks to the Netlify function on the same
// site (netlify/functions/whatsapp-send.mjs): asks whether automatic sending is set up, sends a receipt that is already
// saved, and runs the setup check. Every call gives back a plain result and never throws, so a screen can always fall back
// to opening WhatsApp by hand.
//
//   getWhatsappStatus(client)     -> { available, configured, missing, webhookReady, template, problem? }
//   runWhatsappCheck(client)      -> { ok: true, ready, checks: [{ id, label, state, detail }] } | { ok: false, message }
//   sendReceiptViaApi(client, { receiptId, filePath, to })
//                                 -> { ok: true, wamid, to, messageId, recorded }
//                                  | { ok: false, reason, message, kind, retry, unknown, code, messageId, status }
//        unknown: true when it is not known whether the message went out (no answer came back), so it must be checked
//                 before it is sent again
//
// `client` is the Supabase client (only its sign-in is used: the person's own login goes to the function, which asks the
// database who they are and whether they are an admin).
export const SEND_ENDPOINT = '/.netlify/functions/whatsapp-send'
export const SEND_TIMEOUT_MS = 20000        // the server gives up on WhatsApp after 9 seconds; this leaves room for a slow connection
export const QUICK_TIMEOUT_MS = 12000
export const CHECK_TIMEOUT_MS = 25000

async function accessToken(client) {
  try {
    const { data } = await client.auth.getSession()
    return (data && data.session && data.session.access_token) || ''
  } catch { return '' }
}

// -> { status, json } or { problem: 'signin' | 'timeout' | 'network' }
async function call(client, { method = 'GET', query = '', body, timeoutMs, fetchImpl, endpoint = SEND_ENDPOINT }) {
  const token = await accessToken(client)
  if (!token) return { problem: 'signin' }
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
  if (!doFetch) return { problem: 'network' }
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await doFetch(`${endpoint}${query}`, {
      method, cache: 'no-store', signal: controller ? controller.signal : undefined,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not JSON: a platform error page */ }
    return { status: res.status, json: json && typeof json === 'object' ? json : null }
  } catch (err) {
    return { problem: err && err.name === 'AbortError' ? 'timeout' : 'network' }
  } finally { if (timer) clearTimeout(timer) }
}

// ---- is automatic sending set up? ------------------------------------------------------------------------------------
export async function getWhatsappStatus(client, opts = {}) {
  const none = { available: false, configured: false, missing: [], webhookReady: false, template: '' }
  const r = await call(client, { query: '?action=status', timeoutMs: QUICK_TIMEOUT_MS, ...opts })
  if (r.problem) return { ...none, problem: r.problem }
  if (r.status !== 200 || !r.json || r.json.ok !== true) return { ...none, problem: r.status === 401 ? 'signin' : 'unavailable' }
  return {
    available: true,
    configured: r.json.configured === true,
    missing: Array.isArray(r.json.missing) ? r.json.missing.map(String) : [],
    webhookReady: r.json.webhookReady === true,
    template: String(r.json.template || ''),
  }
}

// ---- the step-by-step setup check --------------------------------------------------------------------------------------
const CHECK_STATES = new Set(['ok', 'warn', 'bad', 'skip'])
export async function runWhatsappCheck(client, opts = {}) {
  const r = await call(client, { query: '?action=check', timeoutMs: CHECK_TIMEOUT_MS, ...opts })
  if (r.problem === 'signin') return { ok: false, message: 'Please sign in again.' }
  if (r.problem === 'timeout') return { ok: false, message: 'The check took too long. Try again in a moment.' }
  if (r.problem) return { ok: false, message: 'The check could not reach the server. Check the internet connection.' }
  if (r.status === 200 && r.json && r.json.ok === true && Array.isArray(r.json.checks)) {
    return {
      ok: true, ready: r.json.ready === true,
      checks: r.json.checks.map((c) => ({ id: String(c.id || ''), label: String(c.label || ''), state: CHECK_STATES.has(c.state) ? c.state : 'warn', detail: String(c.detail || '') })),
    }
  }
  if (r.status === 403) return { ok: false, message: 'Only an admin can run the check.' }
  if (r.status === 404) return { ok: false, message: 'Automatic WhatsApp sending is not available on this site (the Netlify function is not there).' }
  if (r.status === 502 || r.status === 504) return { ok: false, message: 'The check took too long. Try again in a moment.' }
  return { ok: false, message: (r.json && r.json.message && String(r.json.message)) || 'The check could not be run.' }
}

// ---- sending a saved receipt ------------------------------------------------------------------------------------------------
// Reasons that are worth trying again (after a pause, or after signing in again). The others need something changed first.
const RETRY_LATER = new Set(['busy', 'rate', 'pdf_unavailable', 'server_error', 'unauthorized'])
const failure = (reason, message, extra = {}) => ({ ok: false, reason, message, kind: 'other', retry: RETRY_LATER.has(reason), unknown: false, code: null, messageId: null, status: 0, ...extra })

export async function sendReceiptViaApi(client, { receiptId, filePath, to }, opts = {}) {
  const r = await call(client, { method: 'POST', body: { receiptId, filePath, ...(to ? { to: String(to) } : {}) }, timeoutMs: SEND_TIMEOUT_MS, ...opts })
  if (r.problem === 'signin') return failure('unauthorized', 'Please sign in again, then press Try again.')
  if (r.problem) {
    // the request went out but no answer came back: the message may well have been sent
    const why = r.problem === 'timeout' ? 'No answer came back in time' : 'The connection dropped before an answer came back'
    return failure(r.problem, `${why}, so it is not known whether the message was sent. Check the message status before sending it again.`, { kind: 'wait', retry: true, unknown: true })
  }
  const j = r.json
  if (r.status === 200 && j && j.ok === true && j.wamid) {
    return { ok: true, wamid: String(j.wamid), to: String(j.to || ''), messageId: j.messageId == null ? null : String(j.messageId), recorded: j.recorded !== false }
  }
  if (j && j.ok === false) {
    const reason = String(j.reason || 'server_error')
    const code = j.code == null || !Number.isFinite(Number(j.code)) ? null : Number(j.code)
    const kind = String(j.kind || 'other')
    return failure(reason, String(j.message || 'The message could not be sent.'), {
      kind, code, status: r.status, messageId: j.messageId == null ? null : String(j.messageId),
      retry: typeof j.retry === 'boolean' ? j.retry : RETRY_LATER.has(reason),
      unknown: reason === 'whatsapp_failed' && code == null && kind === 'wait',        // WhatsApp did not answer in time
    })
  }
  if (r.status === 404) return failure('unavailable', 'Automatic WhatsApp sending is not available on this site.', { status: 404 })
  if (r.status >= 500) {
    // the platform stopped the function (usually because WhatsApp was too slow): it is not known how far it got
    return failure('server_error', 'The server did not answer properly, so it is not known whether the message was sent. Check the message status before sending it again.', { kind: 'wait', retry: true, unknown: true, status: r.status })
  }
  return failure('server_error', 'The message could not be sent. Please try again.', { status: r.status })
}
