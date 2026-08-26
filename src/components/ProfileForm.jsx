import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'

export default function ProfileFormModal({ profile, isSelf, onClose, onSave }) {
  const [form, setForm] = useState({
    fullName: profile.fullName, username: profile.username,
    contact: profile.contact, title: profile.title || '',
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
    })
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{isSelf ? 'My profile' : `Edit ${profile.fullName}`}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
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
          <div className="flex gap-3" style={{ paddingTop: '0.4rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
