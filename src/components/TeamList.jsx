import { Pencil, Phone, Shield } from 'lucide-react'
import { EmptyState } from './shared'
import { DEPARTMENTS, departmentLabel } from '../lib/helpers'

const DEPT_BADGE_CLASS = { sales: 'sns-badge-progress', technical: 'sns-badge-role', admin: 'sns-badge-pending' }

export default function TeamList({ users, jobs, onPromote, onUpdateDepartment, onEditMember }) {
  if (!users.length) return <EmptyState message="No team members registered yet." />
  return (
    <div className="sns-card">
      {users.map((m, i) => {
        const count = jobs.filter((j) => j.memberId === m.id).length
        return (
          <div key={m.id} className={i > 0 ? 'sns-border-t' : ''} style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
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
                <p className="sns-mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{count}</p>
                <p className="sns-eyebrow sns-text-faint">jobs filed</p>
              </div>
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
        )
      })}
    </div>
  )
}
