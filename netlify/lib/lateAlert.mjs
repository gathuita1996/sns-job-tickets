// The Director's late-payment email. Every evening at 5:31 pm (Nairobi time), one minute after the 5:30 pm closing hour, this
// looks for money that is still waiting to be paid and, only if there is some, sends the Director one short email.
//
// Update 53: it runs on EVERY day of the week. Sundays and public holidays are not skipped (the leave rules' non-working days play
// no part here at all): a technician can be called out on any day, and a payment can be late on any day.
//
//   transport   a job's transport that has not been marked paid (the Transport tab's "unpaid")
//   expenses    a purchase whose receipt is in and is waiting for payment, or an approved service not yet paid
//               (exactly the rows the Expenses screen offers "Mark as Paid" on), unless it was already paid in advance
//
// Written as a plain function of (env, fetch, now) so it can be tested against pretend versions of the database and of Resend;
// the Netlify function (netlify/functions/late-payments-alert.mjs) only passes the real ones in and holds the schedule.
import { EAT_OFFSET_MS, DAY_MS, eatDateKey } from '../../src/lib/eat.js'
import { EMAIL_ADDRESS, readAlertConfig } from './alertConfig.mjs'
import { supabaseApi } from './supabaseRest.mjs'

export const CLOSING_TIME = '5:30 pm'
export const CLOSING_MINUTE = 17 * 60 + 30            // 17:30, as minutes since midnight in Nairobi
// Netlify reads a schedule in UTC. Nairobi is UTC+3 all year (Kenya has no daylight saving), so 17:31 there is 14:31 UTC.
// Every day of the week (the last field is the day of the week, and * means all seven).
export const ALERT_CRON = '31 14 * * *'
export const ALERT_MINUTE = CLOSING_MINUTE + 1        // 17:31

export const RESEND_URL = 'https://api.resend.com/emails'
const PAGE = 1000                  // rows asked of the database at a time (Supabase answers at most 1000)
const MAX_PAGES = 50
const REQUEST_TIMEOUT_MS = 8000    // one slow call must not use up the 30 seconds Netlify gives a scheduled function
const WAITS_MS = [1000, 3000]      // between the (up to) three tries of a call that failed for a passing reason

// What to read. These ask for a little MORE than is owed (the rule below makes the final decision), so a filter that is a
// bit too wide can never hide a payment.
export const JOBS_PATH = 'jobs?select=id,member_id,transport_amount,transport_paid_at&transport_paid_at=is.null&transport_amount=gt.0&order=id.asc'
export const EXPENSES_PATH = 'expenses?select=id,entry_type,status,amount,paid_at&paid_at=is.null&status=in.(Approved,Purchased)&order=id.asc'
export const DIRECTOR_PATH = 'profiles?select=full_name,email&role=eq.admin&is_director=eq.true&order=created_at.asc'

export class AlertError extends Error {}

// ---- what is owed ----------------------------------------------------------------------------------------------------------
// Money is added up in cents so that decimals never leave a stray 0.0000001.
const toCents = (value) => { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) : 0 }

// A job's transport is owed while it is more than nothing and has not been marked paid (see TransportTab / transportReport).
export const isTransportOwed = (job) => toCents(job.transport_amount) > 0 && !job.transport_paid_at
// The Expenses screen offers "Mark as Paid" on a Purchased row, and on an approved Service that has not been paid
// (ExpensesList.jsx, readyToMarkPaid). Anything already paid in advance (paid_at is set) is not late.
export const isExpenseOwed = (expense) => toCents(expense.amount) > 0 && !expense.paid_at
  && (expense.status === 'Purchased' || (expense.entry_type === 'service' && expense.status === 'Approved'))

// rows as they come from the database -> what is still unpaid
export function latePayments({ jobs = [], expenses = [] } = {}) {
  const trips = jobs.filter(isTransportOwed)
  const requests = expenses.filter(isExpenseOwed)
  const transport = {
    cents: trips.reduce((sum, j) => sum + toCents(j.transport_amount), 0),
    trips: trips.length,
    staff: new Set(trips.map((j) => String(j.member_id == null ? '' : j.member_id))).size,
  }
  const spending = { cents: requests.reduce((sum, e) => sum + toCents(e.amount), 0), count: requests.length }
  const totalCents = transport.cents + spending.cents
  return { transport, expenses: spending, totalCents, any: totalCents > 0 }
}

// ---- the email -------------------------------------------------------------------------------------------------------------
// 120000 cents -> "KSh 1,200"; 120050 -> "KSh 1,200.50"
export function ksh(cents) {
  const whole = Math.trunc(cents / 100)
  const rest = Math.abs(cents % 100)
  return `KSh ${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${rest ? '.' + String(rest).padStart(2, '0') : ''}`
}
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The whole message. Short on purpose: it only has to tell the Director that money is waiting and how much.
//   name    the Director's first name (left out when it is not known)   appUrl  the app's address, as a link (left out when unknown)
//   test    true when this was sent before closing time, by someone pressing "Run now": the message says so
export function buildEmail({ late, name = '', appUrl = '', test = false }) {
  const lines = []
  if (test) lines.push(`(Test run, sent before the ${CLOSING_TIME} closing time. The real email goes at 5:31 pm.)`, '')
  lines.push(name ? `Hello ${name},` : 'Hello,', '', `These payments are still unpaid after the ${CLOSING_TIME} closing time:`, '')
  if (late.transport.cents > 0) lines.push(`- Transport: ${ksh(late.transport.cents)} (${count(late.transport.staff, 'staff member', 'staff members')})`)
  if (late.expenses.cents > 0) lines.push(`- Expenses / purchases: ${ksh(late.expenses.cents)} (${count(late.expenses.count, 'request', 'requests')})`)
  lines.push('', appUrl ? `Open Job Cards to pay: ${appUrl}` : 'Open Job Cards to pay.', '', 'Swahili Net Solution')
  return {
    subject: `${test ? '[Test] ' : ''}Late payments: ${ksh(late.totalCents)} unpaid after closing`,
    text: lines.join('\n') + '\n',
  }
}

// ---- reading the database and sending ------------------------------------------------------------------------------------------
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const passing = (r) => Boolean(r.unreachable) || r.status === 429 || r.status >= 500

// A call that failed for a passing reason (no connection, "try again", a server hiccup) is tried again, up to three times.
async function retrying(call, sleep) {
  let r = await call()
  for (let i = 0; i < WAITS_MS.length && !r.ok && passing(r); i++) {
    await sleep(WAITS_MS[i])
    r = await call()
  }
  return r
}

// every call gets a time limit of its own
const withTimeout = (fetch) => (url, init = {}) => fetch(url, init.signal ? init : { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

async function readAll(db, path, sleep) {
  const table = path.split('?')[0]
  const rows = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await retrying(() => db.serviceGet(`${path}&limit=${PAGE}&offset=${page * PAGE}`), sleep)
    if (!r.ok || !Array.isArray(r.data)) {
      throw new AlertError(`Could not read ${table}: ${r.unreachable ? 'the database could not be reached' : `the database answered ${r.status}`}.`)
    }
    rows.push(...r.data)
    if (r.data.length < PAGE) return rows
  }
  throw new AlertError(`Could not read ${table}: there are more than ${PAGE * MAX_PAGES} rows.`)
}

// Sends one email through Resend. The Idempotency-Key makes a second try of the same email harmless: Resend sends it once.
export async function sendEmail({ key, from, to, subject, text, idempotencyKey, fetch, sleep = sleepFor }) {
  const call = async () => {
    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, 'User-Agent': 'sns-job-cards/late-payments' },
        body: JSON.stringify({ from, to, subject, text }),
      })
      const raw = await res.text()
      let data = null
      try { data = raw ? JSON.parse(raw) : null } catch { /* not JSON */ }
      return { ok: res.ok, status: res.status, data }
    } catch (error) {
      return { ok: false, status: 0, data: null, unreachable: true }
    }
  }
  const r = await retrying(call, sleep)
  if (r.ok) return { id: r.data && r.data.id ? String(r.data.id) : '', duplicate: false }
  // the same email (same minute) was already sent, or is being sent right now: nothing more to do
  if (r.status === 409 && r.data && (r.data.name === 'invalid_idempotent_request' || r.data.name === 'concurrent_idempotent_requests')) return { id: '', duplicate: true }
  const why = r.unreachable ? 'Resend could not be reached' : `Resend answered ${r.status}${r.data && r.data.message ? `: ${String(r.data.message).slice(0, 300)}` : ''}`
  const message = `The email was not sent. ${why}`
  throw new AlertError(key ? message.split(key).join('[key]') : message)   // the key is never written to a log
}

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || ''
const two = (n) => String(n).padStart(2, '0')

// The whole job, once. Throws an AlertError (with a message that says what to fix) when something stops it; the Netlify log shows it.
// Returns what happened: { ok, sent, reason?, ... }.
export async function runLateAlert(deps) {
  const log = deps.log || ((...args) => console.log(...args))
  const sleep = deps.sleep || sleepFor
  const at = deps.now ? deps.now() : new Date()
  const cfg = readAlertConfig(deps.env || {})

  if (cfg.missing.length > 0) {
    throw new AlertError(`The late-payment email is not set up. Add ${cfg.missing.join(', ')} under Netlify -> Project configuration -> Environment variables, then deploy again.`)
  }
  if (cfg.badTo.length > 0) {
    throw new AlertError(`ALERT_EMAIL_TO has something that is not an email address: ${cfg.badTo.join(', ')}`)
  }
  const fetch = withTimeout(deps.fetch)
  const db = supabaseApi({ url: cfg.supabaseUrl, anonKey: '', serviceKey: cfg.serviceKey, fetch })
  const today = eatDateKey(at)
  const minute = Math.floor(((at.getTime() + EAT_OFFSET_MS) % DAY_MS) / 60000)

  // Nothing about the day decides whether it is sent: not a Sunday, not a public holiday the Director has added in the app.
  // Only money that is still unpaid does.
  const jobs = await readAll(db, JOBS_PATH, sleep)
  const expenses = await readAll(db, EXPENSES_PATH, sleep)
  const late = latePayments({ jobs, expenses })
  if (!late.any) {
    log('late-payments-alert: nothing is unpaid, so no email.')
    return { ok: true, sent: false, reason: 'nothing_unpaid' }
  }

  // who gets it: the addresses in ALERT_EMAIL_TO, otherwise the Director's own address in the app
  let recipients = cfg.to
  let name = ''
  if (recipients.length === 0) {
    const r = await retrying(() => db.serviceGet(DIRECTOR_PATH), sleep)
    if (!r.ok || !Array.isArray(r.data)) throw new AlertError(`Could not look up the Director: ${r.unreachable ? 'the database could not be reached' : `the database answered ${r.status}`}.`)
    const directors = r.data.filter((p) => p && EMAIL_ADDRESS.test(String(p.email || '').trim()))
    if (directors.length === 0) {
      throw new AlertError('The Director has no email address in the app. Add one to the Director\'s profile, or set ALERT_EMAIL_TO in Netlify.')
    }
    recipients = [...new Set(directors.map((p) => String(p.email).trim().toLowerCase()))]
    if (directors.length === 1) name = firstName(directors[0].full_name)
  }

  const test = minute < CLOSING_MINUTE
  const { subject, text } = buildEmail({ late, name, appUrl: cfg.appUrl, test })
  const idempotencyKey = `sns-late-payments-${today}-${two(Math.floor(minute / 60))}${two(minute % 60)}`
  const sent = await sendEmail({ key: cfg.resendKey, from: cfg.from, to: recipients, subject, text, idempotencyKey, fetch, sleep })

  log(`late-payments-alert: ${sent.duplicate ? 'this minute\'s email had already gone out' : 'email sent'} to ${count(recipients.length, 'address', 'addresses')}: ${ksh(late.totalCents)} unpaid (transport ${ksh(late.transport.cents)}, expenses ${ksh(late.expenses.cents)}).${sent.id ? ` Resend id ${sent.id}.` : ''}`)
  return { ok: true, sent: !sent.duplicate, duplicate: sent.duplicate, test, recipients: recipients.length, totalCents: late.totalCents, id: sent.id }
}
