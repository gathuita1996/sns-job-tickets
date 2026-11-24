// Update 52: a job card says what the customer reported and how it was solved.
// A member who files a job of any type except New Installation and Site Survey writes two short things (the reported fault, and how it
// was solved) instead of "Job details", and both are required. New Installation and Site Survey keep "Job details".
// Plain logic only (no browser, no database): the ONE rule for the screens (src/lib/faultReport.js), the way the app reads and writes
// the two new columns (src/lib/mappers.js), the SQL file that carries the same rule to the real database
// (supabase/update-52-migration.sql) checked against that rule so the two can never drift apart, and the way the screens use it.
// The same rule is also run against a real PostgreSQL by the maintainer's database tests; those are not part of the shipped app.
// Also here: the two cards that were taken out of the members' portal ("Retrieved routers" and "Jobs I raised").
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FAULT_REPORT_FIELDS, FAULT_REPORT_HINT, FAULT_REPORT_MESSAGE, JOB_TYPES_WITH_DETAILS, isFaultReportError, jobDetailLines, jobDetailsPlan,
  missingFaultReport, needsFaultReport,
} from '../src/lib/faultReport.js'
import { JOB_TYPES, SITE_SURVEY, defaultJobForm } from '../src/lib/helpers.js'
import { isBlank } from '../src/lib/profileComplete.js'
import { jobToDbFields, mapJob } from '../src/lib/mappers.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const section = (text, from, to) => { const a = text.indexOf(from); assert.ok(a >= 0, `missing: ${from}`); const b = to ? text.indexOf(to, a + from.length) : text.length; return text.slice(a, b < 0 ? text.length : b) }

const WITH_DETAILS = ['New Installation', 'Site Survey']
const OTHER_TYPES = ['Network Troubleshooting', 'Router / Equipment Repair', 'Routine Maintenance', 'Fibre / Cable Repair', 'Equipment Upgrade', 'Other']
const FAULT = 'No internet - the router is on but will not connect'
const FIX = 'Replaced the damaged patch cord and restarted the router'

// ======================================================================================================================
// 1. The rule
// ======================================================================================================================
await ok('two job types keep "Job details"; the other six ask for the reported fault and how it was solved', () => {
  assert.deepEqual(JOB_TYPES_WITH_DETAILS, WITH_DETAILS)
  assert.equal(SITE_SURVEY, 'Site Survey')
  assert.deepEqual([...JOB_TYPES].sort(), [...WITH_DETAILS, ...OTHER_TYPES].sort(), 'these are all the job types the form offers')
  for (const t of WITH_DETAILS) assert.equal(needsFaultReport(t), false, t)
  for (const t of OTHER_TYPES) assert.equal(needsFaultReport(t), true, t)
  // strict, like the database: an unknown, empty or differently written type is not one of the two
  for (const t of ['', null, undefined, 'new installation', 'NEW INSTALLATION', ' New Installation', 'Site survey', 'Installation', 'x']) assert.equal(needsFaultReport(t), true, JSON.stringify(t))
})

await ok('the words are the ones asked for, and the two boxes have their own names', () => {
  assert.equal(FAULT_REPORT_MESSAGE, 'Please describe the reported fault and how it was solved.')
  assert.equal(FAULT_REPORT_HINT, 'fault_resolution_required')
  assert.deepEqual(FAULT_REPORT_FIELDS, [
    { key: 'reported_fault', field: 'reportedFault', label: 'Reported fault', error: 'Please describe the reported fault' },
    { key: 'resolution', field: 'resolution', label: 'How it was solved', error: 'Please describe how it was solved' },
  ])
})

await ok('what is missing: nothing for the two types that keep "Job details", and the empty ones, fault first, for every other type', () => {
  for (const t of WITH_DETAILS) {
    assert.deepEqual(missingFaultReport(t, {}), [], t)
    assert.deepEqual(missingFaultReport(t, { reportedFault: '', resolution: '' }), [], t)
    assert.deepEqual(missingFaultReport(t, undefined), [], t)
    assert.deepEqual(missingFaultReport(t, { reportedFault: FAULT, resolution: FIX }), [], t)
  }
  for (const t of OTHER_TYPES) {
    assert.deepEqual(missingFaultReport(t, { reportedFault: FAULT, resolution: FIX }), [], t)
    assert.deepEqual(missingFaultReport(t, { reportedFault: '', resolution: FIX }), ['reported_fault'], t)
    assert.deepEqual(missingFaultReport(t, { reportedFault: FAULT, resolution: '' }), ['resolution'], t)
    assert.deepEqual(missingFaultReport(t, { reportedFault: '', resolution: '' }), ['reported_fault', 'resolution'], t)
    assert.deepEqual(missingFaultReport(t, {}), ['reported_fault', 'resolution'], t)
    assert.deepEqual(missingFaultReport(t, null), ['reported_fault', 'resolution'], t)
    assert.deepEqual(missingFaultReport(t, undefined), ['reported_fault', 'resolution'], t)
  }
  assert.deepEqual(missingFaultReport('', { reportedFault: FAULT }), ['resolution'], 'before a type is chosen the strict rule applies')
})

await ok('"empty" is the same as in the profile rule: nothing but spaces, tabs and line breaks', () => {
  for (const blank of ['', ' ', '   ', '\t', '\r\n', ' \t\r\n ', '\n\n', null, undefined]) {
    assert.deepEqual(missingFaultReport('Other', { reportedFault: blank, resolution: FIX }), ['reported_fault'], JSON.stringify(blank))
    assert.deepEqual(missingFaultReport('Other', { reportedFault: FAULT, resolution: blank }), ['resolution'], JSON.stringify(blank))
  }
  for (const real of ['x', ' x ', '0', '.', '-', '\u00a0', '\u200b', '\u2003', '\u2028', '\u3000', '\ufeff', '\f', '\v', '\u0085']) {
    assert.deepEqual(missingFaultReport('Other', { reportedFault: real, resolution: real }), [], JSON.stringify(real))
    assert.equal(isBlank(real), false, JSON.stringify(real))
  }
})

await ok('what the form shows, for every job type, with and without an admin\'s hand on it, and with and without details already saved', () => {
  for (const jobType of ['', ...JOB_TYPES]) {
    for (const adminMode of [false, true]) {
      for (const hasNotes of [false, true]) {
        const p = jobDetailsPlan({ jobType, adminMode, hasNotes })
        const label = JSON.stringify({ jobType, adminMode, hasNotes })
        if (adminMode) {
          // the admin's form is the guidance box for the member, whatever the type; it never touches the two fault boxes
          assert.deepEqual(p, { kind: 'guidance', notes: 'editor', notesRequired: true, fault: false, faultRequired: false }, label)
        } else if (jobType === '') {
          assert.deepEqual(p, { kind: 'none', notes: 'none', notesRequired: false, fault: false, faultRequired: false }, label)
        } else if (WITH_DETAILS.includes(jobType)) {
          assert.deepEqual(p, { kind: 'details', notes: 'editor', notesRequired: true, fault: false, faultRequired: false }, label)
        } else {
          // never the details box; the earlier details stay in view (read-only) when there are some
          assert.deepEqual(p, { kind: 'report', notes: hasNotes ? 'readonly' : 'none', notesRequired: false, fault: true, faultRequired: true }, label)
        }
        // whatever else, "Job details" and the two fault boxes are never both asked for
        assert.ok(!(p.notesRequired && p.faultRequired), label)
        assert.ok(!(p.notes === 'editor' && p.fault), label)
      }
    }
  }
})

await ok('how a saved job is shown (print view, admin\'s hand-over form): what was ever written never disappears', () => {
  const lines = (job) => jobDetailLines(job).map((l) => [l.key, l.label, l.value])
  // a job with a fault report
  assert.deepEqual(lines({ jobType: 'Network Troubleshooting', reportedFault: FAULT, resolution: FIX, notes: '' }),
    [['reported_fault', 'Reported fault', FAULT], ['resolution', 'How it was solved', FIX]])
  // ...and earlier details after it, when it has some (a job from before the update that was then given a fault report)
  assert.deepEqual(lines({ jobType: 'Network Troubleshooting', reportedFault: FAULT, resolution: FIX, notes: 'Old details' }),
    [['reported_fault', 'Reported fault', FAULT], ['resolution', 'How it was solved', FIX], ['notes', 'Job details (as first written)', 'Old details']])
  // one of the two written: the other shows a dash
  assert.deepEqual(lines({ jobType: 'Other', reportedFault: FAULT, resolution: '' }), [['reported_fault', 'Reported fault', FAULT], ['resolution', 'How it was solved', '—']])
  assert.deepEqual(lines({ jobType: 'Other', reportedFault: '  ', resolution: FIX }), [['reported_fault', 'Reported fault', '—'], ['resolution', 'How it was solved', FIX]])
  // an installation or a survey: "Job Details", as before
  for (const jobType of WITH_DETAILS) {
    assert.deepEqual(lines({ jobType, notes: 'Installed 10 Mbps' }), [['notes', 'Job Details', 'Installed 10 Mbps']], jobType)
    assert.deepEqual(lines({ jobType, notes: '' }), [['notes', 'Job Details', '—']], jobType)
    assert.deepEqual(lines({ jobType, notes: 'Installed', reportedFault: '', resolution: '' }), [['notes', 'Job Details', 'Installed']], jobType)
  }
  // a job from before this update (a repair with only "Job details"): shown as it always was
  assert.deepEqual(lines({ jobType: 'Network Troubleshooting', notes: 'Replaced the ONU', reportedFault: '', resolution: '' }), [['notes', 'Job Details', 'Replaced the ONU']])
  assert.deepEqual(lines({ jobType: 'Routine Maintenance', notes: 'Cleaned the dish' }), [['notes', 'Job Details', 'Cleaned the dish']])
  // a repair with nothing at all yet (an admin's hand-over without guidance): the two lines, empty
  assert.deepEqual(lines({ jobType: 'Network Troubleshooting', notes: '' }), [['reported_fault', 'Reported fault', '—'], ['resolution', 'How it was solved', '—']])
  assert.deepEqual(lines({ jobType: 'Network Troubleshooting', notes: '   ' }), [['reported_fault', 'Reported fault', '—'], ['resolution', 'How it was solved', '—']])
  // nothing to show, nothing to break
  assert.equal(jobDetailLines(null).length, 2)
  assert.equal(jobDetailLines(undefined).length, 2)
  assert.ok(jobDetailLines({}).every((l) => l.value === '—'))
})

await ok('a refusal from the database is recognised by its hint or by its words, and nothing else is mistaken for it', () => {
  assert.equal(isFaultReportError({ message: FAULT_REPORT_MESSAGE, hint: FAULT_REPORT_HINT, details: 'Still empty: reported_fault' }), true)
  assert.equal(isFaultReportError({ hint: FAULT_REPORT_HINT }), true)
  assert.equal(isFaultReportError({ message: FAULT_REPORT_MESSAGE }), true)
  assert.equal(isFaultReportError({ message: `error: ${FAULT_REPORT_MESSAGE} (more)` }), true)
  for (const other of [null, undefined, {}, { message: 'Failed' }, { hint: 'profile_incomplete', message: 'Please update your profile to file this job.' }, { message: 'A site survey needs a GPS location.' }, { code: '42501', message: 'new row violates row-level security policy' }]) {
    assert.equal(isFaultReportError(other), false, JSON.stringify(other))
  }
})

// ======================================================================================================================
// 2. How the app reads and writes the two new columns
// ======================================================================================================================
const base = {
  jobType: 'Network Troubleshooting', jobTypeOther: '', location: 'Diani', requestedBy: 'Amina', requesterContact: '', visitDate: '2026-11-20',
  transportFrom: 'Office', transportTo: ['Diani'], transportAmount: 300, status: 'Completed', priority: 'Normal', overdueReason: '', customerId: null, coTechnicians: [],
}

await ok('a job from the database carries the two new texts (empty when it has none)', () => {
  const row = { id: 1, job_code: 'JC-0001', job_type: 'Network Troubleshooting', location: 'Diani', visit_date: '2026-11-20', status: 'Completed', member_id: 'm1', transport_amount: '300', notes: 'Old details' }
  const old = mapJob(row)
  assert.equal(old.reportedFault, '')
  assert.equal(old.resolution, '')
  assert.equal(old.notes, 'Old details', 'details written before the update are untouched')
  const j = mapJob({ ...row, notes: null, reported_fault: FAULT, resolution: FIX })
  assert.equal(j.reportedFault, FAULT)
  assert.equal(j.resolution, FIX)
  assert.equal(j.notes, '')
  assert.equal(mapJob({ ...row, reported_fault: null, resolution: null }).reportedFault, '')
  assert.equal(mapJob({ ...row, reported_fault: FAULT }).resolution, '', 'each one is read from its own column')
  assert.equal(mapJob({ ...row, resolution: FIX }).reportedFault, '')
})

await ok('a new job form starts with both boxes empty (and "Job details" empty)', () => {
  const f = defaultJobForm()
  assert.equal(f.reportedFault, '')
  assert.equal(f.resolution, '')
  assert.equal(f.notes, '')
  assert.equal(f.jobType, '')
})

await ok('what the app writes: the two texts, trimmed, for a job that asks for them; "Job details" only when the form has the box', () => {
  const out = jobToDbFields({ ...base, reportedFault: `  ${FAULT}  `, resolution: ` ${FIX}\n` })
  assert.equal(out.reported_fault, FAULT)
  assert.equal(out.resolution, FIX)
  assert.ok(!('notes' in out), 'a repair does not send "Job details", so details written earlier are never wiped by it')
  // an installation or survey: details, and the two texts cleared (a job whose type was changed keeps no fault report that no longer applies)
  const inst = jobToDbFields({ ...base, jobType: 'New Installation', notes: 'Installed 10 Mbps', reportedFault: null, resolution: null })
  assert.equal(inst.notes, 'Installed 10 Mbps')
  assert.strictEqual(inst.reported_fault, null)
  assert.strictEqual(inst.resolution, null)
  // the admin's hand-over: guidance only, the two texts are not mentioned at all
  const admin = jobToDbFields({ ...base, notes: 'Check the splice at the pole' })
  assert.equal(admin.notes, 'Check the splice at the pole')
  assert.ok(!('reported_fault' in admin) && !('resolution' in admin), 'an admin\'s edit leaves the member\'s fault report alone')
  // empty text is saved as nothing (null), never as an empty string
  const emptied = jobToDbFields({ ...base, reportedFault: '   ', resolution: '' })
  assert.strictEqual(emptied.reported_fault, null)
  assert.strictEqual(emptied.resolution, null)
  assert.strictEqual(jobToDbFields({ ...base, notes: '' }).notes, null, 'details cleared on purpose are saved as nothing')
  // naming just one still writes both, so one is never left behind by accident
  const half = jobToDbFields({ ...base, reportedFault: FAULT })
  assert.equal(half.reported_fault, FAULT)
  assert.strictEqual(half.resolution, null)
  const otherHalf = jobToDbFields({ ...base, resolution: FIX })
  assert.equal(otherHalf.resolution, FIX)
  assert.strictEqual(otherHalf.reported_fault, null)
  // the rest of the job is written as before
  assert.equal(out.job_type, 'Network Troubleshooting')
  assert.equal(out.location, 'Diani')
  assert.equal(out.status, 'Completed')
  assert.equal(out.transport_amount, 300)
})

// ======================================================================================================================
// 3. The SQL: the same rule in the real database
// ======================================================================================================================
const mig52 = read('supabase/update-52-migration.sql')
const mig51 = read('supabase/update-51-migration.sql')
const mig50 = read('supabase/update-50-migration.sql')
const code52 = mig52.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const rebuild = read('supabase/job-card-rebuild.sql')
const schema = read('supabase/schema.sql')
const fn = section(mig52, 'create or replace function public.job_fault_report_missing', '$$;')
const guard = section(mig52, 'create or replace function public.require_fault_report', '$$;')

await ok('the database excuses the same two job types as the app', () => {
  const list = fn.match(/when p_job_type in \(([^)]*)\) then array\[\]::text\[\]/)
  assert.ok(list, 'the excused types are listed in one place in the function')
  const names = [...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual(names, JOB_TYPES_WITH_DETAILS)
  assert.match(fn, /returns text\[\] language sql immutable as \$\$/)
  assert.match(fn, /create or replace function public\.job_fault_report_missing\(p_job_type text, p_fault text, p_resolution text\)/)
})

await ok('the database reports the same two names as the screens, fault first, each from its own text', () => {
  const cases = [...fn.matchAll(/case when coalesce\((p_\w+), ''\)\s+~ '([^']*)'\s+then '(\w+)'\s+end/g)].map((m) => ({ arg: m[1], literal: m[2], key: m[3] }))
  assert.deepEqual(cases.map((c) => c.key), FAULT_REPORT_FIELDS.map((f) => f.key))
  assert.deepEqual(cases.map((c) => c.arg), ['p_fault', 'p_resolution'])
  assert.match(fn, /array_remove\(array\[[\s\S]*\], null\)/)
  assert.equal(cases[0].literal, cases[1].literal, 'both are judged by the same test')
})

await ok('"empty" in the database is the same as "empty" on the screens, character for character', () => {
  const literals = [...code52.matchAll(/~ '(\^\[ \\t\\r\\n\]\*\$)'/g)].map((m) => m[1])
  assert.equal(literals.length, 2, 'the blank test is in the file, once per text')
  assert.equal(literals[0], literals[1])
  const sqlBlank = new RegExp(literals[0])                                    // PostgreSQL reads \t \r \n in a regular expression just as JavaScript does
  const samples = ['', ' ', '   ', '\t', '\r', '\n', '\r\n', ' \t\r\n ', 'a', ' a', 'a ', 'a\n', '\na', 'a\nb', '0', '.', '​', '﻿', '　', ' ', '\v', '\f', '\u0085', ' ']
  for (const s of samples) assert.equal(sqlBlank.test(s), isBlank(s), `database and screens agree about ${JSON.stringify(s)}`)
  assert.match(read('src/lib/profileComplete.js'), /replace\(\/\^\[ \\t\\r\\n\]\+\|\[ \\t\\r\\n\]\+\$\/g, ''\)/)
})

await ok('the database says what the screens say: the same words and the same hint', () => {
  assert.ok(guard.includes(`raise exception '${FAULT_REPORT_MESSAGE}'`))
  assert.ok(guard.includes(`hint = '${FAULT_REPORT_HINT}'`))
  assert.match(guard, /detail = 'Still empty: ' \|\| array_to_string\(missing, ', '\)/)
})

await ok('the guard stops a member\'s NEW job when either text is empty, and nobody else', () => {
  assert.match(guard, /returns trigger language plpgsql security definer set search_path = public as \$\$/)
  assert.match(guard, /if auth\.uid\(\) is null or public\.is_admin\(\) then return new; end if;/)           // the server's own key, the SQL editor and admins pass
  assert.match(guard, /missing := public\.job_fault_report_missing\(new\.job_type, new\.reported_fault, new\.resolution\);/)
  assert.match(guard, /if coalesce\(array_length\(missing, 1\), 0\) > 0 then/)
  assert.match(mig52, /drop trigger if exists trg_require_fault_report on public\.jobs;\s*create trigger trg_require_fault_report before insert on public\.jobs\s+for each row execute function public\.require_fault_report\(\);/)
  assert.ok(!/before (insert or update|update)/i.test(code52), 'only a new job is held back: editing, completing or deleting one that exists is not')
  assert.ok(!/after insert/i.test(code52))
  assert.ok(!/for each statement/i.test(code52))
})

await ok('the two functions are the database\'s own business', () => {
  assert.match(mig52, /revoke all on function public\.job_fault_report_missing\(text, text, text\) from public, anon, authenticated;/)
  assert.match(mig52, /grant execute on function public\.job_fault_report_missing\(text, text, text\) to service_role;/)
  assert.match(mig52, /revoke all on function public\.require_fault_report\(\) from public, anon, authenticated;/)
  assert.match(mig52, /notify pgrst, 'reload schema';/)
  assert.ok(!/grant execute on function public\.require_fault_report/.test(mig52), 'the trigger function is never granted to anyone')
})

await ok('it only adds: two optional text columns, two functions and one trigger, and it is safe to run again', () => {
  assert.match(code52, /alter table public\.jobs add column if not exists reported_fault text;/)
  assert.match(code52, /alter table public\.jobs add column if not exists resolution\s+text;/)
  assert.equal((code52.match(/alter table/g) || []).length, 2, 'two columns and nothing else is altered')
  assert.ok(!/\bnot null\b|\bdefault\b/i.test(code52.replace(/--.*$/gm, '')), 'the columns are optional and have no default')
  assert.ok(!/\b(insert\s+into|delete\s+from|update\s+public\.|drop\s+table|drop\s+column|create\s+table|truncate|create\s+policy|drop\s+policy|disable\s+trigger|drop\s+function)\b/i.test(code52))
  assert.ok(!/^\s*update\s/im.test(code52), 'no UPDATE statement anywhere: no existing job is changed')
  assert.equal((code52.match(/create or replace function/g) || []).length, 2)
  assert.equal((code52.match(/create trigger/g) || []).length, 1)
  assert.equal((code52.match(/drop trigger if exists/g) || []).length, 1)
  assert.ok(!/\b(commit|rollback|begin)\s*;/i.test(code52), 'it runs inside the SQL editor\'s own transaction')
})

await ok('the full set-up scripts are one file that ends with this update and still carries the ones before it', () => {
  assert.equal(rebuild, schema)
  assert.ok(rebuild.endsWith(mig52), 'the full script ends with update 52')
  assert.equal(rebuild.split(mig52).length - 1, 1, 'and carries it once')
  assert.equal(rebuild.split(mig51).length - 1, 1, 'and carries update 51 once, before it')
  assert.equal(rebuild.split(mig50).length - 1, 1, 'and update 50')
  assert.ok(rebuild.lastIndexOf(mig51) < rebuild.lastIndexOf(mig52))
  assert.ok(rebuild.indexOf('create or replace function public.require_fault_report') > rebuild.indexOf('create or replace function public.is_admin'), 'after is_admin()')
  assert.ok(rebuild.indexOf('alter table public.jobs add column if not exists reported_fault') > rebuild.indexOf('create table public.jobs'), 'after the table it adds to')
})

await ok('a new job meets the profile check, then this one, then the site-survey check (triggers run in name order)', () => {
  const names = (rebuild.match(/create trigger (trg_\w+) before insert on public\.jobs/g) || []).map((s) => s.split(' ')[2])
  for (const t of ['trg_require_complete_profile', 'trg_require_fault_report', 'trg_require_site_survey_gps']) assert.ok(names.includes(t), t)
  assert.ok('trg_require_complete_profile' < 'trg_require_fault_report' && 'trg_require_fault_report' < 'trg_require_site_survey_gps')
})

// ======================================================================================================================
// 4. The screens carry it
// ======================================================================================================================
await ok('the job form asks for the two boxes instead of "Job details" for every type except the two, and both are required', () => {
  const form = read('src/components/JobForm.jsx')
  assert.match(form, /import \{ FAULT_REPORT_FIELDS, FAULT_REPORT_MESSAGE, jobDetailLines, jobDetailsPlan, missingFaultReport \} from '\.\.\/lib\/faultReport'/)
  assert.match(form, /const plan = jobDetailsPlan\(\{ jobType: form\.jobType, adminMode, hasNotes: hasEarlierDetails \}\)/)
  // "Job details" is only in the page when the plan says so
  const editor = section(form, "{plan.notes === 'editor' && (", '\n          )}')
  assert.match(editor, /'Job details \(guidance for the assigned member\)' : 'Job details'/)
  assert.equal((form.match(/label=\{adminMode \? 'Job details/g) || []).length, 1, 'there is one "Job details" box in the whole form')
  // the two boxes, with their words
  const boxes = section(form, '{plan.fault && (', '\n          )}')
  assert.match(boxes, /label="Reported fault" error=\{errors\.reportedFault\} htmlFor="job-reported-fault" hint="Briefly, what the customer reported\."/)
  assert.match(boxes, /label="How it was solved" error=\{errors\.resolution\} htmlFor="job-resolution" hint="What was done to fix it\. If it is not fixed yet, say what has been done so far\."/)
  assert.match(boxes, /<textarea id="job-reported-fault"/)
  assert.match(boxes, /<textarea id="job-resolution"/)
  // required: checked as it will be saved, and only on the path that is not the reassign-only form
  const validate = section(form, 'function validate() {', 'async function handleSubmit')
  assert.ok(validate.indexOf('if (reassignOnly) {') < validate.indexOf('if (plan.faultRequired) {'))
  assert.match(validate, /if \(plan\.notesRequired && !form\.notes\.trim\(\)\) e\.notes = 'Job details are required'/)
  assert.match(validate, /missingFaultReport\(form\.jobType, \{ reportedFault: form\.reportedFault\.trim\(\), resolution: form\.resolution\.trim\(\) \}\)/)
  assert.match(validate, /for \(const f of FAULT_REPORT_FIELDS\) if \(missing\.includes\(f\.key\)\) e\[f\.field\] = f\.error/)
})

await ok('what the form sends follows what it showed: details only from the box, the two texts only for a job that asks for them', () => {
  const form = read('src/components/JobForm.jsx')
  const send = section(form, 'const result = await onSave({', 'location: form.location')
  assert.match(send, /notes: plan\.notes === 'editor' \? form\.notes : undefined,/)
  assert.match(send, /reportedFault: plan\.fault \? form\.reportedFault : \(plan\.kind === 'guidance' \? undefined : null\),/)
  assert.match(send, /resolution: plan\.fault \? form\.resolution : \(plan\.kind === 'guidance' \? undefined : null\),/)
  // earlier details stay in view, read-only, and are never edited
  assert.match(form, /const hasEarlierDetails = Boolean\(initialJob\) && !isBlank\(initialJob\.notes\)/)
  assert.match(form, /\{plan\.notes === 'readonly' && \(\s*<div className="sns-card" data-testid="earlier-details"/)
  assert.match(form, /initialJob\.assignedBy \? 'Job details from your admin' : 'Job details \(as first written\)'/)
  // when the database refuses a new job for this reason the form stays open and says so
  assert.match(form, /if \(result && result\.faultReport\) setFaultNotice\(true\)/)
  assert.match(form, /\{faultNotice && <div role="alert"><ErrorBanner message=\{FAULT_REPORT_MESSAGE\} \/><\/div>\}/)
  // the admin's reassign-only view lists what the job carries
  assert.match(form, /jobDetailLines\(initialJob\)\.filter\(\(line\) => line\.value !== '—'\)/)
})

await ok('the app tells the form when the database refused the job for this reason, and the member\'s dashboard passes it on', () => {
  const app = read('src/App.jsx')
  assert.match(app, /import \{ FAULT_REPORT_MESSAGE, isFaultReportError \} from '\.\/lib\/faultReport'/)
  const add = section(app, 'async function handleAddJob(formData)', 'async function handleAssignJob')
  assert.match(add, /if \(isFaultReportError\(error\)\) \{\s+showToast\(FAULT_REPORT_MESSAGE, 'error'\)\s+return \{ ok: false, faultReport: true \}/)
  assert.match(add, /return \{ ok: true \}/)
  assert.ok(add.indexOf('isProfileIncompleteError(error)') < add.indexOf('isFaultReportError(error)'), 'the profile is spoken of first, as in the database')
  assert.match(read('src/components/MemberDashboard.jsx'), /if \(result && \(result\.profileIncomplete \|\| result\.faultReport\)\) return result/)
})

await ok('the printed job card shows the reported fault and how it was solved', () => {
  const print = read('src/components/PrintViews.jsx')
  assert.match(print, /import \{ jobDetailLines \} from '\.\.\/lib\/faultReport'/)
  assert.match(print, /\{jobDetailLines\(job\)\.map\(\(line\) => <PrintField key=\{line\.key\} label=\{line\.label\} value=\{line\.value\} full \/>\)\}/)
  assert.ok(!/label="Job Details"/.test(print), 'no fixed "Job Details" line is left in the print view')
})

await ok('the members\' portal no longer has "Retrieved routers" or "Jobs I raised"; what stays is still there', () => {
  const dash = read('src/components/MemberDashboard.jsx')
  for (const gone of ['Retrieved routers', 'Retrieved Routers', 'RetrievedRouters', 'Jobs I raised', 'raisedJobs', "'raised'", "'routers'", 'routerApi']) assert.ok(!dash.includes(gone), `${gone} is gone from the members' portal`)
  for (const label of ['File a new job', 'All my jobs', 'Pending jobs', 'Jobs today', 'Assigned to me', 'Record new customer', 'My customers', 'Field visits', 'My leave', 'Submit a purchase', 'My Expenses/Purchases']) {
    assert.ok(dash.includes(`label="${label}"`), `${label} is still there`)
  }
  assert.ok(!/raisedJobs/.test(read('src/App.jsx')), 'the app no longer works out a list for it')
  // admins keep the Retrieved Routers screen (Stock tab), where they can still record, edit and manage the routers
  const stock = read('src/components/StockTab.jsx')
  assert.match(stock, /import RetrievedRouters from '\.\/RetrievedRouters'/)
  assert.match(stock, /<RetrievedRouters [^>]*\bisAdmin\b/)
})

await ok('the test chain runs this file, and the guide for the update is in the README', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.test, /node scripts\/test-fault-report\.mjs/)
  const readme = read('README.md')
  assert.match(readme, /## Update 52/)
  assert.match(readme, /supabase\/update-52-migration\.sql/)
  assert.match(readme, /Please describe the reported fault and how it was solved\./)
})

console.log(`\n${n} fault-report checks passed`)
