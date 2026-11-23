import { useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, FileText, MessageCircle, Pencil, Receipt, RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmDialog } from './shared'
import MessageStatus from './MessageStatus'
import { formatDayKey, formatEatDateTime } from '../lib/eat'
import { describeSubscription, endLabel, expiryKeyOf } from '../lib/subscription'
import { formatWhatsappNumber, whatsappNumber } from '../lib/phone'
import { openPendingWindow } from '../lib/whatsapp'
import { deleteReceipt, ensureReceiptFile, linkForReceipt, messageForReceipt, whatsappUrl } from '../lib/receipts'
import { formatReceiptMoney } from '../lib/receiptText'
import { sendReceiptViaApi } from '../lib/whatsappApi'

const SHOWN = 5

export function SubscriptionBadge({ sub }) {
  return <span className={`sns-badge ${sub.active ? 'sns-badge-done' : 'sns-badge-pending'}`}>{sub.active ? 'Active' : 'Inactive'}</span>
}

// What opens under a customer's row when it is clicked: whether they are Active, the button to send a receipt, and the
// receipts already sent (open the PDF, send it again on WhatsApp, see whether WhatsApp delivered it, and -- for the Director
// only -- delete one).
//   customer : the customer      sub : their subscription (subscription.js)      mine : their receipts, newest payment first
//   messagesByReceipt : Map(receiptId -> that receipt's WhatsApp messages, newest first)      whatsapp : is automatic sending set up?
//   onRefreshMessages : load the message log again
export default function CustomerReceipts({ id, customer, sub, now, mine, messagesByReceipt = new Map(), whatsapp = null, client, isDirector, onSend, onEdit, onChanged, onRefreshMessages, notify }) {
  const [busy, setBusy] = useState('')                     // which action is running, e.g. 'pdf-12'
  const working = useRef(false)                        // the same, but set at once: a second press in the same moment is ignored (`busy` only changes after the next redraw)
  const [showAll, setShowAll] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmResend, setConfirmResend] = useState(null) // a receipt about to be sent again automatically
  const [problem, setProblem] = useState(null)             // { receipt, result, url } when an automatic send did not go through
  const [fallback, setFallback] = useState(null)           // a link to press when the browser blocked the new tab
  const number = whatsappNumber(customer.contact)
  const apiReady = Boolean(whatsapp && whatsapp.available && whatsapp.configured)
  const webhookReady = whatsapp ? whatsapp.webhookReady : true
  const shown = showAll ? mine : mine.slice(0, SHOWN)

  function refreshLog() {
    try { const p = onRefreshMessages && onRefreshMessages(); if (p && typeof p.catch === 'function') p.catch(() => {}) } catch { /* the log refreshes by itself when it changes */ }
  }

  async function open(receipt, kind) {
    if (working.current || busy) return
    working.current = true
    setBusy(`${kind}-${receipt.id}`); setFallback(null); setProblem(null)
    const waiting = openPendingWindow(kind === 'pdf' ? 'Opening the receipt…' : 'Opening WhatsApp…')      // opened now, inside the click
    try {
      const link = await linkForReceipt(client, receipt)
      const url = kind === 'pdf' ? link : whatsappUrl(number, messageForReceipt(customer, receipt, link))
      if (!waiting.go(url)) setFallback({ url, label: kind === 'pdf' ? 'Open the receipt' : 'Open WhatsApp' })
    } catch {
      waiting.close()
      notify('The receipt could not be opened. Check the internet connection and try again.', 'error')
    } finally { working.current = false; setBusy('') }
  }

  // "Resend": straight from the business WhatsApp number when that is set up (after asking), otherwise WhatsApp opens
  function resendClicked(receipt) {
    if (working.current || busy) return
    if (apiReady) { setProblem(null); setFallback(null); setConfirmResend(receipt) } else open(receipt, 'wa')
  }

  async function resendNow(receipt) {
    setConfirmResend(null)
    if (working.current || busy) return
    working.current = true
    setBusy(`wa-${receipt.id}`); setProblem(null); setFallback(null)
    try {
      const file = await ensureReceiptFile(client, receipt)
      const r = await sendReceiptViaApi(client, { receiptId: receipt.id, filePath: file.path, to: number })
      if (r.ok) notify(`Receipt ${receipt.receiptNo} sent to ${customer.firstName || 'the customer'} on WhatsApp.`)
      else setProblem({ receipt, result: r, url: whatsappUrl(number, messageForReceipt(customer, receipt, file.link)) })
    } catch {
      notify('The receipt could not be prepared. Check the internet connection and try again.', 'error')
    } finally { working.current = false; setBusy(''); refreshLog() }
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
            <span className="sns-text-soft" title={sub.never ? undefined : endLabel(sub)}>{describeSubscription(sub, now)}</span>
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
        {mine.length === 0 ? <p className="sns-text-faint" style={{ fontSize: '0.84rem' }}>None yet. Once a receipt is sent, this customer is Active until the expiry date on it.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((r) => {
              const latest = (messagesByReceipt.get(r.id) || [])[0]
              return (
                <li key={r.id} className="flex items-center justify-between" style={{ gap: '0.6rem 1rem', padding: '0.55rem 0', borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, fontSize: '0.84rem' }}>
                    <p>
                      <span className="sns-mono" style={{ fontWeight: 600 }}>{r.receiptNo}</span>
                      <span className="sns-text-soft"> · {formatReceiptMoney(r.amount)}</span>
                      {sub.active && sub.receipt && sub.receipt.id === r.id && <> <span className="sns-badge sns-badge-done" style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem' }}>Current</span></>}
                    </p>
                    <p className="sns-text-faint" style={{ fontSize: '0.76rem' }}>Paid {formatEatDateTime(r.paidAt)} · expires {formatDayKey(expiryKeyOf(r))} · <span className="sns-mono">{r.mpesaCode}</span></p>
                    {latest && <div style={{ marginTop: '0.3rem' }}><MessageStatus message={latest} webhookReady={webhookReady} now={now} /></div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }} disabled={Boolean(busy)} onClick={() => open(r, 'pdf')} aria-label={`Open the PDF of receipt ${r.receiptNo}`}><FileText size={13} /> {busy === `pdf-${r.id}` ? 'Opening…' : 'PDF'}</button>
                    <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }} disabled={Boolean(busy) || !number}
                      title={!number ? 'This customer has no usable WhatsApp number' : apiReady ? 'Send this receipt to the customer again on WhatsApp' : 'Open WhatsApp with this receipt ready to send'}
                      onClick={() => resendClicked(r)} aria-label={`Resend receipt ${r.receiptNo} on WhatsApp`}><MessageCircle size={13} /> {busy === `wa-${r.id}` ? (apiReady ? 'Sending…' : 'Opening…') : 'Resend'}</button>
                    {isDirector && <button type="button" className="sns-icon-btn danger" title="Delete this receipt (Director only)" aria-label={`Delete receipt ${r.receiptNo}`} onClick={() => setConfirmDelete(r)}><Trash2 size={15} /></button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {mine.length > SHOWN && <button type="button" className="sns-btn-link" style={{ marginTop: '0.5rem' }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${mine.length}`}</button>}
      </div>

      {problem && (
        <div role="alert" style={{ marginTop: '0.8rem', fontSize: '0.84rem', background: problem.result.unknown ? 'var(--stamp-pale)' : 'var(--danger-pale)', color: problem.result.unknown ? 'var(--stamp-deep)' : 'var(--danger)', borderRadius: 9, padding: '0.7rem 0.85rem' }}>
          <p><strong>{problem.result.unknown ? 'Not certain it was sent.' : 'The WhatsApp message was not sent.'}</strong> Receipt {problem.receipt.receiptNo}: {problem.result.message}</p>
          <div className="flex items-center gap-3" style={{ marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {problem.result.retry && !problem.result.unknown && <button type="button" className="sns-btn-link sns-link-icon" onClick={() => resendNow(problem.receipt)} disabled={Boolean(busy)}><RefreshCw size={12} aria-hidden="true" /> Try again</button>}
            {problem.result.unknown && <button type="button" className="sns-btn-link sns-link-icon" onClick={refreshLog}><RefreshCw size={12} aria-hidden="true" /> Check status</button>}
            <a className="sns-btn-link sns-link-icon" href={problem.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden="true" /> Open WhatsApp instead</a>
            <button type="button" className="sns-btn-link" onClick={() => setProblem(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {fallback && (
        <p role="alert" style={{ marginTop: '0.8rem', fontSize: '0.84rem' }}>
          Your browser blocked the new window. <a className="sns-btn-link sns-link-icon" href={fallback.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden="true" /> {fallback.label}</a>
        </p>
      )}

      {confirmResend && (
        <ConfirmDialog title="Send receipt again"
          message={`Send receipt ${confirmResend.receiptNo} to ${customer.firstName || 'the customer'} (${formatWhatsappNumber(number)}) on WhatsApp now? It goes out from the business WhatsApp number with the PDF attached.`}
          onCancel={() => setConfirmResend(null)} onConfirm={() => resendNow(confirmResend)} />
      )}

      {confirmDelete && (
        <ConfirmDialog danger title="Delete receipt"
          message={`Delete receipt ${confirmDelete.receiptNo} (${formatReceiptMoney(confirmDelete.amount)}, paid ${formatEatDateTime(confirmDelete.paidAt)})? ${customer.firstName || 'The customer'} will no longer be Active because of it unless another receipt covers them. This cannot be undone, and anything already sent on WhatsApp stays with the customer.`}
          onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(confirmDelete)} />
      )}
    </div>
  )
}
