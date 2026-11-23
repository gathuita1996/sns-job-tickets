// Update 47: who can ask for a purchase (the Expenses feature in the member portal), and that "Log a service" stays admin-only.
// The same rule is enforced in the database (supabase/update-47-migration.sql); this file checks the portal's side of it
// and that the scripts carry the rule.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { canRequestPurchases } from '../src/lib/helpers.js'
import { mapProfile } from '../src/lib/mappers.js'

let n = 0
const ok = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

// a person as the portal holds them (what mapProfile makes of a profiles row)
const person = (o = {}) => mapProfile({ id: 'u1', username: 'x', full_name: 'X', contact: '0700', role: 'member', department: 'technical', is_team_lead: false, ...o })

// ---- who gets "Submit a purchase" and "My Expenses/Purchases" -----------------------------------------------------------
ok('everyone in the Technical department can ask for a purchase', () => {
  assert.equal(canRequestPurchases(person({ department: 'technical' })), true)
  assert.equal(canRequestPurchases(person({ department: 'technical', is_team_lead: true })), true)
})

ok('a member with no department set is Technical (the database default), so they can too', () => {
  assert.equal(canRequestPurchases(person({ department: null })), true)
  assert.equal(canRequestPurchases(person({ department: undefined })), true)
})

ok('a Team Lead still can, in any department', () => {
  assert.equal(canRequestPurchases(person({ department: 'sales', is_team_lead: true })), true)
  assert.equal(canRequestPurchases(person({ department: 'admin', is_team_lead: true })), true)
})

ok('a member of any other department who is not a Team Lead still cannot', () => {
  assert.equal(canRequestPurchases(person({ department: 'sales' })), false)
  assert.equal(canRequestPurchases(person({ department: 'admin' })), false)
})

ok('nobody signed in gets nothing', () => {
  assert.equal(canRequestPurchases(null), false)
  assert.equal(canRequestPurchases(undefined), false)
  assert.equal(canRequestPurchases({}), false)
})

// ---- the member portal offers the purchase cards, and never "Log a service" -----------------------------------------------
ok('the member portal decides with canRequestPurchases and has no service entry at all', () => {
  const src = read('src/components/MemberDashboard.jsx')
  assert.ok(/const canMakePurchases = canRequestPurchases\(currentUser\)/.test(src), 'the cards follow canRequestPurchases')
  assert.ok(!/currentUser\.isTeamLead/.test(src), 'no Team Lead only check is left in the member portal')
  for (const w of ['ServiceForm', 'EntryTypeChoice', 'onAddService', 'Log a service', 'serviceToDbFields']) {
    assert.ok(!src.replace(/\/\/.*$/gm, '').includes(w), `${w} is not in the member portal`)
  }
})

ok('the member portal is given the purchase handler and not the service handler', () => {
  const app = read('src/App.jsx')
  const from = app.indexOf('<MemberDashboard')
  assert.ok(from > 0, 'the member dashboard tag is in App.jsx')
  const tag = app.slice(from, app.indexOf('/>', from) + 2)   // props hold arrow functions, so read up to the tag's own end
  assert.ok(tag.includes('onAddExpense={handleAddExpense}'), 'it gets onAddExpense')
  assert.ok(tag.includes('onAttachReceipt={handleAttachReceipt}') && tag.includes('onDeleteExpense={handleDeleteExpense}'), 'and the rest of the purchase steps')
  assert.ok(!tag.includes('onAddService'), 'it does not get onAddService')
  assert.ok(/expenses=\{expenses\.filter\(/.test(tag), 'and only the signed-in member\'s own expenses')
})

ok('"Log a service" is still an admin-only screen', () => {
  const admin = read('src/components/AdminDashboard.jsx')
  assert.ok(admin.includes("import ServiceFormModal from './ServiceForm'") && admin.includes('onAddService(data)'), 'the admin dashboard still has it')
  const users = ['src/components/MemberDashboard.jsx', 'src/components/ExpenseForm.jsx', 'src/components/ExpensesList.jsx', 'src/components/AttachReceiptModal.jsx', 'src/components/StaffDetail.jsx', 'src/components/TeamList.jsx']
  for (const f of users) assert.ok(!read(f).includes("from './ServiceForm'"), `${f} does not open the service form`)
})

ok('the staff page tells the truth about who can submit purchases', () => {
  const s = read('src/components/StaffDetail.jsx')
  assert.ok(s.includes('Technical members and Team Leads can submit purchases'))
  assert.ok(!/>\s*Team Leads can submit purchases/.test(s), 'the old sentence (Team Leads only) is gone')
})

// ---- the database script ------------------------------------------------------------------------------------------------
ok('the database now lets Technical members file a purchase, and still only admins file a service', () => {
  const mig = read('supabase/update-47-migration.sql')
  const policy = mig.slice(mig.indexOf('create policy "expenses_insert_purchase_member_or_service_admin"'), mig.indexOf('-- The one thing a member does'))
  assert.ok(policy.includes('submitted_by = auth.uid()'), 'always as themselves')
  assert.ok(/entry_type = 'purchase'[\s\S]*public\.is_admin\(\)[\s\S]*\(department = 'technical' or is_team_lead = true\)/.test(policy), 'a purchase: an admin, or someone in Technical or a Team Lead')
  assert.ok(policy.includes("or (entry_type = 'service' and public.is_admin())"), 'a service: admins only')
  const serviceBranch = policy.slice(policy.indexOf("(entry_type = 'service'"))
  assert.ok(!/technical|team_lead/.test(serviceBranch), 'nothing about Technical or Team Leads in the service branch')
})

ok('a member\'s new request is always a plain request, and the receipt step changes nothing else', () => {
  const mig = read('supabase/update-47-migration.sql')
  const policy = mig.slice(mig.indexOf('create policy'), mig.indexOf('-- The one thing a member does'))
  for (const w of ["status = 'Requested'", 'reviewed_by is null', 'reviewed_at is null', 'paid_at is null', 'receipt_path is null', 'receipt_uploaded_at is null', 'admin_notes is null']) assert.ok(policy.includes(w), `${w} is required of a member\'s new request`)
  assert.ok(mig.includes("raise exception 'Amount cannot be changed when attaching a receipt.'"), 'the amount lock is kept')
  assert.ok(mig.includes("raise exception 'Only the receipt can be added to an approved request.'"), 'and everything else is locked too')
  assert.ok(/\(to_jsonb\(new\) - 'status' - 'receipt_path' - 'receipt_uploaded_at' - 'purchase_date'\)/.test(mig), 'only the status, receipt and purchase date may change')
})

ok('it is safe to run twice, and it replaces the old rule instead of adding to it', () => {
  const mig = read('supabase/update-47-migration.sql')
  assert.ok(mig.includes('drop policy if exists "expenses_insert_team_lead_or_service_admin" on public.expenses;'), 'the old rule is dropped, otherwise it would stay beside the new one')
  assert.ok(mig.includes('drop policy if exists "expenses_insert_purchase_member_or_service_admin" on public.expenses;'), 'and the new one is dropped before it is made again')
  assert.equal((mig.match(/create policy/g) || []).length, 1)
  assert.ok(mig.trim().endsWith("notify pgrst, 'reload schema';"))
})

ok('the two full scripts are identical and carry update 47 (later updates follow it)', () => {
  const mig = read('supabase/update-47-migration.sql'), rebuild = read('supabase/job-card-rebuild.sql'), schema = read('supabase/schema.sql')
  assert.equal(rebuild, schema, 'job-card-rebuild.sql and schema.sql must be the same file')
  assert.ok(rebuild.includes(mig), 'the full script carries update 47, byte for byte')
  assert.ok(rebuild.includes('UPDATE 46 -- safe to run more than once') && rebuild.includes('UPDATE 45 -- safe to run more than once'), 'and still has the earlier updates')
})

console.log(`expense access: ${n} checks ran`)
