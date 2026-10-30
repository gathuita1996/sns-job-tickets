import { useMemo, useState } from 'react'
import { ArrowLeft, Award, Clipboard, CreditCard, Mail, Pencil, Phone, Plane, Shield, Star, Users, Wallet } from 'lucide-react'
import Avatar from './Avatar'
import { ConfirmDialog, EmptyState, StatCard, StatusBadge } from './shared'
import { LEAVE_STATUS_BADGE, LEAVE_STATUS_LABEL, dayCount, formatLeaveRange, leaveYearLabel } from '../lib/leave'
import { DEPARTMENTS, departmentLabel, formatDate, formatKSh, isInPeriod, isOverdue } from '../lib/helpers'

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4" style={{ fontSize: '0.86rem', padding: '0.45rem 0' }}>
    <span className="sns-text-faint">{label}</span>
    <span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{children || '—'}</span>
  </div>
)
const Section = ({ title, action, children }) => (
  <div className="sns-card" style={{ padding: '1.1rem 1.3rem', marginBottom: '1rem' }}>
    <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
      <h3 className="sns-display" style={{ fontWeight: 700, fontSize: '0.98rem' }}>{title}</h3>{action}
    </div>
    {children}
  </div>
)

// One page with everything about one staff member, for the admins.
export default function StaffDetail({ member, bank, jobs, customers, expenses, visits, routers, leaveRequests, leaveAdjustments, leaveRow, policy, userMap, commissionRate, onBack, onEdit, onOpenCustomers, onPromote, onToggleTeamLead, onSetDirector, onUpdateDepartment }) {
  const [confirm, setConfirm] = useState(null)        // null | 'promote' | 'director'
  const currentDirector = Object.values(userMap || {}).find((u) => u.isDirector)
  const myJobs = useMemo(() => jobs.filter((j) => j.memberId === member.id || (j.coTechnicians || []).includes(member.id)).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate)), [jobs, member.id])
  const myCustomers = useMemo(() => customers.filter((c) => c.recordedBy === member.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [customers, member.id])
  const thisMonth = myCustomers.filter((c) => isInPeriod(c.createdAt, 'month'))
  const owed = thisMonth.filter((c) => !c.commissionExempt && !c.commissionPaidAt).length * commissionRate
  const myLeave = useMemo(() => leaveRequests.filter((r) => r.memberId === member.id).sort((a, b) => b.startDate.localeCompare(a.startDate)), [leaveRequests, member.id])
  const myAdj = leaveAdjustments.filter((a) => a.memberId === member.id)
  const myExpenses = (expenses || []).filter((e) => e.submittedBy === member.id)
  const myVisits = (visits || []).filter((v) => v.visitedBy === member.id)
  const myRouters = (routers || []).filter((r) => r.recordedBy === member.id || r.retrievedBy === member.id)
  const imported = myCustomers.filter((c) => c.commissionExempt).length
  const age = member.dateOfBirth ? Math.floor((Date.now() - new Date(member.dateOfBirth).getTime()) / 31557600000) : null

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button type="button" onClick={onBack} className="sns-btn-secondary"><ArrowLeft size={16} /> Back to staff</button>
        <button type="button" onClick={() => onEdit(member)} className="sns-btn-secondary"><Pencil size={15} /> Edit details</button>
      </div>

      <div className="sns-card flex items-center gap-4" style={{ padding: '1.3rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Avatar name={member.fullName} url={member.avatarUrl} size={88} />
        <div style={{ flex: 1, minWidth: '14rem' }}>
          <h2 className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{member.fullName}</h2>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', margin: '0.35rem 0' }}>
            {member.role === 'admin' && <span className="sns-badge sns-badge-role">{member.title || 'Admin'}</span>}
            <span className="sns-badge sns-badge-progress">{departmentLabel(member.department)}</span>
            {member.isTeamLead && <span className="sns-badge" style={{ background: 'var(--confirmed-pale)', color: 'var(--confirmed)' }}><Star size={11} /> Team Lead</span>}
            {member.isDirector && <span className="sns-badge" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)' }}><Award size={11} /> Director</span>}
            {leaveRow?.on_leave_today && <span className="sns-badge sns-badge-pending">On leave today</span>}
          </div>
          <p className="flex items-center gap-4 sns-text-soft" style={{ fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span className="flex items-center gap-1"><Phone size={13} /> {member.contact || '—'}</span>
            {member.email && <span className="flex items-center gap-1"><Mail size={13} /> {member.email}</span>}
            {member.employeeNumber && <span className="sns-mono">{member.employeeNumber}</span>}
          </p>
          <p className="sns-text-faint" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>Username {member.username} · joined {formatDate(member.createdAt)}</p>
        </div>
      </div>

      <Section title="Role & access">
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          {onUpdateDepartment && (
            <label className="flex items-center gap-2" style={{ fontSize: '0.84rem' }}>
              <span className="sns-text-faint">Department</span>
              <select className="sns-input" style={{ width: 'auto', fontSize: '0.82rem' }} value={member.department} onChange={(e) => onUpdateDepartment(member, e.target.value)} aria-label="Department">
                {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
          )}
          {member.role !== 'admin' && onToggleTeamLead && (
            <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => onToggleTeamLead(member)} title="A Team Lead can submit purchases and expenses"><Star size={14} /> {member.isTeamLead ? 'Remove Team Lead' : 'Make Team Lead'}</button>
          )}
          {member.role !== 'admin' && onPromote && (
            <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setConfirm('promote')}><Shield size={14} /> Promote to admin</button>
          )}
          {member.role === 'admin' && !member.isDirector && onSetDirector && (
            <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setConfirm('director')}><Award size={14} /> Make Director</button>
          )}
          {member.isDirector && <span className="sns-text-soft" style={{ fontSize: '0.82rem' }}>This person is the Director. Making someone else Director replaces them.</span>}
        </div>
        <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginTop: '0.6rem' }}>Team Leads can submit purchases. Admins can see and manage everything. Only the Director approves purchases and leave.</p>
      </Section>
      {confirm === 'promote' && <ConfirmDialog title="Promote to admin" message={`Make ${member.fullName} an admin? Admins can see every job, customer, expense and staff record.`} onCancel={() => setConfirm(null)} onConfirm={async () => { await onPromote(member); setConfirm(null) }} />}
      {confirm === 'director' && <ConfirmDialog title="Make Director" message={`Make ${member.fullName} the Director? There is only one Director${currentDirector ? `, so ${currentDirector.fullName} stops being Director` : ''}. Only the Director approves purchases and leave.`} onCancel={() => setConfirm(null)} onConfirm={async () => { await onSetDirector(member); setConfirm(null) }} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1rem' }}>
        <StatCard label="Jobs worked" value={myJobs.length} icon={Clipboard} />
        <StatCard label="Customers recorded" value={myCustomers.length} icon={Users} />
        <StatCard label="Leave days left" value={leaveRow ? leaveRow.remaining : '—'} icon={Plane} tone="success" />
        <StatCard label="Commission owed (month)" value={formatKSh(owed)} icon={Wallet} tone="warning" masked />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <Section title="Personal details">
            <Row label="Gender">{member.gender}</Row>
            <Row label="Date of birth">{member.dateOfBirth ? `${formatDate(member.dateOfBirth)}${age != null ? ` (${age})` : ''}` : ''}</Row>
            <Row label="National ID number">{member.idNumber}</Row>
            <Row label="KRA PIN">{member.kraPin}</Row>
            <Row label="SHA number">{member.shaNumber}</Row>
          </Section>
          <Section title="Bank details" action={<CreditCard size={16} className="sns-text-faint" />}>
            {bank && (bank.bankName || bank.accountNumber) ? (<>
              <Row label="Bank">{bank.bankName}</Row><Row label="Account number"><span className="sns-mono">{bank.accountNumber}</span></Row>
              <Row label="Account name">{bank.accountName}</Row><Row label="Branch">{bank.branch}</Row></>) : <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>Not provided yet. {member.fullName.split(' ')[0]} can add them under My profile.</p>}
          </Section>
          <Section title="Leave" action={leaveRow ? <span className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{leaveYearLabel(leaveRow.leave_year, policy.year_start_month)}</span> : null}>
            {leaveRow && <p style={{ fontSize: '0.86rem', marginBottom: '0.6rem' }}><strong>{dayCount(leaveRow.remaining)}</strong> left of {leaveRow.entitlement} · {leaveRow.used_requests + leaveRow.adjustments} used{leaveRow.pending ? ` · ${leaveRow.pending} waiting` : ''}{myAdj.length ? ` (includes ${myAdj.reduce((s, a) => s + Number(a.days), 0)} opening)` : ''}</p>}
            {myLeave.length === 0 ? <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>No leave requests yet.</p> : myLeave.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between" style={{ fontSize: '0.84rem', padding: '0.3rem 0' }}><span>{formatLeaveRange(r.startDate, r.endDate)} · {dayCount(r.days)}</span><span className={`sns-badge ${LEAVE_STATUS_BADGE[r.status]}`}>{LEAVE_STATUS_LABEL[r.status]}</span></div>))}
          </Section>
        </div>
        <div>
          <Section title="Customers they recorded" action={myCustomers.length > 0 ? <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.74rem', padding: '0.3rem 0.6rem' }} onClick={() => onOpenCustomers(member.id)}>See all {myCustomers.length}</button> : null}>
            <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>{thisMonth.length} this month{imported ? ` · ${imported} imported (no commission)` : ''}</p>
            {myCustomers.length === 0 ? <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>None yet.</p> : myCustomers.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between" style={{ fontSize: '0.84rem', padding: '0.3rem 0' }}><span style={{ fontWeight: 600 }}>{c.fullName}</span><span className="sns-text-faint">{c.location} · {formatDate(c.createdAt)}</span></div>))}
          </Section>
          <Section title="Recent jobs">
            <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>{myJobs.filter((j) => j.status === 'Completed').length} completed · {myJobs.filter((j) => j.status !== 'Completed').length} open{myJobs.filter(isOverdue).length ? ` · ${myJobs.filter(isOverdue).length} overdue` : ''}</p>
            {myJobs.length === 0 ? <EmptyState message="No jobs yet." /> : myJobs.slice(0, 8).map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2" style={{ fontSize: '0.82rem', padding: '0.3rem 0' }}><span><span className="sns-mono sns-text-faint">{j.jobId}</span> {j.jobType} · {j.location}</span><StatusBadge status={j.status} /></div>))}
          </Section>
          <Section title="Also">
            <Row label="Purchases / expenses submitted">{myExpenses.length || ''}</Row>
            <Row label="Field visits recorded">{myVisits.length || ''}</Row>
            <Row label="Routers retrieved">{myRouters.length || ''}</Row>
          </Section>
        </div>
      </div>
    </div>
  )
}
