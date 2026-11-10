import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : [] })
const files = walk('src'); const src = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]))
let n = 0; const ok = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 } }
ok('no way left to edit who recorded a customer', () => {
  for (const word of ['canChangeRecorder', 'onAssignCustomers', 'handleAssignCustomers', 'assign_customers_to_member', 'recordUnder', 'unmatchedRecorders', 'Change who recorded', 'Record these customers under', 'record-under']) {
    const hits = files.filter((f) => src[f].includes(word)); assert.deepEqual(hits, [], `"${word}" is still in ${hits.join(', ')}`)
  }
})
ok('no Imported tag in the customer screens', () => {
  for (const f of ['src/components/CustomersTab.jsx', 'src/components/StaffDetail.jsx', 'src/components/MemberDashboard.jsx', 'src/components/CustomerForm.jsx']) assert.ok(!/imported/i.test(src[f]), `${f} still mentions "imported"`)
})
console.log(`removed features: ${n} checks ran`)
