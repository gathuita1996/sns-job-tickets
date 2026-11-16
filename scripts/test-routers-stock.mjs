// Update 46: which retrieved routers count in the stock, and how the remaining routers are worked out.
// The same rule is enforced in the database (supabase/update-46-migration.sql); this file checks the screens' side of it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RETRIEVED_MARK, routerCounts, routerStockState, routerFormEffect, computeStock, routerStockSummary, suggestItemFor, linkEffect, readyRoutersFor } from '../src/lib/stockCore.js'
import { mapRetrievedRouter, retrievedRouterToDbFields, issueRouterArgs } from '../src/lib/mappers.js'
import { TABLES } from '../src/lib/dataCore.js'

let n = 0
const ok = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 } }

// ---- a small shop: the XPON Router starts at 4 (bought 7 + 7, issued 10), as in the real catalogue ----------------
const ONU = 6, XPON = 12, CABLE = 20, TPLINK = 30
const item = (id, itemName, o = {}) => ({ id, itemCode: `ITM-${id}`, itemName, unit: 'Pcs', reorderLevel: 3, isDevice: false, ...o })
const items = [item(ONU, 'Router (ONU)', { isDevice: true }), item(XPON, 'XPON Router', { isDevice: true }), item(CABLE, 'Fibre cable', { unit: 'Metres', reorderLevel: 50 }), item(TPLINK, 'TP Link')]
const sin = (id, itemId, quantity, o = {}) => ({ id, itemId, quantity, invoiceNo: '', ...o })
const sout = (id, itemId, quantity, o = {}) => ({ id, itemId, quantity, issuedTo: '', referenceNo: '', ...o })
const router = (id, o = {}) => ({ id, stockItemId: XPON, condition: 'working', status: 'in_store', routerModel: 'XPON router', serialNumber: `S${id}`, retrievedDate: '2026-10-01', stockInId: null, writeoffStockOutId: null, reissueStockOutId: null, ...o })
const baseIn = [sin(1, XPON, 7), sin(2, XPON, 7), sin(3, CABLE, 100), sin(4, ONU, 5)]
const baseOut = [sout(1, XPON, 10), sout(2, CABLE, 30)]
const stockOf = (id, args) => computeStock({ items, stockIn: baseIn, stockOut: baseOut, routers: [], ...args }).find((r) => r.item.id === id)

// ---- the rule ---------------------------------------------------------------------------------------------------------
ok('only a working router, linked to a router item and in the store, counts', () => {
  assert.equal(routerCounts(router(1)), true)
  assert.equal(routerCounts(router(1, { condition: 'faulty' })), false)
  assert.equal(routerCounts(router(1, { condition: 'damaged' })), false)
  assert.equal(routerCounts(router(1, { status: 'under_repair' })), false)
  assert.equal(routerCounts(router(1, { status: 'reissued' })), false)
  assert.equal(routerCounts(router(1, { status: 'written_off' })), false)
  assert.equal(routerCounts(router(1, { stockItemId: null })), false)
  assert.equal(routerCounts(null), false)
})

ok('every router has a plain-words state that says whether it is counted', () => {
  const key = (o) => routerStockState(router(1, o)).key
  assert.equal(key({}), 'counted')
  assert.equal(key({ condition: 'faulty' }), 'not_working')
  assert.equal(key({ condition: 'damaged' }), 'not_working')
  assert.equal(key({ status: 'under_repair' }), 'under_repair')
  assert.equal(key({ stockItemId: null }), 'unlinked')
  assert.equal(key({ status: 'written_off' }), 'written_off')
  assert.equal(key({ status: 'reissued', reissueStockOutId: 9 }), 'reissued')
  assert.equal(key({ status: 'reissued' }), 'reissued_old')
  assert.equal(routerStockState(router(1)).counted, true)
  assert.equal(routerStockState(router(1)).label, 'Counted in stock')
  assert.equal(routerStockState(router(1, { condition: 'faulty' })).label, 'Not counted: faulty')
  assert.equal(routerStockState(router(1, { condition: 'damaged' })).label, 'Not counted: damaged')
  for (const o of [{ condition: 'faulty' }, { condition: 'damaged' }, { status: 'under_repair' }, { stockItemId: null }, { status: 'written_off' }, { status: 'reissued' }]) assert.equal(routerStockState(router(1, o)).counted, false)
})

ok('a faulty router that is unlinked is "not working", not "not linked" (fixing the fault comes first)', () => {
  assert.equal(routerStockState(router(1, { condition: 'faulty', stockItemId: null })).key, 'not_working')
})

ok('the form says what saving will do to the stock', () => {
  const good = routerFormEffect({ condition: 'working', stockItemId: XPON, itemName: 'XPON Router' })
  assert.equal(good.counted, true); assert.match(good.message, /XPON Router goes up by 1/)
  const bad = routerFormEffect({ condition: 'faulty', stockItemId: XPON, itemName: 'XPON Router' })
  assert.equal(bad.counted, false); assert.match(bad.message, /Not counted .* faulty/)
  assert.equal(routerFormEffect({ condition: 'damaged', stockItemId: XPON }).counted, false)
  const none = routerFormEffect({ condition: 'working', stockItemId: null })
  assert.equal(none.counted, false); assert.match(none.message, /not linked to a router item/)
  assert.equal(routerFormEffect({ condition: 'working', stockItemId: XPON, status: 'under_repair' }).counted, false)
  assert.equal(routerFormEffect({ condition: 'working', stockItemId: XPON, status: 'written_off' }).counted, false)
})

// ---- the figures ------------------------------------------------------------------------------------------------------------
ok('before any retrieved router: 7 + 7 bought, 10 issued, 4 remaining', () => {
  const r = stockOf(XPON)
  assert.deepEqual([r.bought, r.retrieved, r.issued, r.writtenOff, r.remaining, r.currentStock, r.retrievedReady], [14, 0, 10, 0, 4, 4, 0])
  assert.equal(r.status, 'OK')
})

ok('a working retrieved router is added: 4 becomes 5, and it shows as retrieved and ready', () => {
  const routers = [router(1, { stockInId: 50 })]
  const r = stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK })], routers })
  assert.deepEqual([r.bought, r.retrieved, r.remaining, r.retrievedReady], [14, 1, 5, 1])
  assert.equal(r.fromPurchases, 4)
  assert.deepEqual(r.readyRouters.map((x) => x.id), [1])
})

ok('faulty and damaged routers are not counted: the stock stays at 5 and they are listed as not counted', () => {
  const routers = [router(1, { stockInId: 50 }), router(2, { condition: 'faulty' }), router(3, { condition: 'damaged' })]
  const r = stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK })], routers })
  assert.equal(r.remaining, 5)
  assert.deepEqual([r.notCounted.faulty, r.notCounted.damaged, r.notCounted.underRepair, r.notCounted.total], [1, 1, 0, 2])
  assert.equal(r.retrievedReady, 1)
})

ok('the old behaviour (all three counted: 4 + 3 = 7) is gone', () => {
  const routers = [router(1, { stockInId: 50 }), router(2, { condition: 'faulty' }), router(3, { condition: 'damaged' })]
  assert.notEqual(stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK })], routers }).remaining, 7)
})

ok('a repaired router (faulty then working again) is added: 5 becomes 6', () => {
  const routers = [router(1, { stockInId: 50 }), router(2, { stockInId: 51 })]
  const r = stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK }), sin(51, XPON, 1, { invoiceNo: RETRIEVED_MARK })], routers })
  assert.deepEqual([r.retrieved, r.remaining, r.retrievedReady], [2, 6, 2])
})

ok('using a retrieved working router in an installation takes it out again, and it stops showing as ready', () => {
  const routers = [router(1, { stockInId: 50, status: 'reissued', reissueStockOutId: 60 }), router(2, { stockInId: 51 })]
  const r = stockOf(XPON, {
    stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK }), sin(51, XPON, 1, { invoiceNo: RETRIEVED_MARK })],
    stockOut: [...baseOut, sout(60, XPON, 1, { installType: 'new_installation' })], routers })
  assert.deepEqual([r.retrieved, r.issued, r.remaining, r.retrievedReady], [2, 11, 5, 1])
  assert.deepEqual(r.readyRouters.map((x) => x.id), [2])
})

ok('a written-off router is shown as written off, apart from what was issued to customers', () => {
  const routers = [router(1, { stockInId: 50, status: 'written_off', writeoffStockOutId: 61 })]
  const r = stockOf(XPON, {
    stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK })],
    stockOut: [...baseOut, sout(61, XPON, 1, { issuedTo: 'Written off', referenceNo: 'RETRIEVED-1' })], routers })
  assert.deepEqual([r.retrieved, r.issued, r.writtenOff, r.issuedAll, r.remaining, r.retrievedReady], [1, 10, 1, 11, 4, 0])
})

ok('a write-off is also recognised by its wording when the router link is missing', () => {
  const r = stockOf(XPON, { stockOut: [...baseOut, sout(61, XPON, 1, { issuedTo: 'Written off', referenceNo: 'RETRIEVED-9' })] })
  assert.deepEqual([r.issued, r.writtenOff], [10, 1])
})

ok('"ready to use" never claims more than what is left (a plain Stock Out may have taken some)', () => {
  const routers = [router(1, { stockInId: 50 }), router(2, { stockInId: 51 }), router(3, { stockInId: 52 })]
  const r = stockOf(XPON, {
    stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK }), sin(51, XPON, 1, { invoiceNo: RETRIEVED_MARK }), sin(52, XPON, 1, { invoiceNo: RETRIEVED_MARK })],
    stockOut: [...baseOut, sout(70, XPON, 5)], routers })
  assert.equal(r.remaining, 2); assert.equal(r.retrievedReady, 2)
})

ok('the remaining number can reach zero and flags REORDER at or below the reorder level', () => {
  assert.equal(stockOf(XPON, { stockOut: [...baseOut, sout(80, XPON, 4)] }).remaining, 0)
  assert.equal(stockOf(XPON, { stockOut: [...baseOut, sout(80, XPON, 1)] }).status, 'REORDER')    // 3 left, level 3
  assert.equal(stockOf(XPON).status, 'OK')                                                         // 4 left
})

ok('items that are not routers are worked out as before (bought minus issued)', () => {
  const c = stockOf(CABLE)
  assert.deepEqual([c.bought, c.retrieved, c.issued, c.remaining, c.notCounted.total], [100, 0, 30, 70, 0])
  assert.equal(stockOf(TPLINK).remaining, 0)
})

ok('a retrieved Stock In is found by the router that owns it, or by its RETRIEVED mark', () => {
  const byLink = stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: 'whatever' })], routers: [router(1, { stockInId: 50 })] })
  assert.equal(byLink.retrieved, 1)
  const byMark = stockOf(XPON, { stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK })] })
  assert.equal(byMark.retrieved, 1)
})

// ---- the "routers remaining" view ------------------------------------------------------------------------------------------
ok('the routers-remaining summary lists only the router items and adds them up', () => {
  const routers = [router(1, { stockInId: 50 }), router(2, { stockItemId: ONU, stockInId: 51 }), router(3, { condition: 'faulty' }), router(4, { stockItemId: null }), router(5, { stockItemId: null, condition: 'faulty' })]
  const sum = routerStockSummary({ items, stockIn: [...baseIn, sin(50, XPON, 1, { invoiceNo: RETRIEVED_MARK }), sin(51, ONU, 1, { invoiceNo: RETRIEVED_MARK })], stockOut: baseOut, routers })
  assert.deepEqual(sum.rows.map((r) => r.item.itemName), ['Router (ONU)', 'XPON Router'])        // cable and TP Link are not flagged
  assert.equal(sum.rows[0].remaining, 6); assert.equal(sum.rows[1].remaining, 5)
  assert.equal(sum.total.remaining, 11); assert.equal(sum.total.retrievedReady, 2); assert.equal(sum.total.notCounted, 1)
  assert.deepEqual(sum.unlinked.map((r) => r.id), [4])                                         // a working one with no item; the faulty one is not a "link it" case
})

ok('with no router items marked, the summary is empty and says so', () => {
  const sum = routerStockSummary({ items: items.map((i) => ({ ...i, isDevice: false })), stockIn: baseIn, stockOut: baseOut, routers: [] })
  assert.equal(sum.rows.length, 0); assert.equal(sum.total.remaining, 0)
})

// ---- linking old records ----------------------------------------------------------------------------------------------------------
ok('an old record is matched to its router item by name, and only when there is exactly one match', () => {
  const dev = [{ id: ONU, name: 'Router (ONU)' }, { id: XPON, name: 'XPON Router' }]
  assert.equal(suggestItemFor({ routerModel: 'XPON router' }, dev), XPON)
  assert.equal(suggestItemFor({ routerModel: 'ONU' }, dev), ONU)
  assert.equal(suggestItemFor({ routerModel: 'Wi-Fi router' }, dev), null)
  assert.equal(suggestItemFor({ routerModel: 'Other' }, dev), null)
  assert.equal(suggestItemFor({ routerModel: '' }, dev), null)
  assert.equal(suggestItemFor({ routerModel: 'router' }, dev), null)                             // matches both: ambiguous
})

ok('the link pop-up knows how many of each router it will add', () => {
  const dev = [{ id: ONU, name: 'Router (ONU)' }, { id: XPON, name: 'XPON Router' }]
  assert.deepEqual(linkEffect([{ id: 1, stockItemId: XPON }, { id: 2, stockItemId: XPON }, { id: 3, stockItemId: ONU }, { id: 4, stockItemId: null }], dev),
    [{ itemId: ONU, name: 'Router (ONU)', count: 1 }, { itemId: XPON, name: 'XPON Router', count: 2 }])
  assert.deepEqual(linkEffect([{ id: 4, stockItemId: null }], dev), [])
})

ok('ready routers for an item come oldest first, and only the counted ones', () => {
  const routers = [router(1, { retrievedDate: '2026-10-09' }), router(2, { retrievedDate: '2026-10-02' }), router(3, { retrievedDate: '2026-10-01', condition: 'faulty' }), router(4, { stockItemId: ONU, retrievedDate: '2026-09-01' }), router(5, { retrievedDate: '2026-10-02' })]
  assert.deepEqual(readyRoutersFor(routers, XPON).map((r) => r.id), [2, 5, 1])
})

// ---- what is read from and written to the database --------------------------------------------------------------------------------
ok('a router row is read with the links to its stock rows', () => {
  const r = mapRetrievedRouter({ id: 3, retrieved_date: '2026-10-01', customer_name: 'A', router_model: 'ONU', reason: 'other', condition: 'working', status: 'reissued', stock_item_id: 6, stock_in_id: 50, writeoff_stock_out_id: null, reissue_stock_out_id: 60 })
  assert.deepEqual([r.stockItemId, r.stockInId, r.writeoffStockOutId, r.reissueStockOutId], [6, 50, null, 60])
  const bare = mapRetrievedRouter({ id: 3, retrieved_date: '2026-10-01', customer_name: 'A', router_model: 'ONU', reason: 'other', condition: 'working', status: 'in_store' })
  assert.deepEqual([bare.stockItemId, bare.stockInId, bare.writeoffStockOutId, bare.reissueStockOutId], [null, null, null, null])
})

ok('saving the form sends the router item, and can never overwrite the stock links or the status', () => {
  const f = { retrievedDate: '2026-10-01', customerId: '', customerName: ' Amina ', routerModel: 'XPON Router', stockItemId: XPON, serialNumber: ' S1 ', reason: 'other', reasonNotes: '', amountOwed: '', condition: 'faulty', accessories: '', retrievedBy: 'u1',
    status: 'reissued', stockInId: 5, writeoffStockOutId: 6, reissueStockOutId: 7 }
  const db = retrievedRouterToDbFields(f)
  assert.equal(db.stock_item_id, XPON); assert.equal(db.condition, 'faulty'); assert.equal(db.customer_name, 'Amina'); assert.equal(db.serial_number, 'S1')
  for (const k of ['status', 'stock_in_id', 'writeoff_stock_out_id', 'reissue_stock_out_id', 'status_note']) assert.ok(!(k in db), `${k} must not be sent from the form`)
  assert.equal(retrievedRouterToDbFields({ ...f, stockItemId: null }).stock_item_id, null)
})

ok('using a router in an installation sends exactly what the database function wants', () => {
  assert.deepEqual(issueRouterArgs(7, { issueDate: '2026-11-10', installType: 'replacement', customerId: '42', issuedTo: ' Langat ', purpose: '', referenceNo: ' JC-9 ', issuedBy: '' }),
    { p_router: 7, p_issue_date: '2026-11-10', p_install_type: 'replacement', p_customer: 42, p_issued_to: 'Langat', p_purpose: null, p_reference: 'JC-9', p_issued_by: null })
  assert.equal(issueRouterArgs(7, { issueDate: '2026-11-10', installType: 'new_installation', customerId: '' }).p_customer, null)
})

ok('a backup restores the new link between a router and the Stock Out that used it', () => {
  const spec = TABLES.find((t) => t.table === 'retrieved_routers')
  assert.equal(spec.fk.reissue_stock_out_id, 'stock_out'); assert.equal(spec.fk.writeoff_stock_out_id, 'stock_out'); assert.equal(spec.fk.stock_in_id, 'stock_in')
})

// ---- the screens and the database script stay in step ------------------------------------------------------------------------------
const read = (p) => readFileSync(p, 'utf8')
ok('the old, wrong wording is gone from the screens', () => {
  const rr = read('src/components/RetrievedRouters.jsx'), st = read('src/components/StockTab.jsx')
  assert.ok(!/still counted in the stock list/i.test(rr), 'under repair is no longer described as counted')
  assert.ok(!/Also record that in Stock Out/i.test(rr), 'no more "record it twice"')
  assert.ok(!/deviceItems\[0\]/.test(rr), 'the form must not silently pick the first router item')
  assert.ok(!/\bx\.returned\b|\.returned\b|↩/.test(st), 'the old "returned" badge counted faulty routers')
})

ok('the screens call the new database functions', () => {
  const app = read('src/App.jsx')
  assert.ok(app.includes("rpc('issue_retrieved_router'") && app.includes("rpc('undo_router_reissue'"))
})

ok('what the screens send has exactly the names the database functions expect', () => {
  const mig = read('supabase/update-46-migration.sql')
  const params = (fn) => { const m = mig.match(new RegExp(`function public\\.${fn}\\(([^)]*)\\)`)); assert.ok(m, `${fn} is in the migration`); return m[1].split(',').map((x) => x.trim().split(/\s+/)[0]).sort() }
  const sent = Object.keys(issueRouterArgs(1, { issueDate: '2026-01-01', installType: 'new_installation' })).sort()
  assert.deepEqual(sent, params('issue_retrieved_router'))
  assert.deepEqual(params('undo_router_reissue'), ['p_router'])
  assert.ok(read('src/App.jsx').includes("rpc('undo_router_reissue', { p_router: row.id })"))
  assert.equal((mig.match(/create or replace function public\.issue_retrieved_router/g) || []).length, 1, 'one version only, so PostgREST is never asked to choose between two')
})

ok('the database script has the new rule, and the two full scripts are identical', () => {
  const mig = read('supabase/update-46-migration.sql'), rebuild = read('supabase/job-card-rebuild.sql'), schema = read('supabase/schema.sql')
  assert.equal(rebuild, schema, 'job-card-rebuild.sql and schema.sql must be the same file')
  assert.ok(rebuild.includes(mig.trim()), 'the full script ends with update 46')
  for (const w of ['reissue_stock_out_id', 'issue_retrieved_router', 'undo_router_reissue', "new.condition = 'working'", 'retrieved_routers_guard_delete']) assert.ok(mig.includes(w), `${w} is in the migration`)
})

console.log(`routers and stock: ${n} checks ran`)
