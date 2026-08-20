import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, Clipboard, Clock, Plus, Wallet } from 'lucide-react'
import Header from './Header'
import JobFormModal from './JobForm'
import JobsTable from './JobsTable'
import { JobPrintView } from './PrintViews'
import { ConfirmDialog, NavCard, PeriodSelector, SearchInput, StatCard, StatusFilterSelect } from './shared'
import { formatKSh, isOverdue, isInPeriod, getPeriodRange, isInRange } from '../lib/helpers'

export default function MemberDashboard({ currentUser, jobs, onLogout, onAddJob, onUpdateJob, onDeleteJob }) {
  const [view, setView] = useState('home') // 'home' | 'all' | 'pending' | 'today'
  const [periodGranularity, setPeriodGranularity] = useState('day')
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date())
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [printing, setPrinting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const pendingJobs = useMemo(() => jobs.filter((j) => j.status !== 'Completed'), [jobs])
  const overdueJobs = useMemo(() => jobs.filter(isOverdue), [jobs])
  const todayJobs = useMemo(() => jobs.filter((j) => isInPeriod(j.createdAt, 'day')), [jobs])

  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodRange(periodGranularity, periodAnchor), [periodGranularity, periodAnchor])
  const periodJobs = useMemo(() => jobs.filter((j) => isInRange(j.createdAt, periodStart, periodEnd)), [jobs, periodStart, periodEnd])
  const stats = useMemo(() => ({
    periodCount: periodJobs.length,
    periodTransport: periodJobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0),
    periodCompleted: periodJobs.filter((j) => j.status === 'Completed').length,
    pending: pendingJobs.length,
    overdue: overdueJobs.length,
  }), [periodJobs, pendingJobs, overdueJobs])

  const filtered = useMemo(() => {
    let base = jobs
    if (view === 'pending') base = pendingJobs
    else if (view === 'today') base = todayJobs
    return base.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || [j.location, j.requestedBy, j.jobId].some((f) => (f || '').toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter
      return matchesSearch && matchesStatus
    }).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
  }, [view, jobs, pendingJobs, todayJobs, search, statusFilter])

  if (printing) return <JobPrintView job={printing} filedByUser={currentUser} onBack={() => setPrinting(null)} />

  const viewTitles = { all: 'All my jobs', pending: 'Pending jobs', today: "Today's jobs" }

  function openNewJob() { setEditingJob(null); setShowForm(true) }

  return (
    <div className="sns-shell">
      <Header currentUser={currentUser} onLogout={onLogout} subtitle="Ticketing System" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>

        {stats.overdue > 0 && (
          <div className="sns-alert-banner" style={{ marginBottom: '1.25rem' }}>
            <AlertCircle size={17} style={{ flexShrink: 0 }} />
            <span>{stats.overdue} job{stats.overdue === 1 ? ' is' : 's are'} overdue (Pending more than 24 hours) — resolve {stats.overdue === 1 ? 'it' : 'them'} from Pending Jobs.</span>
          </div>
        )}

        {view === 'home' ? (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700 }}>Overview</h2>
              <PeriodSelector granularity={periodGranularity} anchor={periodAnchor} onGranularityChange={setPeriodGranularity} onAnchorChange={setPeriodAnchor} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" style={{ marginBottom: '2rem' }}>
              <StatCard label="Total Jobs" value={stats.periodCount} icon={Clipboard} />
              <StatCard label="Transport" value={formatKSh(stats.periodTransport)} icon={Wallet} masked />
              <StatCard label="Completed" value={stats.periodCompleted} icon={CheckCircle2} />
              <StatCard label="Pending" value={stats.pending} icon={Clock} />
              <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} />
            </div>

            <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>Quick actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NavCard icon={Plus} label="File a new job" description="Log a new job card" onClick={openNewJob} />
              <NavCard icon={Clipboard} label="All my jobs" description={`${jobs.length} total`} onClick={() => setView('all')} />
              <NavCard icon={Clock} label="Pending jobs" description={`${pendingJobs.length} waiting`} onClick={() => setView('pending')} badge={stats.overdue} />
              <NavCard icon={Calendar} label="Jobs today" description={`${todayJobs.length} filed today`} onClick={() => setView('today')} />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <button onClick={() => setView('home')} className="sns-btn-secondary" style={{ padding: '0.5rem' }} title="Back to dashboard"><ArrowLeft size={16} /></button>
              <h2 className="sns-display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>{viewTitles[view]}</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-between" style={{ marginBottom: '1rem' }}>
              <div className="flex flex-col sm:flex-row gap-2" style={{ flex: 1 }}>
                <SearchInput value={search} onChange={setSearch} placeholder="Search by location, requester, job ID…" />
                <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
              </div>
              <button onClick={openNewJob} className="sns-btn-primary" style={{ whiteSpace: 'nowrap' }}>
                <Plus size={17} /> File new job
              </button>
            </div>
            <JobsTable
              jobs={filtered}
              onView={(j) => setPrinting(j)}
              onEdit={(j) => { setEditingJob(j); setShowForm(true) }}
              onDelete={(j) => setConfirmDelete(j)}
            />
          </>
        )}
      </main>
      {showForm && (
        <JobFormModal
          initialJob={editingJob}
          onClose={() => { setShowForm(false); setEditingJob(null) }}
          onSave={async (data) => {
            if (editingJob) await onUpdateJob(editingJob.id, data)
            else await onAddJob(data)
            setShowForm(false); setEditingJob(null)
          }}
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
