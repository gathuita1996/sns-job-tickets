import { useState } from 'react'
import { AlertTriangle, ExternalLink, FileText, MessageCircle, Pencil, Receipt, Trash2 } from 'lucide-react'
import { ConfirmDialog } from './shared'
import { formatEatDateTime } from '../lib/eat'
import { SUBSCRIPTION_DAYS, describeSubscription, endMoment } from '../lib/subscription'
import { formatWhatsappNumber, whatsappNumber } from '../lib/phone'
import { openPendingWindow } from '../lib/whatsapp'
import { deleteReceipt, linkForReceipt, messageForReceipt, whatsappUrl } from '../lib/receipts'
import { formatReceiptMoney } from '../lib/receiptText'

const SHOWN = 5

export function SubscriptionBadge({ sub }) {
  return <span className={`sns-badge ${sub.active ? 'sns-badge-done' : 'sns-badge-pending'}`}>{sub.active ? 'Active' : 'Inactive'}</span>
}

// What opens under a customer's row when it is clicked: whether they are Active, the button to send a receipt, and the
// receipts already sent (open the PDF, send it again on WhatsApp, and -- for the Director only -- delete one).
//   customer : the customer      sub : their subscription (subscription.js)      mine : their receipts, newest payment first
export default function CustomerReceipts({ id, customer, sub, now, mine, client, isDirector, onSend, onEdit, onChanged, notify }) {
  const [busy, setBusy] = useState('')                     // which action is running, e.g. 'pdf-12'
  const [showAll, setShowAll] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [fallback, setFallback] = useState(null)           // a link to press when the browser blocked the new tab
  const number = whatsappNumber(customer.contact)
  const shown = showAll ? mine : mine.slice(0, SHOWN)

  async function open(receipt, kind) {
    if (busy) return
    setBusy(`${kind}-${receipt.id}`); setFallback(null)
    const waiting = openPendingWindow(kind === 'pdf' ? 'Opening the receipt…' : 'Opening WhatsApp…')      // opened now, inside the click
    try {
      const link = await linkForReceipt(client, receipt)
      const url = kind === 'pdf' ? link : whatsappUrl(number, messageForReceipt(customer, receipt, link))
      if (!waiting.go(url)) setFallback({ url, label: kind === 'pdf' ? 'Open the receipt' : 'Open WhatsApp' })
    } catch {
      waiting.close()
      notify('The receipt could not be opened. Check the internet connection and try again.', 'error')
    } finally { setBusy('') }
  }

  async function remove(receipt) {
    setConfirmDelete(null)
    const r = await deleteReceipt(client, receipt)
    if (!r.ok) { notify(r.error, 'error'); return }
    notify(`Receipt ${receipt.receiptNo} deleted.`)
    await onChanged()
  }

  return (
    <div id={id} style={{ padding: '0.2rem 0' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.8rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '0.9rem' }}>
            <SubscriptionBadge sub={sub} />{' '}
            <span className="sns-text-soft" title={sub.never ? undefined : `Runs out ${endMoment(sub)} (Kenya time)`}>{describeSubscription(sub, now)}</span>
          </p>
          <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginTop: '0.3rem' }}>
            {number ? <>WhatsApp: {formatWhatsappNumber(number)}</> : <>No usable WhatsApp number{customer.contact ? ` ("${customer.contact}")` : ''}</>}
          </p>
        </div>
        <button type="button" className="sns-btn-primary" onClick={() => onSend(customer)} style={{ fontSize: '0.85rem' }}><Receipt size={15} /> Send receipt</button>
      </div>

      {!number && (
        <p role="alert" className="flex items-center gap-2" style={{ background: 'var(--danger-pale)', color: 'var(--danger)', fontSize: '0.82rem', borderRadius: 9, padding: '0.6rem 0.8rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <AlertTriangle size={15} aria-hidden="true" /> A receipt goes out on WhatsApp, so this customer needs a valid phone number first.
          <button type="button" className="sns-btn-link sns-link-icon" onClick={() => onEdit(customer)}><Pencil size={12} aria-hidden="true" /> Edit customer</button>
        </p>
      )}

      <div style={{ marginTop: '1rem' }}>
        <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.4rem' }}>Receipts sent{mine.length ? ` (${mine.length})` : ''}</p>
        {mine.length === 0 ? <p className="sns-text-faint" style={{ fontSize: '0.84rem' }}>None yet. Once a receipt is sent, this customer is Active for {SUBSCRIPTION_DAYS} days from the payment.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((r) => (
              <li key={r.id} className="flex items-center justify-between" style={{ gap: '0.6rem 1rem', padding: '0.55rem 0', borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, fontSize: '0.84rem' }}>
                  <p>
                    <span className="sns-mono" style={{ fontWeight: 600 }}>{r.receiptNo}</span>
                    <span className="sns-text-soft"> · {formatReceiptMoney(r.amount)}</span>
                    {sub.active && sub.receipt && sub.receipt.id === r.id && <> <span className="sns-badge sns-badge-done" style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem' }}>Current</span></>}
                  </p>
                  <p className="sns-text-faint" style={{ fontSize: '0.76rem' }}>Paid {formatEatDateTime(r.paidAt)} · valid until {formatEatDateTime(r.validUntil)} · <span className="sns-mono">{r.mpesaCode}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }} disabled={Boolean(busy)} onClick={() => open(r, 'pdf')} aria-label={`Open the PDF of receipt ${r.receiptNo}`}><FileText size={13} /> {busy === `pdf-${r.id}` ? 'Opening…' : 'PDF'}</button>
                  <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }} disabled={Boolean(busy) || !number} title={number ? undefined : 'This customer has no usable WhatsApp number'} onClick={() => open(r, 'wa')} aria-label={`Resend receipt ${r.receiptNo} on WhatsApp`}><MessageCircle size={13} /> {busy === `wa-${r.id}` ? 'Opening…' : 'Resend'}</button>
                  {isDirector && <button type="button" className="sns-icon-btn danger" title="Delete this receipt (Director only)" aria-label={`Delete receipt ${r.receiptNo}`} onClick={() => setConfirmDelete(r)}><Trash2 size={15} /></button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {mine.length > SHOWN && <button type="button" className="sns-btn-link" style={{ marginTop: '0.5rem' }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${mine.length}`}</button>}
      </div>

      {fallback && (
        <p role="alert" style={{ marginTop: '0.8rem', fontSize: '0.84rem' }}>
          Your browser blocked the new window. <a className="sns-btn-link sns-link-icon" href={fallback.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden="true" /> {fallback.label}</a>
        </p>
      )}

      {confirmDelete && (
        <ConfirmDialog danger title="Delete receipt"
          message={`Delete receipt ${confirmDelete.receiptNo} (${formatReceiptMoney(confirmDelete.amount)}, paid ${formatEatDateTime(confirmDelete.paidAt)})? ${customer.firstName || 'The customer'} will no longer be Active because of it unless another receipt covers them. This cannot be undone, and anything already sent on WhatsApp stays with the customer.`}
          onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />
      )}
    </div>
  )
}
