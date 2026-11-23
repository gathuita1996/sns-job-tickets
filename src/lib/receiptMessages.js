// What was sent through WhatsApp for each receipt (the rows of the message log, see receipt_messages) and how it reads on
// the screen. Plain logic, so it can be tested without a browser.
//
// A message moves through these stages, and only ever forwards:
//   queued    the server is handing it to WhatsApp                       (a moment)
//   accepted  WhatsApp took it                                           (the server heard back)
//   sent      WhatsApp's servers sent it on                               (reported by WhatsApp afterwards)
//   delivered it reached the customer's phone                             (  "  )
//   read      the customer opened it                                      (  "  )
//   failed    it did not go, and the reason is kept
// The last three come from WhatsApp's delivery updates (the webhook); without those a message stays at "accepted".
import { formatEatDateTimeComma } from './eat.js'

const ms = (d) => new Date(d).getTime()

// A message that is still "queued" after this long was never handed over (the server stopped part-way).
export const QUEUED_GIVE_UP_MS = 2 * 60 * 1000

const STAGES = {
  queued: { label: 'Sending…', tone: 'wait', final: false },
  accepted: { label: 'Accepted by WhatsApp', tone: 'info', final: false },
  sent: { label: 'Sent', tone: 'info', final: false },
  delivered: { label: 'Delivered', tone: 'ok', final: true },
  read: { label: 'Read', tone: 'ok', final: true },
  failed: { label: 'Not delivered', tone: 'bad', final: true },
}

// messages -> Map(receiptId -> that receipt's messages, newest first)
export function messagesByReceipt(messages) {
  const by = new Map()
  for (const m of messages || []) {
    if (m == null || m.receiptId == null) continue
    if (!by.has(m.receiptId)) by.set(m.receiptId, [])
    by.get(m.receiptId).push(m)
  }
  for (const list of by.values()) list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
  return by
}

// One message in words.
//   { key, label, tone ('wait' | 'info' | 'ok' | 'bad'), final, detail, at, text }
//     text : label and time in one line, "Delivered · 21 Nov 2026, 05:51 PM"
//   webhookReady : false when delivery updates are not switched on (so "accepted" will not change)
export function describeMessage(msg, { webhookReady = true, now = new Date() } = {}) {
  const key = msg && STAGES[msg.status] ? msg.status : 'queued'
  let stage = STAGES[key]
  let detail = ''
  if (key === 'queued') {
    const age = msg && msg.createdAt ? ms(now) - ms(msg.createdAt) : 0
    if (age > QUEUED_GIVE_UP_MS) {
      stage = { label: 'Not confirmed', tone: 'bad', final: true }
      detail = 'WhatsApp never confirmed this message, so it may not have been sent. Check the customer\'s WhatsApp before sending it again.'
    } else detail = 'Handing the message to WhatsApp…'
  } else if (key === 'failed') detail = (msg.errorText && String(msg.errorText).trim()) || 'WhatsApp could not deliver the message.'
  else if (key === 'accepted' || key === 'sent') detail = webhookReady ? 'Waiting for WhatsApp to say whether it reached the phone.' : 'Delivery updates are not switched on, so this will stay as it is.'

  const when = { read: msg && msg.readAt, delivered: msg && msg.deliveredAt, sent: msg && msg.sentAt, failed: msg && msg.failedAt }[key] || (msg && (msg.updatedAt || msg.createdAt)) || null
  const at = when && Number.isFinite(ms(when)) ? new Date(when) : null
  return { key, label: stage.label, tone: stage.tone, final: stage.final, detail, at, text: at ? `${stage.label} · ${formatEatDateTimeComma(at)}` : stage.label }
}
