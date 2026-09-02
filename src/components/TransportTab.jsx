import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Wallet } from 'lucide-react'
import { EmptyState, StatCard } from './shared'
import { formatKSh, formatDate, toDateInputValue } from '../lib/helpers'

function dayRange(anchor) {
  const start = new Date(anchor)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export default function TransportTab({ users, jobs, onMarkPaid }) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [expandedId, setExpandedId] = useState(null)
  const { start, end } = useMemo(() => dayRange(anchor), [anchor])
  const isToday = toDateInputValue(anchor) === toDateInputValue(new Date())

  const dayJobs = useMemo(
    () => jobs.filter((j) => { const t = new Date(j.createdAt); return t >= start && t < end }),
    [jobs, start, end]
  )

  const rows = useMemo(() => {
    return users
      .map((m) => {
        const memberJobs = dayJobs.filter((j) => j.memberId === m.id)
        const unpaidJobs = memberJobs.filter((j) => !j.transportPaidAt)
        const paidTotal = memberJobs.filter((j) => j.transportPaidAt).reduce((s, j) => s + (Number(j.transportAmount) || 0), 0)
        const unpaidTotal = unpaidJobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0)
        return { member: m, memberJobs, unpaidJobs, paidTotal, unpaidTotal, total: paidTotal + unpaidTotal }
      })
      .filter((r) => r.memberJobs.length > 0)
      .sort((a, b) => b.unpaidTotal - a.unpaidTotal)
  }, [users, dayJobs])

  const totalUnpaid = rows.reduce((s, r) => s + r.unpaidTotal, 0)

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="grid grid-cols-2 gap-3" style={{ maxWidth: '22rem' }}>
          <StatCard label="Members with transport" value={rows.length} icon={Wallet} />
          <StatCard label="Unpaid today" value={formatKSh(totalUnpaid)} icon={Wallet} tone={totalUnpaid > 0 ? 'warning' : 'default'} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor((a) => { const d = new Date(a); d.setDate(d.getDate() - 1); return d }) } className="sns-icon-btn" title="Previous day">
            <ChevronLeft size={18} />
          </button>
          <div style={{ textAlign: 'center', minWidth: '9rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{isToday ? 'Today' : formatDate(anchor)}</p>
            {!isToday && <p className="sns-text-faint" style={{ fontSize: '0.72rem' }}>{formatDate(anchor)}</p>}
          </div>
          <button onClick={() => setAnchor((a) => { const d = new Date(a); d.setDate(d.getDate() + 1); return d })} className="sns-icon-btn" title="Next day">
            <ChevronRight size={18} />
          </button>
          {!isToday && <button onClick={() => setAnchor(new Date())} className="sns-btn-link" style={{ fontSize: '0.78rem', marginLeft: '0.3rem' }}>Jump to today</button>}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No transport recorded for this day." />
      ) : (
        <div className="sns-card">
          {rows.map((r, i) => {
            const expanded = expandedId === r.member.id
            return (
              <div key={r.member.id} className={i > 0 ? 'sns-border-t' : ''}>
                <div
                  onClick={() => setExpandedId(expanded ? null : r.member.id)}
                  style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', cursor: 'pointer' }}
                >
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronUp size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />}
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.member.fullName}</p>
                      <p className="sns-text-faint" style={{ fontSize: '0.76rem' }}>{r.memberJobs.length} job{r.memberJobs.length === 1 ? '' : 's'} · Total {formatKSh(r.total)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.unpaidTotal > 0 ? (
                      <>
                        <div style={{ textAlign: 'right' }}>
                          <p className="sns-mono" style={{ fontWeight: 700, color: 'var(--stamp-deep)' }}>{formatKSh(r.unpaidTotal)}</p>
                          <p className="sns-eyebrow sns-text-faint">unpaid</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onMarkPaid(r.member, start, end) }} className="sns-btn-primary" style={{ fontSize: '0.78rem', padding: '0.5rem 0.9rem' }}>
                          Mark as Paid
                        </button>
                      </>
                    ) : (
                      <span className="sns-badge sns-badge-done">Paid</span>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div style={{ background: 'var(--paper)', padding: '0.9rem 1.1rem 1.1rem 2.9rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {r.memberJobs.map((j) => (
                        <div key={j.id} className="flex items-center justify-between" style={{ fontSize: '0.82rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span className="sns-chip-id">{j.jobId}</span>
                          <span className="sns-text-soft">{j.transportFrom || '—'} → {(j.transportTo && j.transportTo.length ? j.transportTo : ['—']).join(' → ')}</span>
                          <span className="sns-mono" style={{ fontWeight: 600 }}>{formatKSh(j.transportAmount)}</span>
                          {j.transportPaidAt && <span className="sns-badge sns-badge-done" style={{ fontSize: '0.62rem' }}>Paid</span>}
                        </div>
                      ))}
                    </div>
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
