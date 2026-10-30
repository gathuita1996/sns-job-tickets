import { useMemo, useState } from 'react'
import { Calendar, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Wallet } from 'lucide-react'
import Avatar from './Avatar'
import { EmptyState, StatCard } from './shared'
import TransportReport from './TransportReport'
import { departmentLabel, formatDate, formatKSh, formatPeriodLabel, getPeriodRange, toDateInputValue } from '../lib/helpers'
import { transportReport, tripRoute } from '../lib/reportsCore'

// Transport: the day's trips and who is still owed, with the Daily and Monthly reports one click away. A report opens as a page.
export default function TransportTab({ users, jobs, onMarkPaid, currentUser }) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [expandedId, setExpandedId] = useState(null)
  const [report, setReport] = useState(null)         // null | 'day' | 'month'
  const day = useMemo(() => getPeriodRange('day', anchor), [anchor])
  const month = useMemo(() => getPeriodRange('month', anchor), [anchor])
  const isToday = toDateInputValue(anchor) === toDateInputValue(new Date())
  const dayReport = useMemo(() => transportReport(jobs, users, day.start, day.end), [jobs, users, day])
  const monthReport = useMemo(() => transportReport(jobs, users, month.start, month.end), [jobs, users, month])
  const rows = [...dayReport.rows].sort((a, b) => b.unpaid - a.unpaid || b.total - a.total)

  if (report) return <TransportReport mode={report} anchor={anchor} jobs={jobs} users={users} generatedBy={currentUser && currentUser.fullName} onBack={() => setReport(null)} />

  const step = (n) => setAnchor((a) => { const d = new Date(a); d.setDate(d.getDate() + n); return d })
  return (
    <div>
      <div className="flex items-end justify-between" style={{ marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 className="sns-display" style={{ fontSize: '1.15rem', fontWeight: 700 }}>Transport</h2>
          <p className="sns-text-soft" style={{ fontSize: '0.82rem' }}>What staff spent getting to jobs, and who is still owed.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setReport('day')} className="sns-btn-secondary"><CalendarDays size={15} /> Daily report</button>
          <button type="button" onClick={() => setReport('month')} className="sns-btn-primary"><Calendar size={15} /> Monthly report</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginBottom: '1.1rem' }}>
        <StatCard label={isToday ? 'Spent today' : 'Spent this day'} value={formatKSh(dayReport.total)} icon={Wallet} />
        <StatCard label={isToday ? 'Unpaid today' : 'Unpaid this day'} value={formatKSh(dayReport.unpaid)} icon={Wallet} tone={dayReport.unpaid > 0 ? 'warning' : 'default'} />
        <StatCard label={`Spent in ${formatPeriodLabel('month', anchor)}`} value={formatKSh(monthReport.total)} icon={Wallet} tone="success" />
      </div>

      <div className="sns-card flex items-center justify-between" style={{ padding: '0.7rem 1rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => step(-1)} className="sns-icon-btn" title="Previous day" aria-label="Previous day"><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 700 }}>{isToday ? 'Today' : formatDate(anchor)}</p>
          {isToday ? <p className="sns-text-faint" style={{ fontSize: '0.72rem' }}>{formatDate(anchor)}</p> : <button type="button" onClick={() => setAnchor(new Date())} className="sns-btn-link" style={{ fontSize: '0.74rem' }}>Jump to today</button>}
        </div>
        <button type="button" onClick={() => step(1)} className="sns-icon-btn" title="Next day" aria-label="Next day"><ChevronRight size={18} /></button>
      </div>

      {rows.length === 0 ? <EmptyState message="No transport recorded for this day." /> : (
        <div className="space-y-3">
          {rows.map((r) => {
            const expanded = expandedId === r.memberId
            return (
              <div key={r.memberId} className="sns-card" style={{ overflow: 'hidden' }}>
                <div onClick={() => setExpandedId(expanded ? null : r.memberId)} className="sns-row-click" style={{ padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} ${r.name}'s trips`} onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : r.memberId) }}
                    className="flex items-center gap-3" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: 'inherit', font: 'inherit' }}>
                    <Avatar name={r.name} url={r.avatarUrl} size={38} />
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</p>
                      <p className="sns-text-faint" style={{ fontSize: '0.76rem' }}>{departmentLabel(r.department)} · {r.count} trip{r.count === 1 ? '' : 's'} · {formatKSh(r.total)}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    {r.unpaid > 0 ? (
                      <>
                        <div style={{ textAlign: 'right' }}><p className="sns-mono" style={{ fontWeight: 700, color: 'var(--stamp-deep)' }}>{formatKSh(r.unpaid)}</p><p className="sns-eyebrow sns-text-faint">unpaid</p></div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onMarkPaid({ id: r.memberId, fullName: r.name }, day.start, day.end) }} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.5rem 0.9rem' }}>Mark as Paid</button>
                      </>
                    ) : <span className="sns-badge sns-badge-done">Paid</span>}
                    {expanded ? <ChevronUp size={16} className="sns-text-faint" /> : <ChevronDown size={16} className="sns-text-faint" />}
                  </div>
                </div>
                {expanded && (
                  <div style={{ background: 'var(--paper)', padding: '0.8rem 1.1rem 1rem 4.2rem' }}>
                    {r.trips.map((j) => (
                      <div key={j.id} className="flex items-center justify-between" style={{ fontSize: '0.82rem', flexWrap: 'wrap', gap: '0.5rem', padding: '0.25rem 0' }}>
                        <span className="sns-chip-id">{j.jobId}</span><span className="sns-text-soft">{tripRoute(j)}</span>
                        <span className="sns-mono" style={{ fontWeight: 600 }}>{formatKSh(j.transportAmount)}</span>
                        {j.transportPaidAt && <span className="sns-badge sns-badge-done" style={{ fontSize: '0.62rem' }}>Paid</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
