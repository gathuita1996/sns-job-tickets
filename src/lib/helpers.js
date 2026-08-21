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

// Logistics cap: KSh 60 each way, 120 KSh round trip maximum per job.
export const MAX_TRANSPORT = 120

export const DEPARTMENTS = [
  { key: 'sales', label: 'Sales & Marketing' },
  { key: 'technical', label: 'Technical' },
  { key: 'admin', label: 'Admin' },
]

export function departmentLabel(key) {
  return (DEPARTMENTS.find((d) => d.key === key) || {}).label || key || '—'
}

// Real product names from the marketing site -- kept as a plain list here
// rather than importing across the two separate projects.
export const PACKAGES = ['Swahili 10 Unlimited', 'Swahili 15 Unlimited', 'Swahili 20 Unlimited', 'Not sure yet']

export const COMMISSION_PER_CUSTOMER = 500
// Departments whose members earn a commission for recording a new customer.
export const COMMISSION_DEPARTMENTS = ['sales', 'technical']

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

export function defaultCustomerForm() {
  return {
    fullName: '',
    contact: '',
    location: '',
    interestedPackage: PACKAGES[0],
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

// ---------------------------------------------------------------------------
// Navigable period system for the Overview date selector — unlike isInPeriod
// above (always "from now"), this computes a range anchored at any date, so
// the user can browse previous weeks/months/years, not just the current one.
// ---------------------------------------------------------------------------

// The [start, end) range for a given granularity, anchored at any date.
export function getPeriodRange(granularity, anchorDate) {
  const d = new Date(anchorDate)
  d.setHours(0, 0, 0, 0)
  let start, end
  if (granularity === 'week') {
    const day = d.getDay()
    const diff = day === 0 ? 6 : day - 1
    start = new Date(d)
    start.setDate(start.getDate() - diff)
    end = new Date(start)
    end.setDate(end.getDate() + 7)
  } else if (granularity === 'month') {
    start = new Date(d.getFullYear(), d.getMonth(), 1)
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  } else if (granularity === 'year') {
    start = new Date(d.getFullYear(), 0, 1)
    end = new Date(d.getFullYear() + 1, 0, 1)
  } else {
    // day
    start = new Date(d)
    end = new Date(d)
    end.setDate(end.getDate() + 1)
  }
  return { start, end }
}

export function isInRange(iso, start, end) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t < end.getTime()
}

// Move the anchor one unit of the given granularity forward (+1) or back (-1).
export function shiftAnchor(anchorDate, granularity, direction) {
  const d = new Date(anchorDate)
  if (granularity === 'week') d.setDate(d.getDate() + direction * 7)
  else if (granularity === 'month') d.setMonth(d.getMonth() + direction)
  else if (granularity === 'year') d.setFullYear(d.getFullYear() + direction)
  else d.setDate(d.getDate() + direction)
  return d
}

// Human label for the current granularity + anchor, e.g. "Today",
// "17 – 23 Aug 2026", "August 2026", or "2026".
export function formatPeriodLabel(granularity, anchorDate) {
  const { start, end } = getPeriodRange(granularity, anchorDate)
  const endInclusive = new Date(end.getTime() - 1)
  if (granularity === 'day') {
    const today = startOfToday()
    if (start.getTime() === today.getTime()) return 'Today'
    return formatDate(start)
  }
  if (granularity === 'week') {
    const sameMonth = start.getMonth() === endInclusive.getMonth()
    const startStr = start.toLocaleDateString('en-KE', { day: 'numeric', month: sameMonth ? undefined : 'short' })
    const endStr = endInclusive.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${startStr} – ${endStr}`
  }
  if (granularity === 'month') {
    return start.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
  }
  return String(start.getFullYear())
}

// 'YYYY-MM-DD' for use as an <input type="date"> value.
export function toDateInputValue(date) {
  const d = new Date(date)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
