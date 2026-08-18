import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clipboard, Printer, Users, Wallet } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import Header from './Header'
import JobFormModal from './JobForm'
import JobsTable from './JobsTable'
import TeamList from './TeamList'
import { JobPrintView, BatchPrintView } from './PrintViews'
import { ConfirmDialog, EmptyState, SearchInput, StatCard, StatusFilterSelect } from './shared'
import { JOB_TYPES, CHART_COLORS, formatKSh } from '../lib/helpers'

export default function AdminDashboard({ currentUser, users, jobs, onLogout, onUpdateJob, onDeleteJob, onPromote }) {
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState([])
  const [printing, setPrinting] = useState(null)
  const [editingJob, setEditingJob] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const members = users.filter((u) => u.role === 'member')
  const userMap = useMemo(() => { const m = {}; users.forEach((u) => (m[u.id] = u)); return m }, [users])

  useEffect(() => { setSelected([]) }, [search, statusFilter, memberFilter, typeFilter])

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || [j.location, j.requestedBy, j.jobId, userMap[j.memberId]?.fullName].filter(Boolean).some((f) => f.toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter
      const matchesMember = memberFilter === 'all' || j.memberId === memberFilter
      const matchesType = typeFilter === 'all' || j.jobType === typeFilter
      return matchesSearch && matchesStatus && matchesMember && matchesType
    }).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
  }, [jobs, search, statusFilter, memberFilter, typeFilter, userMap])

  const stats = useMemo(() => {
    const now = new Date()
    const byType = JOB_TYPES.map((t) => ({ type: t, count: jobs.filter((j) => j.jobType === t).length })).filter((x) => x.count > 0)
    return {
      total: jobs.length,
      totalTransport: jobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0),
      thisMonth: jobs.filter((j) => { const d = new Date(j.visitDate); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }).length,
      activeMembers: members.length,
      byType,
    }
  }, [jobs, members])

  if (printing?.type === 'single') return <JobPrintView job={printing.job} filedByUser={userMap[printing.job.memberId]} onBack={() => setPrinting(null)} />
  if (printing?.type === 'batch') return <BatchPrintView jobs={printing.jobs} userMap={userMap} onBack={() => setPrinting(null)} generatedBy={currentUser} />

  return (
    <div className="sns-shell">
      <Header currentUser={currentUser} onLogout={onLogout} subtitle="Admin Portal" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        <div className="no-print flex gap-1 sns-border-b" style={{ marginBottom: '1.5rem' }}>
          <button className={`sns-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`sns-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>All Jobs</button>
          <button className={`sns-tab ${tab === 'team' ? 'active' : ''}`} onClick={() => setTab('team')}>Team</button>
        </div>

        {tab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1.5rem' }}>
              <StatCard label="Total Jobs" value={stats.total} icon={Clipboard} />
              <StatCard label="This Month" value={stats.thisMonth} icon={Calendar} />
              <StatCard label="Active Members" value={stats.activeMembers} icon={Users} />
              <StatCard label="Transport Spent" value={formatKSh(stats.totalTransport)} icon={Wallet} />
            </div>
            <div className="sns-card" style={{ padding: '1.25rem' }}>
              <h3 className="sns-display" style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.95rem' }}>Jobs by type</h3>
              {stats.byType.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={stats.byType} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEEEF" vertical={false} />
                    <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#8993A1' }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8993A1' }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #DCE1E4', fontSize: '0.8rem' }} />
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
              <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
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

        {tab === 'team' && <TeamList users={users} jobs={jobs} onPromote={onPromote} />}
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
    </div>
  )
}
