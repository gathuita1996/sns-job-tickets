import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'

const NUMBER_FORMAT = /^SNS\d{3,}$/i

function ProfileFields({ profile, canEditNumber, onClose, onSave }) {
  const [form, setForm] = useState({
    fullName: profile.fullName, username: profile.username,
    contact: profile.contact, title: profile.title || '',
    gender: profile.gender || '', dateOfBirth: profile.dateOfBirth || '',
    idNumber: profile.idNumber || '', kraPin: profile.kraPin || '', shaNumber: profile.shaNumber || '',
    employeeNumber: profile.employeeNumber || '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.fullName.trim()) e.fullName = 'Required'
    if (!form.username.trim()) e.username = 'Required'
    else if (!/^[a-zA-Z0-9_.]{3,20}$/.test(form.username.trim())) e.username = '3–20 characters: letters, numbers, underscore, dot.'
    if (!form.contact.trim()) e.contact = 'Required'
    if (canEditNumber && form.employeeNumber.trim() && !NUMBER_FORMAT.test(form.employeeNumber.trim())) e.employeeNumber = 'Use the format SNS001'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSave({
      full_name: form.fullName.trim(),
      username: form.username.trim(),
      contact: form.contact.trim(),
      title: form.title.trim() || null,
      gender: form.gender || null,
      date_of_birth: form.dateOfBirth || null,
      id_number: form.idNumber.trim() || null,
      kra_pin: form.kraPin.trim() || null,
      sha_number: form.shaNumber.trim() || null,
      // only an admin sends this, so a team member's save never touches their number
      ...(canEditNumber ? { employee_number: form.employeeNumber.trim().toUpperCase() || null } : {}),
    })
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
      <FormField label="Full name" error={errors.fullName}>
        <input className="sns-input" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
      </FormField>
      <FormField label="Username" error={errors.username} hint="Shown on job cards as who filed them.">
        <input className="sns-input" value={form.username} onChange={(e) => update('username', e.target.value)} />
      </FormField>
      <FormField label="Contact number" error={errors.contact}>
        <input className="sns-input" value={form.contact} onChange={(e) => update('contact', e.target.value)} />
      </FormField>
      <FormField label="Title (optional)" hint="e.g. Director, Operations Manager.">
        <input className="sns-input" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Director" />
      </FormField>
      {canEditNumber ? (
        <FormField label="Employee number" error={errors.employeeNumber} hint="Unique for each person, in the form SNS001. Use the Team tab to give numbers to everyone at once.">
          <input className="sns-input sns-mono" value={form.employeeNumber} onChange={(e) => update('employeeNumber', e.target.value)} placeholder="e.g. SNS005" />
        </FormField>
      ) : (
        <FormField label="Employee number" hint="Given by your admin.">
          <input className="sns-input sns-mono" value={profile.employeeNumber || 'Not assigned yet'} readOnly />
        </FormField>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Gender">
          <select className="sns-input" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
            <option value="">Not specified</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </FormField>
        <FormField label="Date of birth">
          <input type="date" className="sns-input" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
        </FormField>
      </div>

      <FormField label="National ID number">
        <input className="sns-input" value={form.idNumber} onChange={(e) => update('idNumber', e.target.value)} placeholder="e.g. 12345678" />
      </FormField>
      <FormField label="KRA PIN">
        <input className="sns-input" value={form.kraPin} onChange={(e) => update('kraPin', e.target.value)} placeholder="e.g. A012345678Z" />
      </FormField>
      <FormField label="SHA number">
        <input className="sns-input" value={form.shaNumber} onChange={(e) => update('shaNumber', e.target.value)} />
      </FormField>

      <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
        <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  )
}

// "My profile". For an admin it also carries the Settings (access code, commission rate): the
// window then has two tabs, so the settings are found by clicking your own name.
export default function ProfileFormModal({ profile, isSelf, canEditNumber, settings, onClose, onSave }) {
  const [tab, setTab] = useState('profile')
  const title = settings ? 'Profile & settings' : isSelf ? 'My profile' : `Edit ${profile.fullName}`
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: settings ? '34rem' : '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="sns-icon-btn" title="Close"><X size={18} /></button>
        </div>
        {settings && (
          <div className="flex gap-1 sns-border-b" style={{ padding: '0 1.4rem' }}>
            <button type="button" className={`sns-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>My profile</button>
            <button type="button" className={`sns-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
          </div>
        )}
        {settings && tab === 'settings'
          ? <div style={{ padding: '1.4rem' }}>{settings}</div>
          : <ProfileFields profile={profile} canEditNumber={canEditNumber} onClose={onClose} onSave={onSave} />}
      </div>
    </div>
  )
}
