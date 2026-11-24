// Update 50: a member must complete their profile before they can file a job.
// Plain logic only (no browser, no database): the ONE list of what "complete" means (src/lib/profileComplete.js) -- who is held to
// it, what counts as empty, what the banner and the profile form say -- and the SQL file that carries the same rule to the real
// database (supabase/update-50-migration.sql), checked against that list so the two can never drift apart, and the way the screens
// use it. (The same rule is also run against a real PostgreSQL by the maintainer's database tests; those are not part of the
// shipped app.)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PROFILE_INCOMPLETE_HINT, PROFILE_REQUIRED_MESSAGE, REQUIRED_PROFILE_FIELDS, describeMissing, isBlank, isProfileComplete, isProfileIncompleteError,
  jobFilingGate, missingInForm, missingProfileFields, profileApplies,
} from '../src/lib/profileComplete.js'
import { mapBank, mapProfile } from '../src/lib/mappers.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const section = (text, from, to) => { const a = text.indexOf(from); assert.ok(a >= 0, `missing: ${from}`); const b = to ? text.indexOf(to, a + from.length) : text.length; return text.slice(a, b < 0 ? text.length : b) }

// the thirteen, in the order the database reports them
const KEYS = ['full_name', 'username', 'contact', 'gender', 'date_of_birth', 'id_number', 'kra_pin', 'sha_number', 'avatar', 'bank_name', 'account_number', 'account_name', 'branch']
const AVATAR = 'https://proj.supabase.co/storage/v1/object/public/avatars/u1/avatar-1.jpg'
const completeProfile = (o = {}) => ({
  id: 'u1', role: 'member', department: 'technical', fullName: 'Amina Hassan', username: 'amina', contact: '0712345678', title: '', employeeNumber: '',
  gender: 'Female', dateOfBirth: '1996-03-04', idNumber: '12345678', kraPin: 'A012345678Z', shaNumber: 'SHA-1', avatarUrl: AVATAR, ...o,
})
const completeBank = (o = {}) => ({ bankName: 'Equity Bank', accountNumber: '0123456789', accountName: 'Amina Hassan', branch: 'Ukunda', ...o })
const keysOf = (missing) => missing.map((m) => m.key)
const byKey = (key) => REQUIRED_PROFILE_FIELDS.find((f) => f.key === key)

// ======================================================================================================================
// 1. What "complete" means
// ======================================================================================================================
await ok('the list is the thirteen fields, in one fixed order, and Title and the employee number are not on it', () => {
  assert.deepEqual(REQUIRED_PROFILE_FIELDS.map((f) => f.key), KEYS)
  assert.equal(new Set(REQUIRED_PROFILE_FIELDS.map((f) => f.label)).size, 13, 'every field has its own words')
  assert.equal(new Set(REQUIRED_PROFILE_FIELDS.map((f) => f.field)).size, 13)
  assert.deepEqual(REQUIRED_PROFILE_FIELDS.filter((f) => f.where === 'bank').map((f) => f.key), ['bank_name', 'account_number', 'account_name', 'branch'])
  assert.equal(REQUIRED_PROFILE_FIELDS.filter((f) => f.where === 'profile').length, 9)
  for (const left of ['title', 'employee_number', 'employeeNumber', 'email', 'department']) assert.ok(!REQUIRED_PROFILE_FIELDS.some((f) => f.key === left || f.field === left), `${left} is not required`)
  assert.deepEqual(REQUIRED_PROFILE_FIELDS.map((f) => f.label), [
    'Full name', 'Username', 'Contact number', 'Gender', 'Date of birth', 'National ID number', 'KRA PIN', 'SHA number', 'Profile picture', 'Bank name', 'Account number', 'Account name', 'Branch',
  ])
})

await ok('the error words are the ones asked for', () => {
  assert.equal(PROFILE_REQUIRED_MESSAGE, 'Please update your profile to file this job.')
  assert.equal(PROFILE_INCOMPLETE_HINT, 'profile_incomplete')
  assert.equal(jobFilingGate(completeProfile({ gender: '' }), completeBank()).message, PROFILE_REQUIRED_MESSAGE)
})

await ok('the names the list reads are really in what the app holds for a profile and for bank details', () => {
  const profile = mapProfile({ id: 'u1', username: 'a', full_name: 'A B', contact: '1', role: 'member' })
  const bank = mapBank({ member_id: 'u1' })
  for (const f of REQUIRED_PROFILE_FIELDS) assert.ok(f.field in (f.where === 'bank' ? bank : profile), `${f.key} reads ${f.field}`)
  // and a row from the database turns into exactly the values the list looks at
  const row = { id: 'u1', username: 'amina', full_name: 'Amina Hassan', contact: '0712345678', role: 'member', gender: 'Female', date_of_birth: '1996-03-04', id_number: '1', kra_pin: 'A', sha_number: 'S', avatar_url: AVATAR }
  assert.deepEqual(missingProfileFields(mapProfile(row), mapBank({ member_id: 'u1', bank_name: 'B', account_number: '1234', account_name: 'N', branch: 'X' })), [])
  assert.deepEqual(keysOf(missingProfileFields(mapProfile({ ...row, date_of_birth: null, avatar_url: null }), mapBank({ member_id: 'u1', bank_name: 'B', account_number: '1234' }))), ['date_of_birth', 'avatar', 'account_name', 'branch'])
})

await ok('a member with everything filled in is not held back', () => {
  assert.deepEqual(missingProfileFields(completeProfile(), completeBank()), [])
  assert.equal(isProfileComplete(completeProfile(), completeBank()), true)
  const gate = jobFilingGate(completeProfile(), completeBank())
  assert.deepEqual(gate, { blocked: false, missing: [], message: PROFILE_REQUIRED_MESSAGE })
})

await ok('each field on its own: leaving only that one empty reports exactly that one', () => {
  for (const f of REQUIRED_PROFILE_FIELDS) {
    const profile = completeProfile(), bank = completeBank()
    ;(f.where === 'bank' ? bank : profile)[f.field] = ''
    const missing = missingProfileFields(profile, bank)
    assert.deepEqual(missing, [{ key: f.key, label: f.label }], f.key)
    assert.equal(jobFilingGate(profile, bank).blocked, true, f.key)
    assert.equal(isProfileComplete(profile, bank), false, f.key)
  }
})

await ok('a brand-new member is missing all thirteen, in order; with no bank details at all, the four bank fields are missing', () => {
  const blank = { id: 'u1', role: 'member', fullName: '', username: '', contact: '', gender: '', dateOfBirth: '', idNumber: '', kraPin: '', shaNumber: '', avatarUrl: '' }
  assert.deepEqual(keysOf(missingProfileFields(blank, undefined)), KEYS)
  assert.deepEqual(keysOf(missingProfileFields(blank, null)), KEYS)
  assert.deepEqual(keysOf(missingProfileFields(blank, {})), KEYS)
  assert.deepEqual(keysOf(missingProfileFields(completeProfile(), undefined)), ['bank_name', 'account_number', 'account_name', 'branch'])
  assert.deepEqual(keysOf(missingProfileFields({ id: 'u1', role: 'member' }, undefined)), KEYS, 'values that are not there at all count as empty')
})

await ok('missing fields are reported in the order of the list, whichever way round they were emptied', () => {
  const profile = completeProfile({ shaNumber: '', gender: '', kraPin: '' })
  const bank = completeBank({ branch: '', bankName: '' })
  assert.deepEqual(keysOf(missingProfileFields(profile, bank)), ['gender', 'kra_pin', 'sha_number', 'bank_name', 'branch'])
})

await ok('empty means nothing but spaces, tabs and line breaks (and the database agrees: see below)', () => {
  for (const blank of ['', ' ', '   ', '\t', '\r\n', ' \t\r\n ', null, undefined]) assert.equal(isBlank(blank), true, JSON.stringify(blank))
  for (const real of ['a', ' a ', '0', 0, 'a\nb', ' ', '.', '-']) assert.equal(isBlank(real), false, JSON.stringify(real))
  const profile = completeProfile({ fullName: '   ', username: '\t', contact: '\r\n', idNumber: ' \t ' })
  assert.deepEqual(keysOf(missingProfileFields(profile, completeBank())), ['full_name', 'username', 'contact', 'id_number'])
  assert.deepEqual(keysOf(missingProfileFields(completeProfile(), completeBank({ accountNumber: '  ' }))), ['account_number'])
})

await ok('admins are not held to it: the Director, any admin, and nobody at all', () => {
  const emptyAdmin = { id: 'a1', role: 'admin', isDirector: false, fullName: '', username: 'boss', contact: '' }
  assert.deepEqual(missingProfileFields(emptyAdmin, undefined), [])
  assert.deepEqual(missingProfileFields({ ...emptyAdmin, isDirector: true, title: 'Director' }, null), [])
  assert.equal(jobFilingGate(emptyAdmin, undefined).blocked, false)
  assert.equal(isProfileComplete(emptyAdmin), true)
  assert.deepEqual(missingProfileFields(null, undefined), [])
  assert.deepEqual(missingProfileFields(undefined, undefined), [])
  assert.equal(profileApplies(emptyAdmin), false)
  assert.equal(profileApplies(null), false)
  assert.equal(profileApplies({ role: 'member' }), true)
  for (const department of ['technical', 'sales', 'accounts', undefined]) assert.equal(profileApplies({ role: 'member', department }), true, `${department} members are held to it`)
  assert.equal(profileApplies({ role: 'member', isTeamLead: true }), true, 'a team lead is a member')
})

await ok('while the bank details have not been read, the bank fields are left out instead of being reported empty', () => {
  const profile = completeProfile({ gender: '' })
  assert.deepEqual(keysOf(missingProfileFields(profile, undefined, { bankKnown: false })), ['gender'])
  assert.deepEqual(keysOf(missingProfileFields(profile, undefined, { bankKnown: true })), ['gender', 'bank_name', 'account_number', 'account_name', 'branch'])
  assert.deepEqual(keysOf(missingProfileFields(profile, undefined, {})), ['gender', 'bank_name', 'account_number', 'account_name', 'branch'], 'unknown only when it is said to be')
  assert.equal(isProfileComplete(completeProfile(), undefined, { bankKnown: false }), true)
  assert.equal(jobFilingGate(completeProfile(), undefined, { bankKnown: false }).blocked, false)
  assert.equal(jobFilingGate(completeProfile(), undefined).blocked, true, 'and with no bank details, once they are known, it is blocked')
  assert.equal(jobFilingGate(completeProfile(), completeBank(), { bankKnown: false }).blocked, false)
})

await ok('the short sentence about what is missing', () => {
  const names = (...ks) => ks.map((k) => ({ key: k, label: byKey(k).label }))
  assert.equal(describeMissing([]), '')
  assert.equal(describeMissing(undefined), '')
  assert.equal(describeMissing(names('gender')), 'Gender')
  assert.equal(describeMissing(names('gender', 'kra_pin')), 'Gender and KRA PIN')
  assert.equal(describeMissing(names('gender', 'kra_pin', 'sha_number')), 'Gender, KRA PIN and SHA number')
  assert.equal(describeMissing(names('gender', 'kra_pin', 'sha_number', 'branch')), 'Gender, KRA PIN, SHA number and Branch')
  assert.equal(describeMissing(names('gender', 'kra_pin', 'sha_number', 'branch', 'avatar')), 'Gender, KRA PIN, SHA number and 2 more')
  assert.equal(describeMissing(names(...KEYS)), 'Full name, Username, Contact number and 10 more')
  assert.equal(describeMissing(names(...KEYS), 6), 'Full name, Username, Contact number, Gender, Date of birth and 8 more')
  assert.equal(describeMissing(names('gender', 'kra_pin', 'sha_number', 'branch', 'avatar'), 5), 'Gender, KRA PIN, SHA number, Branch and Profile picture')
})

// ======================================================================================================================
// 2. The profile form's own check
// ======================================================================================================================
const completeForm = (o = {}) => ({
  fullName: 'Amina Hassan', username: 'amina', contact: '0712345678', title: '', gender: 'Female', dateOfBirth: '1996-03-04', idNumber: '12345678', kraPin: 'A012345678Z', shaNumber: 'SHA-1',
  employeeNumber: '', bankName: 'Equity Bank', branch: 'Ukunda', accountNumber: '0123456789', accountName: 'Amina Hassan', ...o,
})

await ok('the form asks for every field except Title and the employee number, with "Required" under each and a note for the picture', () => {
  assert.deepEqual(missingInForm(completeForm(), AVATAR), {})
  const empty = { fullName: '', username: '', contact: '', title: '', gender: '', dateOfBirth: '', idNumber: '', kraPin: '', shaNumber: '', employeeNumber: '', bankName: '', branch: '', accountNumber: '', accountName: '' }
  const all = missingInForm(empty, '')
  assert.deepEqual(Object.keys(all), REQUIRED_PROFILE_FIELDS.map((f) => f.field))
  for (const [field, words] of Object.entries(all)) assert.equal(words, field === 'avatarUrl' ? 'Add a profile picture.' : 'Required', field)
  assert.ok(!('title' in all) && !('employeeNumber' in all))
  assert.deepEqual(Object.keys(missingInForm(completeForm({ title: '', employeeNumber: '' }), AVATAR)), [], 'Title and the employee number may stay empty')
  assert.deepEqual(Object.keys(missingInForm(completeForm(), '')), ['avatarUrl'])
  assert.deepEqual(Object.keys(missingInForm(completeForm(), null)), ['avatarUrl'])
  assert.deepEqual(Object.keys(missingInForm(completeForm({ branch: '', accountName: '' }), AVATAR)), ['accountName', 'branch'].sort((a, b) => REQUIRED_PROFILE_FIELDS.findIndex((f) => f.field === a) - REQUIRED_PROFILE_FIELDS.findIndex((f) => f.field === b)))
  assert.deepEqual(missingInForm(null, AVATAR) && Object.keys(missingInForm(null, AVATAR)).length, 12, 'no form at all: everything but the picture')
})

await ok('the form looks at the trimmed text, because that is what it saves: whatever it lets through is never empty in the database', () => {
  for (const blank of [' ', '   ', '\t', '\r\n', ' ', ' ', '﻿', '   ']) {
    assert.equal(missingInForm(completeForm({ idNumber: blank }), AVATAR).idNumber, 'Required', JSON.stringify(blank))
  }
  assert.deepEqual(missingInForm(completeForm({ idNumber: ' 1234 ' }), AVATAR), {})
  // what the form lets through is also non-empty by the rule the database uses
  for (const text of ['x', ' x ', '0', 'A012345678Z']) { assert.deepEqual(missingInForm(completeForm({ kraPin: text }), AVATAR), {}); assert.equal(isBlank(text.trim()), false) }
  // the picture is only a link we made ourselves, but the same holds
  assert.deepEqual(Object.keys(missingInForm(completeForm(), '   ')), ['avatarUrl'])
})

await ok('the screen\'s list and the form\'s list are the same list, field for field', () => {
  const profile = completeProfile(), bank = completeBank()
  const form = completeForm()
  for (const f of REQUIRED_PROFILE_FIELDS) {
    const source = f.where === 'bank' ? bank : profile
    if (f.field === 'avatarUrl') continue
    assert.equal(source[f.field], form[f.field], `${f.field} is the same value in the form and in the profile`)
  }
})

await ok('a refusal from the database is recognised by its hint or by its words, and nothing else is', () => {
  assert.equal(isProfileIncompleteError({ hint: 'profile_incomplete', message: 'whatever' }), true)
  assert.equal(isProfileIncompleteError({ message: 'Please update your profile to file this job.' }), true)
  assert.equal(isProfileIncompleteError({ message: 'Error: Please update your profile to file this job. (P0001)', code: 'P0001' }), true)
  assert.equal(isProfileIncompleteError({ code: 'P0001', message: 'A site survey must record where it was done.' }), false)
  assert.equal(isProfileIncompleteError({ code: '23505', message: 'duplicate key value' }), false)
  assert.equal(isProfileIncompleteError({ hint: 'something_else' }), false)
  assert.equal(isProfileIncompleteError(null), false)
  assert.equal(isProfileIncompleteError(undefined), false)
  assert.equal(isProfileIncompleteError({}), false)
  assert.equal(isProfileIncompleteError('Please update your profile to file this job.'), false, 'only an error object')
})

// ======================================================================================================================
// 3. The SQL: the same rule in the real database
// ======================================================================================================================
const mig50 = read('supabase/update-50-migration.sql')
const code50 = mig50.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const rebuild = read('supabase/job-card-rebuild.sql')
const schema = read('supabase/schema.sql')

await ok('the database reports the same thirteen fields as the screens, in the same order, from the same columns', () => {
  const body = section(mig50, 'create or replace function public.profile_missing_fields', '$$;')
  const cases = [...body.matchAll(/case when (.+?) then '(\w+)'\s+end/g)].map((m) => ({ condition: m[1].trim(), key: m[2] }))
  assert.deepEqual(cases.map((c) => c.key), REQUIRED_PROFILE_FIELDS.map((f) => f.key))
  for (const { condition, key } of cases) {
    const f = byKey(key)
    const alias = f.where === 'bank' ? 'b' : 'p'
    const column = key === 'avatar' ? 'avatar_url' : key
    if (key === 'date_of_birth') assert.equal(condition, `${alias}.${column} is null`, key)
    else assert.match(condition, new RegExp(`^coalesce\\(${alias}\\.${column}, ''\\)\\s+~ '\\^\\[ \\\\t\\\\r\\\\n\\]\\*\\$'$`), `${key}: ${condition}`)
  }
  // the bank fields come from the bank table, joined on the member; a member with no bank row is missing all four
  assert.match(body, /left join public\.staff_bank_details b on b\.member_id = p\.id/)
  assert.match(body, /from public\.profiles p/)
  assert.match(body, /where p\.id = p_user/)
  assert.match(body, /array_remove\(array\[[\s\S]*\], null\)/)
})

await ok('"empty" in the database is the same as "empty" on the screens, character for character', () => {
  const sqlLiteral = mig50.match(/~ '(\^\[ \\t\\r\\n\]\*\$)'/)
  assert.ok(sqlLiteral, 'the blank test is in the file')
  const sqlBlank = new RegExp(sqlLiteral[1])                                  // PostgreSQL reads \t \r \n in a regular expression just as JavaScript does
  const samples = ['', ' ', '   ', '\t', '\r', '\n', '\r\n', ' \t\r\n ', 'a', ' a', 'a ', 'a\n', '\na', 'a\nb', '0', '.', ' ', ' ', '﻿', '​', '   ', '\v', '\f', '\u0085', ' ']
  for (const s of samples) assert.equal(sqlBlank.test(s), isBlank(s), `database and screens agree about ${JSON.stringify(s)}`)
  // and the screens' trimming is written with the same four characters
  assert.match(read('src/lib/profileComplete.js'), /replace\(\/\^\[ \\t\\r\\n\]\+\|\[ \\t\\r\\n\]\+\$\/g, ''\)/)
})

await ok('the database says what the screens say: the same words and the same hint', () => {
  const guard = section(mig50, 'create or replace function public.require_complete_profile', '$$;')
  assert.ok(guard.includes(`raise exception '${PROFILE_REQUIRED_MESSAGE}'`))
  assert.ok(guard.includes(`hint = '${PROFILE_INCOMPLETE_HINT}'`))
  assert.match(guard, /detail = 'Still empty: ' \|\| coalesce\(array_to_string\(missing, ', '\), 'the whole profile'\)/)
})

await ok('the guard stops a member\'s NEW job when the profile is not complete, and nobody else', () => {
  const guard = section(mig50, 'create or replace function public.require_complete_profile', '$$;')
  assert.match(guard, /security definer set search_path = public/)
  assert.match(guard, /me uuid := auth\.uid\(\)/)
  assert.match(guard, /if me is null or public\.is_admin\(\) then return new; end if;/)         // the server's own key, the SQL editor and admins pass
  assert.match(guard, /missing := public\.profile_missing_fields\(me\)/)
  assert.match(guard, /if missing is null or coalesce\(array_length\(missing, 1\), 0\) > 0 then/)  // no profile row at all is also "not complete"
  assert.match(mig50, /drop trigger if exists trg_require_complete_profile on public\.jobs;\s*create trigger trg_require_complete_profile before insert on public\.jobs\s+for each row execute function public\.require_complete_profile\(\);/)
  assert.ok(!/before (insert or update|update)/i.test(code50), 'only a new job is held back: editing, completing or deleting one that exists is not')
  assert.ok(!/after insert/i.test(code50))
})

await ok('the two functions are the database\'s own business', () => {
  assert.match(mig50, /revoke all on function public\.profile_missing_fields\(uuid\) from public, anon, authenticated;/)
  assert.match(mig50, /grant execute on function public\.profile_missing_fields\(uuid\) to service_role;/)
  assert.match(mig50, /revoke all on function public\.require_complete_profile\(\) from public, anon, authenticated;/)
  assert.match(mig50, /notify pgrst, 'reload schema';/)
  assert.ok(!/grant execute on function public\.require_complete_profile/.test(mig50), 'the trigger function is never granted to anyone')
})

await ok('it is safe to run again and changes nobody\'s profile: only functions, one trigger and permissions', () => {
  assert.ok(!/\b(insert\s+into|delete\s+from|update\s+public\.|alter\s+table|drop\s+table|drop\s+column|create\s+table|truncate|create\s+policy|drop\s+policy)\b/i.test(code50))
  assert.equal((code50.match(/create or replace function/g) || []).length, 2)
  assert.equal((code50.match(/create trigger/g) || []).length, 1)
  assert.equal((code50.match(/drop trigger if exists/g) || []).length, 1)
  assert.ok(!/^\s*update\s/im.test(code50), 'no UPDATE statement anywhere')
})

await ok('the full set-up scripts are one file that ends with this update and still carries the ones before it', () => {
  assert.equal(rebuild, schema)
  assert.ok(rebuild.endsWith(mig50), 'the full script ends with update 50')
  assert.equal(rebuild.split(mig50).length - 1, 1, 'and carries it once')
  assert.ok(rebuild.includes(read('supabase/update-49-migration.sql')), 'and carries update 49')
  assert.ok(rebuild.includes(read('supabase/update-48-migration.sql')), 'and carries update 48')
  assert.ok(rebuild.indexOf('create or replace function public.require_complete_profile') > rebuild.indexOf('create table if not exists public.staff_bank_details'), 'after the tables it reads')
  assert.ok(rebuild.indexOf('create or replace function public.require_complete_profile') > rebuild.indexOf('create or replace function public.is_admin'), 'after is_admin()')
})

await ok('a new job meets the profile check before the site-survey check (triggers run in name order)', () => {
  const gps = rebuild.match(/create trigger (trg_\w+) before insert on public\.jobs/g) || []
  const names = gps.map((s) => s.split(' ')[2])
  assert.ok(names.includes('trg_require_complete_profile') && names.includes('trg_require_site_survey_gps'), names.join())
  assert.ok('trg_require_complete_profile' < 'trg_require_site_survey_gps')
})

// ======================================================================================================================
// 4. The screens carry it
// ======================================================================================================================
await ok('the member\'s dashboard shows the banner first and lets the job form ask the same question', () => {
  const dash = read('src/components/MemberDashboard.jsx')
  assert.match(dash, /import ProfileBanner from '\.\/ProfileBanner'/)
  assert.match(dash, /import \{ jobFilingGate \} from '\.\.\/lib\/profileComplete'/)
  assert.match(dash, /jobFilingGate\(currentUser, headerExtras\.bank, \{ bankKnown: headerExtras\.bankKnown !== false \}\)/)
  const main = dash.indexOf('<main')
  assert.ok(dash.indexOf('<ProfileBanner missing={profileGate.missing} onOpen={openProfile} />') > main, 'the banner is on the page')
  assert.ok(dash.indexOf('<ProfileBanner') < dash.indexOf('stats.overdue > 0 &&'), 'above the overdue notice')
  assert.match(dash, /openProfile = \(\) => setProfileRequest\(\{ tab: 'profile', n: Date\.now\(\) \}\)/)
  assert.match(dash, /profileGate=\{profileGate\}\s+onOpenProfile=\{openProfile\}/)
  assert.match(dash, /if \(result && result\.profileIncomplete\) return result/)
})

await ok('the job form holds back only a NEW job filed by a member, asks first, and keeps what was typed', () => {
  const form = read('src/components/JobForm.jsx')
  assert.match(form, /const holdsForProfile = !initialJob && !adminMode/)
  assert.ok(form.indexOf("if (holdsForProfile && profileGate && profileGate.blocked) { setProfileNotice('form'); return }") < form.indexOf('if (!validate()) return'), 'the profile is asked before the other fields')
  assert.match(form, /import \{ PROFILE_REQUIRED_MESSAGE, describeMissing \} from '\.\.\/lib\/profileComplete'/)
  assert.match(form, /<p className="sns-profile-notice-title">\{PROFILE_REQUIRED_MESSAGE\}<\/p>/)
  assert.match(form, /Everything you typed here is kept\./)
  assert.match(form, /if \(result && result\.profileIncomplete\) setProfileNotice\('database'\)/)
  assert.ok(!/onSave\(/.test(section(form, "setProfileNotice('form'); return }", 'if (!validate()) return')), 'nothing is sent when the profile is not complete')
})

await ok('the profile window opens above the job form, and asks a member for every field', () => {
  const header = read('src/components/Header.jsx')
  assert.ok(header.indexOf('</header>') < header.indexOf('<ProfileFormModal'), 'the profile window is not inside the header\'s own layer')
  assert.match(header, /layer=\{55\}/)
  assert.match(header, /if \(saved !== false\) setOpenTab\(null\)/)
  const pf = read('src/components/ProfileForm.jsx')
  assert.match(pf, /layer = 50/)
  assert.match(pf, /zIndex: layer/)
  assert.match(pf, /const requireAll = Boolean\(isSelf\) && profile\.role !== 'admin'/)
  assert.match(pf, /import \{ missingInForm \} from '\.\.\/lib\/profileComplete'/)
  assert.match(pf, /requireAll \? 'Account name' : 'Account name \(optional\)'/)
  assert.match(pf, /requireAll \? 'Branch' : 'Branch \(optional\)'/)
  assert.match(read('src/components/AdminDashboard.jsx'), /if \(saved !== false\) setEditingMember\(null\)/)
  const layers = [...read('src/components/shared.jsx').matchAll(/zIndex: (\d+)/g)].map((m) => Number(m[1]))
  assert.ok(Math.max(...layers) >= 60 && 55 < 60 && 55 > 50, 'above the job form (50), below toasts and confirmations (60)')
})

await ok('the app tells the screens what the database said, and saves the profile before it shows it', () => {
  const app = read('src/App.jsx')
  const add = section(app, 'async function handleAddJob(formData)', 'async function handleAssignJob')
  assert.match(add, /if \(isProfileIncompleteError\(error\)\)/)
  assert.match(add, /return \{ ok: false, profileIncomplete: true \}/)
  assert.match(add, /return \{ ok: true \}/)
  const cust = section(app, 'async function handleAddCustomer', 'async function handleUpdateCustomer')
  assert.match(cust, /else if \(isProfileIncompleteError\(jobError\)\)/)
  assert.match(cust, /The follow-up job was not scheduled because your profile is not complete/)
  const upd = section(app, 'async function handleUpdateProfile', 'async function handleDeleteJob')
  const showStart = upd.indexOf('if (bankMap) { setBankDetails(bankMap)')
  const showEnd = upd.indexOf("if (currentUserRef.current.role === 'admin') await refreshUsers()")
  assert.ok(upd.indexOf('await fetchBank()') < showStart && showStart > 0 && showEnd > showStart && !/await/.test(upd.slice(showStart, showEnd)),
    'both are read first, then the bank details and the profile are shown together (nothing awaited in between)')
  assert.equal((upd.match(/return false/g) || []).length, 2, 'both ways of failing tell the window to stay open')
  assert.match(upd, /return true/)
  assert.match(app, /bank: bankDetails\[currentUser\.id\], bankKnown: bankLoaded/)
  assert.match(app, /setBankDetails\(\{\}\)\s+setBankLoaded\(false\)/)
})

await ok('the banner and the notice have their looks, in light and dark, and the banner reads well on a phone', () => {
  const css = read('src/styles/index.css')
  assert.match(css, /\.sns-profile-banner \{[^}]*var\(--stamp-pale\)/)
  assert.match(css, /\.sns-profile-notice \{[^}]*var\(--overdue-pale\)/)
  assert.match(css, /@media \(max-width: 40rem\) \{\s*\.sns-profile-banner \{ flex-wrap: wrap; \}/)
  const banner = read('src/components/ProfileBanner.jsx')
  assert.match(banner, /Please update your profile/)
  assert.match(banner, /You cannot file a job until every field in your profile is filled in\. Still missing: \{describeMissing\(missing\)\}\./)
  assert.match(banner, /if \(!missing \|\| missing\.length === 0\) return null/)
})

await ok('the test chain runs this file, and the guide for the update is in the README', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.test, /node scripts\/test-profile\.mjs/)
  const readme = read('README.md')
  assert.match(readme, /## Update 50/)
  assert.match(readme, /Please update your profile to file this job\./)
  assert.match(readme, /supabase\/update-50-migration\.sql/)
})

console.log(`\n${n} profile checks passed`)
