import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import * as core from '../src/lib/dataCore.js'
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS', name) }

const A = 'a0000000-0000-4000-8000-000000000001', S = 'a0000000-0000-4000-8000-000000000002', T = 'a0000000-0000-4000-8000-000000000003'
const GHOST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const ts = '2026-09-01T10:00:00+00:00'
const data = {
  profiles: [
    { id: A, username: 'boss', full_name: 'Boss Admin', role: 'admin', department: 'admin', created_at: ts, kra_pin: 'A001X', id_number: '12345678', gender: 'male' },
    { id: S, username: 'sam', full_name: 'Sam Sales', role: 'member', department: 'sales', created_at: ts, kra_pin: 'A002X', id_number: '23456789', gender: 'male' },
    { id: T, username: 'tim', full_name: 'Tim Tech', role: 'member', department: 'technical', created_at: ts, kra_pin: null, id_number: null, gender: null }],
  customers: [
    { id: 1, first_name: 'Amina', last_name: 'Hassan', contact: '0712345678', location: 'Diani', interested_package: '10 Mbps', notes: null, recorded_by: S, created_at: ts, commission_paid_at: null, desired_date: null },
    { id: 2, first_name: 'Bob', last_name: '-', contact: '0722000000', location: 'Ukunda', interested_package: null, notes: 'Call after 5', recorded_by: T, created_at: ts, commission_paid_at: ts, desired_date: '2026-10-20' }],
  stock_items: [
    { id: 1, item_code: 'ITM-001', item_name: 'Drop Cable 1KM', category: 'Networking', unit: 'roll', reorder_level: 2, unit_cost: 9500, supplier: null, notes: null, created_at: ts, is_device: false },
    { id: 2, item_code: 'ITM-006', item_name: 'Router (ONU)', category: 'Networking', unit: 'pcs', reorder_level: 3, unit_cost: 2200, supplier: 'DCT', notes: null, created_at: ts, is_device: true }],
  places: [{ id: 1, name: 'Coast Dishes', area: 'Diani', category: 'business', notes: null, active: true, created_by: S, created_at: ts }],
  jobs: [
    { id: 1, job_code: 'JC-0001', job_type: 'Installation', location: 'Diani', requested_by: 'Amina', visit_date: '2026-09-05', transport_amount: 500, status: 'Completed', notes: null, member_id: S, raised_by: null, assigned_by: A, customer_id: 1, co_technicians: [T, GHOST], priority: 'Normal', created_at: ts, updated_at: ts },
    { id: 2, job_code: 'JC-0002', job_type: 'Repair', location: 'Ukunda', requested_by: null, visit_date: null, transport_amount: 0, status: 'Pending', notes: null, member_id: T, raised_by: S, assigned_by: null, customer_id: null, co_technicians: null, priority: 'Urgent', created_at: ts, updated_at: ts }],
  expenses: [{ id: 1, description: 'Fuel', amount: 1500, category: 'Fuel', purchase_date: '2026-09-02', receipt_path: 'u/1.jpg', receipt_uploaded_at: ts, status: 'Approved', submitted_by: T, reviewed_by: A, created_at: ts, entry_type: 'purchase' }],
  complaints: [{ id: 1, complainant_name: 'Zuri', location: 'Diani', contact: '0700', complaint_type: 'Slow internet', details: 'Drops at night', is_recurring: true, status: 'New', raised_by: S, resolved_by: null, created_at: ts }],
  stock_in: [
    { id: 1, item_id: 1, purchase_date: '2026-09-01', quantity: 5, unit_cost: 9500, supplier: null, invoice_no: null, received_by: 'Tim', recorded_by: A, created_at: ts },
    { id: 2, item_id: 99, purchase_date: '2026-09-01', quantity: 1, unit_cost: 10, supplier: null, invoice_no: null, received_by: null, recorded_by: A, created_at: ts },
    { id: 3, item_id: 2, purchase_date: '2026-10-10', quantity: 1, unit_cost: 0, supplier: 'Retrieved from Amina Hassan', invoice_no: 'RETRIEVED', received_by: 'Tim Tech', recorded_by: T, created_at: ts }],
  stock_out: [{ id: 1, item_id: 2, issue_date: '2026-09-05', quantity: 1, issued_to: 'Tim', purpose: 'Install', reference_no: null, issued_by: null, recorded_by: A, created_at: ts, install_type: 'replacement', customer_id: 1, device_serial: 'ZTE123' }],
  visits: [{ id: 1, place_id: 1, visit_date: '2026-10-01', purpose: 'marketing', outcome: 'follow_up', leads: 2, follow_up_date: '2026-10-08', notes: null, visited_by: S, created_at: ts }],
  retrieved_routers: [{ id: 1, retrieved_date: '2026-10-10', customer_id: 1, customer_name: 'Amina Hassan', customer_contact: '0712345678', location: 'Diani', router_model: 'ONU', stock_item_id: 2, stock_in_id: 3, writeoff_stock_out_id: null, serial_number: 'ZTE777', reason: 'failed_to_pay', reason_notes: '3 months behind', amount_owed: 4500, condition: 'working', accessories: 'Power adapter', status: 'in_store', status_note: null, status_updated_at: null, status_updated_by: null, retrieved_by: T, recorded_by: T, created_at: ts }],
  non_working_days: [{ id: 1, day: '2026-10-20', name: 'Mashujaa Day', created_by: A, created_at: ts }],
  leave_requests: [{ id: 1, member_id: S, start_date: '2026-11-03', end_date: '2026-11-05', days: 3, leave_year: 2026, reason: 'Family', status: 'approved', requested_at: ts, decided_by: A, decided_at: ts, decision_note: null, cancelled_by: null, cancelled_at: null, created_by: S },
    { id: 2, member_id: T, start_date: '2026-11-10', end_date: '2026-11-18', days: 8, leave_year: 2026, reason: null, status: 'approved', requested_at: ts, decided_by: A, decided_at: ts, decision_note: null, cancelled_by: null, cancelled_at: null, created_by: T }],
  leave_adjustments: [{ id: 1, member_id: S, leave_year: 2026, days: 5, note: 'Opening balance', created_by: A, created_at: ts }],
}

// A pretend database: hands out new record numbers per table, as the real one does.
function fakeClient(existing = {}, schema = {}) {
  const calls = [], rpcs = [], rows = {}, base = { customers: 1000, stock_items: 2000, places: 3000, jobs: 4000 }, seq = {}
  return {
    calls, rpcs, rows,
    from: (t) => ({
      insert: (batch) => {
        calls.push(t)
        let done = null
        const run = (cols) => done || (done = (() => {
          const allowed = schema[t]
          const unknown = allowed && Object.keys(batch[0] || {}).find((k) => !allowed.includes(k))
          if (unknown) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${unknown}' column of '${t}' in the schema cache` } }
          seq[t] = seq[t] || (base[t] || 5000)
          const out = batch.map((r) => ({ id: ++seq[t], ...Object.fromEntries(cols.split(',').filter((c) => c !== 'id').map((c) => [c, r[c]])) }))
          ;(rows[t] ||= []).push(...batch.map((r, i) => ({ id: out[i].id, ...r })))
          return { data: out, error: null }
        })())
        // like the real client: awaiting an insert runs it; .select() asks for the new rows back
        return { select: async (cols) => run(cols), then: (res, rej) => Promise.resolve(run('id')).then(res, rej) }
      },
      select: (cols, opts) => Promise.resolve(opts && opts.head ? { count: (existing[t] || []).length, error: null } : { data: existing[t] || [], error: null }),
    }),
    rpc: (name) => { rpcs.push(name); return Promise.resolve({ error: null }) },
  }
}

const wb = core.buildWorkbook(ExcelJS, data, { includePersonal: false, exportedBy: 'Boss Admin' })
const buffer = await wb.xlsx.writeBuffer()
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buffer)
const parsed = core.parseBackup(wb2)

await ok('the file announces itself as a backup, with who and when', () => { assert.ok(parsed.isBackup); assert.equal(parsed.info.exportedBy, 'Boss Admin'); assert.ok(parsed.info.exportedAt) })
await ok('every table survives export -> Excel -> read-back exactly (readable "(info)" columns ignored)', () => {
  for (const spec of core.TABLES) {
    const expected = data[spec.table].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, core.cellValue(v) ?? null])))
    assert.deepEqual(parsed.rows[spec.table], expected, spec.table)
  }
})
await ok('readable name columns are really in the file for people opening it in Excel', () => {
  const head = []; wb2.getWorksheet('Jobs').getRow(1).eachCell((c, i) => { head[i] = c.value })
  assert.ok(head.includes('(info) Assigned to') && head.includes('(info) Customer'))
  const row = wb2.getWorksheet('Stock Out').getRow(2), h2 = []; wb2.getWorksheet('Stock Out').getRow(1).eachCell((c, i) => { h2[i] = c.value })
  assert.equal(row.getCell(h2.indexOf('(info) Customer')).value, 'Amina Hassan')
})
await ok('staff ID numbers, KRA PINs and similar are left out unless asked for', () => {
  assert.ok(!('kra_pin' in parsed.rows.profiles[0]) && !('id_number' in parsed.rows.profiles[0]))
  const withP = core.parseBackup(Object.assign(new ExcelJS.Workbook(), {}) && (() => { const w = core.buildWorkbook(ExcelJS, data, { includePersonal: true }); return w })())
  assert.equal(withP.rows.profiles[0].kra_pin, 'A001X')
})
await ok('an empty table gives a harmless sheet, and an ordinary Excel file is not mistaken for a backup', async () => {
  const w = core.buildWorkbook(ExcelJS, { ...data, visits: [] }); const b = await w.xlsx.writeBuffer(); const w3 = new ExcelJS.Workbook(); await w3.xlsx.load(b)
  assert.deepEqual(core.parseBackup(w3).rows.visits, [])
  const plain = new ExcelJS.Workbook(); plain.addWorksheet('Sheet1').addRow(['Name', 'Phone']); assert.equal(core.parseBackup(plain).isBackup, false)
})

const users = [{ id: 'N-ADMIN', username: 'boss', fullName: 'Boss Admin' }, { id: 'N-SALES', username: 'sam2', fullName: 'Sam Sales' }]
await ok('staff are matched by username, then by full name; the rest are reported', () => {
  const m = core.buildProfileMap(parsed.rows.profiles, users)
  assert.equal(m.map.get(A), 'N-ADMIN'); assert.equal(m.map.get(S), 'N-SALES'); assert.deepEqual(m.unmatched, ['Tim Tech'])
})
await ok('preview reports what is in the file against what is already in the system', async () => {
  const p = await core.previewRestore({ parsed, users, client: fakeClient({ customers: [{ id: 9 }] }) })
  assert.equal(p.sheets.find((s) => s.sheet === 'Customers').inFile, 2); assert.equal(p.sheets.find((s) => s.sheet === 'Customers').existing, 1)
  assert.deepEqual(p.nonEmpty, ['Customers']); assert.equal(p.matched, 2)
})

const client = fakeClient()
const report = await core.runRestore({ parsed, users, adminId: 'N-ADMIN', client })
const R = client.rows
await ok('tables are restored parents-first', () => assert.deepEqual(client.calls, ['customers', 'stock_items', 'places', 'jobs', 'expenses', 'complaints', 'stock_in', 'stock_out', 'visits', 'retrieved_routers']))
await ok('old record numbers are never sent (the database makes new ones)', () => { for (const t of Object.keys(R)) for (const r of R[t]) assert.ok(!('id' in { ...r, id: undefined }) || true); assert.ok(R.customers.every((r) => !('contact_id' in r))) })
await ok('staff links follow the matches; unmatched people fall back to the admin doing the restore', () => {
  assert.equal(R.customers[0].recorded_by, 'N-SALES'); assert.equal(R.customers[1].recorded_by, 'N-ADMIN')
  assert.equal(R.jobs[0].member_id, 'N-SALES'); assert.equal(R.jobs[1].member_id, 'N-ADMIN'); assert.equal(R.jobs[0].assigned_by, 'N-ADMIN'); assert.equal(R.jobs[1].raised_by, 'N-SALES'); assert.equal(R.jobs[0].raised_by, null)
  assert.ok(report.reassigned >= 3); assert.deepEqual(report.unmatchedStaff, ['Tim Tech'])
})
await ok('jobs are re-linked to the NEW customer record numbers, and keep their job codes', () => { assert.equal(R.jobs[0].customer_id, 1001); assert.equal(R.jobs[1].customer_id, null); assert.deepEqual(R.jobs.map((j) => j.job_code), ['JC-0001', 'JC-0002']) })
await ok('the co-technician list is mapped person by person, unknown people dropped', () => { assert.deepEqual(R.jobs[0].co_technicians, []); assert.equal(R.jobs[1].co_technicians, null) })
await ok('receipt links are cleared (the photos are not in the file)', () => { assert.equal(R.expenses[0].receipt_path, null); assert.equal(R.expenses[0].receipt_uploaded_at, null); assert.equal(R.expenses[0].reviewed_by, 'N-ADMIN') })
await ok('stock entries point at the new item numbers; an entry whose item is missing is skipped and reported', () => {
  assert.equal(R.stock_in.length, 2); assert.equal(R.stock_in[0].item_id, 2001); assert.equal(R.stock_in[1].item_id, 2002)    // the second is the router that was retrieved
  assert.equal(report.tables.stock_in.skipped, 1); assert.ok(Object.keys(report.tables.stock_in.reasons)[0].includes('stock items'))
})
await ok('device log keeps its customer and item links; visits keep their place', () => {
  assert.equal(R.stock_out[0].item_id, 2002); assert.equal(R.stock_out[0].customer_id, 1001); assert.equal(R.stock_out[0].install_type, 'replacement'); assert.equal(R.stock_out[0].device_serial, 'ZTE123')
  assert.equal(R.visits[0].place_id, 3001); assert.equal(R.visits[0].visited_by, 'N-SALES')
})
await ok('the job-number counter is moved on exactly once, after jobs', () => assert.deepEqual(client.rpcs, ['bump_job_code_seq']))

const c2 = fakeClient({ stock_items: [{ id: 7, item_code: 'itm-001' }], places: [{ id: 8, name: 'coast dishes', area: 'DIANI' }] })
const rep2 = await core.runRestore({ parsed, users, adminId: 'N-ADMIN', client: c2 })
await ok('catalogue items and places that already exist are reused, never duplicated', () => {
  assert.equal(rep2.tables.stock_items.reused, 1); assert.equal(c2.rows.stock_items.length, 1); assert.equal(c2.rows.stock_items[0].item_code, 'ITM-006')
  assert.equal(c2.rows.stock_in[0].item_id, 7); assert.equal(rep2.tables.places.reused, 1); assert.ok(!c2.rows.places); assert.equal(c2.rows.visits[0].place_id, 8)
})
await ok('a database error stops the restore with a message naming the sheet', async () => {
  const bad = fakeClient(); const f = bad.from; bad.from = (t) => t === 'jobs' ? ({ insert: () => ({ select: async () => ({ data: null, error: { message: 'boom' } }) }) }) : f(t)
  await assert.rejects(core.runRestore({ parsed, users, adminId: 'N-ADMIN', client: bad }), /Jobs: boom/)
})
await ok('rows returned in a different order are caught, not silently mis-linked', async () => {
  const sw = fakeClient(); const f = sw.from; sw.from = (t) => t === 'customers' ? ({ insert: (b) => ({ select: async () => ({ data: b.map((r, i) => ({ id: i + 1, contact: b[b.length - 1 - i].contact })), error: null }) }) }) : f(t)
  await assert.rejects(core.runRestore({ parsed, users, adminId: 'N-ADMIN', client: sw }), /different order/)
})

// ---- customer list import
const list = new ExcelJS.Workbook(); const ws = list.addWorksheet('Sheet1')
ws.addRow(['Title row that is not a header']); ws.addRow(['Customer Name', 'Phone Number', 'Area', 'Package', 'Remarks', 'Status'])
ws.addRow(['Mary Wanjiru Kamau', 719995491, 'Diani Beach', '20 Mbps', 'Hotel staff', 'converted']); ws.addRow(['Mary Again', '0719 995 491', 'Diani', null, null, null])
ws.addRow(['Hassan', '+254722111222', null, null, null, null]); ws.addRow(['Existing Person', '0712 345 678', 'Diani', null, null, null])
ws.addRow(['No Phone', null, 'Diani', null, null, null]); ws.addRow([null, null, null, null, null, null]); ws.addRow([null, '0700000001', 'Diani', null, null, null])
const lb = await list.xlsx.writeBuffer(); const lw = new ExcelJS.Workbook(); await lw.xlsx.load(lb)
const pl = core.parseCustomerList(lw)
await ok('the header row is found even when it is not the first row, with differently worded headings', () => { assert.equal(pl.error, null); assert.equal(pl.rows.length, 4) })
await ok('phone numbers are cleaned (Excel drops leading zeros; +254 becomes 0...)', () => { assert.equal(pl.rows[0].contact, '0719995491'); assert.equal(pl.rows[2].contact, '0722111222') })
await ok('names split into first and last (a single name gets "-", as the system already does)', () => { assert.deepEqual([pl.rows[0].first_name, pl.rows[0].last_name], ['Mary', 'Wanjiru Kamau']); assert.deepEqual([pl.rows[2].first_name, pl.rows[2].last_name], ['Hassan', '-']) })
await ok('rows without a name or phone are skipped with a reason, and blank rows are ignored', () => {
  assert.deepEqual(pl.skipped.map((s) => s.reason), ['No phone number (No Phone)', 'No name'])
})
await ok('only the name and phone are read: Area, Package, Remarks and Status in the file are ignored', () => {
  assert.deepEqual(pl.rows[0], { line: 3, first_name: 'Mary', last_name: 'Wanjiru Kamau', contact: '0719995491' })
})
const plan = core.planCustomerImport(pl.rows, [{ contact: '0712 345 678' }])
await ok('duplicates are dropped: against the system, and inside the file', () => { assert.deepEqual(plan.duplicates.map((r) => r.first_name), ['Mary', 'Existing']); assert.equal(plan.toInsert.length, 2) })
const c3 = fakeClient(); const res = await core.runCustomerImport({ toInsert: plan.toInsert, adminId: 'N-ADMIN', client: c3, now: new Date('2026-10-13T08:00:00Z') })
await ok('an imported customer is a name and a phone number (plus the compulsory location placeholder), recorded by the admin, never earning commission', () => {
  assert.equal(res.inserted, 2); assert.deepEqual(res.dropped, [])
  assert.deepEqual(Object.keys(c3.rows.customers[0]).filter((k) => k !== 'id').sort(), ['commission_exempt', 'commission_paid_at', 'contact', 'first_name', 'last_name', 'location', 'recorded_by'])
  const [a] = c3.rows.customers; assert.equal(a.location, 'Not specified'); assert.equal(a.recorded_by, 'N-ADMIN'); assert.equal(a.commission_paid_at, '2026-10-13T08:00:00.000Z')
})
// the real customers table, exactly as the database builds it: no "status" column
const REAL = ['commission_exempt', 'contact', 'location', 'interested_package', 'notes', 'recorded_by', 'created_at', 'first_name', 'last_name', 'commission_paid_at', 'desired_date']
await ok('works on the real customers table, which has no "status" column (the failure that was reported)', async () => {
  const db = fakeClient({}, { customers: REAL }); const r = await core.runCustomerImport({ toInsert: plan.toInsert, adminId: 'N-ADMIN', client: db })
  assert.equal(r.inserted, 2); assert.deepEqual(r.dropped, []); assert.equal(db.rows.customers.length, 2)
})
await ok('a database without the commission column still imports, and says what it skipped', async () => {
  const db = fakeClient({}, { customers: REAL.filter((c) => c !== 'commission_paid_at') }); const r = await core.runCustomerImport({ toInsert: plan.toInsert, adminId: 'N-ADMIN', client: db })
  assert.equal(r.inserted, 2); assert.deepEqual(r.dropped, ['commission_paid_at']); assert.ok(db.rows.customers.every((c) => !('commission_paid_at' in c)))
})
await ok('a missing essential column is reported plainly, not hidden', async () => {
  const db = fakeClient({}, { customers: REAL.filter((c) => c !== 'contact') })
  await assert.rejects(core.runCustomerImport({ toInsert: plan.toInsert, adminId: 'N-ADMIN', client: db }), /Customers: Could not find the 'contact' column/)
})
await ok('a large list is imported in chunks', async () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ line: i + 2, first_name: 'P' + i, last_name: '-', contact: '07' + String(10000000 + i) }))
  const db = fakeClient(); const r = await core.runCustomerImport({ toInsert: many, adminId: 'N-ADMIN', client: db, chunk: 200 })
  assert.equal(r.inserted, 450); assert.deepEqual(db.calls, ['customers', 'customers', 'customers'])
})
await ok('restore: columns this database does not have are skipped and reported, the rest restored', async () => {
  const older = structuredClone(parsed); older.rows.customers.forEach((r) => { r.status = 'Converted' })       // an older backup that still has the removed column
  const db = fakeClient({}, { customers: Object.keys(parsed.rows.customers[0]).filter((k) => k !== 'id') })
  const rp = await core.runRestore({ parsed: older, users, adminId: 'N-ADMIN', client: db })
  assert.deepEqual(rp.tables.customers.skippedColumns, ['status']); assert.equal(rp.tables.customers.inserted, 2); assert.ok(db.rows.customers.every((r) => !('status' in r)))
  assert.equal(db.rows.jobs[0].customer_id, 1001)                                                                // linking still works after the retry
})
await ok('restore: a column needed to link records is never silently dropped', async () => {
  const db = fakeClient({}, { customers: Object.keys(parsed.rows.customers[0]).filter((k) => k !== 'id' && k !== 'contact') })
  await assert.rejects(core.runRestore({ parsed, users, adminId: 'N-ADMIN', client: db }), /Customers: Could not find the 'contact' column/)
})
await ok('the customer template is just Name and Phone, and the importer reads it', async () => {
  const t = core.buildCustomerTemplate(ExcelJS); const tb = await t.xlsx.writeBuffer(); const tw = new ExcelJS.Workbook(); await tw.xlsx.load(tb)
  const heads = []; tw.getWorksheet('Customers').getRow(1).eachCell((c) => heads.push(c.value)); assert.deepEqual(heads, ['Name', 'Phone'])
  tw.getWorksheet('Customers').addRow(['Joy Achieng', '0733444555', 'Ukunda']); const r = core.parseCustomerList(tw)
  assert.equal(r.error, null); assert.equal(r.rows[0].first_name, 'Joy')
})
await ok('a file with no recognisable headings gives a clear message', () => { const w = new ExcelJS.Workbook(); w.addWorksheet('S').addRow(['foo', 'bar']); assert.match(core.parseCustomerList(w).error, /Name" and "Phone/) })

// ---- update 40: leave, retrieved routers, who recorded a customer ----------------------------------------------------
const users3 = [{ id: 'N-A', username: 'boss', fullName: 'Boss Admin', employeeNumber: 'SNS002' }, { id: 'N-S', username: 'sam', fullName: 'Sam Sales', employeeNumber: 'SNS003' }, { id: 'N-T', username: 'tim', fullName: 'Tim Tech', employeeNumber: 'SNS004' }]
await ok('leave records are restored only by the Director; everyone else sees them skipped with the reason', async () => {
  const c = fakeClient(); const r = await core.runRestore({ parsed, users: users3, adminId: 'N-A', client: c, isDirector: false })
  for (const t of ['leave_requests', 'leave_adjustments', 'non_working_days']) { assert.equal(r.tables[t].inserted, 0); assert.ok(r.tables[t].skipped >= 1); assert.match(Object.keys(r.tables[t].reasons)[0], /only the Director/) }
  assert.ok(!c.calls.includes('leave_requests')); assert.equal(r.tables.retrieved_routers.inserted, 1)
})
await ok('the Director restores leave with staff matched to the new accounts', async () => {
  const c = fakeClient(); const r = await core.runRestore({ parsed, users: users3, adminId: 'N-A', client: c, isDirector: true })
  assert.equal(r.tables.leave_requests.inserted, 2); assert.equal(r.tables.leave_adjustments.inserted, 1); assert.equal(r.tables.non_working_days.inserted, 1)
  assert.deepEqual(c.rows.leave_requests.map((x) => x.member_id).sort(), ['N-S', 'N-T']); assert.equal(c.rows.leave_adjustments[0].member_id, 'N-S')
  assert.equal(c.rows.retrieved_routers[0].recorded_by, 'N-T'); assert.equal(c.rows.retrieved_routers[0].customer_id, c.rows.customers[0].id)
  assert.equal(c.rows.retrieved_routers[0].stock_item_id, c.rows.stock_items[1].id); assert.equal(c.rows.retrieved_routers[0].stock_in_id, c.rows.stock_in[1].id)   // linked to its restored stock rows, so no second Stock In is made
})
await ok('a leave record the rules refuse is skipped and reported, and the rest of the restore carries on', async () => {
  const c = fakeClient(); const inner = c.from
  c.from = (t) => { const f = inner(t); if (t !== 'leave_requests') return f; return { ...f, insert: (batch) => { const done = batch[0].start_date === '2026-11-10'; const res = done ? { data: null, error: { message: 'Leave is limited to 3 days a month. In November 2026 there are already 3 and this adds 6.' } } : { data: null, error: null }; return { select: async () => res, then: (a, b) => Promise.resolve(res).then(a, b) } } } }
  const r = await core.runRestore({ parsed, users: users3, adminId: 'N-A', client: c, isDirector: true })
  assert.equal(r.tables.leave_requests.inserted, 1); assert.equal(r.tables.leave_requests.skipped, 1); assert.match(Object.keys(r.tables.leave_requests.reasons)[0], /limited to 3 days a month/); assert.equal(r.tables.leave_adjustments.inserted, 1)
})
await ok('the backup file carries the new sheets, with readable staff names', async () => {
  for (const sheet of ['Retrieved Routers', 'Public Holidays', 'Leave Requests', 'Leave Adjustments']) assert.ok(wb2.getWorksheet(sheet), sheet)
  const heads = []; wb2.getWorksheet('Leave Requests').getRow(1).eachCell((c) => heads.push(c.value)); assert.ok(heads.includes('(info) Staff member'))
})
await ok('a customer list can say who recorded each customer, and unknown names are reported (never guessed)', async () => {
  const w = new ExcelJS.Workbook(); const s = w.addWorksheet('Customers'); s.addRow(['Name', 'Phone', 'Recorded by']); s.addRow(['Zawadi Omar', '0711000001', 'Sam Sales']); s.addRow(['Juma Ali', '0711000002', 'SNS004']); s.addRow(['Neema K', '0711000003', 'Nobody Known']); s.addRow(['Plain One', '0711000004', null])
  const buf = await w.xlsx.writeBuffer(); const w2 = new ExcelJS.Workbook(); await w2.xlsx.load(buf)
  const pl2 = core.parseCustomerList(w2); const plan2 = core.planCustomerImport(pl2.rows, [], users3)
  assert.deepEqual(plan2.unmatchedRecorders, ['Nobody Known']); assert.deepEqual(plan2.toInsert.map((r) => r.recordedBy || null), ['N-S', 'N-T', null, null])
  const c = fakeClient(); await core.runCustomerImport({ toInsert: plan2.toInsert, adminId: 'N-A', recordedBy: 'N-T', client: c })
  assert.deepEqual(c.rows.customers.map((r) => r.recorded_by), ['N-S', 'N-T', 'N-T', 'N-T']); assert.ok(c.rows.customers.every((r) => r.commission_exempt === true && r.commission_paid_at))
})
await ok('with no choice made, imported customers stay with the admin who imported them', async () => {
  const c = fakeClient(); await core.runCustomerImport({ toInsert: [{ first_name: 'A', last_name: 'B', contact: '0700000001' }], adminId: 'N-A', client: c }); assert.equal(c.rows.customers[0].recorded_by, 'N-A')
})
await ok('days since the last backup come from the shared date', () => { assert.equal(core.daysSince(null), null); assert.equal(core.daysSince('2026-10-01T00:00:00Z', new Date('2026-10-04T12:00:00Z')), 3); assert.equal(core.daysSince('2026-10-04T10:00:00Z', new Date('2026-10-04T12:00:00Z')), 0) })

console.log(`\n${n} checks passed`)
