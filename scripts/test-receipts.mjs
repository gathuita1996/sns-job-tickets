// Update 48: customer receipts, and "Active / Inactive" worked out from them.
// Plain logic only (no browser, no database): the M-Pesa message reader, Kenya time, the 30-day subscription rule, the
// WhatsApp number / message / link, invoice numbers, the PDF, saving and deleting a receipt (against a pretend database),
// and the SQL files that carry the rules to the real one.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseMpesaMessage, MAX_AMOUNT } from '../src/lib/mpesa.js'
import { eatMonth2, eatToDate, formatEatDate, formatEatDateTime, formatEatDateTimeComma, formatEatTime } from '../src/lib/eat.js'
import { ENDING_SOON_DAYS, SUBSCRIPTION_DAYS, describeSubscription, endMoment, groupReceipts, subscriptionEnd, subscriptionFor, subscriptionMap, subscriptionOf } from '../src/lib/subscription.js'
import { formatWhatsappNumber, whatsappNumber } from '../src/lib/phone.js'
import { openPendingWindow } from '../src/lib/whatsapp.js'
import { formatReceiptMoney, receiptFileName, subscriptionNote } from '../src/lib/receiptText.js'
import { LAST_NUMBER_USED, RECEIPT_BUCKET, ReceiptError, buildWhatsAppMessage, checkReceiptNo, customerDisplayName, deleteReceipt, issueReceipt, linkForReceipt, makeReceiptPdf, messageForReceipt, modelFromReceipt, namesAlike, planReceiptFile, receiptModel, suggestReceiptNo, whatsappUrl } from '../src/lib/receipts.js'
import { buildReceiptLayout } from '../src/lib/receiptLayout.js'
import { mapReceipt } from '../src/lib/mappers.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const root = fileURLToPath(new URL('../', import.meta.url))
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

const HOUR = 3600 * 1000, DAY = 24 * HOUR
const NOW = new Date('2026-11-23T08:00:00Z')                   // Monday 23 Nov 2026, 11:00 in Kenya
// the message the receipt feature was built around (21 Nov 2026, 05:50 PM Kenya time = 14:50 UTC)
const MSG = 'UKL41383DB Confirmed. KES 2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 05:50 PM.'
const PAID = '2026-11-21T14:50:00.000Z'
const parse = (text, now = NOW) => parseMpesaMessage(text, { now })
const iso = (t) => new Date(t).toISOString()
const rec = (id, customerId, paidAtIso, days = 30) => ({ id, customerId, paidAt: paidAtIso, validUntil: new Date(Date.parse(paidAtIso) + days * DAY).toISOString(), daysCovered: days })

// ======================================================================================================================
// 1. Reading the M-Pesa message
// ======================================================================================================================
await ok('the message from the request is read exactly: code, amount, the exact date and time, who paid, account', () => {
  const r = parse(MSG)
  assert.equal(r.ok, true)
  assert.equal(r.payment.code, 'UKL41383DB')
  assert.equal(r.payment.amount, 2000)
  assert.equal(r.payment.paidAt.toISOString(), PAID)
  assert.equal(r.payment.payerName, 'VISHWAKARMA VIVEK ADYAPRASAD')
  assert.equal(r.payment.account, '899118')
  assert.equal(formatEatDateTime(r.payment.paidAt), '21 Nov 2026 05:50 PM')
})

await ok('the whole message as M-Pesa really sends it (with the balance and the cost) takes the payment amount, not the balance', () => {
  const r = parse('UKL41383DB Confirmed. KES 2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 05:50 PM. New Utility balance is KES 14,300.00. Transaction cost, KES 0.00.')
  assert.equal(r.ok, true)
  assert.equal(r.payment.amount, 2000)
  assert.equal(r.payment.payerName, 'VISHWAKARMA VIVEK ADYAPRASAD')
  assert.equal(r.payment.account, '899118')
})

await ok('the other ways the message is worded or typed still give the same payment', () => {
  const same = [
    'UKL41383DB confirmed. Ksh2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/2026 at 5:50 PM.',   // Ksh, 4-digit year, no leading zero
    'UKL41383DB Confirmed. KES2,000 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21-11-26 at 5.50pm.',          // no cents, dashes, "5.50pm"
    'UKL41383DB Confirmed.\nKES 2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD\nfor account 899118\non 21/11/26 at 05:50 PM.',     // pasted with line breaks
    '   UKL41383DB   Confirmed.   KES   2,000.00   received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 05:50 PM.  ',
    'UKL41383DB Confirmed. KES 2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 17:50.',        // 24-hour clock
    'UKL41383DB Confirmed. KES 2,000.00 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 05:50:33 PM.', // seconds
    'UKL41383DB Confirmed. Ksh. 2000 received from VISHWAKARMA VIVEK ADYAPRASAD for account 899118 on 21/11/26 at 05:50 p.m.',       // "p.m."
  ]
  for (const text of same) {
    const r = parse(text)
    assert.equal(r.ok, true, text)
    assert.equal(r.payment.code, 'UKL41383DB', text)
    assert.equal(r.payment.amount, 2000, text)
    assert.equal(r.payment.paidAt.toISOString(), PAID, text)
  }
})

await ok('every minute of the clock turns into the right moment, including 12 AM, 12 PM and the month and year ends', () => {
  let checked = 0
  for (const [y, mo, d] of [[2026, 11, 21], [2026, 1, 1], [2026, 2, 28], [2028, 2, 29], [2026, 12, 31], [2026, 3, 31]]) {
    for (let h12 = 1; h12 <= 12; h12++) {
      for (const pm of [false, true]) {
        for (const mi of [0, 1, 7, 30, 59]) {
          const h24 = (h12 % 12) + (pm ? 12 : 0)
          const text = `QWE1234567 Confirmed. KES 100.00 received from A B on ${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${String(y).slice(2)} at ${h12}:${String(mi).padStart(2, '0')} ${pm ? 'PM' : 'AM'}.`
          const r = parse(text, new Date('2030-01-01T00:00:00Z'))
          assert.equal(r.ok, true, text)
          assert.equal(r.payment.paidAt.getTime(), Date.UTC(y, mo - 1, d, h24, mi) - 3 * HOUR, text)
          checked++
        }
      }
    }
  }
  assert.equal(checked, 6 * 12 * 2 * 5)
  // the two that people get wrong
  assert.equal(formatEatTime(parse('QWE1234567 Confirmed. KES 1.00 received from A B on 21/11/26 at 12:00 AM.').payment.paidAt), '12:00 AM')
  assert.equal(formatEatTime(parse('QWE1234567 Confirmed. KES 1.00 received from A B on 21/11/26 at 12:00 PM.').payment.paidAt), '12:00 PM')
})

await ok('what is not a good message is refused with a plain sentence', () => {
  const bad = (text, pattern, now) => { const r = parse(text, now); assert.equal(r.ok, false, text); assert.match(r.error, pattern, text) }
  bad('', /Paste the M-Pesa message first/)
  bad('   \n  ', /Paste the M-Pesa message first/)
  bad(null, /Paste the M-Pesa message first/)
  bad('hello there, here is my payment', /couldn't find the M-Pesa transaction code/)
  bad('UKL41383DB Confirmed. on 21/11/26 at 05:50 PM.', /couldn't find the amount/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X at 05:50 PM.', /couldn't find the payment date/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 21/11/26.', /couldn't find the payment time/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 31/02/26 at 05:50 PM.', /not a real date/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 21/13/26 at 05:50 PM.', /not a real date/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 29/02/27 at 05:50 PM.', /not a real date/)       // 2027 is not a leap year
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 21/11/26 at 13:50 PM.', /couldn't find the payment time/)
  bad('UKL41383DB Confirmed. KES 0.00 received from X on 21/11/26 at 05:50 PM.', /not a valid payment/)
  bad(`UKL41383DB Confirmed. KES ${MAX_AMOUNT + 1} received from X on 21/11/26 at 05:50 PM.`, /too large/)
  bad('UKL41383DB Confirmed. KES 2,000.00 received from X on 21/11/26 at 05:50 PM. UKM55555XY Confirmed. KES 500.00 received from Y on 21/11/26 at 06:00 PM.', /more than one message/)
  bad('UKL41383DB Confirmed. Transaction reversed. KES 2,000.00 on 21/11/26 at 05:50 PM.', /reversed or failed/)
  bad('UKL41383DB Failed. KES 2,000.00 on 21/11/26 at 05:50 PM.', /reversed or failed/)
})

await ok('a payment cannot be in the future, but a phone clock a few minutes ahead is forgiven', () => {
  const at = (iso) => parse('QWE1234567 Confirmed. KES 100.00 received from A B on 23/11/26 at 11:00 AM.', new Date(iso))      // the payment is 08:00 UTC
  assert.equal(at('2026-11-23T08:00:00Z').ok, true)
  assert.equal(at('2026-11-23T07:50:00Z').ok, true)           // 10 minutes early: allowed
  assert.equal(at('2026-11-23T07:49:00Z').ok, false)          // 11 minutes early: refused
  assert.match(at('2026-11-23T07:00:00Z').error, /are in the future/)
  assert.match(at('2026-11-23T07:00:00Z').error, /23 Nov 2026, 11:00 AM/)
})

await ok('a message with no payer or account still reads, and leaves those blank', () => {
  const r = parse('QWE1234567 Confirmed. KES 750.00 received on 21/11/26 at 05:50 PM.')
  assert.equal(r.ok, true)
  assert.equal(r.payment.payerName, '')
  assert.equal(r.payment.account, '')
  assert.equal(r.payment.amount, 750)
})

await ok('the payer name stops at the words that follow it and leaves out a phone number', () => {
  assert.equal(parse('QWE1234567 Confirmed. KES 100.00 received from 0722***456 JOHN KAMAU for account 123 on 21/11/26 at 05:50 PM.').payment.payerName, 'JOHN KAMAU')
  assert.equal(parse('QWE1234567 Confirmed. KES 100.00 received from JOHN KAMAU on 21/11/26 at 05:50 PM.').payment.payerName, 'JOHN KAMAU')
  assert.equal(parse('QWE1234567 Confirmed. KES 100.00 received from JOHN KAMAU. New balance is KES 5.00 on 21/11/26 at 05:50 PM.').payment.payerName, 'JOHN KAMAU')
})

await ok('the code is kept in capitals even when the message is typed in small letters', () => {
  const r = parse('ukl41383db confirmed. KES 2,000.00 received from A B on 21/11/26 at 05:50 PM.')
  assert.equal(r.ok, true)
  assert.equal(r.payment.code, 'UKL41383DB')
})

// ======================================================================================================================
// 2. Kenya time
// ======================================================================================================================
await ok('dates and times are always Kenya time (UTC+3), including across midnight, month ends and the new year', () => {
  assert.equal(formatEatDate(PAID), '21 Nov 2026')
  assert.equal(formatEatTime(PAID), '05:50 PM')
  assert.equal(formatEatDateTime(PAID), '21 Nov 2026 05:50 PM')
  assert.equal(formatEatDateTimeComma(PAID), '21 Nov 2026, 05:50 PM')
  assert.equal(formatEatDateTime('2026-11-30T21:00:00Z'), '1 Dec 2026 12:00 AM')         // UTC evening is already tomorrow in Kenya
  assert.equal(formatEatDateTime('2026-11-30T20:59:59Z'), '30 Nov 2026 11:59 PM')
  assert.equal(formatEatDateTime('2026-12-31T21:30:00Z'), '1 Jan 2027 12:30 AM')
  assert.equal(formatEatDateTime('2026-11-21T09:00:00Z'), '21 Nov 2026 12:00 PM')
  assert.equal(eatMonth2('2026-11-30T20:59:59Z'), '11')
  assert.equal(eatMonth2('2026-11-30T21:00:00Z'), '12')
  assert.equal(eatMonth2('2026-12-31T21:00:00Z'), '01')
})

await ok('a Kenyan wall-clock time becomes the right moment, and a date that does not exist becomes nothing', () => {
  assert.equal(eatToDate(2026, 11, 21, 17, 50).toISOString(), PAID)
  assert.equal(eatToDate(2026, 11, 21, 0, 0).toISOString(), '2026-11-20T21:00:00.000Z')
  assert.equal(eatToDate(2028, 2, 29, 12, 0).toISOString(), '2028-02-29T09:00:00.000Z')
  for (const bad of [[2026, 2, 29, 1, 1], [2026, 4, 31, 1, 1], [2026, 13, 1, 1, 1], [2026, 0, 1, 1, 1], [2026, 1, 0, 1, 1], [2026, 1, 1, 24, 0], [2026, 1, 1, 1, 60], [2026, 1.5, 1, 1, 1], [NaN, 1, 1, 1, 1]]) assert.equal(eatToDate(...bad), null, bad.join(','))
})

await ok('the answers do not depend on the time zone of the computer: the same on seven different clocks', () => {
  const code = `
    import { parseMpesaMessage } from ${JSON.stringify(pathToFileURL(root + 'src/lib/mpesa.js').href)}
    import { formatEatDateTime, eatMonth2 } from ${JSON.stringify(pathToFileURL(root + 'src/lib/eat.js').href)}
    import { subscriptionEnd, subscriptionOf, describeSubscription } from ${JSON.stringify(pathToFileURL(root + 'src/lib/subscription.js').href)}
    const now = new Date('2026-11-23T08:00:00Z')
    const p = parseMpesaMessage(${JSON.stringify(MSG)}, { now }).payment
    const end = subscriptionEnd(p.paidAt)
    const s = subscriptionOf([{ id: 1, customerId: 1, paidAt: p.paidAt.toISOString(), validUntil: end.toISOString() }], now)
    // a payment just before the clocks go back in New York / London (30 days must still be exactly 30 x 24 hours)
    const across = subscriptionEnd('2026-10-20T12:00:00Z')
    console.log(JSON.stringify({ paidAt: p.paidAt.toISOString(), shown: formatEatDateTime(p.paidAt), month: eatMonth2(p.paidAt), end: end.toISOString(), line: describeSubscription(s, now), active: s.active, left: s.daysLeft, across: across.toISOString() }))`
  const results = new Map()
  for (const tz of ['UTC', 'Africa/Nairobi', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Pacific/Auckland', 'Pacific/Kiritimati']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' })
    results.set(tz, out.trim())
  }
  const first = [...results.values()][0]
  for (const [tz, out] of results) assert.equal(out, first, `time zone ${tz}`)
  const r = JSON.parse(first)
  assert.deepEqual(r, { paidAt: PAID, shown: '21 Nov 2026 05:50 PM', month: '11', end: '2026-12-21T14:50:00.000Z', line: 'Until 21 Dec 2026 · 28 days left', active: true, left: 28, across: '2026-11-19T12:00:00.000Z' })
})

// ======================================================================================================================
// 3. Active or Inactive: the 30-day rule
// ======================================================================================================================
await ok('the subscription runs for 30 days, exactly 30 x 24 hours, from the moment of payment', () => {
  assert.equal(SUBSCRIPTION_DAYS, 30)
  assert.equal(subscriptionEnd(PAID).toISOString(), '2026-12-21T14:50:00.000Z')
  assert.equal(formatEatDateTimeComma(subscriptionEnd(PAID)), '21 Dec 2026, 05:50 PM')
  assert.equal(subscriptionEnd('2026-01-31T10:00:00Z').toISOString(), '2026-03-02T10:00:00.000Z')            // 30 days, not "one month"
  assert.equal(subscriptionEnd(PAID, 7).toISOString(), '2026-11-28T14:50:00.000Z')
})

await ok('someone who has never been sent a receipt is Inactive', () => {
  for (const none of [[], null, undefined]) {
    const s = subscriptionOf(none, NOW)
    assert.equal(s.active, false); assert.equal(s.never, true); assert.equal(s.validUntil, null); assert.equal(s.receipt, null)
    assert.equal(describeSubscription(s, NOW), 'No receipt sent yet')
    assert.equal(endMoment(s), '')
  }
})

await ok('Active up to the last second of the 30 days, Inactive from the very moment they end', () => {
  const r = rec(1, 7, PAID)
  const at = (t) => subscriptionOf([r], new Date(t))
  assert.equal(at('2026-11-21T14:50:00.000Z').active, true)              // the moment of payment
  assert.equal(at('2026-11-21T14:49:59.000Z').active, true)              // (a clock a second behind)
  assert.equal(at('2026-12-21T14:49:59.999Z').active, true)
  assert.equal(at('2026-12-21T14:50:00.000Z').active, false)
  assert.equal(at('2026-12-21T14:50:00.001Z').active, false)
  assert.equal(at('2027-06-01T00:00:00.000Z').active, false)
  assert.equal(at('2026-12-21T14:49:59.999Z').receipt, r)
})

await ok('the words next to the badge count days on the Kenya calendar, so they agree with the dates beside them', () => {
  const r = rec(1, 7, PAID)
  const say = (t) => { const now = new Date(t); return describeSubscription(subscriptionOf([r], now), now) }
  assert.equal(say(NOW), 'Until 21 Dec 2026 · 28 days left')                          // 23 Nov to 21 Dec is 28 days
  assert.equal(say('2026-11-21T14:50:00Z'), 'Until 21 Dec 2026 · 30 days left')      // the day it was paid
  assert.equal(say('2026-12-19T10:00:00Z'), 'Until 21 Dec 2026 · 2 days left')
  assert.equal(say('2026-12-20T20:59:59Z'), 'Until 21 Dec 2026 · 1 day left')        // 23:59:59 on the 20th in Kenya: tomorrow is the last day
  assert.equal(say('2026-12-20T21:00:00Z'), 'Ends today at 05:50 PM')                // 00:00 on the 21st
  assert.equal(say('2026-12-21T09:00:00Z'), 'Ends today at 05:50 PM')
  assert.equal(say('2026-12-21T14:49:59Z'), 'Ends today at 05:50 PM')
  assert.equal(say('2026-12-21T14:50:00Z'), 'Ended today (21 Dec 2026)')
  assert.equal(say('2026-12-21T20:59:59Z'), 'Ended today (21 Dec 2026)')
  assert.equal(say('2026-12-21T21:00:00Z'), 'Ended yesterday (21 Dec 2026)')
  assert.equal(say('2026-12-24T08:00:00Z'), 'Ended 3 days ago (21 Dec 2026)')
  assert.equal(say('2027-02-01T08:00:00Z'), 'Ended 42 days ago (21 Dec 2026)')
})

await ok('"ending soon" is the last three days, and only while Active', () => {
  assert.equal(ENDING_SOON_DAYS, 3)
  const r = rec(1, 7, PAID)
  const s = (t) => subscriptionOf([r], new Date(t))
  assert.equal(s('2026-12-17T10:00:00Z').daysLeft, 4); assert.equal(s('2026-12-17T10:00:00Z').endingSoon, false)
  assert.equal(s('2026-12-18T10:00:00Z').daysLeft, 3); assert.equal(s('2026-12-18T10:00:00Z').endingSoon, true)
  assert.equal(s('2026-12-21T10:00:00Z').daysLeft, 0); assert.equal(s('2026-12-21T10:00:00Z').endingSoon, true)
  assert.equal(s('2026-12-22T10:00:00Z').active, false); assert.equal(s('2026-12-22T10:00:00Z').endingSoon, false); assert.equal(s('2026-12-22T10:00:00Z').daysLeft, 0)
})

await ok('paying again early starts 30 new days from the new payment, and an older receipt never shortens a newer one', () => {
  const first = rec(1, 7, '2026-11-01T07:00:00Z')              // runs to 1 Dec 07:00 UTC
  const second = rec(2, 7, '2026-11-20T07:00:00Z')             // paid early: runs to 20 Dec 07:00 UTC
  const s = subscriptionOf([first, second], new Date('2026-11-25T00:00:00Z'))
  assert.equal(s.active, true)
  assert.equal(s.receipt.id, 2)
  assert.equal(s.validUntil.toISOString(), '2026-12-20T07:00:00.000Z')                // not 1 Dec + 30 days, not stacked
  // the order the rows arrive in makes no difference
  assert.equal(subscriptionOf([second, first], new Date('2026-11-25T00:00:00Z')).receipt.id, 2)
  // a receipt for an old payment entered late (a higher id) cannot cut the subscription short
  const late = rec(3, 7, '2026-10-01T07:00:00Z')
  assert.equal(subscriptionOf([first, second, late], new Date('2026-12-10T00:00:00Z')).receipt.id, 2)
  assert.equal(subscriptionOf([first, second, late], new Date('2026-12-10T00:00:00Z')).active, true)
  // after the newest one runs out they are Inactive again
  assert.equal(subscriptionOf([first, second, late], new Date('2026-12-20T07:00:00Z')).active, false)
})

await ok('a receipt that covers more than 30 days (for later) is simply honoured through its own end date', () => {
  const long = rec(1, 7, '2026-11-01T00:00:00Z', 60)
  assert.equal(subscriptionOf([long], new Date('2026-12-15T00:00:00Z')).active, true)
  assert.equal(subscriptionOf([long], new Date('2026-12-31T00:00:00Z')).active, false)
})

await ok('receipts are grouped per customer, newest payment first, and receipts with no customer are left out', () => {
  const a = rec(1, 1, '2026-10-01T00:00:00Z'), b = rec(2, 1, '2026-11-01T00:00:00Z'), c = rec(3, 2, '2026-11-02T00:00:00Z'), orphan = { ...rec(4, null, '2026-11-03T00:00:00Z') }
  const same1 = rec(5, 1, '2026-11-01T00:00:00Z')               // same payment time as b: the later row comes first
  const g = groupReceipts([a, b, c, orphan, same1])
  assert.deepEqual([...g.keys()].sort(), [1, 2])
  assert.deepEqual(g.get(1).map((r) => r.id), [5, 2, 1])
  assert.deepEqual(g.get(2).map((r) => r.id), [3])
  assert.equal(groupReceipts(null).size, 0)
})

await ok('everyone\'s status at once: customers with receipts are in the map, the rest read as Inactive', () => {
  const m = subscriptionMap([rec(1, 1, PAID), rec(2, 2, '2026-09-01T00:00:00Z')], NOW)
  assert.equal(subscriptionFor(m, 1).active, true)
  assert.equal(subscriptionFor(m, 2).active, false); assert.equal(subscriptionFor(m, 2).never, false)
  assert.equal(subscriptionFor(m, 3).active, false); assert.equal(subscriptionFor(m, 3).never, true)
})

// ======================================================================================================================
// 4. The customer's WhatsApp number
// ======================================================================================================================
await ok('Kenyan numbers written the usual ways all become 254… (no guessing)', () => {
  const same = ['0712 345 678', '0712345678', '+254 712 345 678', '254712345678', '+254712345678', '712345678', '0712-345-678', '(0712) 345 678', '0712.345.678', ' 0712 345 678 ', '00254712345678'.slice(2)]
  for (const t of same) assert.equal(whatsappNumber(t), '254712345678', t)
  assert.equal(whatsappNumber('0112 345 678'), '254112345678')                  // the 01xx numbers
  assert.equal(whatsappNumber('0722000111'), '254722000111')
  assert.equal(whatsappNumber(712345678), '254712345678')                       // typed as a number in a spreadsheet
})

await ok('when a contact holds two numbers the first real one is used; a name beside the number is ignored', () => {
  assert.equal(whatsappNumber('0712 345 678 / 0733 111 222'), '254712345678')
  assert.equal(whatsappNumber('0712 345 678, 0733 111 222'), '254712345678')
  assert.equal(whatsappNumber('0712 345 678 or 0733 111 222'), '254712345678')
  assert.equal(whatsappNumber('0712 34 / 0722 111 222'), '254722111222')        // the first is a typing slip: use the next
  assert.equal(whatsappNumber('John 0712345678'), '254712345678')
  assert.equal(whatsappNumber('Wife: 0722 111 222'), '254722111222')
  assert.equal(whatsappNumber('0712 345 678 (WhatsApp)'), '254712345678')
  assert.equal(whatsappNumber('0712 345 678 Mama Amina'), '254712345678')
  assert.equal(whatsappNumber('Mama Amina +254 712 345 678'), '254712345678')
  assert.equal(whatsappNumber('00 254 712 345 678'), '254712345678')               // 00 is the international prefix: still the same Kenyan number
})

await ok('numbers that are not usable give null, so a receipt is never sent to a made-up number', () => {
  for (const t of ['', '   ', null, undefined, 'call me', 'N/A', '12345', '0712 345 67', '07123456789', '+2547123456789', '0212345678', '0612345678', '0912345678', '+254 212 345 678', '0044 7911 123456', 'Plot 17 2345 678', 'House 712 345 678']) assert.equal(whatsappNumber(t), null, String(t))
})

await ok('a number from another country is used only when it is written with its + and country code', () => {
  assert.equal(whatsappNumber('+44 7911 123456'), '447911123456')
  assert.equal(whatsappNumber('+1 (202) 555-0100'), '12025550100')
  assert.equal(whatsappNumber('+255 754 123 456'), '255754123456')
  assert.equal(whatsappNumber('+12'), null)                                     // too short
  assert.equal(whatsappNumber('+1234567890123456'), null)                       // too long
})

await ok('the number is shown the way people read it', () => {
  assert.equal(formatWhatsappNumber('254712345678'), '+254 712 345 678')
  assert.equal(formatWhatsappNumber('447911123456'), '+447911123456')
  assert.equal(formatWhatsappNumber(''), '')
  assert.equal(formatWhatsappNumber(null), '')
})

// ======================================================================================================================
// 5. Invoice numbers and who paid
// ======================================================================================================================
await ok('the invoice number carries on from the last one used (11/1007), in the month of the payment', () => {
  assert.equal(LAST_NUMBER_USED, 1007)
  assert.equal(suggestReceiptNo(PAID, []), '11/1008')
  assert.equal(suggestReceiptNo(PAID, null), '11/1008')
  assert.equal(suggestReceiptNo(PAID, [{ receiptNo: '11/1008' }]), '11/1009')
  assert.equal(suggestReceiptNo(PAID, [{ receiptNo: '11/1015' }, { receiptNo: '10/1003' }, { receiptNo: '11/1009' }]), '11/1016')   // the highest running number wins
  assert.equal(suggestReceiptNo('2026-11-30T21:30:00Z', []), '12/1008')          // 00:30 on 1 December in Kenya
  assert.equal(suggestReceiptNo('2026-12-31T21:30:00Z', [{ receiptNo: '12/1020' }]), '01/1021')
  assert.equal(suggestReceiptNo(PAID, [{ receiptNo: 'ABC' }, { receiptNo: '' }, { receiptNo: null }, {}]), '11/1008')           // numbers typed in another style are ignored
  assert.equal(suggestReceiptNo(PAID, [{ receiptNo: '11/5' }]), '11/1008')                                                      // never goes backwards
})

await ok('a typed invoice number is checked before use', () => {
  assert.deepEqual(checkReceiptNo('11/1008'), { ok: true, value: '11/1008' })
  assert.deepEqual(checkReceiptNo('  11/1008  '), { ok: true, value: '11/1008' })
  assert.deepEqual(checkReceiptNo('SNS-2026.55'), { ok: true, value: 'SNS-2026.55' })
  assert.deepEqual(checkReceiptNo('11/  1008'), { ok: true, value: '11/ 1008' })
  for (const [bad, pattern] of [['', /Enter the invoice number/], ['   ', /Enter the invoice number/], [null, /Enter the invoice number/], ['11/10#1', /Use only letters, numbers/], ['11/1008;drop', /Use only letters, numbers/], ['x'.repeat(31), /too long/]]) {
    const r = checkReceiptNo(bad); assert.equal(r.ok, false, String(bad)); assert.match(r.error, pattern, String(bad))
  }
})

await ok('the name on the payment is compared gently: one shared name is enough, no name is fine, others get a heads-up', () => {
  assert.equal(namesAlike('Amina Hassan', 'AMINA HASSAN'), true)
  assert.equal(namesAlike('Amina Hassan', 'HASSAN OMAR'), true)
  assert.equal(namesAlike('Amina Hassan', 'omar amina'), true)
  assert.equal(namesAlike('Amina Hassan', ''), true)
  assert.equal(namesAlike('Amina Hassan', null), true)
  assert.equal(namesAlike('Amina Hassan', 'PETER KAMAU'), false)
  assert.equal(namesAlike('Amina Hassan', 'AM HA'), true)                     // initials only: too short to compare, so no warning
  assert.equal(namesAlike('Amina Hassan', 'J. KAMAU-HASSAN'), true)
  assert.equal(namesAlike('Bob -', 'BOB MWANGI'), true)
})

await ok('a customer\'s name as it goes on the receipt', () => {
  assert.equal(customerDisplayName({ firstName: 'Amina', lastName: 'Hassan' }), 'Amina Hassan')
  assert.equal(customerDisplayName({ firstName: ' Amina ', lastName: ' Hassan ' }), 'Amina Hassan')
  assert.equal(customerDisplayName({ firstName: 'Bob', lastName: '-' }), 'Bob')
  assert.equal(customerDisplayName({ firstName: 'Bob', lastName: '' }), 'Bob')
  assert.equal(customerDisplayName({ firstName: '', lastName: '', fullName: 'Zuri Ali' }), 'Zuri Ali')
  assert.equal(customerDisplayName({}), 'Customer')
  assert.equal(customerDisplayName(null), 'Customer')
})

// ======================================================================================================================
// 6. The words: amount, file name, the note about 30 days, the WhatsApp message and link
// ======================================================================================================================
await ok('the note under the receipt says the subscription runs for 30 days from the date of payment', () => {
  assert.equal(subscriptionNote(), 'Your internet subscription is valid for 30 days from the date of payment.')
  assert.equal(subscriptionNote(30), subscriptionNote())
  assert.equal(subscriptionNote(60), 'Your internet subscription is valid for 60 days from the date of payment.')
})

await ok('amounts and file names are written the way the receipt shows them', () => {
  assert.equal(formatReceiptMoney(2000), 'Ksh 2,000.00')
  assert.equal(formatReceiptMoney('2500.5'), 'Ksh 2,500.50')
  assert.equal(formatReceiptMoney(1234567.891), 'Ksh 1,234,567.89')
  assert.equal(formatReceiptMoney(0), 'Ksh 0.00')
  assert.equal(formatReceiptMoney(null), 'Ksh 0.00')
  assert.equal(formatReceiptMoney(999), 'Ksh 999.00')
  assert.equal(formatReceiptMoney(1000), 'Ksh 1,000.00')
  assert.equal(receiptFileName('11/1008'), 'Receipt-11-1008.pdf')
  assert.equal(receiptFileName('SNS 2026/55'), 'Receipt-SNS-2026-55.pdf')
  assert.equal(receiptFileName(''), 'Receipt-receipt.pdf')
  assert.equal(receiptFileName(null), 'Receipt-receipt.pdf')
  assert.equal(receiptFileName('///'), 'Receipt-receipt.pdf')
})

const LINK = 'https://proj.supabase.co/storage/v1/object/public/customer-receipts/0123456789abcdef0123456789abcdef/Receipt-11-1008.pdf'
await ok('the WhatsApp message carries every fact, the link, the note and the date the subscription runs to', () => {
  const m = buildWhatsAppMessage({ firstName: 'Amina', amount: 2000, code: 'UKL41383DB', paidAt: PAID, receiptNo: '11/1008', link: LINK })
  assert.equal(m, [
    'Hello Amina,',
    '',
    'Thank you for your payment of Ksh 2,000.00 (M-Pesa ref UKL41383DB), received on 21 Nov 2026 at 05:50 PM.',
    '',
    'Your receipt (invoice no. 11/1008):',
    LINK,
    '',
    'Your internet subscription is valid for 30 days from the date of payment. Valid until 21 Dec 2026, 05:50 PM.',
    '',
    'Swahili Net Solution',
    'Fast. Reliable. Always Connected.',
  ].join('\n'))
  assert.match(buildWhatsAppMessage({ firstName: '', amount: 1, code: 'X', paidAt: PAID, receiptNo: '1', link: LINK }), /^Hello there,/)
  assert.match(buildWhatsAppMessage({ firstName: '  ', amount: 1, code: 'X', paidAt: PAID, receiptNo: '1', link: LINK }), /^Hello there,/)
  assert.match(buildWhatsAppMessage({ firstName: 'Amina', amount: 1, code: 'X', paidAt: PAID, receiptNo: '1', days: 60, link: LINK }), /valid for 60 days from the date of payment\. Valid until 20 Jan 2027, 05:50 PM\./)
})

await ok('the link opens WhatsApp on the customer\'s number with the whole message, nothing lost in the encoding', () => {
  const m = buildWhatsAppMessage({ firstName: 'Amina', amount: 2000, code: 'UKL41383DB', paidAt: PAID, receiptNo: '11/1008', link: LINK })
  const url = whatsappUrl('254712345678', m)
  assert.ok(url.startsWith('https://wa.me/254712345678?text='))
  assert.equal(decodeURIComponent(url.slice(url.indexOf('?text=') + 6)), m)
  assert.ok(!/[\s\n]/.test(url), 'no raw spaces or line breaks')
  assert.ok(url.length < 1800, `length ${url.length}`)
  const tricky = whatsappUrl('254712345678', 'A&B=C?D#E 100% +ok\nnew line “quotes” ñ')
  assert.equal(new URL(tricky).searchParams.get('text'), 'A&B=C?D#E 100% +ok\nnew line “quotes” ñ')
})

// ======================================================================================================================
// 7. The receipt PDF
// ======================================================================================================================
const model = receiptModel({ customerName: 'Amina Hassan', paidAt: PAID, amount: 2000, code: 'UKL41383DB', receiptNo: '11/1008' })
const asText = (bytes) => Buffer.from(bytes).toString('latin1')
const texts = (m) => buildReceiptLayout(m).filter((i) => i.kind === 'text').map((i) => i.text)

await ok('the receipt page shows the customer, the invoice number, the code, the amount, the exact date and time, and the note', () => {
  const all = texts(model).join('\n')
  for (const want of ['Amina Hassan', '11/1008', 'UKL41383DB', 'Ksh 2,000.00', '21 Nov 2026 05:50 PM', 'Your internet subscription is valid for 30 days from the date of payment.', 'Valid until 21 Dec 2026, 05:50 PM.']) assert.ok(all.includes(want), `missing: ${want}\n${all}`)
})

await ok('a different payment gives a different page (the date and time on the receipt are the ones from the message)', () => {
  const other = receiptModel({ customerName: 'Baraka Otieno', paidAt: '2026-12-02T06:05:00Z', amount: 3500.5, code: 'ABC1234567', receiptNo: '12/1009' })
  const all = texts(other).join('\n')
  for (const want of ['Baraka Otieno', '12/1009', 'ABC1234567', 'Ksh 3,500.50', '2 Dec 2026 09:05 AM', 'Valid until 1 Jan 2027, 09:05 AM.']) assert.ok(all.includes(want), `missing: ${want}`)
  assert.ok(!all.includes('21 Nov 2026'))
  assert.ok(!all.includes('UKL41383DB'))
})

await ok('the PDF is a real, well-formed file: header, every object where the table says it is, stream lengths, trailer', async () => {
  const pdf = await makeReceiptPdf(model, { createdAt: NOW, subject: 'Payment UKL41383DB' })
  assert.ok(pdf instanceof Uint8Array)
  assert.ok(pdf.length > 20000 && pdf.length < 400000, `size ${pdf.length}`)
  const t = asText(pdf)
  assert.ok(t.startsWith('%PDF-1.4\n'))
  assert.ok(t.endsWith('%%EOF\n'))
  const start = /startxref\n(\d+)\n%%EOF\n$/.exec(t); assert.ok(start)
  const xrefAt = Number(start[1]); assert.equal(t.slice(xrefAt, xrefAt + 5), 'xref\n')
  const count = Number(/^xref\n0 (\d+)\n/.exec(t.slice(xrefAt))[1])
  const entries = [...t.slice(xrefAt).matchAll(/^(\d{10}) (\d{5}) ([nf]) \n/gm)]
  assert.equal(entries.length, count)
  entries.slice(1).forEach((e, i) => { const label = `${i + 1} 0 obj\n`; assert.equal(t.slice(Number(e[1]), Number(e[1]) + label.length), label, `object ${i + 1}`) })
  assert.match(t.slice(xrefAt), new RegExp(`trailer\\n<< /Size ${count} /Root 1 0 R /Info 9 0 R >>`))
  for (const m of t.matchAll(/\/Length (\d+) >>\nstream\n/g)) { const from = m.index + m[0].length; assert.equal(t.slice(from + Number(m[1]), from + Number(m[1]) + 10), '\nendstream', `stream at ${m.index}`) }
  assert.match(t, /\/Title \(Receipt 11\/1008\)/)
  assert.match(t, /\/Subject \(Payment UKL41383DB\)/)
  assert.match(t, /\/CreationDate \(D:20261123110000\+03'00'\)/)                  // 11:00 in Kenya, whatever the computer's clock says
})

await ok('the words are in the PDF as real text (so it can be searched and read aloud), not a picture of text', async () => {
  const t = asText(await makeReceiptPdf(model, { createdAt: NOW }))
  for (const want of ['(Amina Hassan) Tj', '(UKL41383DB) Tj', '(Ksh 2,000.00) Tj', '(Your internet subscription is valid for 30 days from the date of payment.) Tj']) assert.ok(t.includes(want), want)
  assert.ok(t.includes('(21 Nov 2026 05:50 PM) Tj'))
})

await ok('the same receipt always makes the same file, and a receipt made again from the stored row is identical', async () => {
  const a = await makeReceiptPdf(model, { createdAt: NOW })
  const b = await makeReceiptPdf(model, { createdAt: NOW })
  assert.equal(Buffer.compare(Buffer.from(a), Buffer.from(b)), 0)
  const row = { customerName: 'Amina Hassan', paidAt: PAID, amount: 2000, mpesaCode: 'UKL41383DB', receiptNo: '11/1008', daysCovered: 30 }
  const c = await makeReceiptPdf(modelFromReceipt(row), { createdAt: NOW })
  assert.equal(Buffer.compare(Buffer.from(a), Buffer.from(c)), 0)
})

await ok('awkward characters in a name cannot break the PDF', async () => {
  const odd = receiptModel({ customerName: 'Amina (Hassan) \\ O\'Neil ñ é', paidAt: PAID, amount: 2000, code: 'UKL41383DB', receiptNo: '11/1008' })
  const t = asText(await makeReceiptPdf(odd, { createdAt: NOW }))
  assert.ok(t.includes('\\(Hassan\\)') && t.includes('\\\\'))
  assert.ok(/\/Length \d+ >>\nstream\n/.test(t) && t.endsWith('%%EOF\n'))
})

// ======================================================================================================================
// 8. Making a receipt (a pretend database that remembers what it was asked to do)
// ======================================================================================================================
function pretendClient({ uploadError = null, insertError = null, insertNothing = false, removeThrows = false, deleteResult = { data: [{ id: 5 }], error: null } } = {}) {
  const log = []
  return {
    log,
    storage: {
      from: (bucket) => ({
        upload: async (path, blob, opts) => { log.push({ op: 'upload', bucket, path, blob, opts }); return uploadError ? { data: null, error: uploadError } : { data: { path }, error: null } },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => { log.push({ op: 'remove', bucket, paths }); if (removeThrows) throw new Error('offline'); return { data: [], error: null } },
      }),
    },
    from: (table) => ({
      insert: (row) => ({ select: () => ({ single: async () => {
        log.push({ op: 'insert', table, row })
        if (insertError) return { data: null, error: insertError }
        if (insertNothing) return { data: null, error: null }
        return { data: { id: 5, ...row, valid_until: new Date(Date.parse(row.paid_at) + row.days_covered * DAY).toISOString(), sent_by: 'u-admin', sent_at: NOW.toISOString() }, error: null }
      } }) }),
      delete: () => ({ eq: (col, val) => ({ select: async () => { log.push({ op: 'delete', table, col, val }); return deleteResult } }) }),
    }),
  }
}
const amina = { id: 1, firstName: 'Amina', lastName: 'Hassan', contact: '0712 345 678' }
const payment = parse(MSG).payment
const ops = (client) => client.log.map((l) => l.op)

await ok('a file is planned before anything is sent, with a long random name that cannot be guessed', () => {
  const client = pretendClient()
  const a = planReceiptFile(client, '11/1008'), b = planReceiptFile(client, '11/1008')
  assert.match(a.path, /^[0-9a-f]{32}\/Receipt-11-1008\.pdf$/)
  assert.notEqual(a.path, b.path)
  assert.equal(a.link, `https://proj.supabase.co/storage/v1/object/public/${RECEIPT_BUCKET}/${a.path}`)
  assert.equal(RECEIPT_BUCKET, 'customer-receipts')
  assert.deepEqual(client.log, [])                                                   // planning uploads nothing
})

await ok('sending a receipt: the PDF is kept first, then the row is recorded, with exactly what was read from the message', async () => {
  const client = pretendClient()
  const file = planReceiptFile(client, '11/1008')
  const out = await issueReceipt({ client, customer: amina, payment, receiptNo: '11/1008', file, now: NOW })
  assert.deepEqual(ops(client), ['upload', 'insert'])
  const up = client.log[0], ins = client.log[1]
  assert.equal(up.bucket, 'customer-receipts'); assert.equal(up.path, file.path)
  assert.equal(up.opts.contentType, 'application/pdf'); assert.equal(up.opts.upsert, false)
  assert.equal(asText(new Uint8Array(await up.blob.arrayBuffer())).slice(0, 8), '%PDF-1.4')
  assert.equal(ins.table, 'customer_receipts')
  assert.deepEqual(ins.row, {
    customer_id: 1, customer_name: 'Amina Hassan', customer_contact: '0712 345 678', receipt_no: '11/1008', mpesa_code: 'UKL41383DB', amount: 2000,
    paid_at: PAID, days_covered: 30, payer_name: 'VISHWAKARMA VIVEK ADYAPRASAD', account_ref: '899118', mpesa_message: payment.message, file_path: file.path, sent_via: 'whatsapp',
  })
  assert.ok(!('valid_until' in ins.row) && !('sent_by' in ins.row) && !('sent_at' in ins.row), 'the database decides these')
  assert.equal(out.link, file.link)
  assert.equal(out.pdf.length, up.blob.size)
  assert.equal(out.receipt.receiptNo, '11/1008')
  assert.equal(out.receipt.validUntil, '2026-12-21T14:50:00.000Z')
  assert.equal(subscriptionOf([out.receipt], NOW).active, true)                        // and that is what makes the customer Active
})

await ok('a file is planned for you when none is given', async () => {
  const client = pretendClient()
  const out = await issueReceipt({ client, customer: amina, payment, receiptNo: '11/1008', now: NOW })
  assert.match(client.log[0].path, /^[0-9a-f]{32}\/Receipt-11-1008\.pdf$/)
  assert.equal(client.log[1].row.file_path, client.log[0].path)
  assert.ok(out.link.endsWith(client.log[0].path))
})

await ok('if the PDF cannot be kept, nothing is recorded, so nobody becomes Active without a receipt having gone out', async () => {
  const client = pretendClient({ uploadError: { message: 'Network request failed' } })
  await assert.rejects(() => issueReceipt({ client, customer: amina, payment, receiptNo: '11/1008', now: NOW }), (e) => e instanceof ReceiptError && e.code === 'upload_failed' && /could not be uploaded, so it was not sent/.test(e.message))
  assert.deepEqual(ops(client), ['upload'])
})

await ok('if recording fails, the kept PDF is removed again, and the reason is explained in plain words', async () => {
  const cases = [
    [{ code: '23505', message: 'duplicate key value violates unique constraint "customer_receipts_mpesa_code_key"', details: 'Key (mpesa_code)=(UKL41383DB) already exists.' }, 'duplicate_payment', /already been sent for this M-Pesa payment/],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "customer_receipts_receipt_no_key"' }, 'duplicate_number', /invoice number is already used/],
    [{ code: '42501', message: 'new row violates row-level security policy for table "customer_receipts"' }, 'not_allowed', /Only an admin can send receipts/],
    [{ message: 'permission denied for table customer_receipts' }, 'not_allowed', /Only an admin/],
    [{ code: 'P0001', message: 'The payment time is in the future' }, 'future', /in the future/],
    [{ code: '08006', message: 'connection failure' }, 'save_failed', /could not be saved, so it was not sent/],
    [null, 'save_failed', /could not be saved/],
  ]
  for (const [error, code, pattern] of cases) {
    const client = pretendClient(error ? { insertError: error } : { insertNothing: true })
    await assert.rejects(() => issueReceipt({ client, customer: amina, payment, receiptNo: '11/1008', now: NOW }), (e) => e instanceof ReceiptError && e.code === code && pattern.test(e.message), code)
    assert.deepEqual(ops(client), ['upload', 'insert', 'remove'], code)
    assert.deepEqual(client.log[2].paths, [client.log[0].path], code)               // the very file that was kept
  }
})

await ok('if even the clean-up fails, the real reason is still the one reported', async () => {
  const client = pretendClient({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint "customer_receipts_mpesa_code_key"' }, removeThrows: true })
  await assert.rejects(() => issueReceipt({ client, customer: amina, payment, receiptNo: '11/1008', now: NOW }), (e) => e.code === 'duplicate_payment')
})

await ok('a customer with no contact, and a payment with no payer or account, are recorded with blanks (null), not the word "undefined"', async () => {
  const client = pretendClient()
  const bare = { code: 'QWE1234567', amount: 750, paidAt: new Date(PAID), payerName: '', account: '', message: '' }
  await issueReceipt({ client, customer: { id: 9, firstName: 'Bob', lastName: '-', contact: '' }, payment: bare, receiptNo: '11/1009', now: NOW })
  const row = client.log[1].row
  assert.equal(row.customer_name, 'Bob'); assert.equal(row.customer_contact, null); assert.equal(row.payer_name, null); assert.equal(row.account_ref, null); assert.equal(row.mpesa_message, null)
})

await ok('a receipt sent before is opened from its kept copy; one with no copy (restored from a backup) is made again and kept', async () => {
  const stored = { id: 1, customerName: 'Amina Hassan', paidAt: PAID, amount: 2000, mpesaCode: 'UKL41383DB', receiptNo: '11/1008', daysCovered: 30, sentAt: NOW.toISOString() }
  const c1 = pretendClient()
  assert.equal(await linkForReceipt(c1, { ...stored, filePath: 'tok/Receipt-11-1008.pdf' }), 'https://proj.supabase.co/storage/v1/object/public/customer-receipts/tok/Receipt-11-1008.pdf')
  assert.deepEqual(c1.log, [])
  const c2 = pretendClient()
  const link = await linkForReceipt(c2, { ...stored, filePath: null })
  assert.deepEqual(ops(c2), ['upload'])
  assert.ok(link.endsWith(c2.log[0].path)); assert.match(c2.log[0].path, /^[0-9a-f]{32}\/Receipt-11-1008\.pdf$/)
})

await ok('sending an old receipt again uses that receipt\'s own facts and its own number of days', () => {
  const r = { receiptNo: '10/1002', amount: 1500, mpesaCode: 'OLD1234567', paidAt: '2026-10-01T07:00:00Z', daysCovered: 30 }
  const m = messageForReceipt({ firstName: 'Baraka' }, r, LINK)
  assert.match(m, /^Hello Baraka,/)
  assert.ok(m.includes('Ksh 1,500.00 (M-Pesa ref OLD1234567), received on 1 Oct 2026 at 10:00 AM.'))
  assert.ok(m.includes('invoice no. 10/1002') && m.includes(LINK) && m.includes('Valid until 31 Oct 2026, 10:00 AM.'))
  assert.match(messageForReceipt(null, r, LINK), /^Hello there,/)
})

await ok('a row from the database becomes what the app holds', () => {
  const r = mapReceipt({ id: 5, customer_id: 1, customer_name: 'Amina Hassan', customer_contact: null, receipt_no: '11/1008', mpesa_code: 'UKL41383DB', amount: '2000.00', paid_at: PAID, valid_until: '2026-12-21T14:50:00+00:00', days_covered: 30, payer_name: null, account_ref: null, mpesa_message: null, file_path: null, sent_via: null, sent_by: null, sent_at: PAID })
  assert.deepEqual(r, { id: 5, customerId: 1, customerName: 'Amina Hassan', customerContact: '', receiptNo: '11/1008', mpesaCode: 'UKL41383DB', amount: 2000, paidAt: PAID, validUntil: '2026-12-21T14:50:00+00:00', daysCovered: 30, payerName: '', accountRef: '', mpesaMessage: '', filePath: null, sentVia: 'whatsapp', sentBy: null, sentAt: PAID })
  assert.equal(mapReceipt({ id: 6, customer_id: null, amount: 'x', days_covered: null, receipt_no: 'a', mpesa_code: 'b' }).customerId, null)    // a customer who was deleted
  assert.equal(subscriptionOf([r], NOW).active, true)                                  // the database's timestamp text works as it is  // and a row with everything filled in keeps every piece of it
  const full = mapReceipt({ id: 7, customer_id: 2, customer_name: 'Baraka Otieno', customer_contact: '0722000111', receipt_no: '10/1002', mpesa_code: 'OLD1234567', amount: 1500, paid_at: '2026-10-01T07:00:00+00:00', valid_until: '2026-10-31T07:00:00+00:00', days_covered: 45, payer_name: 'BARAKA OTIENO', account_ref: '899118', mpesa_message: 'OLD1234567 Confirmed.', file_path: 'tok/Receipt-10-1002.pdf', sent_via: 'email', sent_by: 'u-admin', sent_at: '2026-10-01T07:05:00+00:00' })
  assert.deepEqual(full, { id: 7, customerId: 2, customerName: 'Baraka Otieno', customerContact: '0722000111', receiptNo: '10/1002', mpesaCode: 'OLD1234567', amount: 1500, paidAt: '2026-10-01T07:00:00+00:00', validUntil: '2026-10-31T07:00:00+00:00', daysCovered: 45, payerName: 'BARAKA OTIENO', accountRef: '899118', mpesaMessage: 'OLD1234567 Confirmed.', filePath: 'tok/Receipt-10-1002.pdf', sentVia: 'email', sentBy: 'u-admin', sentAt: '2026-10-01T07:05:00+00:00' })
})

await ok('deleting a receipt: the row goes, then its kept PDF; a person who is not the Director deletes nothing and is told so', async () => {
  const receipt = { id: 5, receiptNo: '11/1008', filePath: 'tok/Receipt-11-1008.pdf' }
  const done = pretendClient()
  assert.deepEqual(await deleteReceipt(done, receipt), { ok: true })
  assert.deepEqual(done.log, [{ op: 'delete', table: 'customer_receipts', col: 'id', val: 5 }, { op: 'remove', bucket: 'customer-receipts', paths: ['tok/Receipt-11-1008.pdf'] }])
  const blocked = pretendClient({ deleteResult: { data: [], error: null } })              // the database matched no rows: not the Director
  assert.deepEqual(await deleteReceipt(blocked, receipt), { ok: false, error: 'Only the Director can delete a receipt.' })
  assert.deepEqual(ops(blocked), ['delete'])                                              // and the PDF is left alone
  const denied = pretendClient({ deleteResult: { data: null, error: { message: 'new row violates row-level security policy' } } })
  assert.deepEqual(await deleteReceipt(denied, receipt), { ok: false, error: 'Only the Director can delete a receipt.' })
  const broken = pretendClient({ deleteResult: { data: null, error: { message: 'connection failure' } } })
  assert.equal((await deleteReceipt(broken, receipt)).ok, false)
  assert.match((await deleteReceipt(broken, receipt)).error, /could not be deleted/)
  const nofile = pretendClient()
  assert.equal((await deleteReceipt(nofile, { id: 5, receiptNo: 'x', filePath: null })).ok, true)
  assert.deepEqual(ops(nofile), ['delete'])
  const flaky = pretendClient({ removeThrows: true })
  assert.deepEqual(await deleteReceipt(flaky, receipt), { ok: true })                    // a stray file does no harm: the receipt is gone
})

// ======================================================================================================================
// 9. Opening the WhatsApp tab from a button press
// ======================================================================================================================
function pretendBrowser(open) { globalThis.window = { open } }
const tabOf = () => ({ closed: false, opener: {}, location: { href: '' }, document: { title: '', body: { style: {}, textContent: '' } }, close() { this.closed = true } })

await ok('a blank tab is opened at once, told what is happening, and sent to WhatsApp when the message is ready', () => {
  const tab = tabOf(); let asked = null
  pretendBrowser((url, target) => { asked = [url, target]; return tab })
  const w = openPendingWindow()
  assert.deepEqual(asked, ['', '_blank'])
  assert.equal(w.opened, true); assert.equal(tab.opener, null)
  assert.equal(tab.document.title, 'Opening WhatsApp…'); assert.equal(tab.document.body.textContent, 'Opening WhatsApp…')
  assert.equal(tab.location.href, '')
  assert.equal(w.go('https://wa.me/254712345678?text=Hi'), true)
  assert.equal(tab.location.href, 'https://wa.me/254712345678?text=Hi')
  assert.equal(openPendingWindow('Opening the receipt…').opened, true)
  delete globalThis.window
})

await ok('when the browser blocks the tab, or the tab was closed, nothing breaks and the screen can offer a link instead', () => {
  pretendBrowser(() => null)
  const blocked = openPendingWindow()
  assert.equal(blocked.opened, false); assert.equal(blocked.go('https://wa.me/1'), false); blocked.close()
  pretendBrowser(() => { throw new Error('denied') })
  const thrown = openPendingWindow(); assert.equal(thrown.opened, false); assert.equal(thrown.go('x'), false)
  const tab = tabOf(); pretendBrowser(() => tab)
  const gone = openPendingWindow(); tab.closed = true
  assert.equal(gone.go('https://wa.me/1'), false); assert.equal(tab.location.href, '')
  const live = tabOf(); pretendBrowser(() => live)
  const cancel = openPendingWindow(); cancel.close(); assert.equal(live.closed, true)
  delete globalThis.window
})

// ======================================================================================================================
// 10. The SQL: the same rules in the real database
// ======================================================================================================================
const mig = read('supabase/update-48-migration.sql')
const rebuild = read('supabase/job-card-rebuild.sql')
const schema = read('supabase/schema.sql')
const section = (text, from, to) => { const a = text.indexOf(from); assert.ok(a >= 0, `missing: ${from}`); const b = to ? text.indexOf(to, a + from.length) : text.length; return text.slice(a, b < 0 ? text.length : b) }

await ok('the full set-up scripts end with this update, and still carry the one before it', () => {
  assert.equal(rebuild, schema)
  assert.ok(rebuild.endsWith(mig), 'the full script ends with update 48')
  assert.ok(rebuild.includes(read('supabase/update-47-migration.sql')), 'and carries update 47')
  assert.ok(rebuild.indexOf('create table if not exists public.customer_receipts') > rebuild.indexOf('public.customers'))
})

await ok('the receipts table keeps what a receipt needs and refuses nonsense', () => {
  const t = section(mig, 'create table if not exists public.customer_receipts', ');')
  for (const col of ['customer_id bigint references public.customers(id) on delete set null', 'customer_name text not null', 'receipt_no text not null', 'mpesa_code text not null', 'amount numeric(12, 2) not null', 'paid_at timestamptz not null', 'days_covered integer not null default 30', 'valid_until timestamptz not null', 'sent_via text not null default \'whatsapp\'', 'sent_by uuid default auth.uid() references public.profiles(id) on delete set null', 'sent_at timestamptz not null default now()']) assert.ok(t.replace(/\s+/g, ' ').includes(col), col)
  assert.match(mig, /check \(amount > 0\)/)
  assert.match(mig, /days_covered between 1 and 366/)
  assert.match(mig, /sent_via in \('whatsapp', ?'email'\)/)
  assert.match(mig, /mpesa_code ~ '\^\[A-Z0-9\]\{6,20\}\$'/)
  assert.match(mig, /create unique index if not exists customer_receipts_mpesa_code_key on public\.customer_receipts \(mpesa_code\)/)
  assert.match(mig, /create unique index if not exists customer_receipts_receipt_no_key on public\.customer_receipts \(receipt_no\)/)
})

await ok('the database itself works out when the subscription ends (exactly 30 x 24 hours) and refuses a payment from the future', () => {
  const f = section(mig, 'create or replace function public.customer_receipts_rules()', '$$;')
  assert.match(f, /new\.valid_until := new\.paid_at \+ make_interval\(hours => new\.days_covered \* 24\)/)
  assert.match(f, /new\.paid_at > now\(\) \+ interval '30 minutes'/)
  assert.match(f, /The payment time is in the future/)
  assert.match(f, /upper\(btrim\(new\.mpesa_code\)\)/)
  assert.match(mig, /create trigger trg_customer_receipts_rules before insert on public\.customer_receipts/)
})

await ok('only admins can send and read receipts, only the Director can delete one, nobody can change one, and the public has no access to the table', () => {
  const pol = (name) => section(mig, `create policy "${name}" on public.customer_receipts`, ';')
  assert.match(pol('receipts_select_admin'), /for select using \(public\.is_admin\(\)\)/)
  assert.match(pol('receipts_insert_admin'), /for insert with check \(public\.is_admin\(\)\)/)
  assert.match(pol('receipts_delete_director'), /for delete using \(public\.is_director\(\)\)/)
  assert.ok(!/create policy "?\w+"? on public\.customer_receipts\s+for (update|all)/i.test(mig), 'there is no policy that allows a change')
  assert.equal((mig.match(/create policy "receipts_/g) || []).length, 3)
  assert.match(mig, /revoke all on public\.customer_receipts from anon/)
  assert.match(mig, /revoke update, truncate on public\.customer_receipts from authenticated/)
  assert.match(mig, /alter table public\.customer_receipts enable row level security/)
})

await ok('the PDF copies live in their own folder: PDF only, 1 MB at most, admins add them, and a copy no receipt uses can be cleaned up', () => {
  assert.match(mig, /insert into storage\.buckets[\s\S]*'customer-receipts'[\s\S]*true[\s\S]*1048576[\s\S]*'application\/pdf'/)
  assert.match(mig, /create policy "customer_receipts_files_insert_admin"[\s\S]*bucket_id = 'customer-receipts' and public\.is_admin\(\)/)
  assert.match(mig, /create policy "customer_receipts_files_select_admin"/)
  assert.match(mig, /create policy "customer_receipts_files_delete_unused"[\s\S]*not exists \(select 1 from public\.customer_receipts/)
  assert.ok(!/create policy "customer_receipts_files_(update|all)/.test(mig))
})

await ok('the script can be run twice without harm, and live updates reach the screen', () => {
  assert.match(mig, /create table if not exists public\.customer_receipts/)
  for (const m of mig.matchAll(/create policy "(\w+)"/g)) assert.ok(new RegExp(`drop policy if exists "${m[1]}" on`).test(mig), `drop policy if exists ${m[1]}`)
  for (const m of mig.matchAll(/create (?:unique )?index (?!if not exists)(\w+)/g)) assert.fail(`index ${m[1]} without "if not exists"`)
  assert.match(mig, /drop trigger if exists trg_customer_receipts_rules on public\.customer_receipts/)
  assert.match(mig, /alter publication supabase_realtime add table public\.customer_receipts/)
  assert.match(mig, /pg_publication_tables[\s\S]*tablename = 'customer_receipts'/)
  assert.match(mig, /notify pgrst, 'reload schema'/)
})

// ======================================================================================================================
// 11. The app carries it
// ======================================================================================================================
await ok('the test chain runs this file, and the update is wired to the screens that use it', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.test, /node scripts\/test-receipts\.mjs/)
  assert.match(read('src/components/CustomersTab.jsx'), /lazy\(\(\) => import\('\.\/SendReceipt'\)\)/)           // the sending screen is only downloaded when used
  assert.match(read('src/App.jsx'), /fetchAll\('customer_receipts'\)/)
  assert.match(read('src/lib/dataCore.js'), /table: 'customer_receipts'/)
})

console.log(`\n${n} receipt checks passed`)
