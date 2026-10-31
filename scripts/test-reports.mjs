import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { summarizeExpenses, transportReport, buildTransportWorkbook, expenseDate, tripRoute, commissionReport, buildCommissionWorkbook } from '../src/lib/reportsCore.js'
import { getPeriodRange } from '../src/lib/helpers.js'
let n = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++ }, (e) => { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 })
const d = (s) => new Date(`${s}T10:00:00`)
const week = getPeriodRange('week', d('2026-10-14')), month = getPeriodRange('month', d('2026-10-14'))      // Mon 12 - Sun 18 Oct; October
const ex = (id, o) => ({ id, amount: 1000, category: 'Fuel & Transport', status: 'Paid', submittedBy: 'a', purchaseDate: '2026-10-13', createdAt: '2026-10-12T08:00:00', entryType: 'purchase', ...o })
const E = [ex(1), ex(2, { amount: 500, status: 'Purchased', category: 'Airtime & Data', submittedBy: 'b' }), ex(3, { amount: 2000, status: 'Requested', purchaseDate: null, createdAt: '2026-10-15T09:00:00' }),
  ex(4, { amount: 700, status: 'Approved', purchaseDate: '2026-10-20', submittedBy: 'b' }), ex(5, { amount: 9999, status: 'Rejected' }), ex(6, { amount: 300, status: 'Paid', purchaseDate: '2026-09-30' })]
const names = { a: 'Amina', b: 'Brian' }
await ok('an expense counts on its purchase date, or its request date until it is bought', () => { assert.equal(expenseDate(E[0]), '2026-10-13'); assert.equal(expenseDate(E[2]), '2026-10-15T09:00:00') })
await ok('weekly summary: rejected never counts; requested, owing and paid are separated', () => {
  const s = summarizeExpenses(E, week.start, week.end, (id) => names[id])
  assert.equal(s.total, 3500); assert.equal(s.count, 3); assert.deepEqual(s.requested, { count: 1, amount: 2000 }); assert.deepEqual(s.owing, { count: 1, amount: 500 }); assert.deepEqual(s.paid, { count: 1, amount: 1000 }); assert.deepEqual(s.rejected, { count: 1, amount: 9999 })
})
await ok('monthly summary adds the later purchase and leaves out last month', () => { const s = summarizeExpenses(E, month.start, month.end, (id) => names[id]); assert.equal(s.total, 4200); assert.equal(s.count, 4); assert.equal(s.paid.amount, 1000) })
await ok('it says who spent what, biggest first, and by category', () => {
  const s = summarizeExpenses(E, month.start, month.end, (id) => names[id])
  assert.deepEqual(s.byPerson.map((p) => [p.label, p.amount, p.count]), [['Amina', 3000, 2], ['Brian', 1200, 2]]); assert.deepEqual(s.byCategory.map((c) => [c.label, c.amount]), [['Fuel & Transport', 3700], ['Airtime & Data', 500]])
})
await ok('an empty period gives zeros, not errors', () => { const s = summarizeExpenses(E, new Date('2030-01-01'), new Date('2030-02-01')); assert.equal(s.total, 0); assert.deepEqual(s.byPerson, []) })
const users = [{ id: 'a', fullName: 'Amina', department: 'sales' }, { id: 'b', fullName: 'Brian', department: 'technical' }]
const J = (id, o) => ({ id, jobId: `JC-${id}`, memberId: 'a', transportAmount: 500, transportPaidAt: null, createdAt: '2026-10-14T09:00:00', transportFrom: 'Office', transportTo: ['Diani'], ...o })
const jobs = [J(1), J(2, { transportAmount: 300, transportPaidAt: '2026-10-15T00:00:00' }), J(3, { memberId: 'b', transportAmount: 800 }), J(4, { transportAmount: 0 }), J(5, { createdAt: '2026-10-20T09:00:00', transportAmount: 250 }), J(6, { createdAt: '2026-09-02T09:00:00' }), J(7, { memberId: 'zzz', transportAmount: 100 })]
const day = getPeriodRange('day', d('2026-10-14'))
await ok('daily transport report: who spent what, with paid and unpaid, and the total', () => {
  const r = transportReport(jobs, users, day.start, day.end)
  assert.equal(r.total, 1700); assert.equal(r.count, 4); assert.equal(r.paid, 300); assert.equal(r.unpaid, 1400)
  assert.deepEqual(r.rows.map((x) => [x.name, x.total, x.count, x.paid, x.unpaid]), [['Brian', 800, 1, 0, 800], ['Amina', 800, 2, 300, 500], ['Unknown', 100, 1, 0, 100]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
})
await ok('a trip with no transport money is not a trip', () => { const r = transportReport(jobs, users, day.start, day.end); assert.ok(!r.rows.flatMap((x) => x.trips).some((j) => j.id === 4)) })
await ok('monthly transport report adds the other days, with a total per day', () => {
  const r = transportReport(jobs, users, month.start, month.end)
  assert.equal(r.total, 1950); assert.deepEqual(r.byDay.map((x) => [x.date, x.total]), [['2026-10-14', 1700], ['2026-10-20', 250]])
})
await ok('the trips behind each person are in date order, with the route', () => { const r = transportReport(jobs, users, month.start, month.end); const a = r.rows.find((x) => x.name === 'Amina'); assert.deepEqual(a.trips.map((j) => j.id), [1, 2, 5]); assert.equal(tripRoute(jobs[0]), 'Office → Diani'); assert.equal(tripRoute({ transportFrom: '', transportTo: [] }), '— → —') })
await ok('the Excel copy has who-spent-what with a total row, and one line per trip', async () => {
  const r = transportReport(jobs, users, month.start, month.end); const wb = buildTransportWorkbook(ExcelJS, r, { title: 'Monthly transport report', periodLabel: 'October 2026', generatedBy: 'Boss' })
  const s = wb.getWorksheet('Who spent what'); const rows = []; s.eachRow((row) => rows.push(row.values.slice(1)))
  assert.match(rows[0][0], /Monthly transport report/); assert.deepEqual(rows.at(-1).slice(0, 4), ['TOTAL', '', 5, 1950]); assert.equal(wb.getWorksheet('Trips').rowCount, 1 + 5)
  const buf = await wb.xlsx.writeBuffer(); assert.ok(buf.byteLength > 1000)
})

const cu = [{ id: 'a', fullName: 'Amina', department: 'sales' }, { id: 'b', fullName: 'Brian', department: 'technical' }, { id: 'c', fullName: 'Chief Admin', department: 'admin' }]
const C = (id, o) => ({ id, fullName: `Cust ${id}`, location: 'Diani', recordedBy: 'a', createdAt: '2026-10-14T09:00:00', commissionPaidAt: null, commissionExempt: false, ...o })
const cs = [C(1), C(2, { commissionPaidAt: '2026-10-20T00:00:00' }), C(3, { recordedBy: 'b' }), C(4, { commissionExempt: true }), C(5, { recordedBy: 'c' }), C(6, { createdAt: '2026-09-20T09:00:00' }), C(7, { recordedBy: 'zzz' }), C(8, { recordedBy: 'b', createdAt: '2026-10-20T10:00:00' })]
await ok('monthly commission report: who earned what, paid and not yet paid, and the total', () => {
  const r = commissionReport(cs, cu, month.start, month.end, 500)
  assert.deepEqual(r.rows.map((x) => [x.name, x.count, x.earned, x.paid, x.unpaid]), [['Amina', 2, 1000, 500, 500], ['Brian', 2, 1000, 0, 1000]])
  assert.equal(r.total, 2000); assert.equal(r.count, 4); assert.equal(r.paid, 500); assert.equal(r.unpaid, 1500)
})
await ok('imports, admins, unknown recorders and other months never count towards commission', () => {
  const r = commissionReport(cs, cu, month.start, month.end, 500); const ids = r.rows.flatMap((x) => x.customers.map((c) => c.id))
  assert.deepEqual(ids.sort(), [1, 2, 3, 8])
})
await ok('the customers behind each person are in date order, and an empty month gives zeros', () => {
  const r = commissionReport(cs, cu, month.start, month.end, 500); assert.deepEqual(r.rows[1].customers.map((c) => c.id), [3, 8])
  const e = commissionReport(cs, cu, new Date('2030-01-01'), new Date('2030-02-01'), 500); assert.equal(e.total, 0); assert.deepEqual(e.rows, [])
})
await ok('the commission Excel copy has a total row and one line per customer', async () => {
  const r = commissionReport(cs, cu, month.start, month.end, 500); const wb = buildCommissionWorkbook(ExcelJS, r, { periodLabel: 'October 2026', generatedBy: 'Boss' })
  const rows = []; wb.getWorksheet('Who earned what').eachRow((row) => rows.push(row.values.slice(1))); assert.deepEqual(rows.at(-1).slice(0, 4), ['TOTAL', '', 4, 2000]); assert.equal(wb.getWorksheet('Customers').rowCount, 1 + 4)
})
console.log(`report numbers: ${n} checks ran`)
