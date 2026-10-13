// The browser/database side of export, backup and import. The logic lives in dataCore.js.
import { supabase } from './supabaseClient'
import * as core from './dataCore'

export async function loadExcelJS() {
  const m = await import('exceljs/dist/exceljs.min.js')       // loaded only when a data screen is used
  return m.default || m
}

// A table can hold more than the 1000 rows the database returns per request, so read it in pages.
export async function fetchAll(table, orderBy = 'id') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function collectData() {
  const data = { profiles: await fetchAll('profiles', 'created_at') }
  for (const spec of core.TABLES) data[spec.table] = await fetchAll(spec.table)
  return data
}

export async function makeWorkbookBlob({ includePersonal, exportedBy }) {
  const [ExcelJS, data] = await Promise.all([loadExcelJS(), collectData()])
  const wb = core.buildWorkbook(ExcelJS, data, { includePersonal, exportedBy })
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Chrome / Edge let the person choose the folder; other browsers use the normal download.
// Returns false if the person cancelled, so a cancelled save never counts as a backup.
export async function saveBlob(blob, filename) {
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] })
      const w = await handle.createWritable(); await w.write(blob); await w.close()
      return true
    } catch (e) { if (e && e.name === 'AbortError') return false }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return true
}

export async function exportAll({ kind, includePersonal, exportedBy }) {
  const blob = await makeWorkbookBlob({ includePersonal, exportedBy })
  const saved = await saveBlob(blob, `SNS-${kind === 'backup' ? 'Backup' : 'Export'}-${core.stamp()}.xlsx`)
  if (saved && kind === 'backup') core.markBackup()
  return saved
}

async function readFile(file) {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  return wb
}

export async function inspectBackupFile(file, users) {
  const parsed = core.parseBackup(await readFile(file))
  if (!parsed.isBackup) throw new Error('This is not a backup file made by this system. Use "Back up" to make one.')
  return { parsed, preview: await core.previewRestore({ parsed, users, client: supabase }) }
}
export const restoreFromParsed = (args) => core.runRestore({ ...args, client: supabase })

export async function inspectCustomerFile(file, existingCustomers) {
  const wb = await readFile(file)
  const parsed = core.parseCustomerList(wb)
  if (parsed.error) throw new Error(parsed.error)
  return { ...parsed, ...core.planCustomerImport(parsed.rows, existingCustomers) }
}
export const importCustomers = (args) => core.runCustomerImport({ ...args, client: supabase })

export async function downloadCustomerTemplate() {
  const ExcelJS = await loadExcelJS()
  const buffer = await core.buildCustomerTemplate(ExcelJS).xlsx.writeBuffer()
  return saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'SNS-Customer-Import-Template.xlsx')
}
