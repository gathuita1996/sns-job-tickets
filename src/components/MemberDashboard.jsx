import { useMemo, useState } from 'react'
import { Calendar, Clipboard, Clock, Plus, Wallet } from 'lucide-react'
import Header from './Header'
import JobFormModal from './JobForm'
import JobsTable from './JobsTable'
import { JobPrintView } from './PrintViews'
import { ConfirmDialog, SearchInput, StatCard, StatusFilterSelect } from './shared'
import { formatKSh } from '../lib/helpers'

export default function MemberDashboard({ currentUser, jobs, onLogout, onAddJob, onUpdateJob, onDeleteJob }) {
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [printing, setPrinting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || [j.location, j.requestedBy, j.jobId].some((f) => (f || '').toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter
      return matchesSearch && matchesStatus
    }).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
  }, [jobs, search, statusFilter])

  const stats = useMemo(() => {
    const now = new Date()
    return {
      total: jobs.length,
      totalTransport: jobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0),
      thisMonth: jobs.filter((j) => { const d = new Date(j.visitDate); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() }).length,
      pending: jobs.filter((j) => j.status !== 'Completed').length,
    }
  }, [jobs])

  if (printing) return <JobPrintView job={printing} filedByUser={currentUser} onBack={() => setPrinting(null)} />

  return (
    <div className="sns-shell">
      <Header currentUser={currentUser} onLogout={onLogout} subtitle="Member Portal" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1.5rem' }}>
          <StatCard label="Total Jobs" value={stats.total} icon={Clipboard} />
          <StatCard label="This Month" value={stats.thisMonth} icon={Calendar} />
          <StatCard label="Pending" value={stats.pending} icon={Clock} />
          <StatCard label="Transport Spent" value={formatKSh(stats.totalTransport)} icon={Wallet} />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-between" style={{ marginBottom: '1rem' }}>
          <div className="flex flex-col sm:flex-row gap-2" style={{ flex: 1 }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by location, requester, job ID…" />
            <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
          </div>
          <button onClick={() => { setEditingJob(null); setShowForm(true) }} className="sns-btn-primary" style={{ whiteSpace: 'nowrap' }}>
            <Plus size={17} /> File new job
          </button>
        </div>
        <JobsTable
          jobs={filtered}
          onView={(j) => setPrinting(j)}
          onEdit={(j) => { setEditingJob(j); setShowForm(true) }}
          onDelete={(j) => setConfirmDelete(j)}
        />
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
