import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Hourglass, Plane, Plus, Trash2, Users, X } from 'lucide-react'
import Avatar from './Avatar'
import { ConfirmDialog, EmptyState, FormField, StatCard } from './shared'
import { LEAVE_STATUS_BADGE, LEAVE_STATUS_LABEL, awayNowIds, currentLeaveYear, dayCount, formatLeaveRange, holidaysForLeaveYear, upcomingLeave } from '../lib/leave'
import { departmentLabel, formatDate, toDateInputValue } from '../lib/helpers'

function Modal({ title, onClose, children }) {
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label={title} style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>{children}</div>
      </div>
    </div>
  )
}

function RecordLeaveModal({ users, onPreview, onRecord, onClose }) {
  const [memberId, setMemberId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!memberId || !start || !end) { setPreview(null); return undefined }
    if (end < start) { setPreview({ ok: false, message: 'The last day cannot be before the first day.' }); return undefined }
    let live = true
    const t = setTimeout(async () => { const r = await onPreview(start, end, memberId); if (live) setPreview(r) }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [memberId, start, end]) // eslint-disable-line react-hooks/exhaustive-deps
  const past = end && end < toDateInputValue(new Date())
  async function save(e) {
    e.preventDefault(); setBusy(true)
    const done = await onRecord({ memberId, startDate: start, endDate: end, reason: reason.trim() })
    setBusy(false); if (done) onClose()
  }
  return (
    <Modal title="Record leave for someone" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <FormField label="Who"><select className="sns-input" value={memberId} onChange={(e) => setMemberId(e.target.value)}><option value="">Choose a person</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="First day"><input type="date" className="sns-input" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
          <FormField label="Last day"><input type="date" className="sns-input" value={end} onChange={(e) => setEnd(e.target.value)} /></FormField>
        </div>
        <FormField label="Reason (optional)"><input className="sns-input" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
        {past ? <p className="sns-text-soft" style={{ fontSize: '0.8rem' }}>These dates are in the past, so they are recorded as taken without being checked against the monthly limit.</p>
          : preview && <p role="status" style={{ fontSize: '0.85rem', fontWeight: 600, color: preview.ok ? 'var(--confirmed)' : 'var(--overdue)' }}>{preview.ok ? `${dayCount(preview.days)}. It is recorded as approved.` : preview.message}</p>}
        <button type="submit" className="sns-btn-primary" style={{ width: '100%' }} disabled={busy || !memberId || !start || !end || (!past && (!preview || !preview.ok))}>{busy ? 'Saving…' : 'Record approved leave'}</button>
      </form>
    </Modal>
  )
}

function AdjustModal({ member, onAdjust, onClose }) {
  const [days, setDays] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(days)
  const valid = Number.isInteger(n) && n !== 0 && note.trim()
  async function save(e) { e.preventDefault(); setBusy(true); const done = await onAdjust({ memberId: member.id, days: n, note: note.trim() }); setBusy(false); if (done) onClose() }
  return (
    <Modal title={`Adjust days: ${member.fullName}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="sns-text-soft" style={{ fontSize: '0.84rem' }}>Use this for days already used before the system, or to correct a mistake. A positive number counts as days used; a negative number gives days back.</p>
        <FormField label="Days (for example 6, or -2)"><input type="number" step="1" className="sns-input" value={days} onChange={(e) => setDays(e.target.value)} /></FormField>
        <FormField label="Why"><input className="sns-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Opening balance" /></FormField>
        <button type="submit" className="sns-btn-primary" style={{ width: '100%' }} disabled={busy || !valid}>{busy ? 'Saving…' : 'Save adjustment'}</button>
      </form>
    </Modal>
  )
}

export default function LeaveAdmin({ users, requests, adjustments, overview, holidays, policy, currentUser, onDecide, onCancelRequest, onRecord, onPreview, onAdjust, onSavePolicy, onAddHoliday, onRemoveHoliday, onAddKenyanHolidays }) {
  const isDirector = Boolean(currentUser.isDirector)
  const [sub, setSub] = useState('requests')
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')
  const [recording, setRecording] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [hDay, setHDay] = useState('')
  const [hName, setHName] = useState('')
  const [form, setForm] = useState({ annual: policy.annual_days, month: policy.max_per_month, sat: policy.count_saturdays })
  useEffect(() => { setForm({ annual: policy.annual_days, month: policy.max_per_month, sat: policy.count_saturdays }) }, [policy.annual_days, policy.max_per_month, policy.count_saturdays])

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const today = toDateInputValue(new Date())
  const pending = useMemo(() => requests.filter((r) => r.status === 'pending').sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt))), [requests])
  const decided = useMemo(() => requests.filter((r) => r.status !== 'pending').sort((a, b) => String(b.decidedAt || b.cancelledAt || b.requestedAt).localeCompare(String(a.decidedAt || a.cancelledAt || a.requestedAt))).slice(0, 15), [requests])
  const rowOf = (id) => (overview || []).find((o) => o.member_id === id)
  const away = useMemo(() => awayNowIds(requests, today), [requests, today])
  const coming = useMemo(() => upcomingLeave(requests, today, 45), [requests, today])
  const clash = (r) => requests.filter((o) => o.id !== r.id && o.status === 'approved' && o.memberId !== r.memberId && o.startDate <= r.endDate && o.endDate >= r.startDate).map((o) => userMap[o.memberId]?.fullName).filter(Boolean)
  const year = currentLeaveYear(policy.year_start_month)
  const name = (id) => userMap[id]?.fullName || 'Someone'

  const tab = (key, label, badge) => <button key={key} type="button" className={`sns-tab ${sub === key ? 'active' : ''}`} onClick={() => setSub(key)}>{label}{badge ? <span className="sns-badge sns-badge-overdue" style={{ marginLeft: '0.4rem' }}>{badge}</span> : null}</button>

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1.2rem' }}>
        <StatCard label="Waiting for approval" value={pending.length} icon={Hourglass} tone="warning" onClick={() => setSub('requests')} />
        <StatCard label="Away today" value={away.size} icon={Plane} onClick={() => setSub('away')} />
        <StatCard label="Starting in 45 days" value={coming.filter((r) => r.startDate > today).length} icon={CalendarDays} onClick={() => setSub('away')} />
        <StatCard label="Team" value={users.length} icon={Users} onClick={() => setSub('balances')} />
      </div>
      {!isDirector && <p className="sns-text-faint" style={{ fontSize: '0.8rem', marginBottom: '0.8rem' }}>Only the Director can approve or reject leave. You can see everything here.</p>}
      {!users.some((u) => u.isDirector) && <p className="sns-alert-banner" style={{ marginBottom: '0.8rem' }}>No Director is set, so nobody can approve leave yet. Open the Team tab and press Make Director.</p>}

      <div className="flex gap-1 sns-border-b" style={{ marginBottom: '1rem', flexWrap: 'wrap' }} role="tablist">
        {tab('requests', 'Requests', pending.length)}{tab('balances', 'Balances')}{tab('away', 'Who is away')}{tab('settings', 'Policy & holidays')}
        {isDirector && <button type="button" className="sns-btn-secondary" style={{ marginLeft: 'auto', fontSize: '0.8rem', marginBottom: '0.3rem' }} onClick={() => setRecording(true)}><Plus size={14} /> Record leave</button>}
      </div>

      {sub === 'requests' && (
        <div className="space-y-4">
          {pending.length === 0 ? <EmptyState message="No leave requests are waiting." /> : pending.map((r) => {
            const u = userMap[r.memberId]; const row = rowOf(r.memberId); const others = clash(r)
            return (
              <div key={r.id} className="sns-card" style={{ padding: '1rem 1.2rem' }}>
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div className="flex items-center gap-3"><Avatar name={u?.fullName} url={u?.avatarUrl} size={40} />
                    <div><p style={{ fontWeight: 700 }}>{u?.fullName || 'Unknown'} <span className="sns-text-faint" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{departmentLabel(u?.department)}</span></p>
                      <p style={{ fontSize: '0.88rem' }}>{formatLeaveRange(r.startDate, r.endDate)} · <strong>{dayCount(r.days)}</strong></p></div></div>
                  {isDirector && <div className="flex gap-2"><button type="button" className="sns-btn-primary" onClick={() => onDecide(r, 'approved', '')}><Check size={15} /> Approve</button><button type="button" className="sns-btn-secondary" onClick={() => { setRejecting(r); setNote('') }}><X size={15} /> Reject</button></div>}
                </div>
                <p className="sns-text-soft" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  {r.reason ? <>Reason: {r.reason}. </> : null}{row ? <>{dayCount(row.remaining)} left this leave year (this request included). </> : null}
                  {others.length ? <span style={{ color: 'var(--stamp-deep)', fontWeight: 600 }}>Also away then: {others.join(', ')}.</span> : null}
                </p>
              </div>
            )
          })}
          {decided.length > 0 && (
            <div>
              <h4 className="sns-display" style={{ fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>Recent decisions</h4>
              <div className="sns-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th>Who</th><th>Dates</th><th>Days</th><th>Status</th><th>Decided by</th><th>Note</th><th /></tr></thead>
                  <tbody>{decided.map((r) => (
                    <tr key={r.id}><td style={{ fontWeight: 600 }}>{name(r.memberId)}</td><td>{formatLeaveRange(r.startDate, r.endDate)}</td><td className="sns-mono">{r.days}</td>
                      <td><span className={`sns-badge ${LEAVE_STATUS_BADGE[r.status]}`}>{LEAVE_STATUS_LABEL[r.status]}</span></td>
                      <td className="sns-text-soft">{r.decidedBy ? name(r.decidedBy) : '—'}{r.decidedAt ? `, ${formatDate(r.decidedAt)}` : ''}</td><td className="sns-text-soft" style={{ fontSize: '0.8rem' }}>{r.decisionNote || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{isDirector && r.status === 'approved' && r.endDate >= today && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => setCancelling(r)}>Revoke</button>}</td></tr>
                  ))}</tbody>
                </table></div></div>
            </div>
          )}
        </div>
      )}

      {sub === 'balances' && (
        <div className="sns-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}>
          <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th>Person</th><th>Allowance</th><th>Used</th><th>Waiting</th><th>Left</th><th>This month</th><th /></tr></thead>
            <tbody>{users.map((u) => { const o = rowOf(u.id); const used = o ? o.used_requests + o.adjustments : 0
              return (<tr key={u.id}>
                <td><div className="flex items-center gap-2"><Avatar name={u.fullName} url={u.avatarUrl} size={28} /><span style={{ fontWeight: 600 }}>{u.fullName}</span>{(o?.on_leave_today || away.has(u.id)) && <span className="sns-badge sns-badge-progress">On leave</span>}</div></td>
                <td className="sns-mono">{o ? o.entitlement : policy.annual_days}</td>
                <td className="sns-mono">{used}{o && o.adjustments !== 0 ? <span className="sns-text-faint" style={{ fontSize: '0.72rem' }}> ({o.adjustments > 0 ? '+' : ''}{o.adjustments} opening)</span> : null}</td>
                <td className="sns-mono">{o ? o.pending : 0}</td><td className="sns-mono" style={{ fontWeight: 700, color: o && o.remaining <= 3 ? 'var(--overdue)' : 'var(--confirmed)' }}>{o ? o.remaining : '—'}</td>
                <td className="sns-mono">{o ? o.month_used : 0}/{policy.max_per_month}</td>
                <td style={{ textAlign: 'right' }}>{isDirector && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => setAdjusting(u)}>Adjust days</button>}</td></tr>) })}</tbody>
          </table></div></div>
      )}

      {sub === 'away' && (
        <div className="space-y-4">
          <div><h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Away today</h4>
            {away.size === 0 ? <EmptyState message="Nobody is on leave today." /> : <div className="sns-card">{[...away].map((id, i) => <div key={id} className={`flex items-center gap-3 ${i ? 'sns-border-t' : ''}`} style={{ padding: '0.7rem 1rem' }}><Avatar name={name(id)} url={userMap[id]?.avatarUrl} size={30} /><span style={{ fontWeight: 600 }}>{name(id)}</span><span className="sns-text-soft" style={{ fontSize: '0.82rem' }}>back after {formatDate(requests.find((r) => r.memberId === id && r.status === 'approved' && r.startDate <= today && r.endDate >= today)?.endDate)}</span></div>)}</div>}</div>
          <div><h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Coming up</h4>
            {coming.filter((r) => r.startDate > today).length === 0 ? <EmptyState message="No approved leave starts in the next 45 days." /> : <div className="sns-card">{coming.filter((r) => r.startDate > today).map((r, i) => <div key={r.id} className={`flex items-center gap-3 ${i ? 'sns-border-t' : ''}`} style={{ padding: '0.7rem 1rem' }}><Avatar name={name(r.memberId)} url={userMap[r.memberId]?.avatarUrl} size={30} /><span style={{ fontWeight: 600 }}>{name(r.memberId)}</span><span className="sns-text-soft" style={{ fontSize: '0.82rem' }}>{formatLeaveRange(r.startDate, r.endDate)} · {dayCount(r.days)}</span></div>)}</div>}</div>
        </div>
      )}

      {sub === 'settings' && (
        <div className="space-y-4" style={{ maxWidth: '40rem' }}>
          <div className="sns-card" style={{ padding: '1.2rem' }}>
            <h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Leave policy</h4>
            <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.8rem' }}>The leave year starts in {new Date(2000, policy.year_start_month - 1, 1).toLocaleDateString('en-KE', { month: 'long' })}. Sundays never count as leave.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Days of leave a year"><input type="number" min="1" className="sns-input" value={form.annual} disabled={!isDirector} onChange={(e) => setForm({ ...form, annual: e.target.value })} /></FormField>
              <FormField label="Most days in one month"><input type="number" min="1" className="sns-input" value={form.month} disabled={!isDirector} onChange={(e) => setForm({ ...form, month: e.target.value })} /></FormField>
            </div>
            <label className="flex items-center gap-2" style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}><input type="checkbox" checked={form.sat} disabled={!isDirector} onChange={(e) => setForm({ ...form, sat: e.target.checked })} /> Saturdays count as leave days</label>
            {isDirector && <button type="button" className="sns-btn-primary" style={{ marginTop: '0.9rem' }} onClick={() => onSavePolicy({ annual_leave_days: Number(form.annual), max_leave_days_per_month: Number(form.month), leave_count_saturdays: form.sat })}>Save policy</button>}
          </div>
          <div className="sns-card" style={{ padding: '1.2rem' }}>
            <h4 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Public holidays (not counted as leave)</h4>
            {holidays.length === 0 ? <p className="sns-text-soft" style={{ fontSize: '0.84rem' }}>None added yet, so public holidays inside a leave request are counted as leave days.</p> : (
              <ul style={{ marginBottom: '0.8rem' }}>{holidays.map((h) => <li key={h.id} className="flex items-center justify-between" style={{ padding: '0.35rem 0', fontSize: '0.86rem' }}><span><strong>{formatDate(h.day)}</strong> · {h.name}</span>{isDirector && <button type="button" className="sns-icon-btn danger" title="Remove" aria-label={`Remove ${h.name}`} onClick={() => onRemoveHoliday(h)}><Trash2 size={14} /></button>}</li>)}</ul>)}
            {isDirector && (
              <>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <input type="date" className="sns-input" style={{ width: 'auto' }} value={hDay} onChange={(e) => setHDay(e.target.value)} aria-label="Holiday date" />
                  <input className="sns-input" style={{ flex: 1, minWidth: '9rem' }} placeholder="Name, e.g. Eid ul-Fitr" value={hName} onChange={(e) => setHName(e.target.value)} aria-label="Holiday name" />
                  <button type="button" className="sns-btn-secondary" disabled={!hDay || !hName.trim()} onClick={async () => { await onAddHoliday({ day: hDay, name: hName.trim() }); setHDay(''); setHName('') }}><Plus size={14} /> Add</button>
                </div>
                <button type="button" className="sns-btn-secondary" style={{ marginTop: '0.8rem', fontSize: '0.82rem' }} onClick={() => onAddKenyanHolidays(holidaysForLeaveYear(year, policy.year_start_month))}>Add the Kenyan public holidays for this leave year</button>
                <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginTop: '0.4rem' }}>This adds the fixed holidays, Good Friday and Easter Monday. Eid and any holiday the government announces must be added by hand.</p>
              </>
            )}
          </div>
        </div>
      )}

      {rejecting && (
        <Modal title="Reject leave" onClose={() => setRejecting(null)}>
          <p style={{ fontSize: '0.88rem', marginBottom: '0.8rem' }}>{name(rejecting.memberId)} · {formatLeaveRange(rejecting.startDate, rejecting.endDate)}</p>
          <FormField label="Tell them why (they will see this)"><textarea className="sns-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
          <button type="button" className="sns-btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={!note.trim()} onClick={async () => { await onDecide(rejecting, 'rejected', note.trim()); setRejecting(null) }}>Reject request</button>
        </Modal>
      )}
      {recording && <RecordLeaveModal users={users} onPreview={onPreview} onRecord={onRecord} onClose={() => setRecording(false)} />}
      {adjusting && <AdjustModal member={adjusting} onAdjust={onAdjust} onClose={() => setAdjusting(null)} />}
      {cancelling && <ConfirmDialog title="Revoke leave" message={`Cancel ${name(cancelling.memberId)}'s approved leave (${formatLeaveRange(cancelling.startDate, cancelling.endDate)})? The days go back to their balance.`} danger onCancel={() => setCancelling(null)} onConfirm={async () => { await onCancelRequest(cancelling); setCancelling(null) }} />}
    </div>
  )
}
