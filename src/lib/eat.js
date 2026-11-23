// East Africa Time (Kenya) for everything that goes on a receipt. Kenya has no daylight saving, so EAT is always
// exactly UTC+3. Dates are worked out from that fixed offset rather than from the time zone of whatever device is
// looking at the screen, so a receipt always shows the time the payment was made in Kenya.

export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000
export const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n) => String(n).padStart(2, '0')

function parts(date) {
  const t = new Date(new Date(date).getTime() + EAT_OFFSET_MS)
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() }
}

// "21 Nov 2026"
export function formatEatDate(date) {
  const p = parts(date)
  return `${p.d} ${MONTHS[p.mo]} ${p.y}`
}

// "05:50 PM"
export function formatEatTime(date) {
  const p = parts(date)
  return `${two(p.h % 12 === 0 ? 12 : p.h % 12)}:${two(p.mi)} ${p.h >= 12 ? 'PM' : 'AM'}`
}

// "21 Nov 2026 05:50 PM" -- the way the payment date is written on the receipt
export function formatEatDateTime(date) {
  return `${formatEatDate(date)} ${formatEatTime(date)}`
}

// "21 Nov 2026, 05:50 PM" -- the way it reads inside a sentence
export function formatEatDateTimeComma(date) {
  return `${formatEatDate(date)}, ${formatEatTime(date)}`
}

// The month number as two digits ("11" for November), as used at the front of an invoice number such as 11/1007.
export function eatMonth2(date) {
  return two(parts(date).mo + 1)
}

// A Kenyan wall-clock time (day, month, year, hour 0-23, minute) as the real moment it is. Returns null if that
// date does not exist (31 February, month 13 ...).
export function eatToDate(y, mo, d, h, mi) {
  if (![y, mo, d, h, mi].every(Number.isInteger)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || mi < 0 || mi > 59) return null
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - EAT_OFFSET_MS)
}

// ---- Kenya calendar days ------------------------------------------------------------------------------------------
// A "day key" is a date on Kenya's calendar written the way a date field and the database write it: "2026-12-21". The
// expiry date of a subscription is a day key. A day number counts whole days since 1 Jan 1970 on that calendar.

// "2026-12-21" -> day number, or null when it is not a real date (31 February, "soon", 2026-13-01 ...)
export function dayNumberOfKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key == null ? '' : key).trim())
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return Math.round(t.getTime() / DAY_MS)
}

// day number -> "2026-12-21"
export function dayKeyOf(dayNumber) {
  const t = new Date(dayNumber * DAY_MS)
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}`
}

// the Kenya day a moment falls on, as a day number / as a day key
export function eatDayNumber(date) {
  return Math.floor((new Date(date).getTime() + EAT_OFFSET_MS) / DAY_MS)
}
export function eatDateKey(date) {
  return dayKeyOf(eatDayNumber(date))
}

// "2026-12-21" -> "21 Dec 2026" ("" when it is not a date)
export function formatDayKey(key) {
  const n = dayNumberOfKey(key)
  if (n == null) return ''
  const t = new Date(n * DAY_MS)
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`
}

// "2026-12-21" + 30 -> "2027-01-20"
export function addDaysToKey(key, days) {
  const n = dayNumberOfKey(key)
  return n == null ? null : dayKeyOf(n + days)
}

// The moment a subscription that runs through the day `key` ends: midnight at the end of that day, Kenya time. This is
// what the database stores as valid_until.
export function endOfDayKey(key) {
  const n = dayNumberOfKey(key)
  return n == null ? null : new Date((n + 1) * DAY_MS - EAT_OFFSET_MS)
}

// The last two digits of the year in Kenya ("26" for 2026), as used in an invoice number such as SNS/26/1008.
export function eatYear2(date) {
  return two(parts(date).y % 100)
}

