import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Plane, Router as RouterIcon, Calendar, CheckCircle2, ClipboardCheck, Clipboard, Clock, Pencil, Plus, Receipt, Send, Trash2, UserPlus, Users, Wallet } from 'lucide-react'
import Header from './Header'
import JobFormModal from './JobForm'
import JobsTable from './JobsTable'
import CustomerFormModal from './CustomerForm'
import RetrievedRouters from './RetrievedRouters'
import ExpenseFormModal from './ExpenseForm'
import ExpensesList from './ExpensesList'
import { JobPrintView } from './PrintViews'
import { ConfirmDialog, EmptyState, NavCard, PeriodSelector, SearchInput, StatCard, StatusFilterSelect } from './shared'
import { formatKSh, formatDate, isOverdue, isInPeriod, getPeriodRange, isInRange, COMMISSION_DEPARTMENTS, toDateInputValue } from '../lib/helpers'
import FieldVisits from './FieldVisits'
import { analyzePlaces } from '../lib/visitsIntel'
import { MapPin } from 'lucide-react'


export default function MemberDashboard({ extras, currentUser, jobs, raisedJobs, customers, customerIdsWithJobs, expenses, memberNames, places, visits, onAddPlace, onRecordVisit, onDeleteVisit, onLogout, onAddJob, onUpdateJob, onDeleteJob, onAddCustomer, onUpdateCustomer, onDeleteCustomer, onUpdateProfile, onAddExpense, onAttachReceipt, onDeleteExpense, onViewReceipt, commissionRate }) {
  const [profileRequest, setProfileRequest] = useState(null)
  const routerApi = (extras && extras.routers) || { rows: [] }
  const leaveSummary = extras && extras.leave && extras.leave.summary
  const [view, setView] = useState('home') // 'home' | 'all' | 'pending' | 'today' | 'assigned' | 'raised' | 'customers' | 'routers' | 'expenses'
  const [periodGranularity, setPeriodGranularity] = useState('day')
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date())
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [printing, setPrinting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const isSales = currentUser.department === 'sales'
  const visitStats = useMemo(() => (isSales ? analyzePlaces({ places: places || [], visits: visits || [], customers, today: toDateInputValue(new Date()) }) : []), [isSales, places, visits, customers])
  const revisitCount = visitStats.filter((s) => s.needRevisit).length
  const isTechnical = currentUser.department === 'technical'
  // Regular members no longer get this at all -- only a Team Lead does.
  // Admins get it through AdminDashboard instead, not this component.
  const canMakePurchases = currentUser.isTeamLead

  // jobs here is already scoped to this member (App.jsx filters it), so
  // "assigned" just means someone else (an admin) put it there.
  const pendingJobs = useMemo(() => jobs.filter((j) => j.status !== 'Completed'), [jobs])
  const overdueJobs = useMemo(() => jobs.filter(isOverdue), [jobs])
  const todayJobs = useMemo(() => jobs.filter((j) => isInPeriod(j.createdAt, 'day')), [jobs])
  const assignedJobs = useMemo(() => jobs.filter((j) => j.assignedBy), [jobs])
  const myCustomers = useMemo(() => customers.filter((c) => c.recordedBy === currentUser.id), [customers, currentUser.id])
  const newThisMonthCustomers = useMemo(() => {
    const now = new Date()
    return myCustomers.filter((c) => {
      const d = new Date(c.createdAt)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
  }, [myCustomers])
  const [customersFilter, setCustomersFilter] = useState('all') // 'all' | 'thisMonth'
  const availableCustomers = useMemo(() => customers.filter((c) => !customerIdsWithJobs.has(c.id)), [customers, customerIdsWithJobs])

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
    else if (view === 'assigned') base = assignedJobs
    else if (view === 'raised') base = raisedJobs || []
    return base.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch = !q || [j.location, j.requestedBy, j.jobId].some((f) => (f || '').toLowerCase().includes(q))
      const matchesStatus = statusFilter === 'all' || j.status === statusFilter
      return matchesSearch && matchesStatus
    }).sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
  }, [view, jobs, pendingJobs, todayJobs, assignedJobs, raisedJobs, search, statusFilter])

  const sortedMyCustomers = useMemo(() => [...myCustomers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [myCustomers])
  // JobForm expects allMembers as a plain array (same shape admin already
  // passes from `users`) -- memberNames comes in as an id-keyed object, so
  // convert it once here rather than have JobForm handle two shapes.
  const memberList = useMemo(() => Object.entries(memberNames || {}).map(([id, m]) => ({ id, fullName: m.fullName, department: m.department })), [memberNames])

  if (printing) return <JobPrintView job={printing} filedByUser={currentUser} coTechnicianNames={(printing.coTechnicians || []).map((id) => memberNames?.[id]?.fullName).filter(Boolean)} onBack={() => setPrinting(null)} />

  const viewTitles = { all: 'All my jobs', pending: 'Pending jobs', today: "Today's jobs", assigned: 'Jobs assigned to me', raised: 'Jobs I raised', customers: 'My customers', routers: 'Retrieved routers' }

  function openNewJob() { setEditingJob(null); setShowForm(true) }

  return (
    <div className="sns-shell">
      <Header currentUser={currentUser} onLogout={onLogout} onUpdateProfile={onUpdateProfile} subtitle="Ticketing System" profileExtras={extras && extras.header} profileRequest={profileRequest} />
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
              <StatCard label="Total Jobs" value={stats.periodCount} icon={Clipboard} onClick={() => setView('all')} />
              <StatCard label="Transport" value={formatKSh(stats.periodTransport)} icon={Wallet} masked tone="warning" />
              <StatCard label="Completed" value={stats.periodCompleted} icon={CheckCircle2} tone="success" onClick={() => { setView('all'); setStatusFilter('Completed') }} />
              <StatCard label="Pending" value={stats.pending} icon={Clock} onClick={() => setView('pending')} />
              <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} tone="danger" onClick={() => setView('pending')} />
            </div>

            <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>Quick actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NavCard icon={Plus} label="File a new job" description="Log a new job card" onClick={openNewJob} />
              <NavCard icon={Clipboard} label="All my jobs" description={`${jobs.length} total`} onClick={() => setView('all')} />
              <NavCard icon={Clock} label="Pending jobs" description={`${pendingJobs.length} waiting`} onClick={() => setView('pending')} badge={stats.overdue} />
              <NavCard icon={Calendar} label="Jobs today" description={`${todayJobs.length} filed today`} onClick={() => setView('today')} />
              <NavCard icon={ClipboardCheck} label="Assigned to me" description={`${assignedJobs.length} from admin`} onClick={() => setView('assigned')} />
              <NavCard icon={Send} label="Jobs I raised" description={`${(raisedJobs || []).length} handed off — updates automatically`} onClick={() => setView('raised')} />
              <NavCard icon={UserPlus} label="Record new customer" description={COMMISSION_DEPARTMENTS.includes(currentUser.department) ? `Earn KSh ${commissionRate} commission` : 'Log a lead for follow-up'} onClick={() => setShowCustomerForm(true)} />
              {isSales && (
                <NavCard icon={Users} label="My customers" description={`${myCustomers.length} recorded`} onClick={() => setView('customers')} />
              )}
              {isSales && (
                <NavCard icon={MapPin} label="Field visits" description={`${(visits || []).filter((v) => v.visitedBy === currentUser.id).length} visits recorded · where to go next`} onClick={() => setView('visits')} badge={revisitCount} />
              )}
              {isTechnical && (
                <NavCard icon={RouterIcon} label="Retrieved routers" description={`${routerApi.rows.length} recorded`} onClick={() => setView('routers')} />
              )}
              <NavCard icon={Plane} label="My leave" description={leaveSummary ? `${leaveSummary.remaining} days left` : 'Apply for leave'} onClick={() => setProfileRequest({ tab: 'leave', n: Date.now() })} />
              {canMakePurchases && (
                <>
                  <NavCard icon={Receipt} label="Submit a purchase" description="Upload a receipt" onClick={() => setShowExpenseForm(true)} />
                  <NavCard icon={Receipt} label="My Expenses/Purchases" description={`${(expenses || []).length} submitted`} onClick={() => setView('expenses')} />
                </>
              )}
            </div>
          </>
        ) : view === 'customers' ? (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <button onClick={() => setView('home')} className="sns-btn-secondary" style={{ padding: '0.5rem' }} title="Back to dashboard"><ArrowLeft size={16} /></button>
              <h2 className="sns-display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>My customers</h2>
            </div>
            <div className="grid grid-cols-3 gap-3" style={{ marginBottom: '1rem', maxWidth: '30rem' }}>
              <StatCard label="Customers recorded" value={myCustomers.length} icon={Users} />
              <StatCard label="New this month" value={newThisMonthCustomers.length} icon={UserPlus} tone="success" />
              <StatCard label="Commission earned" value={formatKSh(myCustomers.filter((c) => !c.commissionExempt).length * commissionRate)} icon={Wallet} tone="success" />
            </div>
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div className="flex gap-2">
                <button onClick={() => setCustomersFilter('all')} className={customersFilter === 'all' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.8rem', padding: '0.5rem 0.9rem' }}>All</button>
                <button onClick={() => setCustomersFilter('thisMonth')} className={customersFilter === 'thisMonth' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.8rem', padding: '0.5rem 0.9rem' }}>New this month</button>
              </div>
              <button onClick={() => setShowCustomerForm(true)} className="sns-btn-primary"><UserPlus size={17} /> Record new customer</button>
            </div>
            {(customersFilter === 'thisMonth' ? newThisMonthCustomers : sortedMyCustomers).length === 0 ? (
              <EmptyState message={customersFilter === 'thisMonth' ? 'No new customers recorded this month yet.' : 'No customers recorded yet.'} />
            ) : (
              <div className="sns-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th>No.</th><th>Name</th><th>Contact</th><th>Location</th><th>Package installed</th><th>Recorded</th><th>Commission</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                    </thead>
                    <tbody>
                      {(customersFilter === 'thisMonth' ? newThisMonthCustomers : sortedMyCustomers).map((c, idx) => (
                        <tr key={c.id}>
                          <td className="sns-mono sns-text-faint">{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{c.fullName}</td>
                          <td className="sns-text-soft">{c.contact}</td>
                          <td className="sns-text-soft">{c.location}</td>
                          <td className="sns-text-soft">{c.interestedPackage || '—'}</td>
                          <td className="sns-text-soft">{formatDate(c.createdAt)}</td>
                          <td>
                            {c.commissionExempt ? (
                              <span className="sns-text-faint" title="Imported customers do not earn commission">Imported</span>
                            ) : c.commissionPaidAt ? (
                              <span className="sns-badge sns-badge-done">Paid</span>
                            ) : (
                              <span className="sns-badge" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)' }}>Unpaid</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setEditingCustomer(c); setShowCustomerForm(true) }} title="Edit" className="sns-icon-btn"><Pencil size={15} /></button>
                              <button onClick={() => setConfirmDeleteCustomer(c)} title="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : view === 'visits' ? (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <button onClick={() => setView('home')} className="sns-btn-secondary" style={{ padding: '0.5rem' }} title="Back to dashboard"><ArrowLeft size={16} /></button>
              <h2 className="sns-display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Field visits</h2>
            </div>
            <FieldVisits places={places || []} visits={visits || []} customers={customers} nameOf={(id) => (id === currentUser.id ? currentUser.fullName : (memberNames && memberNames[id] && memberNames[id].fullName) || '')} currentUser={currentUser} isAdmin={false} onAddPlace={onAddPlace} onRecordVisit={onRecordVisit} onDeleteVisit={onDeleteVisit} onSetPlaceActive={() => {}} />
          </>
        ) : view === 'routers' ? (
          <>
            <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
              <button onClick={() => setView('home')} className="sns-btn-secondary" style={{ padding: '0.5rem' }} title="Back to dashboard"><ArrowLeft size={16} /></button>
              <h2 className="sns-display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Retrieved routers</h2>
            </div>
            <RetrievedRouters rows={routerApi.rows} customers={customers} members={[currentUser]} userMap={{ [currentUser.id]: currentUser }} isAdmin={false} currentUser={currentUser} onAdd={routerApi.onAdd} onUpdate={routerApi.onUpdate} onSetStatus={routerApi.onSetStatus} onDelete={routerApi.onDelete} />
          </>
        ) : view === 'expenses' ? (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="flex items-center gap-3">
                <button onClick={() => setView('home')} className="sns-btn-secondary" style={{ padding: '0.5rem' }} title="Back to dashboard"><ArrowLeft size={16} /></button>
                <h2 className="sns-display" style={{ fontSize: '1.1rem', fontWeight: 700 }}>My Expenses/Purchases</h2>
              </div>
              <button onClick={() => setShowExpenseForm(true)} className="sns-btn-primary"><Receipt size={17} /> Submit a purchase</button>
            </div>
            <ExpensesList
              expenses={expenses || []}
              currentUserId={currentUser.id}
              onAttachReceipt={onAttachReceipt}
              onDelete={onDeleteExpense}
              onViewReceipt={onViewReceipt}
            />
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
            {view === 'assigned' && filtered.length === 0 ? (
              <EmptyState message="No jobs have been assigned to you yet." />
            ) : view === 'raised' && filtered.length === 0 ? (
              <EmptyState message="Nothing you've raised has been handed off to someone else yet." />
            ) : (
              <JobsTable
                jobs={filtered}
                onView={(j) => setPrinting(j)}
                onEdit={view === 'raised' ? undefined : (j) => { setEditingJob(j); setShowForm(true) }}
                onDelete={view === 'raised' ? undefined : (j) => setConfirmDelete(j)}
                restrictEditing
              />
            )}
          </>
        )}
      </main>
      {showForm && (
        <JobFormModal
          initialJob={editingJob}
          availableCustomers={availableCustomers}
          allCustomers={customers}
          allMembers={memberList}
          currentUserId={currentUser.id}
          filerDepartment={currentUser.department}
          onClose={() => { setShowForm(false); setEditingJob(null) }}
          onSave={async (data) => {
            if (editingJob) await onUpdateJob(editingJob.id, data)
            else await onAddJob(data)
            setShowForm(false); setEditingJob(null)
          }}
        />
      )}
      {showCustomerForm && (
        <CustomerFormModal
          initialCustomer={editingCustomer}
          onClose={() => { setShowCustomerForm(false); setEditingCustomer(null) }}
          onSave={async (data) => {
            if (editingCustomer) await onUpdateCustomer(editingCustomer.id, data)
            else await onAddCustomer(data)
            setShowCustomerForm(false); setEditingCustomer(null)
          }}
        />
      )}
      {showExpenseForm && (
        <ExpenseFormModal
          onClose={() => setShowExpenseForm(false)}
          onSave={async (data) => { await onAddExpense(data); setShowExpenseForm(false) }}
        />
      )}
      {confirmDeleteCustomer && (
        <ConfirmDialog
          title="Delete customer"
          message={`Are you sure you want to delete ${confirmDeleteCustomer.fullName}? This cannot be undone.`}
          danger
          onCancel={() => setConfirmDeleteCustomer(null)}
          onConfirm={async () => { await onDeleteCustomer(confirmDeleteCustomer.id); setConfirmDeleteCustomer(null) }}
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
