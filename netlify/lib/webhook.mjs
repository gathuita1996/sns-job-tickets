// What WhatsApp tells us afterwards about each message: sent, delivered, read, or failed. WhatsApp calls this address
// (netlify/functions/whatsapp-webhook.mjs) every time a message moves on; the news is written to the message log, which is
// what the screen shows on each receipt.
//
//   GET   the one-time handshake when the address is saved in Meta: answer with the number WhatsApp sends, if the verify token matches
//   POST  the news itself. It is only believed when its signature (made with the app secret) is right.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { explainWhatsappError } from '../../src/lib/whatsappErrors.js'
import { readConfig } from './config.mjs'
import { supabaseApi } from './supabaseRest.mjs'

const MAX_BODY = 1048576
const TRACKED = new Set(['sent', 'delivered', 'read', 'failed'])

// "sha256=<hex>" of the exact bytes received, made with the app secret
export function sign(rawBody, secret) {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
}
export function verifySignature(rawBody, header, secret) {
  if (!secret || !header) return false
  const want = Buffer.from(sign(rawBody, secret))
  const got = Buffer.from(String(header).trim())
  return got.length === want.length && timingSafeEqual(got, want)
}

// The news in a WhatsApp notification -> [{ wamid, status, at, code, text }]. Customers' own messages and anything
// that is not about a message we sent are skipped.
export function extractStatuses(payload) {
  const out = []
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return out
  for (const entry of payload.entry) {
    for (const change of (entry && entry.changes) || []) {
      const value = change && change.value
      for (const s of (value && Array.isArray(value.statuses) ? value.statuses : [])) {
        if (!s || !s.id || !TRACKED.has(s.status)) continue
        const seconds = Number(s.timestamp)
        let code = null, text = null
        if (s.status === 'failed') {
          const err = Array.isArray(s.errors) && s.errors[0] ? s.errors[0] : {}
          code = err.code == null ? null : Number(err.code)
          const why = explainWhatsappError(code, (err.error_data && err.error_data.details) || err.message || err.title || '')
          text = why.text
        }
        out.push({ wamid: String(s.id), status: s.status, at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null, code, text })
      }
    }
  }
  return out
}

export async function handleWebhook(request, deps) {
  const cfg = readConfig(deps.env || {})
  const log = deps.log || ((...args) => console.error(...args))
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  if (request.method === 'GET') {
    const q = new URL(request.url).searchParams
    if (cfg.verifyToken && q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === cfg.verifyToken && q.get('hub.challenge')) {
      return new Response(q.get('hub.challenge'), { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('Forbidden', { status: 403 })
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (cfg.missingForWebhook.length > 0) {
    log('whatsapp-webhook: not set up, missing', cfg.missingForWebhook.join(', '))
    return new Response('Not set up', { status: 503 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY) return new Response('Too large', { status: 413 })
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), cfg.appSecret)) return new Response('Bad signature', { status: 401 })
  let payload
  try { payload = JSON.parse(raw) } catch { return new Response('Bad request', { status: 400 }) }

  const news = extractStatuses(payload)
  const db = supabaseApi({ url: cfg.supabaseUrl, anonKey: cfg.anonKey, serviceKey: cfg.serviceKey, fetch: deps.fetch })
  const record = (n) => db.serviceRpc('record_whatsapp_status', { p_wamid: n.wamid, p_status: n.status, p_at: n.at, p_code: n.code, p_text: n.text })
  const counts = { applied: 0, ignored: 0, unknown: 0 }
  let unknown = []
  for (const n of news) {
    const r = await record(n)
    if (!r.ok) { log('whatsapp-webhook: could not record', n.status, r.status); return new Response('Try again', { status: 500 }) }   // WhatsApp sends it again later
    if (r.data === 'unknown') unknown.push(n)
    else counts[r.data === 'applied' ? 'applied' : 'ignored']++
  }
  // News can arrive before the server has written the message's id to the log (WhatsApp is quick). Look once more shortly after.
  if (unknown.length > 0) {
    await sleep(1500)
    for (const n of unknown) {
      const r = await record(n)
      if (!r.ok) { log('whatsapp-webhook: could not record', n.status, r.status); return new Response('Try again', { status: 500 }) }
      counts[r.data === 'applied' ? 'applied' : r.data === 'unknown' ? 'unknown' : 'ignored']++
    }
  }
  return new Response(JSON.stringify({ ok: true, ...counts }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
