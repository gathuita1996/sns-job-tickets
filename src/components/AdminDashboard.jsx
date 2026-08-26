import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Award, Check, CheckCircle2, Clipboard, Copy, Eye, EyeOff, Printer, Users, Wallet } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Header from './Header'
import JobFormModal from './JobForm'
import JobsTable from './JobsTable'
import TeamList from './TeamList'
import { JobPrintView, BatchPrintView } from './PrintViews'
import { ConfirmDialog, EmptyState, FormField, PeriodSelector, SearchInput, StatCard, StatusFilterSelect } from './shared'
import { JOB_TYPES, PRIORITY_OPTIONS, CUSTOMER_STATUSES, CHART_COLORS, COMMISSION_DEPARTMENTS, departmentLabel, formatKSh, formatDate, formatDateTime, isOverdue, isInPeriod, getPeriodRange, isInRange } from '../lib/helpers'

export default function AdminDashboard({ currentUser, users, jobs, customers, onLogout, onUpdateJob, onDeleteJob, onPromote, onUpdateDepartment, accessCode, onUpdateAccessCode, commissionRate, onUpdateCommissionRate, onClearCommission, onUpdateCustomerStatus }) {
  const [tab, setTab] = useState('overview')
  const [periodGranularity, setPeriodGranularity] = useState('day')
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [selected, setSelected] = useState([])
  const [printing, setPrinting] = useState(null)
  const [editingJob, setEditingJob] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedMemberId, setExpandedMemberId] = useState(null)
  const [confirmClear, setConfirmClear] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')

  const members = users.filter((u) => u.role === 'member')
  const userMap = useMemo(() => { const m = {}; users.forEach((u) => (m[u.id] = u)); return m }, [users])
  const overdueJobs = useMemo(() => jobs.filter(isOverdue), [jobs])

  useEffect(() => { setSelected([]) }, [search, statusFilter, memberFilter, typeFilter, priorityFilter, overdueOnly])

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || [j.location, j.requestedBy, j.jobId, userMap[j.memberId]?.fullName].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter
      const matchesMember = memberFilter === 'all' || j.memberId === memberFilter
      const matchesType = typeFilter === 'all' || j.jobType === typeFilter
      const matchesPriority = priorityFilter === 'all' || j.priority === priorityFilter
      const matchesOverdue = !overdueOnly || isOverdue(j)
      return matchesSearch && matchesStatus && matchesMember && matchesType && matchesPriority && matchesOverdue
    }).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
  }, [jobs, search, statusFilter, memberFilter, typeFilter, priorityFilter, overdueOnly, userMap])

  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodRange(periodGranularity, periodAnchor), [periodGranularity, periodAnchor])
  const periodJobs = useMemo(() => jobs.filter((j) => isInRange(j.createdAt, periodStart, periodEnd)), [jobs, periodStart, periodEnd])

  // Commission is never stored — always derived from customers whose
  // commission hasn't been cleared yet, so it can never drift out of sync.
  // Members with nothing currently owed are left out entirely.
  const commissionRows = useMemo(() => {
    return members
      .filter((m) => COMMISSION_DEPARTMENTS.includes(m.department))
      .map((m) => {
        const unpaidCustomers = customers.filter((c) => c.recordedBy === m.id && !c.commissionPaidAt)
        return { member: m, unpaidCustomers, count: unpaidCustomers.length, commission: unpaidCustomers.length * commissionRate }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.commission - a.commission)
  }, [members, customers, commissionRate])

  const totalCommissionThisMonth = useMemo(() => {
    const count = customers.filter((c) =>
      !c.commissionPaidAt &&
      isInPeriod(c.createdAt, 'month') &&
      COMMISSION_DEPARTMENTS.includes(userMap[c.recordedBy]?.department)
    ).length
    return count * commissionRate
  }, [customers, userMap, commissionRate])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase()
    return [...customers]
      .filter((c) => !q || [c.fullName, c.contact, c.location].some((f) => (f || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [customers, customerSearch])

  const stats = useMemo(() => {
    const byType = JOB_TYPES.map((t) => ({ type: t, count: jobs.filter((j) => j.jobType === t).length })).filter((x) => x.count > 0)
    return {
      periodCount: periodJobs.length,
      periodTransport: periodJobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0),
      periodCompleted: periodJobs.filter((j) => j.status === 'Completed').length,
      activeMembers: members.length,
      overdue: overdueJobs.length,
      byType,
    }
  }, [jobs, periodJobs, members, overdueJobs])

  if (printing?.type === 'single') return <JobPrintView job={printing.job} filedByUser={userMap[printing.job.memberId]} onBack={() => setPrinting(null)} />
  if (printing?.type === 'batch') return <BatchPrintView jobs={printing.jobs} userMap={userMap} onBack={() => setPrinting(null)} generatedBy={currentUser} />

  return (
    <div className="sns-shell">
      <Header currentUser={currentUser} onLogout={onLogout} subtitle="Ticketing System" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>

        {stats.overdue > 0 && (
          <button
            className="no-print sns-alert-banner"
            style={{ marginBottom: '1.25rem', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onClick={() => { setTab('jobs'); setOverdueOnly(true) }}
          >
            <AlertCircle size={17} style={{ flexShrink: 0 }} />
            <span>{stats.overdue} job{stats.overdue === 1 ? ' is' : 's are'} overdue across the team — click to review.</span>
          </button>
        )}

        <div className="no-print flex gap-1 sns-border-b" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button className={`sns-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`sns-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>All Jobs</button>
          <button className={`sns-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>Team</button>
          <button className={`sns-tab ${tab === 'commissions' ? 'active' : ''}`} onClick={() => setTab('commissions')}>Commissions</button>
          <button className={`sns-tab ${tab === 'customers' ? 'active' : ''}`} onClick={() => setTab('customers')}>Customers</button>
          <button className={`sns-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        </div>

        {tab === 'overview' && (
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700 }}>Overview</h2>
              <PeriodSelector granularity={periodGranularity} anchor={periodAnchor} onGranularityChange={setPeriodGranularity} onAnchorChange={setPeriodAnchor} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" style={{ marginBottom: '1.5rem' }}>
              <StatCard label="Total Jobs" value={stats.periodCount} icon={Clipboard} />
              <StatCard label="Transport" value={formatKSh(stats.periodTransport)} icon={Wallet} masked tone="warning" />
              <StatCard label="Completed" value={stats.periodCompleted} icon={CheckCircle2} tone="success" />
              <StatCard label="Active Members" value={stats.activeMembers} icon={Users} />
              <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} tone="danger" />
            </div>
            <div className="sns-card" style={{ padding: '1.25rem' }}>
              <h3 className="sns-display" style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Jobs by type</h3>
              {stats.byType.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.byType} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E1E7F0" vertical={false} />
                    <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#8494A3' }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8494A3' }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E1E7F0', fontSize: '0.8rem' }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {stats.byType.map((entry, i) => <Cell key={entry.type} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState message="No jobs filed yet." />}
            </div>
          </div>
        )}

        {tab === 'jobs' && (
          <div>
            <div className="no-print flex flex-col sm:flex-row flex-wrap gap-2" style={{ marginBottom: '1rem' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" />
              <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="sns-input" style={{ width: 'auto' }}>
                <option value="all">All members</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="sns-input" style={{ width: 'auto' }}>
                <option value="all">All job types</option>
                {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="sns-input" style={{ width: 'auto' }}>
                <option value="all">All priorities</option>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
              <button
                onClick={() => setOverdueOnly((v) => !v)}
                className={overdueOnly ? 'sns-btn-primary' : 'sns-btn-secondary'}
                style={overdueOnly ? { background: 'var(--overdue)' } : undefined}
              >
                <AlertCircle size={15} /> Overdue only
              </button>
              {selected.length > 0 && (
                <button onClick={() => setPrinting({ type: 'batch', jobs: jobs.filter((j) => selected.includes(j.id)) })} className="sns-btn-primary">
                  <Printer size={15} /> Print selected ({selected.length})
                </button>
              )}
            </div>
            <JobsTable
              jobs={filtered} showFiledBy userMap={userMap} selectable selected={selected}
              onToggleSelect={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
              onSelectAll={() => setSelected(filtered.map((j) => j.id))}
              onClearSelect={() => setSelected([])}
              onView={(j) => setPrinting({ type: 'single', job: j })}
              onEdit={(j) => setEditingJob(j)}
              onDelete={(j) => setConfirmDelete(j)}
            />
          </div>
        )}

        {tab === 'team' && <TeamList users={users} jobs={jobs} onPromote={onPromote} onUpdateDepartment={onUpdateDepartment} />}

        {tab === 'commissions' && (
          <div>
            <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '1.5rem', maxWidth: '24rem' }}>
              <StatCard label="Members owed" value={commissionRows.length} icon={Users} />
              <StatCard label="Owed this month" value={formatKSh(totalCommissionThisMonth)} icon={Award} tone="success" />
            </div>
            {commissionRows.length === 0 ? (
              <EmptyState message="No commission currently owed." />
            ) : (
              <div className="sns-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th>Member</th><th>Department</th><th>Customers</th><th>Commission owed</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                    </thead>
                    <tbody>
                      {commissionRows.map((r) => (
                        <React.Fragment key={r.member.id}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedMemberId((id) => (id === r.member.id ? null : r.member.id))}>
                            <td style={{ fontWeight: 600 }}>{r.member.fullName}</td>
                            <td className="sns-text-soft">{departmentLabel(r.member.department)}</td>
                            <td className="sns-mono">{r.count}</td>
                            <td className="sns-mono" style={{ fontWeight: 700, color: 'var(--confirmed)' }}>{formatKSh(r.commission)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={(e) => { e.stopPropagation(); setConfirmClear(r) }} className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem' }}>
                                <Check size={13} /> Clear
                              </button>
                            </td>
                          </tr>
                          {expandedMemberId === r.member.id && (
                            <tr>
                              <td colSpan={5} style={{ background: 'var(--paper)', padding: '0.9rem 1.1rem' }}>
                                <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.6rem' }}>{r.count} unpaid commission{r.count === 1 ? '' : 's'}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  {r.unpaidCustomers.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between" style={{ fontSize: '0.83rem' }}>
                                      <span style={{ fontWeight: 600 }}>{c.fullName}</span>
                                      <span className="sns-text-faint">{formatDate(c.createdAt)}</span>
                                      <span className="sns-mono" style={{ fontWeight: 600 }}>{formatKSh(commissionRate)}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div>
            <div className="no-print" style={{ marginBottom: '1rem' }}>
              <SearchInput value={customerSearch} onChange={setCustomerSearch} placeholder="Search by name, contact, or location…" />
            </div>
            {filteredCustomers.length === 0 ? (
              <EmptyState message="No customers recorded yet." />
            ) : (
              <div className="sns-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th>Name</th><th>Contact</th><th>Location</th><th>Package requested</th><th>Recorded by</th><th>Date &amp; time</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.fullName}</td>
                          <td className="sns-text-soft">{c.contact}</td>
                          <td className="sns-text-soft">{c.location}</td>
                          <td className="sns-text-soft">{c.interestedPackage || '—'}</td>
                          <td className="sns-text-soft">{userMap[c.recordedBy]?.fullName || '—'}</td>
                          <td className="sns-text-soft">{formatDateTime(c.createdAt)}</td>
                          <td>
                            <select
                              className="sns-input"
                              style={{ width: 'auto', fontSize: '0.78rem', padding: '0.35rem 0.55rem' }}
                              value={c.status}
                              onChange={(e) => onUpdateCustomerStatus(c, e.target.value)}
                            >
                              {CUSTOMER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div>
            <AccessCodeSettings accessCode={accessCode} onUpdate={onUpdateAccessCode} />
            <CommissionRateSettings commissionRate={commissionRate} onUpdate={onUpdateCommissionRate} />
          </div>
        )}
      </main>

      {editingJob && (
        <JobFormModal
          initialJob={editingJob}
          onClose={() => setEditingJob(null)}
          onSave={async (data) => { await onUpdateJob(editingJob.id, data); setEditingJob(null) }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete job card"
          message={`Are you sure you want to delete job ${confirmDelete.jobId}? This cannot be undone.`}
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { await onDeleteJob(confirmDelete.id); setConfirmDelete(null) }}
        />
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear commission"
          message={`Mark ${confirmClear.count} commission${confirmClear.count === 1 ? '' : 's'} (${formatKSh(confirmClear.commission)}) as paid for ${confirmClear.member.fullName}? This only makes sense once you've actually paid them — it can't be undone.`}
          danger
          onCancel={() => setConfirmClear(null)}
          onConfirm={async () => { await onClearCommission(confirmClear.member); setConfirmClear(null); setExpandedMemberId(null) }}
        />
      )}
    </div>
  )
}

function AccessCodeSettings({ accessCode, onUpdate }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [draft, setDraft] = useState(accessCode || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(accessCode || '') }, [accessCode])

  function copy() {
    navigator.clipboard.writeText(accessCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function save() {
    if (!draft.trim() || draft === accessCode) return
    setSaving(true)
    await onUpdate(draft.trim())
    setSaving(false)
  }

  return (
    <div className="sns-card" style={{ padding: '1.5rem', maxWidth: '30rem' }}>
      <h3 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Team access code</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.3rem' }}>
        New members need this to sign up. Only share it with people who should be able to join — anyone who has it can create an account.
      </p>

      <FormField label="Current code">
        <div className="flex items-center gap-2">
          <input
            readOnly
            className="sns-input sns-mono"
            style={{ flex: 1 }}
            value={accessCode ? (revealed ? accessCode : '•'.repeat(Math.max(accessCode.length, 8))) : 'Loading…'}
          />
          <button type="button" className="sns-icon-btn" title={revealed ? 'Hide' : 'Reveal'} onClick={() => setRevealed((r) => !r)} disabled={!accessCode}>
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button type="button" className="sns-icon-btn" title="Copy" onClick={copy} disabled={!accessCode}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </FormField>

      <div style={{ marginTop: '1.1rem' }}>
        <FormField label="Change it" hint="Existing members are unaffected — this only changes what new signups need to enter.">
          <div className="flex items-center gap-2">
            <input className="sns-input" style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New access code" />
            <button type="button" className="sns-btn-primary" disabled={saving || !draft.trim() || draft === accessCode} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </FormField>
      </div>
    </div>
  )
}

function CommissionRateSettings({ commissionRate, onUpdate }) {
  const [draft, setDraft] = useState(String(commissionRate))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDraft(String(commissionRate)) }, [commissionRate])

  async function save() {
    const n = Number(draft)
    if (!draft.trim() || isNaN(n) || n < 0 || n === commissionRate) return
    setSaving(true)
    await onUpdate(n)
    setSaving(false)
  }

  return (
    <div className="sns-card" style={{ padding: '1.5rem', maxWidth: '30rem', marginTop: '1.25rem' }}>
      <h3 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Commission rate</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.3rem' }}>
        Paid to Sales &amp; Marketing and Technical members for each new customer they record.
      </p>
      <FormField label="Amount per customer (KSh)">
        <div className="flex items-center gap-2">
          <input type="number" min="0" className="sns-input" style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className="sns-btn-primary" disabled={saving || !draft.trim() || Number(draft) === commissionRate} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </FormField>
    </div>
  )
}
