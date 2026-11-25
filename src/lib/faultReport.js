// Update 52: a job card says what the customer reported and how it was solved.
//
// Three kinds of job keep the free-text "Job details" box: a New Installation, a Site Survey and "Other" (Update 53 moved "Other"
// here from the other group: a job of a kind that is not in the list, which the member describes in their own words, is written up
// in Job details like the two others). Every other kind of job (troubleshooting, repair, maintenance, cable repair, upgrade) is a
// customer's problem, so the member who files it writes two short things instead: the fault that was reported, and how it was
// solved. Both are required, and "Job details" is not asked.
//
// This is the ONE list for the screens. The database has the same rule in public.job_fault_report_missing()
// (supabase/update-53-migration.sql, which replaced the one in update 52) and a trigger that refuses a new job from a member when
// either is empty; a test fails if the two ever differ.
//   * Members are held to it when they file or change a job. Admins are not (an admin hands a job over with guidance, and
//     fixes old records, without having to invent a resolution), and neither are the server's own key and the SQL editor.
//   * The database only stops a NEW job from a member. A job that already exists is never blocked from being changed by it.
//
// To change which job types keep "Job details", change JOB_TYPES_WITH_DETAILS below AND the list inside the function in the
// migration, then run `npm test`.
import { SITE_SURVEY } from './helpers.js'
import { isBlank } from './profileComplete.js'

export const JOB_TYPES_WITH_DETAILS = ['New Installation', SITE_SURVEY, 'Other']

export const FAULT_REPORT_MESSAGE = 'Please describe the reported fault and how it was solved.'
export const FAULT_REPORT_HINT = 'fault_resolution_required'          // what the database sends back with that message

// The names the database reports, in the order it reports them, and what the member reads.
export const FAULT_REPORT_FIELDS = [
  { key: 'reported_fault', field: 'reportedFault', label: 'Reported fault',   error: 'Please describe the reported fault' },
  { key: 'resolution',     field: 'resolution',    label: 'How it was solved', error: 'Please describe how it was solved' },
]

// Does a job of this type need the two fault fields (and not "Job details")? True for every type except the three above, and
// for an empty one too: the database is strict, so this is strict, and the screen decides separately what to show before a
// type has been chosen (see jobDetailsKind).
export const needsFaultReport = (jobType) => !JOB_TYPES_WITH_DETAILS.includes(jobType)

// Which of the two are empty for this job, as the database names them: [] | ['reported_fault'] | ['resolution'] | both.
// Nothing is ever missing for a job type that keeps "Job details". "Empty" is the same as in the profile rule: nothing but
// spaces, tabs and line breaks.
export function missingFaultReport(jobType, values) {
  if (!needsFaultReport(jobType)) return []
  const v = values || {}
  return FAULT_REPORT_FIELDS.filter((f) => isBlank(v[f.field])).map((f) => f.key)
}

// What the job form asks for, in place of (or as) the details box. Inputs:
//   jobType    what is chosen on the form ('' before a type is chosen)
//   adminMode  an admin has the form to hand a job over (a new one, or one they handed over before). This form is the admin's guidance
//              for the member, and it is the same for every job type: the guidance box, as before. It never touches the two fault boxes,
//              which the member fills in when they do the job, so a fault report that is already there is left as it is.
//   hasNotes   the job already has "Job details" saved (an older job, or an admin's guidance)
//   hasFault   the job already has a reported fault or a resolution saved (a repair job, or an "Other" job filed under update 52)
// Returns
//   kind      'guidance' the admin's form: the guidance for the member, whatever the type
//             'none'     no type chosen yet: nothing about the job's text is shown
//             'details'  New Installation / Site Survey / Other: the "Job details" box, as before
//             'report'   every other type: the reported fault and how it was solved, both required
//   notes     what is shown of "Job details": 'editor' | 'readonly' (details an older job, or an admin's guidance, already has) | 'none'
//   notesRequired  the "Job details" box must be filled in (not when the job already says what happened in a fault report)
//   fault          the two fault boxes are shown
//   faultRequired  both must be filled in
//   earlierFault   a fault report the job already has is shown, read-only (a type that keeps "Job details" never asks for one, but
//                  never deletes one that was written: the form leaves it as it is)
export function jobDetailsPlan({ jobType, adminMode, hasNotes, hasFault }) {
  if (adminMode) return { kind: 'guidance', notes: 'editor', notesRequired: true, fault: false, faultRequired: false, earlierFault: false }
  if (!jobType) return { kind: 'none', notes: 'none', notesRequired: false, fault: false, faultRequired: false, earlierFault: false }
  if (!needsFaultReport(jobType)) return { kind: 'details', notes: 'editor', notesRequired: !hasFault, fault: false, faultRequired: false, earlierFault: Boolean(hasFault) }
  return { kind: 'report', notes: hasNotes ? 'readonly' : 'none', notesRequired: false, fault: true, faultRequired: true, earlierFault: false }
}

// The lines that describe a saved job: what the print view and any other read-only place shows, in order.
// A job shows whatever it has, so nothing that was ever written disappears from the card:
//   * a job with a fault report shows the two fault lines, and its "Job details" after them when it has some (called "as first
//     written" for a job of a type that asks for the fault report, where the details are the older text; plain "Job Details" for a
//     type that keeps them);
//   * an older job (or one an admin handed over with guidance) shows its "Job details" as before;
//   * a job of a type that asks for the fault report but has nothing at all yet shows the two lines with a dash.
// Returns [{ key, label, value }].
export function jobDetailLines(job) {
  const j = job || {}
  const has = (v) => !isBlank(v)
  const faultLines = () => [
    { key: 'reported_fault', label: 'Reported fault', value: has(j.reportedFault) ? j.reportedFault : '—' },
    { key: 'resolution', label: 'How it was solved', value: has(j.resolution) ? j.resolution : '—' },
  ]
  if (has(j.reportedFault) || has(j.resolution)) {
    const label = needsFaultReport(j.jobType) ? 'Job details (as first written)' : 'Job Details'
    return has(j.notes) ? [...faultLines(), { key: 'notes', label, value: j.notes }] : faultLines()
  }
  if (needsFaultReport(j.jobType) && !has(j.notes)) return faultLines()
  return [{ key: 'notes', label: 'Job Details', value: has(j.notes) ? j.notes : '—' }]
}

// Did the database refuse a new job for this reason? (The screen's own check normally stops it first.)
export function isFaultReportError(error) {
  if (!error) return false
  return String(error.hint || '') === FAULT_REPORT_HINT || String(error.message || '').includes(FAULT_REPORT_MESSAGE)
}
