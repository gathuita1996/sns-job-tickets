import { useRef, useState } from 'react'
import { Camera, Lock, Trash2, X } from 'lucide-react'
import { FormField } from './shared'
import Avatar from './Avatar'
import { ACCOUNT_NUMBER_FORMAT, BANKS } from '../lib/helpers'
import { validateAvatarFile } from '../lib/image'

const NUMBER_FORMAT = /^SNS\d{3,}$/i

function AvatarPicker({ profile, canUpload, onUpload, onRemove }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function pick(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const problem = validateAvatarFile(file)
    if (problem) { setError(problem); return }
    setError(''); setBusy(true)
    try { await onUpload(file) } finally { setBusy(false) }
  }
  async function remove() { setBusy(true); try { await onRemove(profile.id) } finally { setBusy(false) } }
  return (
    <div className="flex items-center gap-4">
      <Avatar name={profile.fullName} url={profile.avatarUrl} size={76} />
      <div>
        <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>Profile picture</p>
        <p className="sns-text-faint" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>A clear photo of your face. JPG, PNG or WebP.</p>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {canUpload && onUpload && (
            <>
              <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.8rem' }} disabled={busy} onClick={() => input.current && input.current.click()}>
                <Camera size={14} /> {busy ? 'Working…' : profile.avatarUrl ? 'Change picture' : 'Add picture'}
              </button>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} style={{ display: 'none' }} aria-label="Choose a profile picture" />
            </>
          )}
          {profile.avatarUrl && onRemove && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.8rem' }} disabled={busy} onClick={remove}><Trash2 size={14} /> Remove</button>}
        </div>
        {error && <p role="alert" style={{ color: 'var(--overdue)', fontSize: '0.78rem', marginTop: '0.4rem' }}>{error}</p>}
      </div>
    </div>
  )
}

function ProfileFields({ profile, bank, canEditNumber, isSelf, onClose, onSave, onUploadAvatar, onRemoveAvatar }) {
  const [form, setForm] = useState({
    fullName: profile.fullName, username: profile.username, contact: profile.contact, title: profile.title || '',
    gender: profile.gender || '', dateOfBirth: profile.dateOfBirth || '',
    idNumber: profile.idNumber || '', kraPin: profile.kraPin || '', shaNumber: profile.shaNumber || '',
    employeeNumber: profile.employeeNumber || '',
    bankName: (bank && bank.bankName) || '', branch: (bank && bank.branch) || '', accountNumber: (bank && bank.accountNumber) || '', accountName: (bank && bank.accountName) || '',
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
    const acct = form.accountNumber.trim(), bankName = form.bankName.trim()
    if (acct && !ACCOUNT_NUMBER_FORMAT.test(acct)) e.accountNumber = 'Use 4–30 letters, numbers, spaces or dashes.'
    if (acct && !bankName) e.bankName = 'Add the bank name'
    if (bankName && !acct) e.accountNumber = 'Add the account number'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSave({
      full_name: form.fullName.trim(), username: form.username.trim(), contact: form.contact.trim(), title: form.title.trim() || null,
      gender: form.gender || null, date_of_birth: form.dateOfBirth || null,
      id_number: form.idNumber.trim() || null, kra_pin: form.kraPin.trim() || null, sha_number: form.shaNumber.trim() || null,
      // only an admin editing someone else sends this, so nobody's own save ever touches their number
      ...(canEditNumber ? { employee_number: form.employeeNumber.trim().toUpperCase() || null } : {}),
    }, { bankName: form.bankName, branch: form.branch, accountNumber: form.accountNumber, accountName: form.accountName })
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
      <AvatarPicker profile={profile} canUpload={isSelf} onUpload={onUploadAvatar} onRemove={onRemoveAvatar} />
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
        <FormField label="Employee number" error={errors.employeeNumber} hint="Unique for each person, in the form SNS001. Use the Staff tab to give numbers to everyone at once.">
          <input className="sns-input sns-mono" value={form.employeeNumber} onChange={(e) => update('employeeNumber', e.target.value)} placeholder="e.g. SNS005" />
        </FormField>
      ) : (
        <FormField label="Employee number" hint="Given by the admin. It cannot be changed here.">
          <div className="flex items-center gap-2">
            <input className="sns-input sns-mono" value={profile.employeeNumber || 'Not assigned yet'} readOnly aria-readonly="true" style={{ flex: 1, opacity: 0.85 }} />
            <Lock size={16} className="sns-text-faint" aria-hidden="true" />
          </div>
        </FormField>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Gender">
          <select className="sns-input" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
            <option value="">Not specified</option><option value="Male">Male</option><option value="Female">Female</option>
          </select>
        </FormField>
        <FormField label="Date of birth">
          <input type="date" className="sns-input" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
        </FormField>
      </div>
      <FormField label="National ID number"><input className="sns-input" value={form.idNumber} onChange={(e) => update('idNumber', e.target.value)} placeholder="e.g. 12345678" /></FormField>
      <FormField label="KRA PIN"><input className="sns-input" value={form.kraPin} onChange={(e) => update('kraPin', e.target.value)} placeholder="e.g. A012345678Z" /></FormField>
      <FormField label="SHA number"><input className="sns-input" value={form.shaNumber} onChange={(e) => update('shaNumber', e.target.value)} /></FormField>

      <div className="sns-border-t" style={{ paddingTop: '1rem' }}>
        <h4 className="sns-display" style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.2rem' }}>Bank details</h4>
        <p className="sns-text-faint" style={{ fontSize: '0.78rem', marginBottom: '0.8rem' }}>For salary and payments. Only you and the admins can see these.</p>
        <div className="space-y-4">
          <FormField label="Bank name" error={errors.bankName}>
            <input className="sns-input" list="sns-bank-list" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} placeholder="e.g. Equity Bank" />
            <datalist id="sns-bank-list">{BANKS.map((b) => <option key={b} value={b} />)}</datalist>
          </FormField>
          <FormField label="Account number" error={errors.accountNumber}>
            <input className="sns-input sns-mono" inputMode="text" value={form.accountNumber} onChange={(e) => update('accountNumber', e.target.value)} placeholder="e.g. 0123456789012" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Account name (optional)"><input className="sns-input" value={form.accountName} onChange={(e) => update('accountName', e.target.value)} placeholder="Name on the account" /></FormField>
            <FormField label="Branch (optional)"><input className="sns-input" value={form.branch} onChange={(e) => update('branch', e.target.value)} placeholder="e.g. Ukunda" /></FormField>
          </div>
        </div>
      </div>

      <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
        <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
        <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  )
}

// "My profile": picture, details, bank details, and (for yourself) Leave. An admin also gets Settings.
export default function ProfileFormModal({ profile, isSelf, canEditNumber, settings, leave, leaveBadge, data, initialTab, bank, onClose, onSave, onUploadAvatar, onRemoveAvatar }) {
  const tabs = [{ key: 'profile', label: isSelf ? 'My profile' : 'Profile' }]
  if (leave) tabs.push({ key: 'leave', label: 'Leave', badge: leaveBadge })
  if (data) tabs.push({ key: 'data', label: 'Data & Backup' })
  if (settings) tabs.push({ key: 'settings', label: 'Settings' })
  const [tab, setTab] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : 'profile')
  const title = settings ? 'Profile & settings' : isSelf ? 'My profile' : `Edit ${profile.fullName}`
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label={title} style={{ width: '100%', maxWidth: tab === 'data' ? '62rem' : tabs.length > 1 ? '40rem' : '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="sns-icon-btn" title="Close" aria-label="Close"><X size={18} /></button>
        </div>
        {tabs.length > 1 && (
          <div className="flex gap-1 sns-border-b" style={{ padding: '0 1.4rem' }} role="tablist">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sns-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                {t.label}{t.badge ? <span className="sns-badge sns-badge-overdue" style={{ marginLeft: '0.4rem' }}>{t.badge}</span> : null}
              </button>
            ))}
          </div>
        )}
        {tab === 'settings' && settings ? <div style={{ padding: '1.4rem' }}>{settings}</div>
          : tab === 'leave' && leave ? <div style={{ padding: '1.4rem' }}>{leave}</div>
          : tab === 'data' && data ? <div style={{ padding: '1.4rem' }}>{data}</div>
          : <ProfileFields profile={profile} bank={bank} canEditNumber={canEditNumber} isSelf={isSelf} onClose={onClose} onSave={onSave} onUploadAvatar={onUploadAvatar} onRemoveAvatar={onRemoveAvatar} />}
      </div>
    </div>
  )
}
