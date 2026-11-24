import { useMemo, useState } from 'react'
import { Award, ChevronRight, Phone, Star, UserCog } from 'lucide-react'
import { EmptyState, SearchInput } from './shared'
import Avatar from './Avatar'
import { departmentLabel } from '../lib/helpers'
import { describeMissing, incompleteProfiles, profileApplies } from '../lib/profileComplete'

const DEPT_BADGE_CLASS = { sales: 'sns-badge-progress', technical: 'sns-badge-role', admin: 'sns-badge-pending' }

// The staff list: a plain list where the WHOLE row opens that person's page. Role, department and Director controls live on that page.
//   bankDetails / bankKnown (Update 51): the bank details of every member, and whether they have been read. A member who has not
//   finished their profile gets a "Profile incomplete" badge (the same rule as the member's own banner and the database). While the
//   bank details are not known the four bank fields are left out of the check instead of being reported as empty.
export default function TeamList({ users, jobs, onViewMember, awayIds, contracts, bankDetails, bankKnown = false }) {
  const [search, setSearch] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const bankChecked = Boolean(bankDetails) && bankKnown !== false
  const incomplete = useMemo(() => incompleteProfiles(users, bankDetails, { bankKnown: bankChecked }), [users, bankDetails, bankChecked])
  const held = users.filter(profileApplies).length              // the members the rule applies to: everyone but the admins
  const filterOn = onlyIncomplete && incomplete.size > 0        // the filter lets go by itself once nobody is left
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((m) => (!filterOn || incomplete.has(m.id)) && (!q || [m.fullName, m.username, m.contact, m.employeeNumber, departmentLabel(m.department)].some((f) => String(f || '').toLowerCase().includes(q))))
  }, [users, search, filterOn, incomplete])
  if (!users.length) return <EmptyState message="No staff registered yet." />
  const n = incomplete.size

  return (
    <div>
      {n > 0 && (
        <section className="sns-profile-banner" aria-label="Profiles that are not complete" style={{ marginBottom: '0.9rem' }}>
          <UserCog size={20} className="sns-profile-banner-icon" aria-hidden="true" />
          <div className="sns-profile-banner-text">
            <p className="sns-profile-banner-title">{n} {n === 1 ? 'member has' : 'members have'} not completed their profile</p>
            <p>They cannot file a job until they do. Open a member's page to see what is missing.</p>
          </div>
          <button type="button" className="sns-btn-secondary sns-profile-banner-btn" aria-pressed={filterOn} onClick={() => setOnlyIncomplete((v) => !v)}>{filterOn ? 'Show everyone' : 'Show only these'}</button>
        </section>
      )}
      {n === 0 && held > 0 && bankChecked && <p className="sns-text-faint" style={{ fontSize: '0.82rem', marginBottom: '0.8rem' }}>Every member has completed their profile.</p>}
      {!bankChecked && held > 0 && <p className="sns-text-faint" style={{ fontSize: '0.82rem', marginBottom: '0.8rem' }}>The bank details have not loaded, so only the rest of each profile was checked.</p>}
      {users.length > 6 && <div style={{ marginBottom: '0.8rem' }}><SearchInput value={search} onChange={setSearch} placeholder="Search staff by name, phone, number or department…" /></div>}
      {shown.length === 0 ? <EmptyState message="No staff match that search." /> : (
        <div className="sns-card" style={{ overflow: 'hidden' }}>
          {shown.map((m, i) => {
            const jobsWorked = jobs.filter((j) => j.memberId === m.id || (j.coTechnicians || []).includes(m.id)).length
            const open = () => onViewMember(m)
            const missing = incomplete.get(m.id)
            return (
              <div key={m.id} role="button" tabIndex={0} aria-label={`Open ${m.fullName}'s page${missing ? ', profile incomplete' : ''}`} onClick={open}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
                className={`sns-row-click ${i > 0 ? 'sns-border-t' : ''}`} style={{ padding: '0.95rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="flex items-center gap-3">
                  <Avatar name={m.fullName} url={m.avatarUrl} size={40} />
                  <div>
                    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.fullName}</p>
                      {m.role === 'admin' && <span className="sns-badge sns-badge-role">{m.title || 'Admin'}</span>}
                      <span className={`sns-badge ${DEPT_BADGE_CLASS[m.department] || 'sns-badge-pending'}`}>{departmentLabel(m.department)}</span>
                      {missing && <span className="sns-badge sns-badge-profile" title={`Still missing: ${describeMissing(missing, missing.length)}`}><UserCog size={11} aria-hidden="true" /> Profile incomplete</span>}
                      {contracts && (contracts[m.id]
                        ? <span className={`sns-badge ${contracts[m.id].contractType === 'annual' ? 'sns-badge-done' : 'sns-badge-pending'}`} title="Contract">{contracts[m.id].contractType === 'annual' ? '1 year' : 'Short term'}</span>
                        : <span className="sns-badge sns-badge-role" title="No contract on file">No contract</span>)}
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
