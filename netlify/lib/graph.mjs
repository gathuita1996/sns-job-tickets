// Talking to WhatsApp's Cloud API (Meta's Graph API). Every call returns a plain result instead of throwing:
//   { ok: true, status, data }
//   { ok: false, status, code, subcode, message, details, timeout?, network? }     (code = WhatsApp's own error code)
// `deps.fetch` is passed in so the same code runs against a pretend WhatsApp in the tests.
import { templatePayload } from '../../src/lib/whatsappTemplate.js'

export async function graphRequest(deps, { method = 'GET', path, query, json, form, token, timeoutMs = 8000 }) {
  const url = new URL(`https://graph.facebook.com/${deps.apiVersion}/${path}`)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  let body
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json) }
  else if (form) body = form                                   // the boundary of a form is set by fetch itself
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  try {
    const res = await deps.fetch(url.toString(), { method, headers, body, signal: controller.signal })
    const text = await res.text()
    let data = null
    try { data = JSON.parse(text) } catch { /* not JSON */ }
    if (res.ok && data && !data.error) return { ok: true, status: res.status, data }
    const e = (data && data.error) || {}
    return {
      ok: false, status: res.status, code: e.code == null ? null : Number(e.code), subcode: e.error_subcode == null ? null : Number(e.error_subcode),
      message: String(e.message || `WhatsApp answered with HTTP ${res.status}`), details: String((e.error_data && e.error_data.details) || ''), data,
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return { ok: false, status: 0, code: null, subcode: null, message: 'WhatsApp took too long to answer', details: '', timeout: true }
    return { ok: false, status: 0, code: null, subcode: null, message: String((err && err.message) || err), details: '', network: true }
  } finally { clearTimeout(timer) }
}

// Puts the PDF with WhatsApp so it can be attached to the message -> { ok: true, id } or the failed result
export async function uploadMedia(deps, { phoneNumberId, token, bytes, filename, timeoutMs }) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'application/pdf')
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename)
  const r = await graphRequest(deps, { method: 'POST', path: `${phoneNumberId}/media`, form, token, timeoutMs })
  if (!r.ok) return r
  const id = r.data && r.data.id
  if (!id) return { ok: false, status: r.status, code: null, subcode: null, message: 'WhatsApp did not give an id for the uploaded PDF', details: '' }
  return { ok: true, id: String(id) }
}

// Sends the receipt template -> { ok: true, wamid } or the failed result
export async function sendReceiptTemplate(deps, { phoneNumberId, token, to, mediaId, receiptNo, params, name, language, timeoutMs }) {
  const payload = templatePayload({ to, mediaId, receiptNo, params, name, language })
  const r = await graphRequest(deps, { method: 'POST', path: `${phoneNumberId}/messages`, json: payload, token, timeoutMs })
  if (!r.ok) return r
  const sent = r.data && Array.isArray(r.data.messages) ? r.data.messages[0] : null
  if (!sent || !sent.id) return { ok: false, status: r.status, code: null, subcode: null, message: 'WhatsApp answered without a message id', details: '' }
  return { ok: true, wamid: String(sent.id), payload }
}
