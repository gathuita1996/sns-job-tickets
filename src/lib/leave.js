// Leave: labels and small pure helpers. The rules themselves (balance, monthly cap, who may approve)
// live in the database, so they hold even if someone bypasses the app.
export const LEAVE_STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }
export const LEAVE_STATUS_BADGE = { pending: 'sns-badge-pending', approved: 'sns-badge-done', rejected: 'sns-badge-overdue', cancelled: 'sns-badge-role' }

const pad = (n) => String(n).padStart(2, '0')
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// A leave year is named after the year it starts in: 2026 = Aug 2026 to Jul 2027.
export function currentLeaveYear(startMonth = 8, now = new Date()) { return now.getMonth() + 1 >= startMonth ? now.getFullYear() : now.getFullYear() - 1 }
export function leaveYearLabel(year, startMonth = 8) {
  const first = new Date(year, startMonth - 1, 1), last = new Date(year + 1, startMonth - 1, 0)
  const f = (d) => d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })
  return `${f(first)} – ${f(last)}`
}
export const dayCount = (n) => `${n} day${Number(n) === 1 ? '' : 's'}`

export function formatLeaveRange(start, end) {
  const s = parse(start), e = parse(end)
  if (start === end) return s.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const left = s.toLocaleDateString('en-KE', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${left} – ${e.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function onLeaveOn(requests, dateStr) { return requests.filter((r) => r.status === 'approved' && r.startDate <= dateStr && dateStr <= r.endDate) }
export function awayNowIds(requests, today = isoDate(new Date())) { return new Set(onLeaveOn(requests, today).map((r) => r.memberId)) }
export function upcomingLeave(requests, today = isoDate(new Date()), withinDays = 45) {
  const limit = isoDate(addDays(parse(today), withinDays))
  return requests.filter((r) => r.status === 'approved' && r.endDate >= today && r.startDate <= limit).sort((a, b) => a.startDate.localeCompare(b.startDate))
}
// Mirrors the database: a member may cancel pending leave, or approved leave that has not started; the Director may cancel either.
export function canCancel(request, userId, isDirector, today = isoDate(new Date())) {
  if (request.status === 'pending') return request.memberId === userId || Boolean(isDirector)
  if (request.status === 'approved') return Boolean(isDirector) || (request.memberId === userId && request.startDate > today)
  return false
}

// ---- Kenyan public holidays, for the Director to add in one click ---------------------------------------------
export function easterSunday(year) {                       // the standard Gregorian calculation
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}
export function kenyanHolidays(year) {
  const list = [[0, 1, "New Year's Day"], [4, 1, 'Labour Day'], [5, 1, 'Madaraka Day'], [9, 10, 'Utamaduni Day'], [9, 20, 'Mashujaa Day'], [11, 12, 'Jamhuri Day'], [11, 25, 'Christmas Day'], [11, 26, 'Boxing Day']]
    .map(([m, d, name]) => ({ day: isoDate(new Date(year, m, d)), name }))
  const easter = easterSunday(year)
  list.push({ day: isoDate(addDays(easter, -2)), name: 'Good Friday' }, { day: isoDate(addDays(easter, 1)), name: 'Easter Monday' })
  // a holiday that falls on a Sunday moves to the Monday, unless that Monday is already a holiday
  const taken = new Set(list.map((h) => h.day)), moved = []
  for (const h of list) {
    const d = parse(h.day)
    if (d.getDay() === 0) { const mon = isoDate(addDays(d, 1)); if (!taken.has(mon)) { taken.add(mon); moved.push({ day: mon, name: `${h.name} (observed)` }) } }
  }
  return [...list, ...moved].sort((a, b) => a.day.localeCompare(b.day))
}
export function holidaysForLeaveYear(year, startMonth = 8) {
  const start = isoDate(new Date(year, startMonth - 1, 1)), end = isoDate(new Date(year + 1, startMonth - 1, 0))
  return [...kenyanHolidays(year), ...kenyanHolidays(year + 1)].filter((h) => h.day >= start && h.day <= end)
}
