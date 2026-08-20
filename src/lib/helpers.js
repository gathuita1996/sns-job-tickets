export const JOB_TYPES = [
  'New Installation',
  'Network Troubleshooting',
  'Router / Equipment Repair',
  'Routine Maintenance',
  'Fibre / Cable Repair',
  'Equipment Upgrade',
  'Site Survey',
  'Other',
]

export const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed']

export const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

export const LOCATIONS = [
  'Darad', 'Nuru plaza', 'Babla', 'Dola', 'Dodoma', 'Darling', 'Posta',
  'Markas', 'Kona Beach', 'Tsunami', 'Msikti Nuru', 'Diamond', 'Pepsi',
  'Kona Musa', 'Mandingo', 'Ibiza', 'Kona Chief', 'Millennium',
  'Last Moran', 'Kona Tamu', 'Ratinga',
]

export const CHART_COLORS = ['#1A4C93', '#F0781E', '#1DA851', '#4C5F72', '#123870', '#8494A3', '#C0392B', '#E1E7F0']

// A job becomes "overdue" once it has sat in Pending for more than this long
// without being acted on.
export const OVERDUE_HOURS = 24

export function formatDate(isoOrDate) {
  if (!isoOrDate) return '—'
  return new Date(isoOrDate).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatKSh(amount) {
  const n = Number(amount) || 0
  return `KSh ${n.toLocaleString('en-KE')}`
}

export function defaultJobForm() {
  return {
    jobType: '',
    jobTypeOther: '',
    location: '',
    requestedBy: '',
    requesterContact: '',
    visitDate: new Date().toISOString().slice(0, 10),
    transportAmount: '',
    status: '',
    priority: 'Normal',
    notes: '',
  }
}

// Hours elapsed since a job was filed.
export function hoursSince(iso) {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

// A job is overdue when it's still Pending, more than OVERDUE_HOURS old, and
// nobody has yet recorded a reason for the delay. Once a reason is recorded
// (see JobForm's "why was this overdue" field), it's considered acknowledged
// even if still technically Pending for a moment longer while being resolved.
export function isOverdue(job) {
  return job.status === 'Pending' && !job.overdueReason && hoursSince(job.createdAt) > OVERDUE_HOURS
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek() {
  const d = startOfToday()
  const day = d.getDay() // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1 // days since Monday
  d.setDate(d.getDate() - diff)
  return d
}

function startOfMonth() {
  const d = startOfToday()
  d.setDate(1)
  return d
}

function startOfYear() {
  const d = startOfToday()
  d.setMonth(0, 1)
  return d
}

export const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

// Does this ISO timestamp fall within the given period ('day'|'week'|'month'|'year'), counting from now?
export function isInPeriod(iso, period) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  const starts = { day: startOfToday, week: startOfWeek, month: startOfMonth, year: startOfYear }
  const start = (starts[period] || startOfToday)()
  return t >= start.getTime()
}

export function isToday(iso) {
  return isInPeriod(iso, 'day')
}
