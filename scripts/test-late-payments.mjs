// Update 52 (every day since Update 53): the Director's late-payment email, sent at 5:31 pm Nairobi time (one minute after the 5:30 pm
// closing hour) when a transport payment or an expense / purchase payment is still unpaid.
// Plain logic and pretend servers only (no real database, no real Resend, no real clock):
//   * the schedule says 17:31 in Nairobi, on every day of the week (Sundays too), and the function file holds that same text (Netlify
//     reads it from there); a public holiday or a Sunday changes nothing, and the holiday list is never even read;
//   * what counts as "still unpaid" is the same as on the Transport tab and the Expenses screen (checked against their own code);
//   * the email text is exactly what the setup guide shows, and short;
//   * the whole run is played against a small stand-in for the database (which refuses any column that is not in supabase/schema.sql)
//     and a stand-in for Resend: who gets it, nothing sent when nothing is owed, passing failures tried again without ever sending
//     twice, real failures reported with what to fix, and no secret ever written to a log or an error.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DAY_MS, EAT_OFFSET_MS, eatDateKey } from '../src/lib/eat.js'
import { formatKSh } from '../src/lib/helpers.js'
import { transportReport } from '../src/lib/reportsCore.js'
import { DEFAULT_SENDER, EMAIL_ADDRESS, readAlertConfig } from '../netlify/lib/alertConfig.mjs'
import {
  ALERT_CRON, ALERT_MINUTE, AlertError, CLOSING_MINUTE, CLOSING_TIME, DIRECTOR_PATH, EXPENSES_PATH, JOBS_PATH, RESEND_URL,
  buildEmail, isExpenseOwed, isTransportOwed, ksh, latePayments, runLateAlert, sendEmail,
} from '../netlify/lib/lateAlert.mjs'
import * as lateAlertModule from '../netlify/lib/lateAlert.mjs'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

// ---- the real database layout, read from the schema file ---------------------------------------------------------------------
const SCHEMA = read('supabase/schema.sql')
function schemaColumns(table) {
  const cols = new Set()
  const start = SCHEMA.search(new RegExp(`create table (if not exists )?public\\.${table}\\s*\\(`))
  assert.ok(start >= 0, `table ${table} is not in schema.sql`)
  const end = SCHEMA.indexOf('\n);', start)
  for (const line of SCHEMA.slice(start, end).split('\n').slice(1)) {
    const m = /^\s{2}([a-z_][a-z0-9_]*)\s+\S/.exec(line)
    if (m && !['constraint', 'primary', 'unique', 'check', 'foreign'].includes(m[1])) cols.add(m[1])
  }
  for (const m of SCHEMA.matchAll(new RegExp(`alter table public\\.${table} add column (?:if not exists )?([a-z_][a-z0-9_]*)`, 'g'))) cols.add(m[1])
  return cols
}
const COLUMNS = Object.fromEntries(['jobs', 'expenses', 'profiles', 'non_working_days'].map((t) => [t, schemaColumns(t)]))

// ---- the clock: Tuesday 24 November 2026, Nairobi time ------------------------------------------------------------------------
const at = (hhmm, day = '2026-11-24') => new Date(`${day}T${hhmm}:00+03:00`)
const EVENING = at('17:31')
const SUPA = 'https://proj.supabase.co'
const SERVICE_KEY = 'service-key-SECRET'
const RESEND_KEY = 're_SECRET_key_123'
const ENV = { VITE_SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, RESEND_API_KEY: RESEND_KEY, ALERT_APP_URL: 'https://snsjobcard.netlify.app' }

// ---- rows ---------------------------------------------------------------------------------------------------------------------
const job = (o = {}) => ({ id: 1, member_id: 'm1', transport_amount: 500, transport_paid_at: null, ...o })
const expense = (o = {}) => ({ id: 1, entry_type: 'purchase', status: 'Purchased', amount: 1000, paid_at: null, ...o })
const DIRECTOR = { id: 'd1', full_name: 'Naibei Gathuita', email: 'Naibei@Example.com', role: 'admin', is_director: true, created_at: '2025-01-01T00:00:00Z' }
const STAFF = { id: 's1', full_name: 'Langat Tech', email: 'langat@example.com', role: 'member', is_director: false, created_at: '2025-02-01T00:00:00Z' }
const ADMIN = { id: 'a1', full_name: 'Some Admin', email: 'admin@example.com', role: 'admin', is_director: false, created_at: '2025-03-01T00:00:00Z' }
// two people owed transport (1,200 in all), one purchase waiting (3,500)
const OWED = { jobs: [job({ id: 1, member_id: 'm1', transport_amount: 500 }), job({ id: 2, member_id: 'm1', transport_amount: 200 }), job({ id: 3, member_id: 'm2', transport_amount: 500 })], expenses: [expense({ id: 1, amount: 3500 })] }

// ---- a stand-in for the database (PostgREST) and for Resend, behind fetch -------------------------------------------------------------
const RESERVED = new Set(['select', 'order', 'limit', 'offset'])
function postgrest(tables, path) {
  const [table, qs = ''] = path.split('?')
  const rows = tables[table]
  if (!rows) return { status: 404, body: { code: '42P01', message: `relation "public.${table}" does not exist` } }
  const params = new URLSearchParams(qs)
  const known = COLUMNS[table]
  const need = (col) => { if (!known.has(col)) throw Object.assign(new Error(`column ${table}.${col} does not exist`), { status: 400 }); return col }
  let out = rows
  try {
    for (const [key, value] of params) {
      if (RESERVED.has(key)) continue
      const col = need(key)
      const m = /^(is|eq|gt|in)\.(.*)$/.exec(value)
      if (!m) throw new Error(`the stand-in does not understand ${key}=${value}`)
      const [, op, arg] = m
      if (op === 'is') { assert.equal(arg, 'null'); out = out.filter((r) => r[col] == null) }
      else if (op === 'eq') out = out.filter((r) => r[col] != null && String(r[col]) === arg)
      else if (op === 'gt') out = out.filter((r) => r[col] != null && Number(r[col]) > Number(arg))
      else { const list = /^\((.*)\)$/.exec(arg)[1].split(','); out = out.filter((r) => r[col] != null && list.includes(String(r[col]))) }
    }
    const order = params.get('order')
    if (order) { const [col, dir] = order.split('.'); need(col); out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1)) }
    const offset = Number(params.get('offset') || 0), limit = params.has('limit') ? Number(params.get('limit')) : 1000
    out = out.slice(offset, offset + Math.min(limit, 1000))
    const select = params.get('select')
    if (select && select !== '*') { const cols = select.split(',').map(need); out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) }
  } catch (error) {
    return { status: error.status || 500, body: { code: '42703', message: error.message } }
  }
  return { status: 200, body: out }
}

// world({ jobs, expenses, profiles, holidays, db: { table: [status, status, ...] }, resend: [status | { status, body } | 'network', ...] })
function world({ jobs = [], expenses = [], profiles = [DIRECTOR, STAFF, ADMIN], holidays = [], db = {}, resend = [] } = {}) {
  const tables = { jobs, expenses, profiles, non_working_days: holidays }
  const calls = []
  const resendLeft = [...resend]
  const dbLeft = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, [...v]]))
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetch = async (url, init = {}) => {
    const u = String(url)
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body, signal: init.signal })
    if (u === RESEND_URL) {
      const next = resendLeft.length ? resendLeft.shift() : 200
      if (next === 'network') throw new TypeError('fetch failed')
      const status = typeof next === 'number' ? next : next.status
      const body = typeof next === 'number' ? (next < 300 ? { id: 're-email-1' } : { name: 'application_error', message: 'something went wrong' }) : next.body
      return json(body, status)
    }
    assert.ok(u.startsWith(`${SUPA}/rest/v1/`), `unexpected address ${u}`)
    const path = u.slice(`${SUPA}/rest/v1/`.length)
    const table = path.split('?')[0]
    if (dbLeft[table] && dbLeft[table].length) {
      const status = dbLeft[table].shift()
      if (status === 'network') throw new TypeError('fetch failed')
      return json({ message: 'pretend trouble' }, status)
    }
    const r = postgrest(tables, path)
    return json(r.body, r.status)
  }
  return { fetch, calls, resendCalls: () => calls.filter((c) => c.url === RESEND_URL), dbCalls: () => calls.filter((c) => c.url !== RESEND_URL) }
}
const run = async (w, { env = ENV, now = EVENING } = {}) => {
  const logs = [], sleeps = []
  const result = await runLateAlert({ env, fetch: w.fetch, now: () => now, log: (...a) => logs.push(a.join(' ')), sleep: async (ms) => { sleeps.push(ms) } })
  return { result, logs, sleeps }
}
const fails = async (w, options, pattern) => {
  try { await run(w, options) } catch (e) { assert.ok(e instanceof AlertError, `an AlertError was expected, got ${e && e.stack}`); assert.match(e.message, pattern); return e }
  assert.fail('it should have stopped')
}
const sentEmail = (w) => { const [c] = w.resendCalls(); assert.ok(c, 'an email was sent'); return { ...c, payload: JSON.parse(c.body) } }

// ======================================================================================================================
// 1. The schedule
// ======================================================================================================================
await ok('the schedule is 17:31 in Nairobi (14:31 UTC) on every day of the week, one minute after the 5:30 pm closing hour', () => {
  assert.equal(CLOSING_TIME, '5:30 pm'); assert.equal(CLOSING_MINUTE, 17 * 60 + 30); assert.equal(ALERT_MINUTE, 17 * 60 + 31)
  const [minute, hour, dayOfMonth, month, dayOfWeek, ...rest] = ALERT_CRON.split(' ')
  assert.equal(rest.length, 0, 'five fields')
  assert.deepEqual([dayOfMonth, month, dayOfWeek], ['*', '*', '*'], 'every day of the month, every month and every day of the week: no Sunday and no weekday is left out')
  assert.equal(ALERT_CRON, '31 14 * * *')
  assert.equal((Number(hour) * 60 + Number(minute) + 180) % 1440, ALERT_MINUTE, 'Netlify reads UTC, Nairobi is three hours ahead')
  assert.equal(Number(hour) * 60 + Number(minute) + 180 < 1440, true, 'the Nairobi evening is still the same UTC day, so the date is the same')
})
await ok('every day of 2026 and 2027, Sundays included, the schedule fires at 17:31 on that same Nairobi date', () => {
  let fired = 0, sundays = 0
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += DAY_MS) {
    const utc = new Date(t)
    if (utc.getUTCDay() === 0) sundays++
    const fire = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 14, 31))
    assert.equal(Math.floor(((fire.getTime() + EAT_OFFSET_MS) % DAY_MS) / 60000), ALERT_MINUTE)
    assert.equal(eatDateKey(fire), fire.toISOString().slice(0, 10)); fired++
  }
  assert.equal(fired, 730, 'all 365 + 365 days')
  assert.equal(sundays, 104, 'and that includes every one of the 104 Sundays')
})
await ok('the Netlify function file holds the same schedule as plain text, hands the real environment to the lib, and is the only scheduled one', () => {
  const file = read('netlify/functions/late-payments-alert.mjs')
  const found = /export const config = \{ schedule: '([^']+)' \}/.exec(file)
  assert.ok(found, 'Netlify reads the schedule from a literal export const config = { schedule: ... }')
  assert.equal(found[1], ALERT_CRON)
  assert.match(file, /import \{ runLateAlert \} from '\.\.\/lib\/lateAlert\.mjs'/)
  assert.match(file, /runLateAlert\(\{ env: process\.env, fetch: globalThis\.fetch \}\)/)
  for (const other of ['whatsapp-send.mjs', 'whatsapp-webhook.mjs']) assert.ok(!/schedule/.test(read(`netlify/functions/${other}`)), `${other} must not be scheduled`)
})

// ======================================================================================================================
// 2. What counts as still unpaid
// ======================================================================================================================
await ok('transport is owed while it is more than nothing and has not been marked paid', () => {
  const owed = (o) => isTransportOwed(job(o))
  assert.equal(owed({}), true)
  assert.equal(owed({ transport_paid_at: '2026-11-24T10:00:00Z' }), false, 'paid')
  assert.equal(owed({ transport_amount: 0 }), false); assert.equal(owed({ transport_amount: null }), false)
  assert.equal(owed({ transport_amount: -50 }), false); assert.equal(owed({ transport_amount: 'abc' }), false); assert.equal(owed({ transport_amount: Infinity }), false)
  assert.equal(owed({ transport_amount: '250.50' }), true, 'numbers can arrive as text')
  assert.equal(owed({ transport_amount: 0.01 }), true)
  assert.equal(owed({ transport_amount: 0.004 }), false, 'less than one cent is nothing')
})
await ok('an expense is owed when it is a Purchased row, or an approved Service, that has not been paid (not Requested, Approved purchases, Rejected or Paid)', () => {
  let owedCount = 0
  for (const status of ['Requested', 'Approved', 'Rejected', 'Purchased', 'Paid']) {
    for (const entry_type of ['purchase', 'service']) {
      for (const paid_at of [null, '2026-11-24T08:00:00Z']) {
        const expected = !paid_at && (status === 'Purchased' || (entry_type === 'service' && status === 'Approved'))
        assert.equal(isExpenseOwed(expense({ status, entry_type, paid_at })), expected, `${status} / ${entry_type} / ${paid_at ? 'paid in advance' : 'not paid'}`)
        if (expected) owedCount++
      }
    }
  }
  assert.equal(owedCount, 3, 'Purchased purchase, Purchased service, Approved service')
  assert.equal(isExpenseOwed(expense({ amount: 0 })), false); assert.equal(isExpenseOwed(expense({ amount: null })), false); assert.equal(isExpenseOwed(expense({ amount: '1200.75' })), true)
})
await ok('it matches the Expenses screen: the same rows get "Mark as Paid", minus what was already paid in advance', () => {
  const screen = read('src/components/ExpensesList.jsx')
  const line = /const readyToMarkPaid = (.*)$/m.exec(screen)
  assert.ok(line, 'ExpensesList.jsx no longer has readyToMarkPaid: update netlify/lib/lateAlert.mjs (isExpenseOwed) to follow the new rule, then this test')
  assert.equal(line[1].trim(), "e.status === 'Purchased' || (isService && e.status === 'Approved' && !e.paidAt)")
  for (const status of ['Requested', 'Approved', 'Rejected', 'Purchased', 'Paid']) for (const isService of [false, true]) for (const paidAt of [null, 'x']) {
    const e = { status, paidAt }
    const markPaidShows = e.status === 'Purchased' || (isService && e.status === 'Approved' && !e.paidAt)
    assert.equal(isExpenseOwed(expense({ status, entry_type: isService ? 'service' : 'purchase', paid_at: paidAt })), markPaidShows && !paidAt, `${status} service=${isService} paidAt=${paidAt}`)
  }
})
await ok('it matches the Transport tab: the unpaid money and the people owed are the same numbers (300 made-up jobs)', () => {
  let seed = 7
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const rows = Array.from({ length: 300 }, (_, i) => job({
    id: i + 1, member_id: pick(['m1', 'm2', 'm3', 'm4', 'm5']), transport_amount: pick([0, 0, 50, 100.5, 250, 1200.25, '300', null, -20, 75]),
    transport_paid_at: rand() < 0.45 ? '2026-11-20T12:00:00Z' : null,
  }))
  const mine = latePayments({ jobs: rows })
  const users = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id) => ({ id, fullName: id }))
  const app = transportReport(rows.map((r, i) => ({ id: r.id, memberId: r.member_id, transportAmount: Number(r.transport_amount), transportPaidAt: r.transport_paid_at, createdAt: new Date(Date.UTC(2026, 9, 1 + (i % 50))).toISOString() })), users, new Date(0), new Date('2100-01-01'))
  assert.ok(app.unpaid > 0 && mine.transport.cents > 0)
  assert.equal(mine.transport.cents, Math.round(app.unpaid * 100))
  assert.equal(mine.transport.staff, app.rows.filter((r) => r.unpaid > 0).length)
})
await ok('amounts a computer stores a hair off (1.15, 4.35, 0.57, 8.2) still come out as exact cents', () => {
  const late = latePayments({ jobs: [1.15, 4.35, 0.57, 8.2].map((transport_amount, i) => job({ id: i + 1, member_id: `m${i}`, transport_amount })), expenses: [expense({ amount: 1.15 }), expense({ id: 2, amount: 0.29 })] })
  assert.equal(late.transport.cents, 115 + 435 + 57 + 820); assert.equal(late.expenses.cents, 115 + 29); assert.equal(late.totalCents, 1571)
  assert.equal(ksh(late.totalCents), 'KSh 15.71')
})
await ok('money is added in cents, people are counted once each, and junk values count for nothing', () => {
  const late = latePayments({ jobs: [job({ id: 1, transport_amount: 0.1 }), job({ id: 2, transport_amount: 0.2 }), job({ id: 3, member_id: null, transport_amount: 10 }), job({ id: 4, member_id: null, transport_amount: 10 }), job({ id: 5, transport_amount: 'abc' })], expenses: [expense({ id: 1, amount: 33.33 }), expense({ id: 2, amount: 33.33 }), expense({ id: 3, amount: 33.33 })] })
  assert.equal(late.transport.cents, 2030); assert.equal(late.transport.trips, 4); assert.equal(late.transport.staff, 2, 'm1 once, and "no member" once')
  assert.equal(late.expenses.cents, 9999); assert.equal(late.expenses.count, 3)
  assert.equal(late.totalCents, 12029); assert.equal(late.any, true)
  assert.deepEqual(latePayments({}), { transport: { cents: 0, trips: 0, staff: 0 }, expenses: { cents: 0, count: 0 }, totalCents: 0, any: false })
  assert.equal(latePayments({ jobs: [job({ transport_paid_at: 'x' })], expenses: [expense({ status: 'Paid' })] }).any, false)
})

// ======================================================================================================================
// 3. The email
// ======================================================================================================================
const LATE = latePayments(OWED)
await ok('money reads KSh 1,200, with cents only when there are some, and agrees with the app for whole amounts', () => {
  assert.deepEqual([0, 5, 100, 99900, 120000, 120050, 123456789, 100000000].map(ksh), ['KSh 0', 'KSh 0.05', 'KSh 1', 'KSh 999', 'KSh 1,200', 'KSh 1,200.50', 'KSh 1,234,567.89', 'KSh 1,000,000'])
  for (const amount of [0, 1, 20, 999, 1000, 1200, 45000, 123456, 9999999]) assert.equal(ksh(amount * 100), formatKSh(amount), String(amount))
})
await ok('the email, word for word (both kinds owed)', () => {
  const { subject, text } = buildEmail({ late: LATE, name: 'Naibei', appUrl: 'https://snsjobcard.netlify.app' })
  assert.equal(subject, 'Late payments: KSh 4,700 unpaid after closing')
  assert.equal(text, [
    'Hello Naibei,',
    '',
    'These payments are still unpaid after the 5:30 pm closing time:',
    '',
    '- Transport: KSh 1,200 (2 staff members)',
    '- Expenses / purchases: KSh 3,500 (1 request)',
    '',
    'Open Job Cards to pay: https://snsjobcard.netlify.app',
    '',
    'Swahili Net Solution',
    '',
  ].join('\n'))
})
await ok('only the kinds that are owed appear; one person and one request read in the singular', () => {
  const transportOnly = buildEmail({ late: latePayments({ jobs: [job({ transport_amount: 350 })] }), name: 'Naibei' })
  assert.match(transportOnly.text, /^- Transport: KSh 350 \(1 staff member\)$/m); assert.ok(!/Expenses/.test(transportOnly.text))
  assert.equal(transportOnly.subject, 'Late payments: KSh 350 unpaid after closing')
  const expensesOnly = buildEmail({ late: latePayments({ expenses: [expense({ id: 1, amount: 1250.5 }), expense({ id: 2, amount: 100 })] }) })
  assert.match(expensesOnly.text, /^- Expenses \/ purchases: KSh 1,350.50 \(2 requests\)$/m); assert.ok(!/Transport/.test(expensesOnly.text))
  assert.equal(expensesOnly.subject, 'Late payments: KSh 1,350.50 unpaid after closing')
})
await ok('without a name or a web address the message simply leaves them out', () => {
  const { text } = buildEmail({ late: LATE })
  assert.ok(text.startsWith('Hello,\n\nThese payments')); assert.match(text, /\nOpen Job Cards to pay\.\n/); assert.ok(!/https?:/.test(text))
})
await ok('a test run (before closing time) says so, in the subject and at the top, and a real one does not', () => {
  const t = buildEmail({ late: LATE, name: 'Naibei', test: true })
  assert.equal(t.subject, '[Test] Late payments: KSh 4,700 unpaid after closing')
  assert.ok(t.text.startsWith('(Test run, sent before the 5:30 pm closing time. The real email goes at 5:31 pm.)\n\nHello Naibei,'))
  const real = buildEmail({ late: LATE, name: 'Naibei' })
  assert.ok(!/test/i.test(real.subject + real.text))
})
await ok('it is short: a subject that fits a phone screen and a message of six lines of words, in plain text', () => {
  const big = latePayments({ jobs: Array.from({ length: 40 }, (_, i) => job({ id: i + 1, member_id: `m${i}`, transport_amount: 12345.67 })), expenses: Array.from({ length: 12 }, (_, i) => expense({ id: i + 1, amount: 98765.43 })) })
  const { subject, text } = buildEmail({ late: big, name: 'Naibei', appUrl: 'https://snsjobcard.netlify.app' })
  assert.ok(subject.length <= 70, subject)
  assert.ok(text.length <= 400, `${text.length} characters`)
  assert.equal(text.split('\n').filter((l) => l.trim()).length, 6)
  assert.ok(!/[<>]/.test(text), 'plain text, no markup')
})

// ======================================================================================================================
// 4. The settings
// ======================================================================================================================
await ok('the settings are read from the environment, and what is missing is named', () => {
  const c = readAlertConfig({ VITE_SUPABASE_URL: 'https://p.supabase.co//', SUPABASE_SERVICE_ROLE_KEY: ' k ', RESEND_API_KEY: ' re_1 ' })
  assert.equal(c.supabaseUrl, 'https://p.supabase.co'); assert.equal(c.serviceKey, 'k'); assert.equal(c.resendKey, 're_1')
  assert.equal(c.from, DEFAULT_SENDER); assert.deepEqual(c.to, []); assert.deepEqual(c.badTo, []); assert.equal(c.appUrl, ''); assert.deepEqual(c.missing, [])
  assert.deepEqual(readAlertConfig({}).missing, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'])
  assert.deepEqual(readAlertConfig({ SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_URL: 'https://b.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }).missing, ['RESEND_API_KEY'])
  assert.equal(readAlertConfig({ SUPABASE_URL: 'https://a.supabase.co', VITE_SUPABASE_URL: 'https://b.supabase.co' }).supabaseUrl, 'https://a.supabase.co', 'SUPABASE_URL wins over the VITE_ one')
  assert.equal(DEFAULT_SENDER, 'Swahili Net Solution <onboarding@resend.dev>')
})
await ok('the sender, the recipients and the web address can be set; nonsense in them is noticed or ignored', () => {
  const base = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', RESEND_API_KEY: 'r' }
  assert.equal(readAlertConfig({ ...base, ALERT_EMAIL_FROM: 'SNS Alerts <alerts@swahilinet.example>' }).from, 'SNS Alerts <alerts@swahilinet.example>')
  assert.deepEqual(readAlertConfig({ ...base, ALERT_EMAIL_TO: 'a@x.com, b@y.org;c@z.co  d@w.ke' }).to, ['a@x.com', 'b@y.org', 'c@z.co', 'd@w.ke'])
  assert.deepEqual(readAlertConfig({ ...base, ALERT_EMAIL_TO: 'a@x.com, not-an-email, <b@y.org>' }).badTo, ['not-an-email', '<b@y.org>'])
  assert.deepEqual(readAlertConfig({ ...base, ALERT_EMAIL_TO: '  ' }).to, [])
  assert.equal(readAlertConfig({ ...base, ALERT_APP_URL: 'https://snsjobcard.netlify.app/' }).appUrl, 'https://snsjobcard.netlify.app')
  assert.equal(readAlertConfig({ ...base, URL: 'https://other.netlify.app' }).appUrl, 'https://other.netlify.app', "Netlify's own URL setting is the fallback")
  assert.equal(readAlertConfig({ ...base, ALERT_APP_URL: 'https://mine.example', URL: 'https://other.netlify.app' }).appUrl, 'https://mine.example')
  assert.equal(readAlertConfig({ ...base, ALERT_APP_URL: 'javascript:alert(1)' }).appUrl, ''); assert.equal(readAlertConfig({ ...base, ALERT_APP_URL: 'snsjobcard.netlify.app' }).appUrl, '')
  for (const good of ['a@b.co', 'first.last+tag@sub.example.com']) assert.ok(EMAIL_ADDRESS.test(good), good)
  for (const bad of ['', 'a@b', '@b.co', 'a b@c.co', 'a@b..', 'a@.co', 'a@b.co.', 'a@b.co,c@d.co', 'Name <a@b.co>']) assert.ok(!EMAIL_ADDRESS.test(bad), bad)
})

// ======================================================================================================================
// 5. The whole run
// ======================================================================================================================
await ok('an evening with money still owed: one email goes to the Director, with the right words, from the right sender, once', async () => {
  const w = world(OWED)
  const { result, logs } = await run(w)
  assert.deepEqual(result, { ok: true, sent: true, duplicate: false, test: false, recipients: 1, totalCents: 470000, id: 're-email-1' })
  assert.equal(w.resendCalls().length, 1)
  const call = sentEmail(w)
  assert.equal(call.method, 'POST'); assert.equal(call.url, 'https://api.resend.com/emails')
  assert.equal(call.headers.Authorization, `Bearer ${RESEND_KEY}`); assert.equal(call.headers['Content-Type'], 'application/json')
  assert.equal(call.headers['Idempotency-Key'], 'sns-late-payments-2026-11-24-1731')
  assert.deepEqual(Object.keys(call.payload).sort(), ['from', 'subject', 'text', 'to'])
  assert.equal(call.payload.from, DEFAULT_SENDER); assert.deepEqual(call.payload.to, ['naibei@example.com'])
  const want = buildEmail({ late: LATE, name: 'Naibei', appUrl: 'https://snsjobcard.netlify.app' })
  assert.equal(call.payload.subject, want.subject); assert.equal(call.payload.text, want.text)
  assert.equal(logs.length, 1); assert.match(logs[0], /email sent to 1 address: KSh 4,700 unpaid \(transport KSh 1,200, expenses KSh 3,500\)\. Resend id re-email-1\./)
})
await ok('only what the database says is unpaid is counted: paid, advance-paid, requested and rejected rows are left out', async () => {
  const w = world({
    jobs: [...OWED.jobs, job({ id: 10, member_id: 'm3', transport_amount: 900, transport_paid_at: '2026-11-23T12:00:00Z' }), job({ id: 11, member_id: 'm3', transport_amount: 0 })],
    expenses: [...OWED.expenses, expense({ id: 10, status: 'Paid', amount: 5000, paid_at: '2026-11-23T12:00:00Z' }), expense({ id: 11, status: 'Requested', amount: 6000 }), expense({ id: 12, status: 'Rejected', amount: 7000 }),
      expense({ id: 13, status: 'Approved', amount: 8000 }), expense({ id: 14, status: 'Purchased', amount: 9000, paid_at: '2026-11-22T12:00:00Z' }), expense({ id: 15, status: 'Approved', entry_type: 'service', amount: 400 })],
  })
  const { result } = await run(w)
  assert.equal(result.totalCents, (1200 + 3500 + 400) * 100)
  assert.match(sentEmail(w).payload.text, /- Transport: KSh 1,200 \(2 staff members\)\n- Expenses \/ purchases: KSh 3,900 \(2 requests\)/)
})
await ok('it reads only what it needs, as the server (with the service key), by columns that really exist in the schema, and only the Director lookup when it must send', async () => {
  const w = world(OWED)
  await run(w)
  const paths = w.dbCalls().map((c) => c.url.slice(`${SUPA}/rest/v1/`.length))
  assert.deepEqual(paths, [`${JOBS_PATH}&limit=1000&offset=0`, `${EXPENSES_PATH}&limit=1000&offset=0`, DIRECTOR_PATH])
  assert.ok(JOBS_PATH.includes('transport_paid_at=is.null') && JOBS_PATH.includes('transport_amount=gt.0'))
  assert.ok(EXPENSES_PATH.includes('paid_at=is.null') && EXPENSES_PATH.includes('status=in.(Approved,Purchased)'))
  assert.ok(DIRECTOR_PATH.includes('is_director=eq.true') && DIRECTOR_PATH.includes('role=eq.admin'))
  for (const c of w.dbCalls()) { assert.equal(c.method, 'GET'); assert.equal(c.headers.apikey, SERVICE_KEY); assert.equal(c.headers.Authorization, `Bearer ${SERVICE_KEY}`) }
  assert.ok(COLUMNS.jobs.has('transport_paid_at') && COLUMNS.expenses.has('entry_type') && COLUMNS.profiles.has('is_director') && COLUMNS.non_working_days.has('day'), 'the schema reader works')
  // the stand-in refuses a column that is not in the schema, so a typo anywhere above would have failed the run
  const typo = postgrest({ jobs: [] }, 'jobs?select=id&transport_paidd_at=is.null')
  assert.equal(typo.status, 400)
  assert.match(SCHEMA, /status\s+text not null default 'Requested' check \(status in \('Requested', 'Approved', 'Rejected', 'Purchased', 'Paid'\)\)/)
  assert.match(SCHEMA, /entry_type text not null default 'purchase' check \(entry_type in \('purchase', 'service'\)\)/)
})
await ok('the Resend key goes only to Resend and the database key only to the database', async () => {
  const w = world(OWED)
  await run(w)
  for (const c of w.calls) {
    const sent = JSON.stringify(c.headers) + String(c.body || '')
    if (c.url === RESEND_URL) assert.ok(!sent.includes(SERVICE_KEY), 'the database key went to Resend')
    else assert.ok(!sent.includes(RESEND_KEY), 'the Resend key went to the database')
  }
})
await ok('every call has a time limit of its own, so one slow answer cannot use up the whole run', async () => {
  const w = world(OWED)
  await run(w)
  assert.equal(w.calls.length, 4, 'the jobs, the expenses, the Director, and Resend')
  for (const c of w.calls) assert.ok(c.signal instanceof AbortSignal, c.url)
})
await ok('nothing unpaid: nothing is sent and the Director is not even looked up', async () => {
  const w = world({ jobs: [job({ transport_paid_at: '2026-11-24T09:00:00Z' }), job({ id: 2, transport_amount: 0 })], expenses: [expense({ status: 'Paid' }), expense({ id: 2, status: 'Requested' })] })
  const { result, logs } = await run(w)
  assert.deepEqual(result, { ok: true, sent: false, reason: 'nothing_unpaid' })
  assert.equal(w.resendCalls().length, 0); assert.ok(!w.dbCalls().some((c) => c.url.includes('profiles')))
  assert.deepEqual(logs, ['late-payments-alert: nothing is unpaid, so no email.'])
  assert.equal((await run(world({}))).result.sent, false, 'empty tables')
})
await ok('a public holiday the Director added in the app changes nothing: the email goes out that day like any other, and the holiday list is never read', async () => {
  const w = world({ ...OWED, holidays: [{ day: '2026-11-24', name: 'Test Holiday' }, { day: '2026-12-25', name: 'Christmas Day' }] })
  const { result, logs } = await run(w)
  assert.equal(result.ok, true); assert.equal(result.sent, true); assert.equal(w.resendCalls().length, 1)
  assert.ok(!w.calls.some((c) => c.url.includes('non_working_days')), 'the holiday list is not even asked for')
  assert.ok(!logs.some((line) => /non-working|holiday/i.test(line)), 'and nothing is logged about a holiday')
  assert.equal(sentEmail(w).payload.subject, 'Late payments: KSh 4,700 unpaid after closing')
  // nothing of the old holiday check is left in the code
  assert.equal(lateAlertModule.holidayPath, undefined, 'no holiday lookup is exported any more')
  assert.ok(!read('netlify/lib/lateAlert.mjs').includes('non_working_days'), 'and the table is not mentioned in the code that reads the database')
  assert.ok(!Object.values(result).includes('non_working_day'))
})
await ok('Sundays, Saturdays and every public holiday are sent like any other evening, even when the day is marked in the holiday list; only money still unpaid decides', async () => {
  const days = ['2026-11-29', '2026-11-28', '2026-12-25', '2026-12-12', '2027-01-01', '2027-01-03', '2026-12-27']
  const weekday = (day) => new Date(`${day}T12:00:00+03:00`).getUTCDay()
  assert.ok(days.filter((day) => weekday(day) === 0).length >= 3, 'the list has several Sundays')
  assert.ok(days.some((day) => weekday(day) === 6), 'and a Saturday')
  for (const day of days) {
    const w = world({ ...OWED, holidays: [{ day, name: 'Marked as a holiday' }] })
    const { result } = await run(w, { now: at('17:31', day) })
    assert.equal(result.sent, true, day)
    assert.equal(sentEmail(w).headers['Idempotency-Key'], `sns-late-payments-${day}-1731`, day)
    const nothing = world({ jobs: [], expenses: [], holidays: [{ day, name: 'Marked as a holiday' }] })
    assert.equal((await run(nothing, { now: at('17:31', day) })).result.sent, false, `${day}: nothing unpaid, so nothing is sent`)
  }
})
await ok('the date in the Idempotency-Key is the Nairobi date, even when it is already the next day in UTC', async () => {
  const w = world(OWED)
  await run(w, { now: at('00:20', '2026-11-25') })
  assert.equal(sentEmail(w).headers['Idempotency-Key'], 'sns-late-payments-2026-11-25-0020', '00:20 Nairobi on the 25th is still the 24th in UTC')
  const w2 = world(OWED)
  await run(w2, { now: new Date('2026-11-24T21:30:00Z') })
  assert.equal(sentEmail(w2).headers['Idempotency-Key'], 'sns-late-payments-2026-11-25-0030', '21:30 UTC on the 24th is 00:30 on the 25th in Nairobi')
})
await ok('more than one page of unpaid rows is read page by page and added up', async () => {
  const jobs = Array.from({ length: 2350 }, (_, i) => job({ id: i + 1, member_id: `m${i % 7}`, transport_amount: 100 }))
  const w = world({ jobs, expenses: [] })
  const { result } = await run(w)
  assert.equal(result.totalCents, 2350 * 100 * 100)
  const pages = w.dbCalls().map((c) => c.url).filter((u) => u.includes('/jobs?')).map((u) => /limit=(\d+)&offset=(\d+)/.exec(u).slice(1).join('@'))
  assert.deepEqual(pages, ['1000@0', '1000@1000', '1000@2000'])
  assert.match(sentEmail(w).payload.text, /- Transport: KSh 235,000 \(7 staff members\)/)
  // a table that is exactly one page long needs a second, empty, look
  const exact = world({ jobs: Array.from({ length: 1000 }, (_, i) => job({ id: i + 1 })), expenses: [] })
  await run(exact)
  assert.equal(exact.dbCalls().filter((c) => c.url.includes('/jobs?')).length, 2)
})
await ok('a database hiccup is tried again (three tries in all) and the run still succeeds; a database that stays down stops the run with the reason', async () => {
  for (const [table, trouble] of [['jobs', [503]], ['expenses', [500, 502]], ['profiles', ['network']]]) {
    const w = world({ ...OWED, db: { [table]: trouble } })
    const { result, sleeps } = await run(w)
    assert.equal(result.sent, true, table); assert.deepEqual(sleeps, [1000, 3000].slice(0, trouble.length), table)
  }
  const down = world({ ...OWED, db: { jobs: [503, 503, 503] } })
  await fails(down, {}, /Could not read jobs: the database answered 503\./)
  assert.equal(down.resendCalls().length, 0)
  const away = world({ ...OWED, db: { expenses: ['network', 'network', 'network'] } })
  await fails(away, {}, /Could not read expenses: the database could not be reached\./)
  await fails(world({ ...OWED, db: { jobs: [401] } }), {}, /Could not read jobs: the database answered 401\./)
  const noDirector = world({ ...OWED, db: { profiles: [500, 500, 500] } })
  await fails(noDirector, {}, /Could not look up the Director: the database answered 500\./)
})
await ok('Resend hiccups are tried again with the very same Idempotency-Key, so the Director can never get two emails', async () => {
  for (const trouble of [[500], [429], ['network'], [502, 'network']]) {
    const w = world({ ...OWED, resend: trouble })
    const { result, sleeps } = await run(w)
    assert.equal(result.sent, true, JSON.stringify(trouble)); assert.equal(w.resendCalls().length, trouble.length + 1)
    assert.deepEqual(sleeps, [1000, 3000].slice(0, trouble.length))
    const keys = new Set(w.resendCalls().map((c) => c.headers['Idempotency-Key'])); assert.equal(keys.size, 1)
    assert.equal(new Set(w.resendCalls().map((c) => c.body)).size, 1, 'the same message each time')
  }
})
await ok('Resend that stays down stops the run with the reason after three tries; a refusal (a 4xx) is not tried again and says why', async () => {
  const down = world({ ...OWED, resend: [500, 500, 500] })
  await fails(down, {}, /^The email was not sent\. Resend answered 500: something went wrong$/)
  assert.equal(down.resendCalls().length, 3)
  const offline = world({ ...OWED, resend: ['network', 'network', 'network'] })
  await fails(offline, {}, /^The email was not sent\. Resend could not be reached$/)
  const sandbox = world({ ...OWED, resend: [{ status: 403, body: { name: 'validation_error', message: 'You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain.' } }] })
  await fails(sandbox, {}, /Resend answered 403: You can only send testing emails to your own email address/)
  assert.equal(sandbox.resendCalls().length, 1, 'a refusal will not change by asking again')
  for (const status of [400, 401, 422]) {
    const w = world({ ...OWED, resend: [status]})
    await fails(w, {}, new RegExp(`Resend answered ${status}`)); assert.equal(w.resendCalls().length, 1, String(status))
  }
})
await ok('the same email asked for twice in one minute is sent once: Resend says so (409) and that counts as done', async () => {
  for (const name of ['invalid_idempotent_request', 'concurrent_idempotent_requests']) {
    const w = world({ ...OWED, resend: [{ status: 409, body: { name, message: 'already' } }] })
    const { result, logs } = await run(w)
    assert.equal(result.ok, true); assert.equal(result.sent, false); assert.equal(result.duplicate, true)
    assert.match(logs[0], /this minute's email had already gone out/)
  }
  await fails(world({ ...OWED, resend: [{ status: 409, body: { name: 'something_else', message: 'conflict' } }] }), {}, /Resend answered 409: conflict/)
})
await ok('it will not start without its settings, and says which ones to add', async () => {
  await fails(world(OWED), { env: {} }, /^The late-payment email is not set up\. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY under Netlify -> Project configuration -> Environment variables, then deploy again\.$/)
  await fails(world(OWED), { env: { ...ENV, RESEND_API_KEY: '' } }, /Add RESEND_API_KEY under/)
  const none = world(OWED)
  await fails(none, { env: {} }, /not set up/); assert.equal(none.calls.length, 0, 'nothing is asked of anyone without settings')
  await fails(world(OWED), { env: { ...ENV, ALERT_EMAIL_TO: 'a@x.com, oops' } }, /ALERT_EMAIL_TO has something that is not an email address: oops/)
})
await ok('the Director\'s address comes from the app: lower-cased, first name in the greeting; the Director without an email address stops the run with what to fix', async () => {
  const w = world(OWED)
  await run(w)
  assert.deepEqual(sentEmail(w).payload.to, ['naibei@example.com']); assert.ok(sentEmail(w).payload.text.startsWith('Hello Naibei,'))
  const blank = world({ ...OWED, profiles: [{ ...DIRECTOR, email: '' }, STAFF] })
  await fails(blank, {}, /^The Director has no email address in the app\. Add one to the Director's profile, or set ALERT_EMAIL_TO in Netlify\.$/)
  await fails(world({ ...OWED, profiles: [{ ...DIRECTOR, email: null }] }), {}, /no email address/)
  await fails(world({ ...OWED, profiles: [{ ...DIRECTOR, email: 'not an address' }] }), {}, /no email address/)
  await fails(world({ ...OWED, profiles: [STAFF, ADMIN] }), {}, /no email address/)
  assert.equal(blank.resendCalls().length, 0)
  // a member or another admin is never the one it goes to
  const others = world({ ...OWED, profiles: [{ ...DIRECTOR, is_director: false }, STAFF, { ...DIRECTOR, id: 'd2', role: 'member', email: 'member@example.com' }] })
  await fails(others, {}, /no email address/)
})
await ok('ALERT_EMAIL_TO decides who gets it (no Director lookup, no name in the greeting); two Directors both get it, once each', async () => {
  const w = world(OWED)
  await run(w, { env: { ...ENV, ALERT_EMAIL_TO: 'Owner@Example.com, finance@example.com ; owner@example.com' } })
  assert.deepEqual(sentEmail(w).payload.to, ['Owner@Example.com', 'finance@example.com', 'owner@example.com'])
  assert.ok(sentEmail(w).payload.text.startsWith('Hello,\n')); assert.ok(!w.dbCalls().some((c) => c.url.includes('profiles')))
  const two = world({ ...OWED, profiles: [DIRECTOR, { ...DIRECTOR, id: 'd2', full_name: 'Second Director', email: 'NAIBEI@example.com' }, { ...DIRECTOR, id: 'd3', full_name: 'Third', email: 'third@example.com' }] })
  await run(two)
  assert.deepEqual(sentEmail(two).payload.to, ['naibei@example.com', 'third@example.com']); assert.ok(sentEmail(two).payload.text.startsWith('Hello,\n'), 'no single name to greet')
})
await ok('the sender can be changed with ALERT_EMAIL_FROM', async () => {
  const w = world(OWED)
  await run(w, { env: { ...ENV, ALERT_EMAIL_FROM: 'SNS Job Cards <alerts@swahilinet.example>' } })
  assert.equal(sentEmail(w).payload.from, 'SNS Job Cards <alerts@swahilinet.example>')
})
await ok('before 5:30 pm (someone pressing "Run now") it says it is a test; from 5:30 pm on it is the real thing; each minute has its own Idempotency-Key', async () => {
  const early = world(OWED)
  const { result } = await run(early, { now: at('11:05') })
  assert.equal(result.test, true); assert.ok(sentEmail(early).payload.subject.startsWith('[Test] ')); assert.equal(sentEmail(early).headers['Idempotency-Key'], 'sns-late-payments-2026-11-24-1105')
  for (const [time, test] of [['17:29', true], ['17:30', false], ['17:31', false], ['17:44', false], ['23:59', false]]) {
    const w = world(OWED)
    assert.equal((await run(w, { now: at(time) })).result.test, test, time)
    assert.equal(sentEmail(w).headers['Idempotency-Key'], `sns-late-payments-2026-11-24-${time.replace(':', '')}`)
    assert.equal(sentEmail(w).payload.subject.startsWith('[Test] '), test, time)
  }
  // a second after 17:31:00 is still the same minute
  const w = world(OWED); await run(w, { now: new Date('2026-11-24T14:31:59.900Z') })
  assert.equal(sentEmail(w).headers['Idempotency-Key'], 'sns-late-payments-2026-11-24-1731')
})
await ok('no secret is ever written to a log, a result or an error', async () => {
  const w = world(OWED)
  const { result, logs } = await run(w)
  const everything = JSON.stringify([result, logs])
  for (const secret of [SERVICE_KEY, RESEND_KEY]) assert.ok(!everything.includes(secret), secret)
  // even if Resend repeated the key back in its message
  const echo = world({ ...OWED, resend: [{ status: 401, body: { name: 'restricted_api_key', message: `API key ${RESEND_KEY} is not allowed` } }] })
  const e = await fails(echo, {}, /Resend answered 401/)
  assert.ok(!e.message.includes(RESEND_KEY) && e.message.includes('[key]'))
  assert.ok(!(await fails(world({ ...OWED, db: { jobs: [500, 500, 500] } }), {}, /Could not read jobs/)).message.includes(SERVICE_KEY))
})
await ok('sendEmail on its own: asks Resend for exactly what it was given, and an empty key cannot garble an error', async () => {
  const seen = []
  const fetch = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ id: 'abc-123' }), { status: 200 }) }
  const r = await sendEmail({ key: 're_x', from: 'A <a@x.co>', to: ['b@y.co'], subject: 'S', text: 'T', idempotencyKey: 'k-1', fetch, sleep: async () => {} })
  assert.deepEqual(r, { id: 'abc-123', duplicate: false })
  assert.equal(seen[0].url, RESEND_URL); assert.deepEqual(JSON.parse(seen[0].init.body), { from: 'A <a@x.co>', to: ['b@y.co'], subject: 'S', text: 'T' })
  assert.equal(seen[0].init.headers['Idempotency-Key'], 'k-1')
  const bad = async () => new Response('nope', { status: 400 })
  await assert.rejects(() => sendEmail({ key: '', from: 'a', to: ['b'], subject: 's', text: 't', idempotencyKey: 'k', fetch: bad, sleep: async () => {} }), (e) => e instanceof AlertError && e.message === 'The email was not sent. Resend answered 400')
})

// ======================================================================================================================
// 6. The files around the code
// ======================================================================================================================
const NAMES = ['RESEND_API_KEY', 'ALERT_EMAIL_FROM', 'ALERT_EMAIL_TO', 'ALERT_APP_URL']
const readNames = [...new Set([...read('netlify/lib/alertConfig.mjs').matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]))].sort()
await ok('every setting the email reads is in .env.example (as Netlify-only) and explained in EMAIL-ALERT-SETUP.md', () => {
  for (const name of [...NAMES, 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'URL']) assert.ok(readNames.includes(name), `${name} is read by alertConfig.mjs`)
  const example = read('.env.example'); const guide = read('EMAIL-ALERT-SETUP.md')
  for (const name of NAMES) {
    assert.ok(new RegExp(`^#?\\s*${name}=`, 'm').test(example), `${name} is not in .env.example`)
    assert.ok(guide.includes(name), `${name} is not in EMAIL-ALERT-SETUP.md`)
  }
  assert.ok(/RESEND_API_KEY=[^\n]*\n/.test(example) && /^# RESEND_API_KEY=\s*$/m.test(example), 'the key is only a commented-out example, never a value')
  assert.ok(!/re_[A-Za-z0-9_]{8,}/.test(example + guide), 'no real-looking Resend key')
  assert.ok(!NAMES.some((name) => /^VITE_/.test(name)), 'nothing here may reach the page everyone downloads')
})
await ok('the setup guide shows the very email the code sends, and says when and how it runs', () => {
  const guide = read('EMAIL-ALERT-SETUP.md')
  const subject = /\*\*Subject\*\*\s*```\n([^\n]*)\n```/.exec(guide); const body = /\*\*Message\*\*\s*```\n([\s\S]*?)\n```/.exec(guide)
  assert.ok(subject && body, 'the guide has the subject and the message in code blocks')
  const sample = buildEmail({ late: LATE, name: 'Naibei', appUrl: 'https://snsjobcard.netlify.app' })
  assert.equal(subject[1], sample.subject); assert.equal(body[1] + '\n', sample.text)
  for (const word of ['5:31 pm', '5:30 pm', 'every day of the week', 'Sundays and public holidays are not skipped', 'press **Run now**', 'Resend', 'RESEND_API_KEY', 'Make Director', '14:31',
    'only for counting leave; they do not stop this email']) assert.ok(guide.includes(word), `the guide should mention "${word}"`)
  assert.equal((guide.match(/\*\*Run now\*\*/g) || []).length, 2, 'both places that tell the reader to press Run now still do')
  // the guide no longer promises the old rule anywhere (in any capitals)
  const lower = guide.toLowerCase()
  for (const old of ['monday to saturday', 'not on sundays', 'non-working day', 'no email is sent on those days', 'holidays are skipped', 'sundays are skipped', 'not sent on sundays', 'except sundays', 'weekdays only']) assert.ok(!lower.includes(old), `the guide still says "${old}"`)
})
await ok('nothing else around the code (netlify.toml, .env.example, the function files) still promises the old Monday-to-Saturday rule', () => {
  // The words, with the comment marks and line breaks of a wrapped comment taken out, so "every day of the\n# week" is still found.
  const flat = (f) => read(f).replace(/\s*\n\s*(#|\/\/)?\s*/g, ' ').toLowerCase()
  const OLD = ['monday to saturday', 'monday-saturday', 'mon-sat', 'not on sundays', 'except sundays', 'sundays are skipped', 'holidays are skipped', 'skips sundays', 'weekdays only', 'no email is sent on those days']
  for (const f of ['netlify.toml', '.env.example', 'netlify/functions/late-payments-alert.mjs', 'netlify/lib/lateAlert.mjs', 'netlify/lib/alertConfig.mjs']) {
    for (const old of OLD) assert.ok(!flat(f).includes(old), `${f} still says "${old}"`)
  }
  for (const f of ['netlify.toml', '.env.example']) assert.ok(flat(f).includes('every day of the week'), `${f} should say that the email goes every day of the week`)
})
await ok('the README and the test chain know about it', () => {
  const readme = read('README.md')
  assert.ok(readme.includes('EMAIL-ALERT-SETUP.md') && readme.includes('late-payments-alert') && readme.includes('5:31 pm'), 'README, Update 52')
  assert.match(JSON.parse(read('package.json')).scripts.test, /node scripts\/test-late-payments\.mjs/)
})

console.log(`\n${n} late-payment checks passed`)
