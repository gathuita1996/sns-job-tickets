// The few words and numbers of a receipt that the rest of the app needs without drawing the receipt: the amount as it is
// written, the file name, and the sentence about how long the subscription runs. Kept apart from the drawing code
// (receiptLayout.js) so that the screens that only need these do not load the PDF writer.
import { SUBSCRIPTION_DAYS } from './subscription.js'

// 2000 -> "Ksh 2,000.00"
export function formatReceiptMoney(amount) {
  const [whole, cents] = Number(amount || 0).toFixed(2).split('.')
  return `Ksh ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`
}

// "11/1007" -> "Receipt-11-1007.pdf"
export function receiptFileName(receiptNo) {
  return `Receipt-${String(receiptNo || 'receipt').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'receipt'}.pdf`
}

// The sentence printed under the tables (and sent in the WhatsApp message).
export function subscriptionNote(days = SUBSCRIPTION_DAYS) {
  return `Your internet subscription is valid for ${days} days from the date of payment.`
}
