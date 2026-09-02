import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Phone, Shield, Wallet } from 'lucide-react'
import { EmptyState, PeriodSelector } from './shared'
import { DEPARTMENTS, departmentLabel, formatKSh, formatDate, getPeriodRange, isInRange } from '../lib/helpers'

const DEPT_BADGE_CLASS = { sales: 'sns-badge-progress', technical: 'sns-badge-role', admin: 'sns-badge-pending' }

export default function TeamList({ users, jobs, onPromote, onUpdateDepartment, onEditMember }) {
  const [periodGranularity, setPeriodGranularity] = useState('day')
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date())
  const [expandedId, setExpandedId] = useState(null)

  const { start, end } = useMemo(() => getPeriodRange(periodGranularity, periodAnchor), [periodGranularity, periodAnchor])
  // Deliberately not filtered by status -- a job can still be Pending while
  // its transport cost was genuinely incurred that day, so it counts.
  const periodJobs = useMemo(() => jobs.filter((j) => isInRange(j.createdAt, start, end)), [jobs, start, end])

  if (!users.length) return <EmptyState message="No team members registered yet." />

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p className="sns-eyebrow sns-text-faint">Transport totals below reflect this period</p>
        <PeriodSelector granularity={periodGranularity} anchor={periodAnchor} onGranularityChange={setPeriodGranularity} onAnchorChange={setPeriodAnchor} />
      </div>
      <div className="sns-card">
        {users.map((m, i) => {
          const allTimeCount = jobs.filter((j) => j.memberId === m.id).length
          const memberPeriodJobs = periodJobs.filter((j) => j.memberId === m.id)
          const periodTransport = memberPeriodJobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0)
          const expanded = expandedId === m.id
          return (
            <div key={m.id} className={i > 0 ? 'sns-border-t' : ''}>
              <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--signal-pale)', color: 'var(--signal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", flexShrink: 0 }}>
                    {m.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.fullName}</p>
                      {m.role === 'admin' && <span className="sns-badge sns-badge-role">{m.title || 'Admin'}</span>}
                      <span className={`sns-badge ${DEPT_BADGE_CLASS[m.department] || 'sns-badge-pending'}`}>{departmentLabel(m.department)}</span>
                    </div>
                    <p className="flex items-center gap-1 sns-text-faint" style={{ fontSize: '0.75rem' }}><Phone size={11} /> {m.contact}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p className="sns-mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{allTimeCount}</p>
                    <p className="sns-eyebrow sns-text-faint">jobs filed</p>
                  </div>
                  <button
                    onClick={() => setExpandedId(expanded ? null : m.id)}
                    className="sns-btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem', textAlign: 'right' }}
                    title="View detailed breakdown"
                  >
                    <Wallet size={14} />
                    <span>{formatKSh(periodTransport)}</span>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {onUpdateDepartment && (
                    <select
                      className="sns-input"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
                      value={m.department}
                      onChange={(e) => onUpdateDepartment(m, e.target.value)}
                      title="Change department"
                    >
                      {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  )}
                  {onEditMember && (
                    <button onClick={() => onEditMember(m)} className="sns-icon-btn" title="Edit profile">
                      <Pencil size={15} />
                    </button>
                  )}
                  {m.role !== 'admin' && (
                    <button onClick={() => onPromote(m)} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }} title="Promote to admin">
                      <Shield size={14} /> Promote
                    </button>
                  )}
                </div>
              </div>
              {expanded && (
                <div style={{ background: 'var(--paper)', padding: '0.9rem 1.1rem 1.1rem 4.6rem' }}>
                  {memberPeriodJobs.length === 0 ? (
                    <p className="sns-text-faint" style={{ fontSize: '0.82rem' }}>No jobs — and no transport — recorded for this period.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {memberPeriodJobs.map((j) => (
                        <div key={j.id} className="flex items-center justify-between" style={{ fontSize: '0.82rem' }}>
                          <span className="sns-chip-id">{j.jobId}</span>
                          <span className="sns-text-soft">{j.transportFrom || '—'} → {(j.transportTo && j.transportTo.length ? j.transportTo : ['—']).join(' → ')}</span>
                          <span className="sns-text-faint">{formatDate(j.createdAt)}</span>
                          <span className="sns-mono" style={{ fontWeight: 600 }}>{formatKSh(j.transportAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
