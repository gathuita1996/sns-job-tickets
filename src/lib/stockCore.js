// Stock arithmetic for routers, kept free of React so it can be tested on its own.
//
// THE RULE (the database enforces the same one, in retrieved_routers_stock_sync):
//   a retrieved router counts in the current stock only when it is linked to a router item in the stock list,
//   is in WORKING condition, and is in the store (status "In store").
//   Faulty and damaged routers never count; neither does one under repair, re-issued or written off.

export const RETRIEVED_MARK = 'RETRIEVED'          // invoice number of the Stock In the database adds for a retrieved router

export function routerCounts(r) {
  return Boolean(r && r.stockItemId) && r.condition === 'working' && r.status === 'in_store'
}

const COND_WORD = { faulty: 'faulty', damaged: 'damaged' }

// What a retrieved router means for the stock list, in words an admin can act on.
export function routerStockState(r) {
  if (r.status === 'written_off') return { key: 'written_off', counted: false, tone: 'muted', label: 'Written off', short: 'Written off', why: 'Thrown away. It is not in the stock.' }
  if (r.status === 'reissued') {
    return r.reissueStockOutId
      ? { key: 'reissued', counted: false, tone: 'info', label: 'Used again', short: 'Used again', why: 'Given out again from the stock list (see Stock Out). It is not in the store any more.' }
      : { key: 'reissued_old', counted: false, tone: 'info', label: 'Used again (older record)', short: 'Used again', why: 'Marked re-issued under the older rules. The stock follows the Stock Out you recorded.' }
  }
  if (r.status === 'under_repair') return { key: 'under_repair', counted: false, tone: 'warning', label: 'Not counted: under repair', short: 'Under repair', why: 'Not counted while it is being repaired. When it works again, press "Repaired: now working" and it is added to the stock.' }
  if (r.condition !== 'working') {
    const w = COND_WORD[r.condition] || r.condition
    return { key: 'not_working', counted: false, tone: 'warning', label: `Not counted: ${w}`, short: w[0].toUpperCase() + w.slice(1), why: `A ${w} router is not counted in the stock. When it is repaired, press "Repaired: now working" and it is added.` }
  }
  if (!r.stockItemId) return { key: 'unlinked', counted: false, tone: 'warning', label: 'Not linked to a stock item', short: 'Not linked', why: 'It is working, but it is not linked to a router item in the stock list, so it is not counted. Link it and it is added.' }
  return { key: 'counted', counted: true, tone: 'success', label: 'Counted in stock', short: 'Ready to reuse', why: 'Working and in the store: it is part of the current stock and can be used in a new installation.' }
}

// The line shown under the form while a router is being recorded or edited.
export function routerFormEffect({ condition, stockItemId, status = 'in_store', itemName = '' }) {
  if (status === 'written_off') return { counted: false, tone: 'muted', message: 'Written off: not counted in the stock.' }
  if (status === 'reissued') return { counted: false, tone: 'info', message: 'Already given out again: not counted in the stock.' }
  if (status === 'under_repair') return { counted: false, tone: 'warning', message: 'Under repair: not counted in the stock until it is working again.' }
  if (condition !== 'working') return { counted: false, tone: 'warning', message: `Not counted in the stock, because it is ${COND_WORD[condition] || condition}. It stays on this list; when it is repaired, mark it as working and it is added.` }
  if (!stockItemId) return { counted: false, tone: 'warning', message: 'Not counted in the stock yet, because it is not linked to a router item in the stock list. Choose the router above.' }
  return { counted: true, tone: 'success', message: `Counts in the stock: ${itemName || 'this router'} goes up by 1 when you save.` }
}

const sum = (rows, f) => rows.reduce((s, x) => s + (Number(f(x)) || 0), 0)

// Stock levels for every item, with the retrieved routers kept apart from the ones bought new:
//   current = bought new + retrieved (working) - issued - written off
export function computeStock({ items = [], stockIn = [], stockOut = [], routers = [] }) {
  const retrievedIn = new Set(routers.map((r) => r.stockInId).filter((x) => x != null))
  const writeOffOut = new Set(routers.map((r) => r.writeoffStockOutId).filter((x) => x != null))
  const isRetrievedIn = (si) => retrievedIn.has(si.id) || si.invoiceNo === RETRIEVED_MARK
  const isWriteOff = (so) => writeOffOut.has(so.id) || (so.issuedTo === 'Written off' && String(so.referenceNo || '').startsWith('RETRIEVED-'))

  const rows = items.map((item) => {
    const ins = stockIn.filter((si) => si.itemId === item.id)
    const outs = stockOut.filter((so) => so.itemId === item.id)
    const bought = sum(ins.filter((si) => !isRetrievedIn(si)), (si) => si.quantity)
    const retrieved = sum(ins.filter(isRetrievedIn), (si) => si.quantity)
    const writtenOff = sum(outs.filter(isWriteOff), (so) => so.quantity)
    const issued = sum(outs.filter((so) => !isWriteOff(so)), (so) => so.quantity)
    const remaining = bought + retrieved - issued - writtenOff
    const mine = routers.filter((r) => r.stockItemId === item.id)
    const ready = mine.filter(routerCounts)
    const retrievedReady = Math.max(0, Math.min(ready.length, remaining))
    const notCounted = {
      faulty: mine.filter((r) => ['in_store', 'under_repair'].includes(r.status) && r.condition === 'faulty').length,
      damaged: mine.filter((r) => ['in_store', 'under_repair'].includes(r.status) && r.condition === 'damaged').length,
      underRepair: mine.filter((r) => r.status === 'under_repair' && r.condition === 'working').length,
    }
    notCounted.total = notCounted.faulty + notCounted.damaged + notCounted.underRepair
    return {
      item, bought, retrieved, issued, writtenOff, remaining, currentStock: remaining,
      issuedAll: issued + writtenOff,                                 // everything that left the store
      retrievedReady, fromPurchases: remaining - retrievedReady, notCounted, readyRouters: ready,
      status: remaining <= item.reorderLevel ? 'REORDER' : 'OK',
    }
  })
  return rows
}

// The "routers remaining" view: only the items marked as router items (Field device), plus the totals.
export function routerStockSummary(args) {
  const rows = computeStock({ ...args, items: (args.items || []).filter((i) => i.isDevice) })
  const routers = args.routers || []
  const total = {
    remaining: sum(rows, (r) => r.remaining), retrievedReady: sum(rows, (r) => r.retrievedReady),
    notCounted: sum(rows, (r) => r.notCounted.total), bought: sum(rows, (r) => r.bought), retrieved: sum(rows, (r) => r.retrieved),
    issued: sum(rows, (r) => r.issued), writtenOff: sum(rows, (r) => r.writtenOff),
  }
  const unlinked = routers.filter((r) => routerStockState(r).key === 'unlinked')
  return { rows, total, unlinked }
}

// ---- matching an old record to a router item by name ---------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
export function suggestItemFor(router, deviceItems) {
  const model = norm(router.routerModel)
  if (!model || model === 'other') return null
  const hits = (deviceItems || []).filter((d) => { const n = norm(d.name || d.itemName); return n && (n === model || n.includes(model) || model.includes(n)) })
  return hits.length === 1 ? hits[0].id : null
}

// How many of each router item would be added if these links were saved.
export function linkEffect(links, deviceItems) {
  const name = Object.fromEntries((deviceItems || []).map((d) => [d.id, d.name || d.itemName]))
  const by = {}
  links.filter((l) => l.stockItemId).forEach((l) => { by[l.stockItemId] = (by[l.stockItemId] || 0) + 1 })
  return Object.entries(by).map(([id, n]) => ({ itemId: Number(id), name: name[id] || 'Router', count: n }))
}

// Counted retrieved routers for one item, oldest first (the one to use first).
export function readyRoutersFor(routers, itemId) {
  return routers.filter((r) => r.stockItemId === itemId && routerCounts(r))
    .sort((a, b) => String(a.retrievedDate).localeCompare(String(b.retrievedDate)) || a.id - b.id)
}
