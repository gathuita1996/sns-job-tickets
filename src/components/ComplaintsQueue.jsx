import { useState } from 'react'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { EmptyState, FormField, SearchInput, StatCard } from './shared'
import { formatDateTime } from '../lib/helpers'

function ResolveComplaintModal({ complaint, onClose, onConfirm }) {
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    await onConfirm(resolutionNotes)
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 60 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Resolve complaint</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginBottom: '1.1rem' }}>
            Once resolved, this complaint moves out of the active queue. It isn't deleted — just no longer something the team needs to act on day to day.
          </p>
          <div className="sns-card" style={{ padding: '0.9rem 1.1rem', marginBottom: '1.2rem', background: 'var(--paper)' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>{complaint.complainantName} — {complaint.complaintType === 'Other' ? complaint.complaintTypeOther : complaint.complaintType}</p>
            <p className="sns-text-soft" style={{ fontSize: '0.82rem' }}>{complaint.location} · {complaint.contact}</p>
          </div>
          <FormField label="Resolution notes" hint="Briefly note how this was resolved — useful if the same issue comes up again.">
            <textarea className="sns-input" rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="What was done to resolve this…" autoFocus />
          </FormField>
          <div className="flex gap-3" style={{ paddingTop: '1rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="button" onClick={handleConfirm} disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Mark resolved'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Shared between AdminDashboard (as a tab) and MemberDashboard (Technical's
// queue) -- same component, same data, same actions, regardless of who's
// looking at it.
export default function ComplaintsQueue({ complaints, userMap, onUpdateStatus, onResolve }) {
  const [search, setSearch] = useState('')
  const [resolving, setResolving] = useState(null)

  const active = complaints.filter((c) => c.status !== 'Resolved')
  const filtered = active
    .filter((c) => {
      const q = search.toLowerCase()
      return !q || [c.complainantName, c.location, c.contact, c.complaintType].some((f) => (f || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const recurringCount = active.filter((c) => c.isRecurring).length

  function handleStatusChange(complaint, newStatus) {
    if (newStatus === 'Resolved') setResolving(complaint)
    else onUpdateStatus(complaint, newStatus)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '1.25rem', maxWidth: '24rem' }}>
        <StatCard label="Active complaints" value={active.length} icon={AlertTriangle} tone={active.length > 0 ? 'danger' : 'default'} />
        <StatCard label="Recurring" value={recurringCount} icon={RotateCcw} tone={recurringCount > 0 ? 'warning' : 'default'} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, location, or contact…" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState message={active.length === 0 ? 'No active complaints — the queue is clear.' : 'No complaints match your search.'} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="sns-card" style={{ padding: '1.1rem 1.3rem' }}>
              <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.complainantName}</p>
                  <span className="sns-badge sns-badge-pending">{c.complaintType === 'Other' ? c.complaintTypeOther : c.complaintType}</span>
                  {c.isRecurring && <span className="sns-badge" style={{ background: 'var(--overdue-pale)', color: 'var(--overdue)' }}>Recurring</span>}
                </div>
                <select
                  className="sns-input"
                  style={{ width: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.55rem' }}
                  value={c.status}
                  onChange={(e) => handleStatusChange(c, e.target.value)}
                >
                  <option value="New">New</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
              <p className="sns-text-soft" style={{ fontSize: '0.83rem', marginBottom: '0.5rem' }}>{c.location} · {c.contact}</p>
              <p style={{ fontSize: '0.87rem', lineHeight: 1.5, marginBottom: '0.6rem' }}>{c.details}</p>
              <p className="sns-text-faint" style={{ fontSize: '0.72rem' }}>
                Raised by {userMap?.[c.raisedBy]?.fullName || 'a team member'} · {formatDateTime(c.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {resolving && (
        <ResolveComplaintModal
          complaint={resolving}
          onClose={() => setResolving(null)}
          onConfirm={async (notes) => { await onResolve(resolving, notes); setResolving(null) }}
        />
      )}
    </div>
  )
}
