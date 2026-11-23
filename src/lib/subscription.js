// Is a customer "Active" or "Inactive"?  Worked out from the receipts that have been sent, never typed in by hand.
//
//   * A customer's internet subscription is ON once a receipt has been sent to them.
//   * It runs for 30 days from the moment of the payment on that receipt (not from the day the receipt was sent).
//   * When the 30 days are over it is OFF again and the customer is Inactive until the next receipt is sent.
//   * A customer who has never been sent a receipt is Inactive.
// If someone pays again before their 30 days are over, the new 30 days start from the new payment, as the note
// on the receipt says. (Paying for more than one month at once is not handled yet.)
//
// Everything here works from the receipt rows alone, so the answer is always up to date and no scheduled job has to
// switch anyone on or off.
import { DAY_MS, EAT_OFFSET_MS, formatEatDate, formatEatDateTimeComma, formatEatTime } from './eat.js'

export const SUBSCRIPTION_DAYS = 30
export const ENDING_SOON_DAYS = 3

const ms = (d) => new Date(d).getTime()

// Whole days since 1 Jan 1970 on Kenya's calendar. "Days left" and "days ago" are counted with this, so the number always
// agrees with the dates printed next to it (from 23 Nov to 21 Dec is 28 days, whatever the time of day).
const eatDay = (d) => Math.floor((ms(d) + EAT_OFFSET_MS) / DAY_MS)

// When a subscription that started at `paidAt` ends.
export function subscriptionEnd(paidAt, days = SUBSCRIPTION_DAYS) {
  return new Date(ms(paidAt) + days * DAY_MS)
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
//   { active, validUntil, paidAt, receipt, daysLeft, endingSoon }   for someone who has been sent a receipt
//        (daysLeft = days from today to the day it ends on the Kenya calendar; 0 means it ends today)
//   { active: false, never: true }                                  for someone who has not
export function subscriptionOf(customerReceipts, now = new Date()) {
  const list = customerReceipts || []
  if (list.length === 0) return { active: false, never: true, validUntil: null, paidAt: null, receipt: null, daysLeft: 0, endingSoon: false }
  // the receipt that keeps them paid up the longest decides
  const best = list.reduce((a, b) => (ms(b.validUntil) > ms(a.validUntil) ? b : a))
  const left = ms(best.validUntil) - ms(now)
  const active = left > 0
  const daysLeft = active ? eatDay(best.validUntil) - eatDay(now) : 0
  return { active, never: false, validUntil: new Date(best.validUntil), paidAt: new Date(best.paidAt), receipt: best, daysLeft, endingSoon: active && daysLeft <= ENDING_SOON_DAYS }
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

// The short words shown next to the badge, e.g. "Until 21 Dec 2026 · 28 days left", "Ends today at 05:50 PM" or
// "Ended 3 days ago (20 Nov 2026)". Days are counted on the Kenya calendar (see eatDay).
export function describeSubscription(sub, now = new Date()) {
  if (sub.never) return 'No receipt sent yet'
  if (sub.active) {
    if (sub.daysLeft <= 0) return `Ends today at ${formatEatTime(sub.validUntil)}`
    return `Until ${formatEatDate(sub.validUntil)} · ${plural(sub.daysLeft, 'day')} left`
  }
  const ago = eatDay(now) - eatDay(sub.validUntil)
  return `Ended ${ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`} (${formatEatDate(sub.validUntil)})`
}

// The exact moment it ends, for a tooltip or a full sentence: "21 Dec 2026, 05:50 PM".
export function endMoment(sub) {
  return sub.validUntil ? formatEatDateTimeComma(sub.validUntil) : ''
}
