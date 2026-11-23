import { AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react'
import { describeMessage } from '../lib/receiptMessages'

const TONE_CLASS = { ok: 'sns-badge-done', bad: 'sns-badge-overdue', info: 'sns-badge-role', wait: 'sns-badge-pending' }
const ICON = { accepted: Check, sent: Check, delivered: CheckCheck, read: CheckCheck }

// One WhatsApp message as a small badge: "Delivered · 23 Nov 2026, 11:00 AM". A message that did not go says why, in words,
// right under the badge. `detail="always"` also shows the explanation for the stages still on their way.
//   message : a row of the message log (mapReceiptMessage)      webhookReady : false when delivery updates are off
export default function MessageStatus({ message, webhookReady = true, now, detail = 'problems' }) {
  const d = describeMessage(message, { webhookReady, now })
  const Icon = d.tone === 'bad' ? AlertTriangle : ICON[d.key] || Clock
  const showDetail = d.detail && (detail === 'always' || d.tone === 'bad')
  return (
    <span className="sns-message-status" data-status={d.key} style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
      <span className={`sns-badge ${TONE_CLASS[d.tone] || TONE_CLASS.wait}`} style={{ fontSize: '0.7rem' }}><Icon size={12} aria-hidden="true" /> WhatsApp: {d.text}</span>
      {showDetail && <span className="sns-text-soft" style={{ fontSize: '0.76rem', lineHeight: 1.4 }}>{d.detail}</span>}
    </span>
  )
}
