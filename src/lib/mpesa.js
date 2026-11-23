// Reads an M-Pesa confirmation message (the SMS) and picks out what a receipt needs: the transaction code, the amount,
// and the exact date and time of the payment. Plain logic, no browser or database, so it can be tested on its own.
//
// Safaricom words these messages in several ways (money received on a Paybill or Till, money paid to one, money sent
// to a person, "KES 2,000.00" or "Ksh2,000.00", "5:50 PM" or "05:50 PM", a two or four digit year ...). Rather than
// match one fixed sentence, each fact is looked for on its own, so the different wordings all work.
import { eatToDate, formatEatDateTimeComma } from './eat.js'

export const MAX_AMOUNT = 10000000
const FUTURE_SLACK_MS = 10 * 60 * 1000          // a phone clock can be a few minutes ahead

const fail = (error) => ({ ok: false, error })

function findCode(msg) {
  const confirmed = new Set()
  for (const m of msg.matchAll(/\b([A-Z0-9]{10})\s*Confirmed\b/gi)) confirmed.add(m[1].toUpperCase())
  if (confirmed.size > 1) return { error: 'That looks like more than one message. Paste just the one message for this payment.' }
  if (confirmed.size === 1) return { code: [...confirmed][0] }
  // a message that was forwarded or trimmed: any 10-character code in capitals that has both letters and digits in it
  const loose = new Set(msg.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{10}\b/g) || [])
  if (loose.size > 1) return { error: 'That looks like more than one message. Paste just the one message for this payment.' }
  if (loose.size === 1) return { code: [...loose][0] }
  return { error: "I couldn't find the M-Pesa transaction code (for example UKL41383DB). Paste the whole message exactly as M-Pesa sent it." }
}

function findAmount(msg) {
  const m = /\b(?:KES|KSHS?)\.?\s*(\d[\d,]*(?:\.\d{1,2})?)/i.exec(msg)
  if (!m) return { error: "I couldn't find the amount in that message. Paste the whole message exactly as M-Pesa sent it." }
  const amount = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'The amount in that message is not a valid payment.' }
  if (amount > MAX_AMOUNT) return { error: 'The amount in that message is too large to be right. Please check it.' }
  return { amount: Math.round(amount * 100) / 100 }
}

function findDate(msg) {
  const m = /\b(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4}|\d{2})\b/.exec(msg)
  if (!m) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return { d: Number(m[1]), mo: Number(m[2]), y: year }
}

function findTime(msg) {
  // "at 5:50 PM" first, then any "5:50 PM", then a 24-hour "17:50"
  const withMeridiem = /\bat\s+(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp])\.?\s*[Mm]\b/.exec(msg) || /\b(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp])\.?\s*[Mm]\b/.exec(msg)
  if (withMeridiem) {
    let h = Number(withMeridiem[1]); const mi = Number(withMeridiem[2]); const pm = withMeridiem[3].toLowerCase() === 'p'
    if (h < 1 || h > 12) return { bad: true }
    h = (h % 12) + (pm ? 12 : 0)
    return { h, mi }
  }
  const h24 = /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/.exec(msg)
  if (h24) return { h: Number(h24[1]), mi: Number(h24[2]) }
  return null
}

// Who paid, when the message says: the words after "received ... from", leaving out phone numbers.
function findPayer(msg) {
  const r = msg.search(/\breceived\b/i)
  if (r < 0) return ''
  const f = msg.slice(r).search(/\bfrom\b/i)
  if (f < 0) return ''
  const tokens = msg.slice(r + f + 4).trim().split(/\s+/)
  const STOP = new Set(['for', 'on', 'at', 'account', 'acc', 'new', 'transaction', 'via', 'to', 'mpesa', 'm-pesa', 'balance'])
  const name = []
  for (const tok of tokens) {
    const bare = tok.replace(/[.,;:]+$/, '')
    if (!bare) break
    if (STOP.has(bare.toLowerCase())) break
    if (/^\+?[\d*]{6,}$/.test(bare)) { if (/[.]$/.test(tok)) break; continue }          // a phone number: not part of the name
    if (!/^[A-Za-z][A-Za-z'’.-]*$/.test(bare)) break
    name.push(bare)
    if (/[.]$/.test(tok) || name.length >= 6) break
  }
  return name.join(' ')
}

// The account number the payer typed, when the message has one ("for account 899118", "Account Number 899118").
function findAccount(msg) {
  for (const m of msg.matchAll(/\baccount(?:\s+(?:number|no\.?))?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-_.]*)/gi)) {
    const v = m[1].replace(/[.\-_]+$/, '')
    if (/\d/.test(v) && v.toLowerCase() !== 'balance') return v
  }
  return ''
}

// Returns { ok: true, payment } or { ok: false, error } where `error` is a sentence for the person using the screen.
//   payment = { code, amount, paidAt (a Date: the exact moment, from the message), payerName, account, message }
export function parseMpesaMessage(text, { now = new Date() } = {}) {
  const msg = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  if (!msg) return fail('Paste the M-Pesa message first.')
  if (/\b(reversed|reversal|failed)\b/i.test(msg)) return fail('That message says the transaction was reversed or failed, so there is no payment to give a receipt for.')

  const c = findCode(msg); if (c.error) return fail(c.error)
  const a = findAmount(msg); if (a.error) return fail(a.error)

  const date = findDate(msg)
  if (!date) return fail("I couldn't find the payment date in that message. Paste the whole message exactly as M-Pesa sent it.")
  const time = findTime(msg)
  if (!time || time.bad) return fail("I couldn't find the payment time in that message. Paste the whole message exactly as M-Pesa sent it.")
  const paidAt = eatToDate(date.y, date.mo, date.d, time.h, time.mi)
  if (!paidAt) return fail('The date in that message is not a real date. Please check it.')
  if (paidAt.getTime() > new Date(now).getTime() + FUTURE_SLACK_MS) return fail(`The date and time in that message (${formatEatDateTimeComma(paidAt)}) are in the future. Please check the message.`)

  return { ok: true, payment: { code: c.code, amount: a.amount, paidAt, payerName: findPayer(msg), account: findAccount(msg), message: msg } }
}

