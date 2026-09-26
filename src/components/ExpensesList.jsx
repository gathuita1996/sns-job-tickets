import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, Loader2, Receipt as ReceiptIcon, Trash2, X } from 'lucide-react'
import { EmptyState, FormField, SearchInput } from './shared'
import AttachReceiptModal from './AttachReceiptModal'
import { formatKSh, formatDate } from '../lib/helpers'

const STATUS_BADGE = {
  Requested: { bg: 'var(--line-soft)', color: 'var(--ink-soft)' },
  Approved: { bg: 'var(--signal-pale)', color: 'var(--signal-deep)' },
  Rejected: { bg: 'var(--overdue-pale)', color: 'var(--overdue)' },
  Purchased: { bg: 'var(--stamp-pale)', color: 'var(--stamp-deep)' },
  Paid: { bg: 'var(--confirmed-pale)', color: 'var(--confirmed)' },
}

function RejectExpenseModal({ expense, onClose, onConfirm }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!notes.trim()) { setError('Please explain why this is being rejected'); return }
    setSubmitting(true)
    await onConfirm(notes)
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 60 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '26rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Reject request</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}><strong>{expense.description}</strong> — est. {formatKSh(expense.amount)}</p>
          <FormField label="Reason for rejecting" error={error} hint="Lets the person know why, so they can adjust and resubmit if needed.">
            <textarea className="sns-input" rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setError('') }} placeholder="e.g. Not needed right now, or over budget for this month…" autoFocus />
          </FormField>
          <div className="flex gap-3" style={{ paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="button" onClick={handleConfirm} disabled={submitting} className="sns-btn-primary" style={{ flex: 1, background: 'var(--overdue)' }}>{submitting ? 'Saving…' : 'Reject'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// The Director's real decision when approving: pay now (an advance --
// money moves before there's proof of purchase) or approve and pay later
// (the normal reimbursement flow, once a receipt exists). outstandingAdvance
// is the "intelligence" piece -- if this same person already has an
// unreceipted advance sitting out there, that's worth knowing before
// handing them a second one.
function ApproveExpenseModal({ expense, outstandingAdvance, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false)
  const isService = expense.entryType === 'service'

  async function handleChoice(payNow) {
    setSubmitting(true)
    await onConfirm(payNow)
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 60 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '26rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Approve request</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>
          <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}><strong>{expense.description}</strong> — est. {formatKSh(expense.amount)}</p>

          {outstandingAdvance && (
            <div className="flex items-start gap-2" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)', padding: '0.7rem 0.9rem', borderRadius: 9, marginBottom: '1rem', fontSize: '0.82rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{outstandingAdvance.name} already has an unreceipted advance of {formatKSh(outstandingAdvance.amount)} from {formatDate(outstandingAdvance.date)}.</span>
            </div>
          )}

          <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginBottom: '1rem' }}>
            {isService
              ? 'Pay now if you\u2019re settling this immediately, or approve and pay once you\u2019re ready.'
              : 'Pay now if you\u2019re giving this as an advance before the purchase happens, or approve and pay later once they bring back a receipt.'}
          </p>

          <div className="flex flex-col gap-2">
            <button type="button" disabled={submitting} onClick={() => handleChoice(true)} className="sns-btn-primary">
              {submitting ? 'Saving…' : 'Approve and Pay Now'}
            </button>
            <button type="button" disabled={submitting} onClick={() => handleChoice(false)} className="sns-btn-secondary">
              {submitting ? 'Saving…' : 'Approve — Pay Later'}
            </button>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ border: 'none' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Shows the receipt right on the page rather than opening a new tab --
// images render directly, PDFs render in an embedded frame. url is the
// already-fetched signed link; loading is shown while that fetch is
// still in flight.
function ReceiptViewerModal({ url, loading, onClose }) {
  const isPdf = url && url.split('?')[0].toLowerCase().endsWith('.pdf')
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.75)', zIndex: 70 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '42rem', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Receipt</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '1.2rem', display: 'flex', justifyContent: 'center', alignItems: loading ? 'center' : 'flex-start', minHeight: '30vh' }}>
          {loading ? (
            <Loader2 size={28} className="sns-spin" style={{ color: 'var(--ink-faint)' }} />
          ) : isPdf ? (
            <iframe src={url} title="Receipt" style={{ width: '100%', height: '75vh', border: 'none', borderRadius: 8 }} />
          ) : (
            <img src={url} alt="Receipt" style={{ maxWidth: '100%', borderRadius: 8 }} />
          )}
        </div>
      </div>
    </div>
  )
}

// Shared between AdminDashboard (full review actions) and MemberDashboard
// ("My Expenses/Purchases" -- own submissions only via RLS). Which action
// buttons appear is driven by which callbacks are passed in (same pattern
// JobsTable already uses) plus, for Attach Receipt specifically, whether
// this row belongs to the person looking at it -- a Director can approve
// anyone's request, but only the person who asked for it goes and buys it.
export default function ExpensesList({ expenses, userMap, currentUserId, onApprove, onReject, onAttachReceipt, onMarkPaid, onDelete, onViewReceipt }) {
  const [search, setSearch] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [approving, setApproving] = useState(null)
  const [attaching, setAttaching] = useState(null)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [receiptLoading, setReceiptLoading] = useState(false)

  // The "intelligence" check: for whoever is about to be approved, does
  // this same person already have another request sitting at Approved
  // with money already paid out, but no receipt attached yet?
  const outstandingAdvances = useMemo(() => {
    const map = {}
    expenses.forEach((e) => {
      if (e.status === 'Approved' && e.paidAt && !e.receiptPath) {
        map[e.submittedBy] = { name: userMap?.[e.submittedBy]?.fullName || 'This person', amount: e.amount, date: e.paidAt }
      }
    })
    return map
  }, [expenses, userMap])

  async function handleViewReceipt(path) {
    setReceiptLoading(true)
    setReceiptUrl('') // truthy placeholder so the modal opens immediately, showing the spinner
    const url = await onViewReceipt(path)
    setReceiptLoading(false)
    if (!url) { setReceiptUrl(null); return }
    setReceiptUrl(url)
  }

  const filtered = [...expenses]
    .filter((e) => {
      const q = search.toLowerCase()
      return !q || [e.description, e.category, e.providerName].some((f) => (f || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (expenses.length === 0) return <EmptyState message="No purchase or service requests yet." />

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by description, category, or provider…" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="No requests match your search." />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((e) => {
            const badge = STATUS_BADGE[e.status] || STATUS_BADGE.Requested
            const isOwn = e.submittedBy === currentUserId
            const isService = e.entryType === 'service'
            // A Service never goes through the attach-receipt step -- once
            // Approved, it's ready to be marked paid directly, unless it
            // was already paid at approval time.
            const readyToMarkPaid = e.status === 'Purchased' || (isService && e.status === 'Approved' && !e.paidAt)
            const paidInAdvanceAwaitingReceipt = e.status === 'Approved' && e.paidAt && !isService
            return (
              <div key={e.id} className="sns-card" style={{ padding: '1.1rem 1.3rem' }}>
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{e.description}</p>
                    {isService ? (
                      <span className="sns-badge" style={{ background: 'var(--signal-pale)', color: 'var(--signal-deep)' }}>Service</span>
                    ) : (
                      <span className="sns-badge sns-badge-pending">{e.category}</span>
                    )}
                    <span className="sns-badge" style={{ background: badge.bg, color: badge.color }}>{e.status}</span>
                    {paidInAdvanceAwaitingReceipt && (
                      <span className="sns-badge" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)' }}>Paid in advance — receipt pending</span>
                    )}
                  </div>
                  <p className="sns-mono" style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {e.status === 'Requested' ? `est. ${formatKSh(e.amount)}` : formatKSh(e.amount)}
                  </p>
                </div>
                <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginBottom: '0.6rem' }}>
                  {isService
                    ? `${e.providerName} · ${e.providerContact}${e.purchaseDate ? ` · ${formatDate(e.purchaseDate)}` : ''}`
                    : (e.purchaseDate ? formatDate(e.purchaseDate) : 'Not yet purchased')}
                  {userMap?.[e.submittedBy]?.fullName && ` · Requested by ${userMap[e.submittedBy].fullName}`}
                </p>
                {e.adminNotes && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--overdue)', marginBottom: '0.6rem' }}><strong>Reason for rejection:</strong> {e.adminNotes}</p>
                )}
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  {e.receiptPath && (
                    <button onClick={() => handleViewReceipt(e.receiptPath)} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      <Eye size={14} /> View Receipt
                    </button>
                  )}
                  {onApprove && e.status === 'Requested' && (
                    <button onClick={() => setApproving(e)} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      <Check size={14} /> Approve
                    </button>
                  )}
                  {onReject && e.status === 'Requested' && (
                    <button onClick={() => setRejecting(e)} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem', color: 'var(--overdue)' }}>
                      <X size={14} /> Reject
                    </button>
                  )}
                  {onAttachReceipt && isOwn && !isService && e.status === 'Approved' && !e.paidAt && (
                    <button onClick={() => setAttaching(e)} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      <ReceiptIcon size={14} /> Attach Receipt
                    </button>
                  )}
                  {onMarkPaid && readyToMarkPaid && (
                    <button onClick={() => onMarkPaid(e)} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      Mark as Paid
                    </button>
                  )}
                  {onDelete && e.status === 'Requested' && (
                    <button onClick={() => onDelete(e)} className="sns-icon-btn danger" title="Delete">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {approving && (
        <ApproveExpenseModal
          expense={approving}
          outstandingAdvance={outstandingAdvances[approving.submittedBy]}
          onClose={() => setApproving(null)}
          onConfirm={async (payNow) => { await onApprove(approving, payNow); setApproving(null) }}
        />
      )}
      {rejecting && (
        <RejectExpenseModal
          expense={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={async (notes) => { await onReject(rejecting, notes); setRejecting(null) }}
        />
      )}
      {attaching && (
        <AttachReceiptModal
          expense={attaching}
          onClose={() => setAttaching(null)}
          onSave={async (formData) => { await onAttachReceipt(attaching, formData); setAttaching(null) }}
        />
      )}
      {receiptUrl !== null && (
        <ReceiptViewerModal url={receiptUrl} loading={receiptLoading} onClose={() => setReceiptUrl(null)} />
      )}
    </div>
  )
}
