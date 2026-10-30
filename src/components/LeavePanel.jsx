import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Hourglass, Info, Plane } from 'lucide-react'
import { ConfirmDialog, EmptyState, FormField, StatCard } from './shared'
import { LEAVE_STATUS_BADGE, LEAVE_STATUS_LABEL, canCancel, dayCount, formatLeaveRange, leaveYearLabel } from '../lib/leave'
import { formatDate, toDateInputValue } from '../lib/helpers'

// "Leave" inside a person's profile: how many days they have, a request form that checks the rules as they type, and their history.
export default function LeavePanel({ userId, isDirector, requests, adjustments, policy, summary, onPreview, onApply, onCancel }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(null)
  const today = toDateInputValue(new Date())
  const pol = policy || { annual_days: 21, max_per_month: 3, year_start_month: 8, count_saturdays: true }

  useEffect(() => {
    if (!start || !end) { setPreview(null); return undefined }
    if (end < start) { setPreview({ ok: false, message: 'The last day cannot be before the first day.' }); return undefined }
    let live = true
    const timer = setTimeout(async () => { const r = await onPreview(start, end); if (live) setPreview(r) }, 300)
    return () => { live = false; clearTimeout(timer) }
  }, [start, end]) // eslint-disable-line react-hooks/exhaustive-deps

  const history = useMemo(() => [...(requests || [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [requests])
  const opening = useMemo(() => (adjustments || []).reduce((s, a) => s + Number(a.days), 0), [adjustments])

  async function submit(e) {
    e.preventDefault()
    if (!preview || !preview.ok) return
    setSubmitting(true)
    const done = await onApply({ startDate: start, endDate: end, reason: reason.trim() })
    setSubmitting(false)
    if (done) { setStart(''); setEnd(''); setReason(''); setPreview(null) }
  }

  const s = summary
  return (
    <div className="space-y-4">
      <div>
        <p className="sns-eyebrow sns-text-faint">Leave year</p>
        <p style={{ fontWeight: 700 }}>{s ? leaveYearLabel(s.leave_year, pol.year_start_month) : '—'}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Yearly allowance" value={s ? s.entitlement : pol.annual_days} icon={CalendarDays} />
        <StatCard label="Days used" value={s ? s.used : 0} icon={CheckCircle2} />
        <StatCard label="Waiting for approval" value={s ? s.pending : 0} icon={Hourglass} tone="warning" />
        <StatCard label="Days left" value={s ? s.remaining : '—'} icon={Plane} tone="success" />
      </div>
      <p className="sns-text-soft" style={{ fontSize: '0.82rem' }}>
        This month: <strong>{s ? s.month_used : 0}</strong> of {pol.max_per_month} days used.
        {opening > 0 && <> {dayCount(opening)} already used before this system were added by the Director.</>}
      </p>

      <form onSubmit={submit} className="sns-card" style={{ padding: '1.1rem' }} aria-label="Apply for leave">
        <h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Apply for leave</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="First day of leave"><input type="date" className="sns-input" min={today} value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd('') }} /></FormField>
          <FormField label="Last day of leave"><input type="date" className="sns-input" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} /></FormField>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <FormField label="Reason (optional)"><input className="sns-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family matter" /></FormField>
        </div>
        {preview && (
          <p role="status" style={{ marginTop: '0.75rem', fontSize: '0.85rem', fontWeight: 600, color: preview.ok ? 'var(--confirmed)' : 'var(--overdue)' }}>
            {preview.ok ? `${dayCount(preview.days)} of leave. ${isDirector ? 'It will be approved straight away.' : 'It goes to the Director for approval.'}` : preview.message}
          </p>
        )}
        <div className="flex items-start gap-2 sns-text-faint" style={{ fontSize: '0.76rem', marginTop: '0.75rem' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Sundays and public holidays are not counted{pol.count_saturdays ? '' : ', and neither are Saturdays'}. You can take up to {pol.max_per_month} days of leave in a month. {isDirector ? 'As Director, your own leave is approved immediately.' : 'Only the Director approves leave.'}</span>
        </div>
        <button type="submit" className="sns-btn-primary" style={{ marginTop: '0.9rem' }} disabled={submitting || !preview || !preview.ok}>{submitting ? 'Sending…' : 'Send request'}</button>
      </form>

      <div>
        <h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>My leave history</h4>
        {history.length === 0 ? <EmptyState message="You have not applied for leave yet." /> : (
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th>Dates</th><th>Days</th><th>Status</th><th>Note</th><th /></tr></thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{formatLeaveRange(r.startDate, r.endDate)}</td>
                      <td className="sns-mono">{r.days}</td>
                      <td><span className={`sns-badge ${LEAVE_STATUS_BADGE[r.status]}`}>{LEAVE_STATUS_LABEL[r.status]}</span>{r.decidedAt && r.status !== 'pending' && r.status !== 'cancelled' && <span className="sns-text-faint" style={{ fontSize: '0.72rem', marginLeft: '0.4rem' }}>{formatDate(r.decidedAt)}</span>}</td>
                      <td className="sns-text-soft" style={{ fontSize: '0.8rem' }}>{r.decisionNote || r.reason || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{canCancel(r, userId, isDirector, today) && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => setConfirmCancel(r)}>Cancel</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {confirmCancel && (
        <ConfirmDialog title="Cancel leave" message={`Cancel your leave for ${formatLeaveRange(confirmCancel.startDate, confirmCancel.endDate)}? The ${dayCount(confirmCancel.days)} go back to your balance.`} danger
          onCancel={() => setConfirmCancel(null)} onConfirm={async () => { await onCancel(confirmCancel); setConfirmCancel(null) }} />
      )}
    </div>
  )
}
