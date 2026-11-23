// The few words and numbers of a receipt that the rest of the app needs without drawing the receipt: the amount as it is
// written, the file name, and the sentences about how long the subscription runs and when it expires. Kept apart from the
// drawing code (receiptLayout.js) so that the screens that only need these do not load the PDF writer.
import { SUBSCRIPTION_DAYS } from './subscription.js'
import { formatDayKey } from './eat.js'

// 2000 -> "Ksh 2,000.00"
export function formatReceiptMoney(amount) {
  const [whole, cents] = Number(amount || 0).toFixed(2).split('.')
  return `Ksh ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

// "SNS/26/1008" -> "Receipt-SNS-26-1008.pdf"
export function receiptFileName(receiptNo) {
  return `Receipt-${String(receiptNo || 'receipt').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'receipt'}.pdf`
}

// The note printed under the tables, in two lines:
//   "Your internet subscription is valid for 30 days."
//   "It expires on 21 Dec 2026."
// (`days` is what the payment buys; the date is the real end, which can be later when the customer paid before the
// earlier days ran out.)
export function subscriptionNote(days = SUBSCRIPTION_DAYS) {
  return `Your internet subscription is valid for ${days} ${days === 1 ? 'day' : 'days'}.`
}

// "2026-12-21" -> "It expires on 21 Dec 2026."  ("" when there is no date)
export function expiryNote(expiresOn) {
  const date = formatDayKey(expiresOn)
  return date ? `It expires on ${date}.` : ''
}

// Both in one sentence, as sent on WhatsApp: "Your internet subscription is valid for 30 days and expires on 21 Dec 2026."
export function subscriptionSentence(days = SUBSCRIPTION_DAYS, expiresOn) {
  const date = formatDayKey(expiresOn)
  return date ? `Your internet subscription is valid for ${days} ${days === 1 ? 'day' : 'days'} and expires on ${date}.` : subscriptionNote(days)
}
