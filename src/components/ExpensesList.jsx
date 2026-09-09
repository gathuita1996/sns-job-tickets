import { useState } from 'react'
import { Check, ExternalLink, Trash2, X } from 'lucide-react'
import { EmptyState, FormField, SearchInput } from './shared'
import { formatKSh, formatDate } from '../lib/helpers'

const STATUS_BADGE = {
  Submitted: { bg: 'var(--line-soft)', color: 'var(--ink-soft)' },
  Approved: { bg: 'var(--signal-pale)', color: 'var(--signal-deep)' },
  Rejected: { bg: 'var(--overdue-pale)', color: 'var(--overdue)' },
  Paid: { bg: 'var(--confirmed-pale)', color: 'var(--confirmed)' },
}

function RejectExpenseModal({ expense, onClose, onConfirm }) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    await onConfirm(notes)
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 60 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '26rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Reject expense</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>
          <p style={{ fontSize: '0.85rem', marginBottom: '0.3rem' }}><strong>{expense.description}</strong> — {formatKSh(expense.amount)}</p>
          <FormField label="Reason (optional)" hint="Lets the person know why, so they can fix it and resubmit if needed.">
            <textarea className="sns-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Receipt is unreadable, please reupload…" autoFocus />
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

// Shared between AdminDashboard (full review actions) and MemberDashboard
// ("My Expenses" -- read-only status, own submissions only via RLS).
// Which action buttons appear is driven entirely by which callbacks are
// actually passed in, same pattern JobsTable already uses.
export default function ExpensesList({ expenses, userMap, onApprove, onReject, onMarkPaid, onDelete, onViewReceipt }) {
  const [search, setSearch] = useState('')
  const [rejecting, setRejecting] = useState(null)

  const filtered = [...expenses]
    .filter((e) => {
      const q = search.toLowerCase()
      return !q || [e.description, e.category].some((f) => (f || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (expenses.length === 0) return <EmptyState message="No expenses recorded yet." />

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by description or category…" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState message="No expenses match your search." />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((e) => {
            const badge = STATUS_BADGE[e.status] || STATUS_BADGE.Submitted
            return (
              <div key={e.id} className="sns-card" style={{ padding: '1.1rem 1.3rem' }}>
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{e.description}</p>
                    <span className="sns-badge sns-badge-pending">{e.category}</span>
                    <span className="sns-badge" style={{ background: badge.bg, color: badge.color }}>{e.status}</span>
                  </div>
                  <p className="sns-mono" style={{ fontWeight: 700, fontSize: '1rem' }}>{formatKSh(e.amount)}</p>
                </div>
                <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginBottom: '0.6rem' }}>
                  {formatDate(e.purchaseDate)}
                  {userMap?.[e.submittedBy]?.fullName && ` · Submitted by ${userMap[e.submittedBy].fullName}`}
                </p>
                {e.adminNotes && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--overdue)', marginBottom: '0.6rem' }}><strong>Note:</strong> {e.adminNotes}</p>
                )}
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <button onClick={() => onViewReceipt(e.receiptPath)} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                    <ExternalLink size={14} /> View Receipt
                  </button>
                  {onApprove && e.status === 'Submitted' && (
                    <button onClick={() => onApprove(e)} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      <Check size={14} /> Approve
                    </button>
                  )}
                  {onReject && e.status === 'Submitted' && (
                    <button onClick={() => setRejecting(e)} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem', color: 'var(--overdue)' }}>
                      <X size={14} /> Reject
                    </button>
                  )}
                  {onMarkPaid && e.status === 'Approved' && (
                    <button onClick={() => onMarkPaid(e)} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}>
                      Mark as Paid
                    </button>
                  )}
                  {onDelete && e.status === 'Submitted' && (
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
      {rejecting && (
        <RejectExpenseModal
          expense={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={async (notes) => { await onReject(rejecting, notes); setRejecting(null) }}
        />
      )}
    </div>
  )
}
