// Customer receipts: everything about making one and sending it that is not on-screen. Plain logic -- the database
// client and the PDF writer are passed in or imported lazily -- so it can be tested without a browser.
import { eatMonth2, formatEatDate, formatEatDateTimeComma, formatEatTime } from './eat.js'
import { SUBSCRIPTION_DAYS, subscriptionEnd } from './subscription.js'
import { formatReceiptMoney, receiptFileName, subscriptionNote } from './receiptText.js'
import { mapReceipt } from './mappers.js'

export const RECEIPT_BUCKET = 'customer-receipts'

// Invoice numbers on the receipts so far run 10/1001 ... 11/1007: the month, a slash, then a running number. The
// next one the system suggests carries on from there. (It can always be changed by hand before sending.)
export const LAST_NUMBER_USED = 1007

// "Amina Hassan" -- a customer's full name as it goes on a receipt
export function customerDisplayName(c) {
  const first = String(c && c.firstName != null ? c.firstName : '').trim()
  const last = String(c && c.lastName != null ? c.lastName : '').trim()
  const name = [first, last && last !== '-' ? last : ''].filter(Boolean).join(' ')
  return name || String((c && c.fullName) || '').trim() || 'Customer'
}

// The invoice number to suggest for a payment made at `paidAt`: that month, then the next number in the running count.
export function suggestReceiptNo(paidAt, receipts) {
  let top = LAST_NUMBER_USED
  for (const r of receipts || []) {
    const m = /^\d{1,2}\/(\d+)$/.exec(String(r.receiptNo || '').trim())
    if (m) top = Math.max(top, Number(m[1]))
  }
  return `${eatMonth2(paidAt)}/${top + 1}`
}

// What a person typed as the invoice number -> { ok, value } or { ok: false, error }
export function checkReceiptNo(input) {
  const value = String(input == null ? '' : input).replace(/\s+/g, ' ').trim()
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

// ---- the receipt and the message -----------------------------------------------------------------------------------
// What the layout needs, from a stored receipt or from a payment not yet saved.
export function receiptModel({ customerName, paidAt, amount, code, receiptNo, days = SUBSCRIPTION_DAYS }) {
  return { customerName, paidAt: new Date(paidAt), amount: Number(amount), code, receiptNo, days }
}
export function modelFromReceipt(r) {
  return receiptModel({ customerName: r.customerName, paidAt: r.paidAt, amount: r.amount, code: r.mpesaCode, receiptNo: r.receiptNo, days: r.daysCovered })
}

// The WhatsApp message that goes with the receipt: the facts in words, and the link to the PDF.
export function buildWhatsAppMessage({ firstName, amount, code, paidAt, receiptNo, days = SUBSCRIPTION_DAYS, link }) {
  const end = subscriptionEnd(paidAt, days)
  return [
    `Hello ${String(firstName || '').trim() || 'there'},`,
    '',
    `Thank you for your payment of ${formatReceiptMoney(amount)} (M-Pesa ref ${code}), received on ${formatEatDate(paidAt)} at ${formatEatTime(paidAt)}.`,
    '',
    `Your receipt (invoice no. ${receiptNo}):`,
    link,
    '',
    `${subscriptionNote(days)} Valid until ${formatEatDateTimeComma(end)}.`,
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
  return new ReceiptError('save_failed', 'The receipt could not be saved, so it was not sent. Please try again.')
}

// Makes the receipt for a payment, keeps a copy, and records that it was sent -- which is what switches the customer's
// subscription on. Nothing is recorded unless the PDF was made and uploaded first.
//   customer : the customer (as the app holds them)
//   payment  : the result of parseMpesaMessage (code, amount, paidAt, payerName, account, message)
//   file     : { path, link } from planReceiptFile (made here when not given)
// Returns { receipt (as the app holds it), link, pdf }.
export async function issueReceipt({ client, customer, payment, receiptNo, file, now = new Date(), days = SUBSCRIPTION_DAYS }) {
  const customerName = customerDisplayName(customer)
  const { path, link } = file || planReceiptFile(client, receiptNo)
  const model = receiptModel({ customerName, paidAt: payment.paidAt, amount: payment.amount, code: payment.code, receiptNo, days })
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

// The link to the PDF of a receipt that was sent earlier. A copy made when it was sent is used when there is one;
// otherwise the PDF is made again from the receipt's own details (it is always the same page) and a new copy is kept.
export async function linkForReceipt(client, receipt) {
  if (receipt.filePath) return client.storage.from(RECEIPT_BUCKET).getPublicUrl(receipt.filePath).data.publicUrl
  const pdf = await makeReceiptPdf(modelFromReceipt(receipt), { createdAt: new Date(receipt.sentAt || receipt.paidAt), subject: `Payment ${receipt.mpesaCode}` })
  const file = planReceiptFile(client, receipt.receiptNo)
  await uploadReceiptPdf(client, pdf, file.path)
  return file.link
}

// The message to send again for an earlier receipt.
export function messageForReceipt(customer, receipt, link) {
  return buildWhatsAppMessage({ firstName: customer && customer.firstName, amount: receipt.amount, code: receipt.mpesaCode, paidAt: receipt.paidAt, receiptNo: receipt.receiptNo, days: receipt.daysCovered, link })
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
