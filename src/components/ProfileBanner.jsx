import { UserCog } from 'lucide-react'
import { describeMissing } from '../lib/profileComplete'

// Update 50: the notice at the top of a member's dashboard for as long as their profile is not complete. It says what is still
// missing and opens the profile window (the dashboard passes onOpen). Nothing is shown once every field is filled in.
//   missing : [{ key, label }] from missingProfileFields()
export default function ProfileBanner({ missing, onOpen }) {
  if (!missing || missing.length === 0) return null
  return (
    <section className="sns-profile-banner" aria-label="Your profile is not complete">
      <UserCog size={20} className="sns-profile-banner-icon" aria-hidden="true" />
      <div className="sns-profile-banner-text">
        <p className="sns-profile-banner-title">Please update your profile</p>
        <p>You cannot file a job until every field in your profile is filled in. Still missing: {describeMissing(missing)}.</p>
      </div>
      <button type="button" className="sns-btn-primary sns-profile-banner-btn" onClick={onOpen}>Update profile</button>
    </section>
  )
}
