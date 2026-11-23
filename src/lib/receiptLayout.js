// What the customer receipt looks like, as a plain list of things to draw (text, lines, rectangles, pictures,
// outlines) in PDF page units: a 612 x 792 page, origin at the bottom-left, y going up.
//
// The layout copies the receipt template Swahili Net Solution already uses (logo top right, "Receipt" title, the
// Payment information table, the Invoices covered by this payment table, the faint word behind the page, and the
// footer), with one addition: the note under the tables about how long the subscription runs.
//
// The very same list is drawn two ways -- written into the PDF that is sent to the customer (receiptPdf.js) and drawn
// on screen as the preview (ReceiptPreview.jsx) -- so what you check on screen is what the customer gets.
import { HELVETICA, HELVETICA_BOLD } from './pdfMetrics.js'
import { WATERMARK_PATHS } from './receiptWatermark.js'
import { formatEatDateTime } from './eat.js'
import { SUBSCRIPTION_DAYS, paymentExpiryKey } from './subscription.js'
import { expiryNote, formatReceiptMoney, subscriptionNote } from './receiptText.js'

export { expiryNote, formatReceiptMoney, receiptFileName, subscriptionNote } from './receiptText.js'

export const PAGE = { w: 612, h: 792 }
export const METHOD = 'M-Pesa'

// The word behind the page. It is "INVOICE" on the template; change the word here by replacing receiptWatermark.js, or set this to false for a plain page.
export const SHOW_WATERMARK = true

const BLACK = [0, 0, 0]
const BLUE = [0, 0.459, 0.8]
const ORANGE = [0.922, 0.522, 0]
const RULE = [0.906, 0.918, 0.922]
const SOFT_TEXT = [0.30, 0.37, 0.45]

// The template is set in Lucida Sans, which is a little larger on the page than Helvetica at the same point size, so the
// sizes here are a touch bigger than the template's (9 / 12 / 16.56) to give the same look.
const SIZE = { body: 9.3, name: 10.2, heading: 12.4, title: 17.2 }
const WATERMARK_FILL = [0.996, 0.957, 0.925]   // the template's peach at half strength, blended with the white page

// ---- text in the standard fonts ----------------------------------------------------------------------------------
// The PDF uses the standard Helvetica fonts with WinAnsi (Windows-1252) text. Anything outside that set is shown as "?".
const CP1252_EXTRA = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f }

export function winAnsiBytes(text) {
  const out = []
  for (const ch of String(text == null ? '' : text)) {
    const cp = ch.codePointAt(0)
    let b = cp
    if (cp >= 0x20 && cp <= 0x7e) b = cp
    else if (cp >= 0xa0 && cp <= 0xff) b = cp
    else if (CP1252_EXTRA[cp] != null) b = CP1252_EXTRA[cp]
    else b = 0x3f
    out.push(b)
  }
  return out
}

export function textWidth(font, size, text) {
  const widths = font === 'bold' ? HELVETICA_BOLD : HELVETICA
  let w = 0
  for (const b of winAnsiBytes(text)) w += widths[b - 32] || 0
  return (w / 1000) * size
}

// Shortens text with "…" so that it fits in `max` page units.
export function fitText(font, size, text, max) {
  const s = String(text == null ? '' : text).trim()
  if (textWidth(font, size, s) <= max) return s
  let t = s
  while (t.length > 1 && textWidth(font, size, t + '…') > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

// ---- the page ----------------------------------------------------------------------------------------------------
// m = { customerName, paidAt (a Date), amount, code, receiptNo, days, expiresOn ("2026-12-21") }
export function buildReceiptLayout(m) {
  const days = m.days || SUBSCRIPTION_DAYS
  const items = []
  const text = (x, y, size, font, str, fill = BLACK) => items.push({ kind: 'text', x, y, size, font, fill, text: String(str) })
  const textRight = (right, y, size, font, str, fill = BLACK) => text(right - textWidth(font, size, str), y, size, font, str, fill)
  const rect = (x, y, w, h, fill) => items.push({ kind: 'rect', x, y, w, h, fill })
  const line = (x1, y1, x2, y2, stroke, width) => items.push({ kind: 'line', x1, y1, x2, y2, stroke, width })

  // the faint word behind everything
  if (SHOW_WATERMARK) for (const d of WATERMARK_PATHS) items.push({ kind: 'path', d, fill: WATERMARK_FILL, rule: 'evenodd' })

  // logo, top right
  items.push({ kind: 'image', id: 'logo', x: 447, y: 681.6, w: 129, h: 67.8 })

  // title, centred
  const title = 'Receipt'
  text(PAGE.w / 2 - textWidth('bold', SIZE.title, title) / 2, 644.5, SIZE.title, 'bold', title)

  // ---- Payment information
  text(43.2, 604.9, SIZE.heading, 'bold', 'Payment information')
  const rows = [
    ['Customer name', fitText('regular', SIZE.name, m.customerName, 270), 578.62, SIZE.name],
    ['Payment date', formatEatDateTime(m.paidAt), 565.9, SIZE.body],
    ['Amount paid', formatReceiptMoney(m.amount), 551.83, SIZE.body],
    ['Method', METHOD, 535.75, SIZE.body],
    ['Check number', fitText('regular', SIZE.body, m.code, 270), 519.91, SIZE.body],
  ]
  for (const [label, value, y, size] of rows) { text(47.64, y, SIZE.body, 'bold', label); text(291.91, y, size, 'regular', value) }
  for (const y of [574.7, 563, 547.07, 531]) line(43.2, y, 568.8, y, RULE, 0.75)

  // ---- Invoices covered by this payment
  text(43.2, 480.31, SIZE.heading, 'bold', 'Invoices covered by this payment')
  const rights = [300.12, 451.35, 565.2]
  text(48.12, 451.39, SIZE.body, 'bold', 'Invoice number')
  ;['Invoice total', 'Payment amount', 'Amount due'].forEach((h, i) => textRight(rights[i], 451.39, SIZE.body, 'bold', h))
  rect(43.56, 445.87, 525.72, 0.72, RULE)
  text(48.12, 435.67, SIZE.body, 'regular', fitText('regular', SIZE.body, m.receiptNo, 180))
  textRight(rights[0], 435.67, SIZE.body, 'regular', formatReceiptMoney(m.amount))
  textRight(rights[1], 435.67, SIZE.body, 'regular', formatReceiptMoney(m.amount))
  textRight(rights[2], 435.67, SIZE.body, 'regular', formatReceiptMoney(0))

  // ---- the note about how long the subscription runs
  rect(43.2, 366, 3, 46, BLUE)
  text(53, 402, 7.5, 'bold', 'NOTE', BLUE)
  text(53, 388, 10, 'bold', subscriptionNote(days))
  text(53, 373.5, 9, 'regular', expiryNote(m.expiresOn || paymentExpiryKey(m.paidAt, days)), SOFT_TEXT)

  // ---- footer
  rect(34.56, 108.26, 543, 0.96, BLUE)
  rect(421.54, 105.26, 156.02, 3, ORANGE)
  const a = 'Fast. Reliable. ', b = 'Always Connected.'
  const gw = textWidth('bold', 12, a + b), gap = 8.5, iconW = 22.5
  const gx = PAGE.w / 2 - (iconW + gap + gw) / 2
  items.push({ kind: 'image', id: 'globe', x: gx, y: 61.91, w: iconW, h: 25.5 })
  text(gx + iconW + gap, 69.96, 12, 'bold', a, BLUE)
  text(gx + iconW + gap + textWidth('bold', 12, a), 69.96, 12, 'bold', b, ORANGE)

  return items
}
