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
