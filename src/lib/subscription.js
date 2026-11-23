// Is a customer "Active" or "Inactive"?  Worked out from the receipts that have been sent, never typed in by hand.
//
//   * A customer's internet subscription is ON once a receipt has been sent to them.
//   * Every receipt carries an EXPIRY DATE (a day on Kenya's calendar). The subscription runs through the END of that day
//     and is OFF from the next midnight, when the customer is Inactive until the next receipt is sent.
//   * The app suggests the date: 30 days after the payment. When the customer pays again before their subscription has run
//     out, what was left is kept: the new 30 days start from the day the old subscription was due to end. The system only
//     knows about receipts sent through it, so the admin can change the date before sending (for a customer who still had
//     days left from a payment made before this system, say, or for a goodwill extension).
//   * A customer who has never been sent a receipt is Inactive.
// (Paying for more than one month at once is not handled automatically yet: the admin sets the date by hand.)
//
// Everything here works from the receipt rows alone, so the answer is always up to date and no scheduled job has to
// switch anyone on or off.
import { dayKeyOf, dayNumberOfKey, eatDateKey, eatDayNumber, formatDayKey } from './eat.js'

export const SUBSCRIPTION_DAYS = 30
export const ENDING_SOON_DAYS = 3

const ms = (d) => new Date(d).getTime()

// The Kenya date a receipt's subscription runs through, "2026-12-21": the date set on the receipt or, for a receipt that
// has none, the day before the moment it ends.
export function expiryKeyOf(receipt) {
  if (receipt && dayNumberOfKey(receipt.expiresOn) != null) return receipt.expiresOn
  const end = receipt ? ms(receipt.validUntil) : NaN
  return Number.isFinite(end) ? eatDateKey(new Date(end - 1)) : null
}

// The expiry date of a payment on its own: its Kenya date plus the days it pays for.
export function paymentExpiryKey(paidAt, days = SUBSCRIPTION_DAYS) {
  return dayKeyOf(eatDayNumber(paidAt) + days)
}

// The expiry date to suggest for a payment, given the receipts this customer already has (any order).
//   key         : the suggestion, "2026-12-21"
//   carried     : true when the customer still had days left, so the new days start from the end of those
//   previousKey : the day the earlier subscription was due to run through (null if there is none)
//   leftDays    : the days that were left on the payment day (0 when nothing carries over)
//   paymentKey  : the date without any carry-over (payment date + days)
// Only receipts for payments made BEFORE this one count, so a payment entered late is judged as it was on the day.
export function suggestExpiry({ paidAt, days = SUBSCRIPTION_DAYS, receipts = [] }) {
  const paidDay = eatDayNumber(paidAt)
  let previous = null
  for (const r of receipts || []) {
    if (!(ms(r.paidAt) < ms(paidAt))) continue
    const n = dayNumberOfKey(expiryKeyOf(r))
    if (n != null && (previous == null || n > previous)) previous = n
  }
  const carried = previous != null && previous > paidDay
  return {
    key: dayKeyOf((carried ? previous : paidDay) + days),
    carried,
    previousKey: previous == null ? null : dayKeyOf(previous),
    leftDays: carried ? previous - paidDay : 0,
    paymentKey: dayKeyOf(paidDay + days),
  }
}

// receipts -> Map(customerId -> that customer's receipts, newest payment first). Receipts with no customer are left out.
export function groupReceipts(receipts) {
  const by = new Map()
  for (const r of receipts || []) {
    if (r.customerId == null) continue
    if (!by.has(r.customerId)) by.set(r.customerId, [])
    by.get(r.customerId).push(r)
  }
  for (const list of by.values()) list.sort((a, b) => ms(b.paidAt) - ms(a.paidAt) || (b.id || 0) - (a.id || 0))
  return by
}

// One customer's subscription, from their receipts (any order).
//   { active, validUntil, expiresOn, paidAt, receipt, daysLeft, endingSoon }   for someone who has been sent a receipt
//        (expiresOn = the Kenya date it runs through; daysLeft = days from today to that date; 0 means it ends today)
//   { active: false, never: true }                                              for someone who has not
export function subscriptionOf(customerReceipts, now = new Date()) {
  const list = customerReceipts || []
  if (list.length === 0) return { active: false, never: true, validUntil: null, expiresOn: null, paidAt: null, receipt: null, daysLeft: 0, endingSoon: false }
  // the receipt that keeps them paid up the longest decides
  const best = list.reduce((a, b) => (ms(b.validUntil) > ms(a.validUntil) ? b : a))
  const active = ms(best.validUntil) - ms(now) > 0
  const expiresOn = expiryKeyOf(best)
  const daysLeft = active ? Math.max(0, dayNumberOfKey(expiresOn) - eatDayNumber(now)) : 0
  return { active, never: false, validUntil: new Date(best.validUntil), expiresOn, paidAt: new Date(best.paidAt), receipt: best, daysLeft, endingSoon: active && daysLeft <= ENDING_SOON_DAYS }
}

// Every customer's status at once: Map(customerId -> subscription). A customer with no receipts is simply not in the
// map, so use `subscriptionFor` to read one.
export function subscriptionMap(receipts, now = new Date()) {
  const out = new Map()
  for (const [id, list] of groupReceipts(receipts)) out.set(id, subscriptionOf(list, now))
  return out
}
export function subscriptionFor(map, customerId) {
  return map.get(customerId) || subscriptionOf([])
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The short words shown next to the badge, e.g. "Until 21 Dec 2026 · 28 days left", "Ends today (21 Dec 2026)" or
// "Ended 3 days ago (18 Dec 2026)". Days are counted on the Kenya calendar, so the number always agrees with the dates.
export function describeSubscription(sub, now = new Date()) {
  if (sub.never) return 'No receipt sent yet'
  const date = formatDayKey(sub.expiresOn)
  if (sub.active) {
    if (sub.daysLeft <= 0) return `Ends today (${date})`
    return `Until ${date} · ${plural(sub.daysLeft, 'day')} left`
  }
  const ago = eatDayNumber(now) - dayNumberOfKey(sub.expiresOn)
  return `Ended ${ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`} (${date})`
}

// For a tooltip: "Runs through the end of 21 Dec 2026 (Kenya time)".
export function endLabel(sub) {
  return sub.expiresOn ? `Runs through the end of ${formatDayKey(sub.expiresOn)} (Kenya time)` : ''
}
