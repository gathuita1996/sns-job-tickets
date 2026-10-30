import { useMemo, useState } from 'react'
import { Award, ChevronRight, Phone, Star } from 'lucide-react'
import { EmptyState, SearchInput } from './shared'
import Avatar from './Avatar'
import { departmentLabel } from '../lib/helpers'

const DEPT_BADGE_CLASS = { sales: 'sns-badge-progress', technical: 'sns-badge-role', admin: 'sns-badge-pending' }

// The staff list: a plain list where the WHOLE row opens that person's page. Role, department and Director controls live on that page.
export default function TeamList({ users, jobs, onViewMember, awayIds }) {
  const [search, setSearch] = useState('')
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((m) => !q || [m.fullName, m.username, m.contact, m.employeeNumber, departmentLabel(m.department)].some((f) => String(f || '').toLowerCase().includes(q)))
  }, [users, search])
  if (!users.length) return <EmptyState message="No staff registered yet." />

  return (
    <div>
      {users.length > 6 && <div style={{ marginBottom: '0.8rem' }}><SearchInput value={search} onChange={setSearch} placeholder="Search staff by name, phone, number or department…" /></div>}
      {shown.length === 0 ? <EmptyState message="No staff match that search." /> : (
        <div className="sns-card" style={{ overflow: 'hidden' }}>
          {shown.map((m, i) => {
            const jobsWorked = jobs.filter((j) => j.memberId === m.id || (j.coTechnicians || []).includes(m.id)).length
            const open = () => onViewMember(m)
            return (
              <div key={m.id} role="button" tabIndex={0} aria-label={`Open ${m.fullName}'s page`} onClick={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
                className={`sns-row-click ${i > 0 ? 'sns-border-t' : ''}`} style={{ padding: '0.95rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="flex items-center gap-3">
                  <Avatar name={m.fullName} url={m.avatarUrl} size={40} />
                  <div>
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.fullName}</p>
                      {m.role === 'admin' && <span className="sns-badge sns-badge-role">{m.title || 'Admin'}</span>}
                      <span className={`sns-badge ${DEPT_BADGE_CLASS[m.department] || 'sns-badge-pending'}`}>{departmentLabel(m.department)}</span>
                      {m.isTeamLead && <span className="sns-badge" style={{ background: 'var(--confirmed-pale)', color: 'var(--confirmed)' }}><Star size={11} /> Team Lead</span>}
                      {m.isDirector && <span className="sns-badge" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)' }}><Award size={11} /> Director</span>}
                      {awayIds && awayIds.has(m.id) && <span className="sns-badge sns-badge-pending">On leave</span>}
                    </div>
                    <p className="flex items-center gap-2 sns-text-faint" style={{ fontSize: '0.75rem' }}>
                      <span className="flex items-center gap-1"><Phone size={11} /> {m.contact}</span>
                      {m.employeeNumber && <span className="sns-mono">{m.employeeNumber}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div style={{ textAlign: 'right' }}><p className="sns-mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{jobsWorked}</p><p className="sns-eyebrow sns-text-faint">jobs worked</p></div>
                  <ChevronRight size={18} className="sns-text-faint" aria-hidden="true" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
