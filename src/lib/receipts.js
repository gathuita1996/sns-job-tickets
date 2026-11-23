// Customer receipts: everything about making one and sending it that is not on-screen. Plain logic -- the database
// client and the PDF writer are passed in or imported lazily -- so it can be tested without a browser.
import { dayNumberOfKey, eatDayNumber, eatYear2, formatEatDate, formatEatTime } from './eat.js'
import { SUBSCRIPTION_DAYS, paymentExpiryKey } from './subscription.js'
import { formatReceiptMoney, receiptFileName, subscriptionSentence } from './receiptText.js'
import { mapReceipt } from './mappers.js'

export const RECEIPT_BUCKET = 'customer-receipts'

// Invoice numbers look like SNS/26/1008: SNS, the last two digits of the year the payment was made, then a running
// number that goes up by one with every new invoice. (The receipts sent before this format, 10/1001 ... 11/1007, used
// the month in front, and their running numbers still count.) The next number carries on from the highest one used, and
// the running number goes on through the new year: SNS/26/1030 is followed by SNS/27/1031. The suggestion can always be
// changed by hand before sending.
export const RECEIPT_PREFIX = 'SNS'
export const LAST_NUMBER_USED = 1007
const NUMBER_PATTERN = /^(?:SNS\/\d{2}\/|\d{1,2}\/)(\d+)$/i

// "Amina Hassan" -- a customer's full name as it goes on a receipt
export function customerDisplayName(c) {
  const first = String(c && c.firstName != null ? c.firstName : '').trim()
  const last = String(c && c.lastName != null ? c.lastName : '').trim()
  const name = [first, last && last !== '-' ? last : ''].filter(Boolean).join(' ')
  return name || String((c && c.fullName) || '').trim() || 'Customer'
}

// The invoice number to suggest for a payment made at `paidAt`: SNS, that year, then the next number in the running count.
export function suggestReceiptNo(paidAt, receipts) {
  let top = LAST_NUMBER_USED
  for (const r of receipts || []) {
    const m = NUMBER_PATTERN.exec(String(r.receiptNo || '').trim())
    if (m) top = Math.max(top, Number(m[1]))
  }
  return `${RECEIPT_PREFIX}/${eatYear2(paidAt)}/${top + 1}`
}

// What a person typed as the invoice number -> { ok, value } or { ok: false, error }. Kept in capitals, as the database does.
export function checkReceiptNo(input) {
  const value = String(input == null ? '' : input).replace(/\s+/g, ' ').trim().toUpperCase()
  if (!value) return { ok: false, error: 'Enter the invoice number.' }
  if (value.length > 30) return { ok: false, error: 'The invoice number is too long.' }
  if (!/^[A-Za-z0-9/\-. ]+$/.test(value)) return { ok: false, error: 'Use only letters, numbers, / and - in the invoice number.' }
  return { ok: true, value }
}

// ---- who paid ------------------------------------------------------------------------------------------------------
// True when the M-Pesa name shares a name with the customer (or there is no name to compare). Someone else paying for a
// customer is fine, so a "no" is only a gentle heads-up on the screen, never a block.
export function namesAlike(customerName, payerName) {
  const words = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3)
  const payer = words(payerName)
  if (payer.length === 0) return true
  const mine = new Set(words(customerName))
  return payer.some((w) => mine.has(w))
}

// ---- the expiry date -----------------------------------------------------------------------------------------------
// The longest an expiry date may be after the payment (the database refuses anything further out).
export const MAX_EXPIRY_DAYS = 1830

// What was chosen as the expiry date (a date field gives "2026-12-21") -> { ok, value, days } or { ok: false, error }, where
// `days` is how many days after the payment day it falls.
export function checkExpiry(paidAt, input) {
  const key = String(input == null ? '' : input).trim()
  if (!key) return { ok: false, error: 'Choose the date the subscription expires.' }
  const n = dayNumberOfKey(key)
  if (n == null) return { ok: false, error: 'That is not a real date.' }
  const days = n - eatDayNumber(paidAt)
  if (days <= 0) return { ok: false, error: `The expiry date must be after the payment date (${formatEatDate(paidAt)}).` }
  if (days > MAX_EXPIRY_DAYS) return { ok: false, error: 'That date is too far away. Please check the year.' }
  return { ok: true, value: key, days }
}

// ---- the receipt and the message -----------------------------------------------------------------------------------
// What the layout needs, from a stored receipt or from a payment not yet saved. `expiresOn` is the Kenya date the
// subscription runs through ("2026-12-21"); without one it is the payment date plus the days.
export function receiptModel({ customerName, paidAt, amount, code, receiptNo, days = SUBSCRIPTION_DAYS, expiresOn }) {
  return { customerName, paidAt: new Date(paidAt), amount: Number(amount), code, receiptNo, days, expiresOn: expiresOn || paymentExpiryKey(paidAt, days) }
}
export function modelFromReceipt(r) {
  return receiptModel({ customerName: r.customerName, paidAt: r.paidAt, amount: r.amount, code: r.mpesaCode, receiptNo: r.receiptNo, days: r.daysCovered, expiresOn: r.expiresOn })
}

// The WhatsApp message that goes with the receipt: the facts in words, and the link to the PDF.
export function buildWhatsAppMessage({ firstName, amount, code, paidAt, receiptNo, days = SUBSCRIPTION_DAYS, expiresOn, link }) {
  return [
    `Hello ${String(firstName || '').trim() || 'there'},`,
    '',
    `Thank you for your payment of ${formatReceiptMoney(amount)} (M-Pesa ref ${code}), received on ${formatEatDate(paidAt)} at ${formatEatTime(paidAt)}.`,
    '',
    `Your receipt (invoice no. ${receiptNo}):`,
    link,
    '',
    subscriptionSentence(days, expiresOn || paymentExpiryKey(paidAt, days)),
    '',
    'Swahili Net Solution',
    'Fast. Reliable. Always Connected.',
  ].join('\n')
}

export function whatsappUrl(digits, message) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

// ---- saving it -------------------------------------------------------------------------------------------------------
export class ReceiptError extends Error {
  constructor(code, message) { super(message); this.name = 'ReceiptError'; this.code = code }
}

function randomToken() {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Makes the PDF for a receipt (a model from receiptModel) -> Uint8Array. The page layout, the artwork and the PDF writer
// are loaded only when a receipt is actually made, so they stay out of the main download.
export async function makeReceiptPdf(model, { createdAt = new Date(), subject = '' } = {}) {
  const [{ buildReceiptLayout }, { buildReceiptPdf }] = await Promise.all([import('./receiptLayout.js'), import('./receiptPdf.js')])
  return buildReceiptPdf(buildReceiptLayout(model), { title: `Receipt ${model.receiptNo}`, subject, createdAt })
}

// Where the PDF of a receipt will be kept, and the link that opens it. The name is long and random, so the link can be
// sent on WhatsApp (it opens for the customer without a login) but cannot be guessed. Nothing is uploaded here, so the
// message can be shown with its final link before the receipt is sent.
export function planReceiptFile(client, receiptNo) {
  const path = `${randomToken()}/${receiptFileName(receiptNo)}`
  return { path, link: client.storage.from(RECEIPT_BUCKET).getPublicUrl(path).data.publicUrl }
}

// Puts the PDF in the receipts folder at the planned path.
export async function uploadReceiptPdf(client, pdfBytes, path) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const { error } = await client.storage.from(RECEIPT_BUCKET).upload(path, blob, { contentType: 'application/pdf', cacheControl: '31536000', upsert: false })
  if (error) throw new ReceiptError('upload_failed', 'The receipt could not be uploaded, so it was not sent. Check the internet connection and try again.')
}

function explainSaveError(error) {
  const text = `${(error && error.message) || ''} ${(error && error.details) || ''}`
  if (error && (error.code === '23505' || /duplicate key/i.test(text))) {
    if (/mpesa_code/i.test(text)) return new ReceiptError('duplicate_payment', 'A receipt has already been sent for this M-Pesa payment.')
    return new ReceiptError('duplicate_number', 'That invoice number is already used. Please use a different one.')
  }
  if (error && (error.code === '42501' || /row-level security|permission denied/i.test(text))) return new ReceiptError('not_allowed', 'Only an admin can send receipts.')
  if (/future/i.test(text)) return new ReceiptError('future', 'The payment time is in the future. Please check the message.')
  if (/expiry date is too far|customer_receipts_expiry_not_far/i.test(text)) return new ReceiptError('bad_expiry', 'The expiry date is too far away. Please check it.')
  if (/expiry date must be after|customer_receipts_expiry_after_payment/i.test(text)) return new ReceiptError('bad_expiry', 'The expiry date must be after the payment date. Please check it.')
  return new ReceiptError('save_failed', 'The receipt could not be saved, so it was not sent. Please try again.')
}

// Makes the receipt for a payment, keeps a copy, and records that it was sent -- which is what switches the customer's
// subscription on. Nothing is recorded unless the PDF was made and uploaded first.
//   customer : the customer (as the app holds them)
//   payment  : the result of parseMpesaMessage (code, amount, paidAt, payerName, account, message)
//   expiresOn: the date the subscription runs through, "2026-12-21" (the payment date + days when not given)
//   file     : { path, link } from planReceiptFile (made here when not given)
// Returns { receipt (as the app holds it), link, pdf }.
export async function issueReceipt({ client, customer, payment, receiptNo, expiresOn, file, now = new Date(), days = SUBSCRIPTION_DAYS }) {
  const customerName = customerDisplayName(customer)
  const expires = expiresOn || paymentExpiryKey(payment.paidAt, days)
  const checked = checkExpiry(payment.paidAt, expires)
  if (!checked.ok) throw new ReceiptError('bad_expiry', checked.error)
  const { path, link } = file || planReceiptFile(client, receiptNo)
  const model = receiptModel({ customerName, paidAt: payment.paidAt, amount: payment.amount, code: payment.code, receiptNo, days, expiresOn: expires })
  const pdf = await makeReceiptPdf(model, { createdAt: now, subject: `Payment ${payment.code}` })
  await uploadReceiptPdf(client, pdf, path)

  const row = {
    customer_id: customer.id,
    customer_name: customerName,
    customer_contact: customer.contact || null,
    receipt_no: receiptNo,
    mpesa_code: payment.code,
    amount: payment.amount,
    paid_at: new Date(payment.paidAt).toISOString(),
    days_covered: days,
    expires_on: expires,
    payer_name: payment.payerName || null,
    account_ref: payment.account || null,
    mpesa_message: payment.message || null,
    file_path: path,
    sent_via: 'whatsapp',
  }
  const { data, error } = await client.from('customer_receipts').insert(row).select().single()
  if (error || !data) {
    try { await client.storage.from(RECEIPT_BUCKET).remove([path]) } catch { /* the copy is harmless if it cannot be removed */ }
    throw explainSaveError(error)
  }
  return { receipt: mapReceipt(data), link, pdf }
}

// The kept PDF of a receipt that was sent earlier -> { path, link } (the path is where it is kept, the link opens it). A copy
// made when it was sent is used when there is one; otherwise the PDF is made again from the receipt's own details (it is
// always the same page) and a new copy is kept.
export async function ensureReceiptFile(client, receipt) {
  if (receipt.filePath) return { path: receipt.filePath, link: client.storage.from(RECEIPT_BUCKET).getPublicUrl(receipt.filePath).data.publicUrl }
  const pdf = await makeReceiptPdf(modelFromReceipt(receipt), { createdAt: new Date(receipt.sentAt || receipt.paidAt), subject: `Payment ${receipt.mpesaCode}` })
  const file = planReceiptFile(client, receipt.receiptNo)
  await uploadReceiptPdf(client, pdf, file.path)
  return file
}

// The link to the PDF of a receipt that was sent earlier.
export async function linkForReceipt(client, receipt) {
  return (await ensureReceiptFile(client, receipt)).link
}

// The message to send again for an earlier receipt.
export function messageForReceipt(customer, receipt, link) {
  return buildWhatsAppMessage({ firstName: customer && customer.firstName, amount: receipt.amount, code: receipt.mpesaCode, paidAt: receipt.paidAt, receiptNo: receipt.receiptNo, days: receipt.daysCovered, expiresOn: receipt.expiresOn, link })
}

// Deletes a receipt, which switches that subscription off again unless another receipt still covers the customer. The
// database lets only the Director do this (anyone else matches no rows), and a receipt that was sent is never edited, so
// this is how a mistake is put right: delete it, then send the correct one. Returns { ok } or { ok: false, error }.
export async function deleteReceipt(client, receipt) {
  const { data, error } = await client.from('customer_receipts').delete().eq('id', receipt.id).select('id')
  if (error) return { ok: false, error: /row-level security|permission/i.test(error.message || '') ? 'Only the Director can delete a receipt.' : 'The receipt could not be deleted. Please try again.' }
  if (!data || data.length === 0) return { ok: false, error: 'Only the Director can delete a receipt.' }
  // the PDF copy goes too; if that fails the receipt is still gone, and a stray file nobody links to does no harm
  if (receipt.filePath) { try { await client.storage.from(RECEIPT_BUCKET).remove([receipt.filePath]) } catch { /* harmless */ } }
  return { ok: true }
}
