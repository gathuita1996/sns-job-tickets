// The WhatsApp message that carries a receipt when it is sent through the WhatsApp Business API. Plain logic, shared by the
// server (which sends it) and the screens (which show it and the setup instructions), so the two can never drift apart.
//
// WhatsApp only lets a business start a conversation with an approved TEMPLATE: fixed wording with numbered blanks
// ({{1}}, {{2}} ...) that are filled in for every message, and a PDF attached in the header. The template below has to be
// created once in Meta's WhatsApp Manager exactly as written here (see WHATSAPP-SETUP.md); once Meta approves it, every
// receipt is sent with it automatically.
import { SUBSCRIPTION_DAYS } from './subscription.js'
import { formatDayKey, formatEatDate, formatEatTime } from './eat.js'
import { formatReceiptMoney, receiptFileName } from './receiptText.js'

export const RECEIPT_TEMPLATE = {
  name: 'sns_payment_receipt',
  language: 'en',
  category: 'UTILITY',
  header: 'DOCUMENT',                       // the receipt PDF
  body: [
    'Hello {{1}}, thank you for your payment of {{2}} (M-Pesa ref {{3}}), received on {{4}}.',
    '',
    `Your receipt, invoice no. {{5}}, is attached. Your internet subscription is valid for ${SUBSCRIPTION_DAYS} days and expires on {{6}}.`,
    '',
    'Thank you.',
  ].join('\n'),
  footer: 'Swahili Net Solution',
  // what the blanks look like, for the approval form (Meta asks for an example of each)
  samples: ['Amina', 'Ksh 2,000.00', 'UKL41383DB', '21 Nov 2026 at 05:50 PM', 'SNS/26/1008', '21 Dec 2026'],
  // what each blank is, in order
  fields: ['the customer\'s first name', 'the amount paid', 'the M-Pesa code', 'the date and time of the payment', 'the invoice number', 'the date the subscription expires'],
  sampleDocument: 'Receipt-SNS-26-1008.pdf',
}

// A value that goes into a blank. WhatsApp refuses a blank that is empty or holds a line break, a tab or a run of spaces.
export function cleanParam(value, { fallback = '-', max = 120 } = {}) {
  const text = String(value == null ? '' : value).replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return (text.length > max ? text.slice(0, max).trim() : text) || fallback
}

// The values for the six blanks of the receipt template, in order.
export function templateParams({ firstName, amount, code, paidAt, receiptNo, expiresOn }) {
  return [
    cleanParam(firstName, { fallback: 'there', max: 60 }),
    formatReceiptMoney(amount),
    cleanParam(code, { max: 30 }),
    `${formatEatDate(paidAt)} at ${formatEatTime(paidAt)}`,
    cleanParam(receiptNo, { max: 40 }),
    cleanParam(formatDayKey(expiresOn), { max: 30 }),
  ]
}

// The blanks of a template body, as a sorted list of their numbers: "Hi {{1}} {{2}}" -> [1, 2]
export function blankNumbers(body) {
  return [...new Set([...String(body).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b)
}

// The words of the message with the blanks filled in (what the customer reads, apart from the PDF and the footer).
export function renderTemplate(params, body = RECEIPT_TEMPLATE.body) {
  return String(body).replace(/\{\{(\d+)\}\}/g, (all, n) => (params[Number(n) - 1] != null ? params[Number(n) - 1] : all))
}

// The request WhatsApp's API wants for sending the template with the receipt attached (mediaId: the uploaded PDF).
export function templatePayload({ to, mediaId, receiptNo, params, name = RECEIPT_TEMPLATE.name, language = RECEIPT_TEMPLATE.language }) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: language },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: receiptFileName(receiptNo) } }] },
        { type: 'body', parameters: params.map((text) => ({ type: 'text', text })) },
      ],
    },
  }
}
