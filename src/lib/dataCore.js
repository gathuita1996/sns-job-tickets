// Export / backup / import for the job card system.
// Everything here is plain logic (the Excel library and the database client are passed in),
// so it can be tested without a browser or a live database.
import { normalize } from './visitsIntel.js'

export const BACKUP_FILE_TYPE = 'SNS Job Cards backup v1'
export const ABOUT_SHEET = 'About this file'
export const TEAM_SHEET = 'Team'
export const PERSONAL_COLUMNS = ['id_number', 'kra_pin', 'sha_number', 'date_of_birth', 'gender']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// One entry per table. The ORDER is the restore order: parents before the rows that point at them.
//  idMap    : new record numbers are created on restore, so remember old -> new for the rows that point here
//  sig      : a column used to double-check the database returned rows in the order they were sent
//  match    : rows that already exist (catalogue items, places) are reused instead of duplicated
//  profile  : columns holding a staff member; true = may never be empty
//  fk       : columns pointing at another restored table; fkRequired = the row is skipped if the parent is missing
export const TABLES = [
  { table: 'customers', sheet: 'Customers', idMap: true, sig: 'contact', profile: { recorded_by: true } },
  { table: 'stock_items', sheet: 'Stock Items', idMap: true, sig: 'item_code',
    match: { select: 'id,item_code', key: (r) => String(r.item_code || '').trim().toLowerCase() } },
  { table: 'places', sheet: 'Places', idMap: true, sig: 'name', profile: { created_by: true },
    match: { select: 'id,name,area', key: (r) => `${normalize(r.name)}|${normalize(r.area)}` } },
  { table: 'jobs', sheet: 'Jobs', profile: { member_id: true, raised_by: false, assigned_by: false }, fk: { customer_id: 'customers' }, arrays: ['co_technicians'] },
  { table: 'expenses', sheet: 'Expenses', profile: { submitted_by: true, reviewed_by: false }, clear: ['receipt_path', 'receipt_uploaded_at'] },
  { table: 'complaints', sheet: 'Complaints', profile: { raised_by: true, resolved_by: false } },
  { table: 'stock_in', sheet: 'Stock In', profile: { recorded_by: true }, fk: { item_id: 'stock_items' }, fkRequired: ['item_id'] },
  { table: 'stock_out', sheet: 'Stock Out', profile: { recorded_by: true }, fk: { item_id: 'stock_items', customer_id: 'customers' }, fkRequired: ['item_id'] },
  { table: 'visits', sheet: 'Visits', profile: { visited_by: true }, fk: { place_id: 'places' }, fkRequired: ['place_id'] },
  { table: 'retrieved_routers', sheet: 'Retrieved Routers', profile: { recorded_by: true, retrieved_by: false, status_updated_by: false }, fk: { customer_id: 'customers' } },
  // Leave can only be restored by the Director, and a row the leave rules refuse is skipped and reported instead of stopping everything.
  { table: 'non_working_days', sheet: 'Public Holidays', directorOnly: true, profile: { created_by: false }, match: { select: 'id,day', key: (r) => String(r.day) } },
  { table: 'leave_requests', sheet: 'Leave Requests', directorOnly: true, perRow: true, profile: { member_id: true, decided_by: false, cancelled_by: false, created_by: false } },
  { table: 'leave_adjustments', sheet: 'Leave Adjustments', directorOnly: true, profile: { member_id: true, created_by: false } },
]

// ---- cell values -----------------------------------------------------------------------------------
export function cellValue(v) {
  if (v == null) return null
  if (typeof v === 'object') return JSON.stringify(v)       // e.g. the co-technicians list
  return v
}
export function plainValue(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return plainValue(v.result)
    if ('text' in v) return plainValue(v.text)
    if ('error' in v) return null
    return null
  }
  if (typeof v === 'string') { const s = v.trim(); return s === '' ? null : s }
  return v
}
export const stamp = (d = new Date()) => d.toISOString().slice(0, 10)

// ---- building the workbook -----------------------------------------------------------------------------
function makeContext(data) {
  const name = new Map((data.profiles || []).map((p) => [p.id, p.full_name]))
  const cust = new Map((data.customers || []).map((c) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]))
  const item = new Map((data.stock_items || []).map((i) => [i.id, i.item_name]))
  const place = new Map((data.places || []).map((p) => [p.id, p.name]))
  return { name: (id) => (id ? name.get(id) || '' : ''), customer: (id) => (id ? cust.get(id) || '' : ''), item: (id) => item.get(id) || '', place: (id) => place.get(id) || '' }
}
// Readable name columns added next to the raw ones. They are ignored when a file is imported.
const INFO = {
  jobs: (r, c) => ({ '(info) Assigned to': c.name(r.member_id), '(info) Raised by': c.name(r.raised_by), '(info) Customer': c.customer(r.customer_id) }),
  customers: (r, c) => ({ '(info) Recorded by': c.name(r.recorded_by) }),
  expenses: (r, c) => ({ '(info) Submitted by': c.name(r.submitted_by), '(info) Reviewed by': c.name(r.reviewed_by) }),
  complaints: (r, c) => ({ '(info) Raised by': c.name(r.raised_by), '(info) Resolved by': c.name(r.resolved_by) }),
  stock_in: (r, c) => ({ '(info) Item': c.item(r.item_id), '(info) Recorded by': c.name(r.recorded_by) }),
  stock_out: (r, c) => ({ '(info) Item': c.item(r.item_id), '(info) Customer': c.customer(r.customer_id), '(info) Recorded by': c.name(r.recorded_by) }),
  visits: (r, c) => ({ '(info) Place': c.place(r.place_id), '(info) Visited by': c.name(r.visited_by) }),
  retrieved_routers: (r, c) => ({ '(info) Customer': c.customer(r.customer_id), '(info) Recorded by': c.name(r.recorded_by), '(info) Retrieved by': c.name(r.retrieved_by) }),
  leave_requests: (r, c) => ({ '(info) Staff member': c.name(r.member_id), '(info) Decided by': c.name(r.decided_by) }),
  leave_adjustments: (r, c) => ({ '(info) Staff member': c.name(r.member_id) }),
}

function addSheet(wb, sheetName, rows, infoFn, ctx) {
  const ws = wb.addWorksheet(sheetName)
  if (!rows.length) { ws.addRow(['No records yet']); return 0 }
  const withInfo = rows.map((r) => (infoFn ? { ...r, ...infoFn(r, ctx) } : r))
  const cols = []
  for (const r of withInfo) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  ws.addRow(cols)
  for (const r of withInfo) ws.addRow(cols.map((k) => cellValue(r[k])))
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9ECFA' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
  cols.forEach((k, i) => {
    const sample = withInfo.slice(0, 200).map((r) => String(r[k] ?? '').length)
    const col = ws.getColumn(i + 1)
    col.width = Math.min(Math.max(k.length, ...sample) + 2, 42)
    const values = withInfo.map((r) => r[k]).filter((v) => v != null)
    if (values.length && values.every((v) => UUID_RE.test(String(v)))) col.hidden = true   // raw staff ids: the (info) names say who
  })
  return rows.length
}

export function buildWorkbook(ExcelJS, data, { includePersonal = false, exportedBy = '', exportedAt = new Date() } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SNS Job Cards'; wb.created = exportedAt
  const ctx = makeContext(data)
  const about = wb.addWorksheet(ABOUT_SHEET)
  about.getColumn(1).width = 36; about.getColumn(2).width = 46
  about.addRow(['SNS Job Cards - complete data file'])
  about.getRow(1).font = { bold: true, size: 14 }
  about.addRow([])
  about.addRow(['File type', BACKUP_FILE_TYPE])
  about.addRow(['Exported at', exportedAt.toISOString()])
  about.addRow(['Exported by', exportedBy])
  about.addRow(['Staff personal details included', includePersonal ? 'Yes - keep this file safe' : 'No'])
  about.addRow(['Receipt photos', 'Not included (they stay in the system)'])
  about.addRow(['Profile pictures and bank details', 'Not included (staff add them again if the system is ever rebuilt)'])
  about.addRow([])
  about.addRow(['Sheet', 'Records']); about.getRow(about.rowCount).font = { bold: true }
  const profiles = (data.profiles || []).map((p) => (includePersonal ? p : Object.fromEntries(Object.entries(p).filter(([k]) => !PERSONAL_COLUMNS.includes(k)))))
  about.addRow([TEAM_SHEET, addSheet(wb, TEAM_SHEET, profiles)])
  for (const spec of TABLES) about.addRow([spec.sheet, addSheet(wb, spec.sheet, data[spec.table] || [], INFO[spec.table], ctx)])
  return wb
}

// ---- reading it back ---------------------------------------------------------------------------------------
export function sheetRows(ws) {
  if (!ws) return []
  const header = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, i) => { header[i] = String(plainValue(cell.value) ?? '').trim() })
  const out = []
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn === 1) return
    const o = {}; let any = false
    header.forEach((h, i) => {
      if (!h || h.startsWith('(info)')) return
      const v = plainValue(row.getCell(i).value)
      o[h] = v; if (v != null) any = true
    })
    if (any) out.push(o)
  })
  return out
}

export function parseBackup(wb) {
  const info = {}
  let isBackup = false
  const about = wb.getWorksheet(ABOUT_SHEET)
  if (about) about.eachRow((row) => {
    const k = plainValue(row.getCell(1).value), v = plainValue(row.getCell(2).value)
    if (k === 'File type') { info.fileType = v; isBackup = v === BACKUP_FILE_TYPE }
    if (k === 'Exported at') info.exportedAt = v
    if (k === 'Exported by') info.exportedBy = v
  })
  const rows = { profiles: sheetRows(wb.getWorksheet(TEAM_SHEET)) }
  for (const spec of TABLES) rows[spec.table] = sheetRows(wb.getWorksheet(spec.sheet))
  return { isBackup, info, rows }
}

// ---- restore ----------------------------------------------------------------------------------------------------
// Staff accounts cannot be restored from a file (they live in the login system), so each person in the
// file is matched to someone who has signed up again: first by username, then by full name.
export function buildProfileMap(backupProfiles, users) {
  const norm = (s) => String(s || '').trim().toLowerCase()
  const byUser = new Map(), byName = new Map()
  for (const u of users) {
    const full = u.fullName ?? u.full_name
    if (u.username) byUser.set(norm(u.username), u.id)
    if (full) byName.set(norm(full), u.id)
  }
  const map = new Map(), unmatched = []
  for (const p of backupProfiles) {
    const id = byUser.get(norm(p.username)) || byName.get(norm(p.full_name))
    if (id) map.set(p.id, id); else unmatched.push(p.full_name || p.username || String(p.id))
  }
  return { map, unmatched, matched: map.size }
}

export function prepareRow(spec, raw, ctx) {
  const row = {}
  for (const [k, v] of Object.entries(raw)) if (k !== 'id') row[k] = v             // new record numbers are made on restore
  for (const col of spec.arrays || []) {
    if (row[col] == null) continue
    let arr = row[col]
    if (typeof arr === 'string') { try { arr = JSON.parse(arr) } catch { arr = null } }
    row[col] = Array.isArray(arr) ? arr.map((x) => ctx.profileMap.get(x)).filter(Boolean) : null
  }
  for (const [col, required] of Object.entries(spec.profile || {})) {
    let mapped = raw[col] == null ? null : ctx.profileMap.get(raw[col]) || null
    if (mapped == null && required) { mapped = ctx.adminId; ctx.stats.reassigned++ }
    row[col] = mapped
  }
  for (const [col, parent] of Object.entries(spec.fk || {})) {
    if (raw[col] == null) { row[col] = null; continue }
    const mapped = ctx.idMaps[parent] && ctx.idMaps[parent].get(String(raw[col]))
    if (mapped == null) {
      if ((spec.fkRequired || []).includes(col)) return { skip: `its ${parent.replace('_', ' ')} record was not found` }
      row[col] = null
    } else row[col] = mapped
  }
  for (const col of spec.clear || []) if (col in row) row[col] = null
  return { row }
}

// The live database can differ a little from what this program expects. If it says a column does not
// exist, that column is left out for every row and the insert is tried again, instead of failing the
// whole job. Columns listed in `required` are never dropped. Returns { data, error, dropped }.
export async function insertAdaptive(client, table, rows, { select, required = [] } = {}) {
  let current = rows
  const dropped = []
  for (let attempt = 0; attempt < 15; attempt++) {
    const q = client.from(table).insert(current)
    const { data, error } = select ? await q.select(select) : await q
    if (!error) return { data, error: null, dropped }
    const m = /Could not find the '([^']+)' column of '[^']+' in the schema cache/.exec(error.message || '')
    if (!m || required.includes(m[1])) return { data: null, error, dropped }
    const col = m[1]
    dropped.push(col)
    current = current.map(({ [col]: _gone, ...rest }) => rest)
  }
  return { data: null, error: { message: 'Too many columns in the file are missing from this database.' }, dropped }
}
const requiredFor = (spec) => [spec.sig, ...Object.keys(spec.profile || {}), ...Object.keys(spec.fk || {})].filter(Boolean)

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return count || 0
}

export async function previewRestore({ parsed, users, client }) {
  const { unmatched, matched } = buildProfileMap(parsed.rows.profiles || [], users)
  const sheets = [], nonEmpty = []
  for (const spec of TABLES) {
    const inFile = (parsed.rows[spec.table] || []).length
    const existing = await countRows(client, spec.table)
    sheets.push({ sheet: spec.sheet, inFile, existing })
    if (inFile && existing && !spec.match) nonEmpty.push(spec.sheet)
  }
  return { sheets, matched, unmatched, nonEmpty, exportedAt: parsed.info.exportedAt, exportedBy: parsed.info.exportedBy }
}

export async function runRestore({ parsed, users, adminId, client, onProgress = () => {}, chunk = 200, isDirector = false }) {
  const { map: profileMap, unmatched } = buildProfileMap(parsed.rows.profiles || [], users)
  const ctx = { profileMap, adminId, idMaps: {}, stats: { reassigned: 0 } }
  const report = { tables: {}, unmatchedStaff: unmatched, reassigned: 0 }
  for (const spec of TABLES) {
    const raws = parsed.rows[spec.table] || []
    const rep = (report.tables[spec.table] = { sheet: spec.sheet, inserted: 0, reused: 0, skipped: 0, reasons: {}, skippedColumns: [] })
    if (spec.directorOnly && !isDirector && raws.length) { rep.skipped += raws.length; rep.reasons['only the Director can restore leave records and public holidays'] = raws.length; continue }
    if (spec.idMap) ctx.idMaps[spec.table] = new Map()
    if (!raws.length) continue
    onProgress(`Restoring ${spec.sheet}...`)
    const existing = new Map()
    if (spec.match) {
      const { data, error } = await client.from(spec.table).select(spec.match.select)
      if (error) throw new Error(`${spec.sheet}: ${error.message}`)
      for (const r of data || []) existing.set(spec.match.key(r), r.id)
    }
    const todo = []
    for (const raw of raws) {
      const p = prepareRow(spec, raw, ctx)
      if (p.skip) { rep.skipped++; rep.reasons[p.skip] = (rep.reasons[p.skip] || 0) + 1; continue }
      if (spec.match) {
        const key = spec.match.key(p.row)
        if (existing.has(key)) { if (spec.idMap) ctx.idMaps[spec.table].set(String(raw.id), existing.get(key)); rep.reused++; continue }
      }
      todo.push({ raw, row: p.row })
    }
    if (spec.perRow) {
      for (const x of todo) {
        const r = await insertAdaptive(client, spec.table, [x.row], { required: requiredFor(spec) })
        if (r.error) { rep.skipped++; const why = String(r.error.message || 'refused').slice(0, 90); rep.reasons[why] = (rep.reasons[why] || 0) + 1; continue }
        for (const c of r.dropped) if (!rep.skippedColumns.includes(c)) rep.skippedColumns.push(c)
        rep.inserted++
      }
      continue
    }
    for (let i = 0; i < todo.length; i += chunk) {
      const part = todo.slice(i, i + chunk)
      const { data, error, dropped } = await insertAdaptive(client, spec.table, part.map((x) => x.row), { select: spec.sig ? `id,${spec.sig}` : 'id', required: requiredFor(spec) })
      if (error) throw new Error(`${spec.sheet}: ${error.message}`)
      for (const c of dropped) if (!rep.skippedColumns.includes(c)) rep.skippedColumns.push(c)
      if (!data || data.length !== part.length) throw new Error(`${spec.sheet}: the database answered with an unexpected number of rows`)
      part.forEach((x, k) => {
        if (spec.sig && String(data[k][spec.sig]) !== String(x.row[spec.sig])) throw new Error(`${spec.sheet}: records came back in a different order, so the restore was stopped to protect your data`)
        if (spec.idMap) ctx.idMaps[spec.table].set(String(x.raw.id), data[k].id)
      })
      rep.inserted += part.length
    }
    if (spec.table === 'jobs' && rep.inserted) {
      const { error } = await client.rpc('bump_job_code_seq')
      if (error) throw new Error(`Jobs: could not move the job-number counter (${error.message})`)
    }
  }
  report.reassigned = ctx.stats.reassigned
  return report
}

// ---- importing a plain customer list -------------------------------------------------------------------------------
// The customer-list import reads only the name and the phone number. Everything else in the file is
// ignored: location, package and the rest are filled in inside the system afterwards.
const HEADERS = {
  name: ['name', 'fullname', 'customer', 'customername', 'client', 'clientname'],
  first: ['firstname', 'first'], last: ['lastname', 'last', 'surname'],
  recorder: ['recordedby', 'recorder', 'staff', 'staffname', 'member', 'membername', 'assignedto', 'owner', 'salesperson'],
  phone: ['phone', 'phonenumber', 'contact', 'mobile', 'mobilenumber', 'tel', 'telephone', 'msisdn', 'contactnumber'],
}
const canon = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function cleanPhone(v) {
  if (v == null) return ''
  let s = String(v).replace(/[\s\-().]/g, '')
  if (/^\d{9}$/.test(s) && /^[17]/.test(s)) s = '0' + s                    // Excel drops the leading 0 of a number
  if (/^\+?254\d{9}$/.test(s)) s = '0' + s.replace(/^\+?254/, '')
  return s
}
export const phoneKey = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-9) : null }
export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '-' }
}

export function parseCustomerList(wb) {
  const ws = wb.worksheets.find((s) => s.name !== ABOUT_SHEET) || wb.worksheets[0]
  if (!ws) return { rows: [], skipped: [], error: 'The file has no sheets.' }
  let headerRow = 0, map = {}
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
    const found = {}
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, i) => {
      const c = canon(plainValue(cell.value))
      for (const [field, names] of Object.entries(HEADERS)) if (names.includes(c) && !(field in found)) found[field] = i
    })
    if ((found.name || found.first) && found.phone) { headerRow = r; map = found }
  }
  if (!headerRow) return { rows: [], skipped: [], error: 'Could not find the column headings. The first row needs at least "Name" and "Phone".' }
  const rows = [], skipped = []
  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    if (rn <= headerRow) return
    const get = (f) => (map[f] ? plainValue(row.getCell(map[f]).value) : null)
    const nameCell = get('name'), first = get('first'), last = get('last'), phone = cleanPhone(get('phone'))
    if (!nameCell && !first && !phone) return                                        // blank row
    const n = nameCell ? splitName(nameCell) : { first: String(first || ''), last: String(last || '') || '-' }
    if (!n.first) { skipped.push({ line: rn, reason: 'No name' }); return }
    if (!phone) { skipped.push({ line: rn, reason: `No phone number (${nameCell || [n.first, n.last].filter((x) => x && x !== '-').join(' ')})` }); return }
    const recorder = get('recorder')
    rows.push({ line: rn, first_name: n.first, last_name: n.last, contact: phone, ...(recorder ? { recorder: String(recorder).trim() } : {}) })
  })
  return { rows, skipped, error: null }
}

export function planCustomerImport(rows, existingCustomers, users = []) {
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const people = new Map()
  for (const u of users) for (const k of [u.fullName ?? u.full_name, u.username, u.employeeNumber ?? u.employee_number]) if (k) people.set(norm(k), u.id)
  const unmatchedRecorders = new Set()
  const seen = new Set(existingCustomers.map((c) => phoneKey(c.contact)).filter(Boolean))
  const toInsert = [], duplicates = []
  for (const r of rows) {
    const k = phoneKey(r.contact)
    if (k && seen.has(k)) { duplicates.push(r); continue }
    if (k) seen.add(k)
    const who = r.recorder ? people.get(norm(r.recorder)) : null
    if (r.recorder && !who) unmatchedRecorders.add(r.recorder)
    toInsert.push(who ? { ...r, recordedBy: who } : r)
  }
  return { toInsert, duplicates, unmatchedRecorders: [...unmatchedRecorders] }
}

// An imported customer carries only a name and a phone number. The location is compulsory in the
// database, so it is filled with "Not specified" for the team to complete. Commission is marked as
// already settled and flagged as exempt, so an import never earns anyone commission, even after the customer is
// handed to a staff member for tracking.
const CUSTOMER_REQUIRED = ['first_name', 'last_name', 'contact', 'location', 'recorded_by']
export async function runCustomerImport({ toInsert, adminId, recordedBy, client, chunk = 200, now = new Date() }) {
  const settled = now.toISOString()
  const rows = toInsert.map((r) => ({ first_name: r.first_name, last_name: r.last_name, contact: r.contact, location: 'Not specified', recorded_by: r.recordedBy || recordedBy || adminId, commission_paid_at: settled, commission_exempt: true }))
  let inserted = 0
  const dropped = new Set()
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    const r = await insertAdaptive(client, 'customers', part, { required: CUSTOMER_REQUIRED })
    if (r.error) throw new Error(`Customers: ${r.error.message}`)
    r.dropped.forEach((c) => dropped.add(c))
    inserted += part.length
  }
  return { inserted, dropped: [...dropped] }
}

export function buildCustomerTemplate(ExcelJS) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Customers')
  ws.addRow(['Name', 'Phone'])
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9ECFA' } }
  ;[34, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  ws.getColumn(2).numFmt = '@'                         // keep the leading 0 of phone numbers
  const help = wb.addWorksheet('How to fill in')
  ;[['One customer per row, starting on row 2 of the Customers sheet.'],
    ['Only Name and Phone are read. Anything else in the file is ignored: fill in location, package and the rest inside the system afterwards.'],
    ['Phone numbers that already exist in the system are skipped, so importing twice is safe.']].forEach((r) => help.addRow(r))
  help.getColumn(1).width = 100
  return wb
}

// ---- last-backup reminder: the date lives in the database, so every admin sees the same one ------------------
export function daysSince(iso, now = new Date()) { return iso ? Math.max(0, Math.floor((now - new Date(iso)) / 86400000)) : null }
