// Report numbers for the Expenses summary and the Transport report. Plain functions, so they can be tested without a screen.
import { isInRange, toDateInputValue } from './helpers.js'

const num = (v) => Number(v) || 0

// An expense counts on the day it was bought, or on the day it was asked for until it is bought.
export const expenseDate = (e) => e.purchaseDate || e.createdAt

// Rejected requests never count as money. Approved and Purchased are money still to be paid out; Paid has left the bank.
export function summarizeExpenses(expenses, start, end, nameOf = () => '') {
  const inPeriod = expenses.filter((e) => isInRange(expenseDate(e), start, end))
  const live = inPeriod.filter((e) => e.status !== 'Rejected')
  const group = (list) => ({ count: list.length, amount: list.reduce((s, e) => s + num(e.amount), 0) })
  const by = (keyOf, labelOf) => {
    const m = new Map()
    for (const e of live) { const k = keyOf(e); const g = m.get(k) || { key: k, label: labelOf(k), count: 0, amount: 0 }; g.count++; g.amount += num(e.amount); m.set(k, g) }
    return [...m.values()].sort((a, b) => b.amount - a.amount || String(a.label).localeCompare(String(b.label)))
  }
  return {
    total: group(live).amount, count: live.length,
    requested: group(live.filter((e) => e.status === 'Requested')),
    owing: group(live.filter((e) => e.status === 'Approved' || e.status === 'Purchased')),
    paid: group(live.filter((e) => e.status === 'Paid')),
    rejected: group(inPeriod.filter((e) => e.status === 'Rejected')),
    byCategory: by((e) => e.category || (e.entryType === 'service' ? 'Service' : 'Other'), (k) => k),
    byPerson: by((e) => e.submittedBy, (k) => nameOf(k) || 'Unknown'),
  }
}

// Transport spent in a period: every job's transport counts on the day the job was filed, paid or not.
export function transportReport(jobs, users, start, end) {
  const trips = jobs.filter((j) => isInRange(j.createdAt, start, end) && num(j.transportAmount) > 0)
  const byId = new Map(users.map((u) => [u.id, u]))
  const people = new Map()
  for (const j of trips) {
    const u = byId.get(j.memberId)
    const r = people.get(j.memberId) || { memberId: j.memberId, name: (u && u.fullName) || 'Unknown', department: (u && u.department) || '', avatarUrl: (u && u.avatarUrl) || '', trips: [], count: 0, total: 0, paid: 0, unpaid: 0 }
    r.trips.push(j); r.count++
    const amount = num(j.transportAmount); r.total += amount
    if (j.transportPaidAt) r.paid += amount; else r.unpaid += amount
    people.set(j.memberId, r)
  }
  const rows = [...people.values()].map((r) => ({ ...r, trips: r.trips.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  const days = new Map()
  for (const j of trips) { const d = toDateInputValue(j.createdAt); const g = days.get(d) || { date: d, total: 0, count: 0 }; g.total += num(j.transportAmount); g.count++; days.set(d, g) }
  return {
    rows, count: trips.length,
    total: rows.reduce((s, r) => s + r.total, 0), paid: rows.reduce((s, r) => s + r.paid, 0), unpaid: rows.reduce((s, r) => s + r.unpaid, 0),
    byDay: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export const tripRoute = (j) => `${j.transportFrom || '—'} → ${(j.transportTo && j.transportTo.length ? j.transportTo : ['—']).join(' → ')}`

// An Excel copy of the transport report: who spent what, and every trip behind it.
export function buildTransportWorkbook(ExcelJS, report, { title = 'Transport report', periodLabel = '', generatedBy = '', generatedAt = new Date() } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'SNS Job Cards'; wb.created = generatedAt
  const head = (ws) => { ws.getRow(ws.rowCount).font = { bold: true }; ws.getRow(ws.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9ECFA' } } }
  const s = wb.addWorksheet('Who spent what')
  s.addRow([`Swahili Net Solution - ${title}`]); s.getRow(1).font = { bold: true, size: 14 }
  s.addRow([periodLabel]); s.addRow([`Prepared ${generatedAt.toISOString().slice(0, 10)}${generatedBy ? ` by ${generatedBy}` : ''}`]); s.addRow([])
  s.addRow(['Staff member', 'Department', 'Trips', 'Amount (KSh)', 'Paid (KSh)', 'Unpaid (KSh)']); head(s)
  for (const r of report.rows) s.addRow([r.name, r.department, r.count, r.total, r.paid, r.unpaid])
  s.addRow(['TOTAL', '', report.count, report.total, report.paid, report.unpaid]); s.getRow(s.rowCount).font = { bold: true }
  ;[30, 16, 8, 16, 14, 14].forEach((w, i) => { s.getColumn(i + 1).width = w })
  const d = wb.addWorksheet('Trips')
  d.addRow(['Date', 'Staff member', 'Job', 'Route', 'Amount (KSh)', 'Paid']); head(d)
  for (const r of report.rows) for (const j of r.trips) d.addRow([toDateInputValue(j.createdAt), r.name, j.jobId || '', tripRoute(j), num(j.transportAmount), j.transportPaidAt ? 'Paid' : 'Unpaid'])
  ;[12, 28, 12, 44, 16, 10].forEach((w, i) => { d.getColumn(i + 1).width = w })
  return wb
}

// Commission earned in a period: every customer a commission-earning staff member recorded then, paid or not. Imported customers never count.
export function commissionReport(customers, users, start, end, rate, departments = ['sales', 'technical']) {
  const byId = new Map(users.map((u) => [u.id, u]))
  const people = new Map()
  const each = num(rate)
  for (const c of customers) {
    if (c.commissionExempt || !isInRange(c.createdAt, start, end)) continue
    const u = byId.get(c.recordedBy)
    if (!u || !departments.includes(u.department)) continue
    const r = people.get(u.id) || { memberId: u.id, name: u.fullName, department: u.department, avatarUrl: u.avatarUrl || '', customers: [], count: 0, earned: 0, paid: 0, unpaid: 0 }
    r.customers.push(c); r.count++; r.earned += each
    if (c.commissionPaidAt) r.paid += each; else r.unpaid += each
    people.set(u.id, r)
  }
  const rows = [...people.values()].map((r) => ({ ...r, customers: r.customers.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) })).sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name))
  return { rows, rate: each, count: rows.reduce((s, r) => s + r.count, 0), total: rows.reduce((s, r) => s + r.earned, 0), paid: rows.reduce((s, r) => s + r.paid, 0), unpaid: rows.reduce((s, r) => s + r.unpaid, 0) }
}

export function buildCommissionWorkbook(ExcelJS, report, { title = 'Monthly commission report', periodLabel = '', generatedBy = '', generatedAt = new Date() } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'SNS Job Cards'; wb.created = generatedAt
  const head = (ws) => { ws.getRow(ws.rowCount).font = { bold: true }; ws.getRow(ws.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9ECFA' } } }
  const s = wb.addWorksheet('Who earned what')
  s.addRow([`Swahili Net Solution - ${title}`]); s.getRow(1).font = { bold: true, size: 14 }
  s.addRow([`${periodLabel} - KSh ${report.rate} for each new customer`]); s.addRow([`Prepared ${generatedAt.toISOString().slice(0, 10)}${generatedBy ? ` by ${generatedBy}` : ''}`]); s.addRow([])
  s.addRow(['Staff member', 'Department', 'Customers', 'Commission (KSh)', 'Paid (KSh)', 'Not yet paid (KSh)']); head(s)
  for (const r of report.rows) s.addRow([r.name, r.department, r.count, r.earned, r.paid, r.unpaid])
  s.addRow(['TOTAL', '', report.count, report.total, report.paid, report.unpaid]); s.getRow(s.rowCount).font = { bold: true }
  ;[30, 16, 11, 18, 14, 18].forEach((w, i) => { s.getColumn(i + 1).width = w })
  const d = wb.addWorksheet('Customers')
  d.addRow(['Date', 'Staff member', 'Customer', 'Location', 'Commission (KSh)', 'Status']); head(d)
  for (const r of report.rows) for (const c of r.customers) d.addRow([toDateInputValue(c.createdAt), r.name, c.fullName, c.location || '', report.rate, c.commissionPaidAt ? `Paid ${toDateInputValue(c.commissionPaidAt)}` : 'Not yet paid'])
  ;[12, 28, 28, 18, 18, 22].forEach((w, i) => { d.getColumn(i + 1).width = w })
  return wb
}
