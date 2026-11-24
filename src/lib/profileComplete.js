// Update 50: a member must complete their profile before they can file a job.
//
// This is the ONE list of what "complete" means for the screens. The database has the same list in public.profile_missing_fields()
// (supabase/update-51-migration.sql, which replaced the one in update 50) and a test fails if the two ever differ.
//   * Members are held to it. Admins (the Director too) are not.
//   * Three things are not on the list: the title (only admins show one), the employee number (the admin gives it, a member cannot
//     set it) and, since Update 51, the SHA number.
//
// To require one more thing, or to stop requiring one: change the list below AND the function in the migration (same keys, same
// order), then run `npm test`.

export const PROFILE_REQUIRED_MESSAGE = 'Please update your profile to file this job.'
export const PROFILE_INCOMPLETE_HINT = 'profile_incomplete'          // what the database sends back with that message

// key    : what the database reports for it
// label  : what the member reads
// where  : 'profile' (the profile) or 'bank' (kept in its own table, so it arrives as a second object)
// field  : the name of the value in the app (the form uses the same names)
export const REQUIRED_PROFILE_FIELDS = [
  { key: 'full_name',      label: 'Full name',          where: 'profile', field: 'fullName' },
  { key: 'username',       label: 'Username',           where: 'profile', field: 'username' },
  { key: 'contact',        label: 'Contact number',     where: 'profile', field: 'contact' },
  { key: 'gender',         label: 'Gender',             where: 'profile', field: 'gender' },
  { key: 'date_of_birth',  label: 'Date of birth',      where: 'profile', field: 'dateOfBirth' },
  { key: 'id_number',      label: 'National ID number', where: 'profile', field: 'idNumber' },
  { key: 'kra_pin',        label: 'KRA PIN',            where: 'profile', field: 'kraPin' },
  { key: 'avatar',         label: 'Profile picture',    where: 'profile', field: 'avatarUrl' },
  { key: 'bank_name',      label: 'Bank name',          where: 'bank',    field: 'bankName' },
  { key: 'account_number', label: 'Account number',     where: 'bank',    field: 'accountNumber' },
  { key: 'account_name',   label: 'Account name',       where: 'bank',    field: 'accountName' },
  { key: 'branch',         label: 'Branch',             where: 'bank',    field: 'branch' },
]

// "Empty" means nothing but spaces, tabs and line breaks. The database uses exactly the same definition.
export const isBlank = (value) => String(value == null ? '' : value).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') === ''

// Is this person held to the rule? Everyone except an admin.
export const profileApplies = (profile) => Boolean(profile) && profile.role !== 'admin'

// What is still empty, in the order of the list: [{ key, label }]. Nothing for an admin.
// options.bankKnown: pass false while the bank details have not been read yet (or could not be). The four bank fields are then left
// out instead of being reported as empty, so a member whose details are all there never sees a wrong banner. The database has the last
// word either way.
export function missingProfileFields(profile, bank, options) {
  if (!profileApplies(profile)) return []
  const bankKnown = !options || options.bankKnown !== false
  const valueOf = (f) => ((f.where === 'bank' ? bank : profile) || {})[f.field]
  return REQUIRED_PROFILE_FIELDS.filter((f) => (bankKnown || f.where !== 'bank') && isBlank(valueOf(f))).map(({ key, label }) => ({ key, label }))
}

export const isProfileComplete = (profile, bank, options) => missingProfileFields(profile, bank, options).length === 0

// Update 51: who still has to finish their profile (the admin's Staff list). users are the profiles the app holds; bankByMember is
// { memberId: bank details }; options is the same as above (bankKnown). Returns a Map from a member's id to what that member is
// missing, with an entry ONLY for members who are not complete. An admin is never in it.
export function incompleteProfiles(users, bankByMember, options) {
  const out = new Map()
  for (const u of users || []) {
    const missing = missingProfileFields(u, (bankByMember || {})[u.id], options)
    if (missing.length > 0) out.set(u.id, missing)
  }
  return out
}

// What the screens ask before a job is filed: { blocked, missing, message }
export function jobFilingGate(profile, bank, options) {
  const missing = missingProfileFields(profile, bank, options)
  return { blocked: missing.length > 0, missing, message: PROFILE_REQUIRED_MESSAGE }
}

// "National ID number, KRA PIN, Profile picture and 6 more": a short sentence about what is missing (all of it when it is four or fewer).
export function describeMissing(missing, max = 4) {
  const names = (missing || []).map((m) => m.label)
  if (names.length === 0) return ''
  if (names.length <= max) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const shown = names.slice(0, max - 1)
  return `${shown.join(', ')} and ${names.length - shown.length} more`
}

// The profile form's own check (it uses the field names above): what is empty, with the words to show under it.
// The form saves what was typed with the spaces trimmed off (and saves nothing for a blank), so it looks at the trimmed text:
// whatever it lets through is never empty in the database.
export function missingInForm(form, avatarUrl) {
  const errors = {}
  for (const f of REQUIRED_PROFILE_FIELDS) {
    const value = f.field === 'avatarUrl' ? avatarUrl : (form || {})[f.field]
    if (String(value == null ? '' : value).trim() === '') errors[f.field] = f.field === 'avatarUrl' ? 'Add a profile picture.' : 'Required'
  }
  return errors
}

// Did the database refuse a new job because the profile is not complete?
export function isProfileIncompleteError(error) {
  if (!error) return false
  return error.hint === PROFILE_INCOMPLETE_HINT || String(error.message || '').includes(PROFILE_REQUIRED_MESSAGE)
}
