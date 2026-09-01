import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { LOCATIONS, COMPLAINT_TYPES, defaultComplaintForm } from '../lib/helpers'

export default function ComplaintFormModal({ onClose, onSave }) {
  const [form, setForm] = useState(defaultComplaintForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.complainantName.trim()) e.complainantName = 'Required'
    if (!form.location) e.location = 'Please select a location'
    if (!form.contact.trim()) e.contact = 'Required'
    if (!form.complaintType) e.complaintType = 'Please select a complaint type'
    else if (form.complaintType === 'Other' && !form.complaintTypeOther.trim()) e.complaintTypeOther = 'Please describe the complaint type'
    if (!form.details.trim()) e.details = 'Please describe what happened'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSave(form)
    setSubmitting(false)
  }

  const locationCls = `sns-input${form.location === '' ? ' sns-select-placeholder' : ''}`
  const typeCls = `sns-input${form.complaintType === '' ? ' sns-select-placeholder' : ''}`

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Report a complaint</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Who raised the complaint" error={errors.complainantName}>
            <input className="sns-input" value={form.complainantName} onChange={(e) => update('complainantName', e.target.value)} placeholder="Customer / contact name" />
          </FormField>

          <FormField label="Location" error={errors.location}>
            <select className={locationCls} value={form.location} onChange={(e) => update('location', e.target.value)}>
              <option value="" disabled>select-location</option>
              {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </FormField>

          <FormField label="Contact" error={errors.contact}>
            <input className="sns-input" value={form.contact} onChange={(e) => update('contact', e.target.value)} placeholder="e.g. 0712 345 678" />
          </FormField>

          <FormField label="Type of complaint" error={errors.complaintType}>
            <select className={typeCls} value={form.complaintType} onChange={(e) => update('complaintType', e.target.value)}>
              <option value="" disabled>select-complaint-type</option>
              {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>

          {form.complaintType === 'Other' && (
            <FormField label="Describe the complaint type" error={errors.complaintTypeOther}>
              <input className="sns-input" value={form.complaintTypeOther} onChange={(e) => update('complaintTypeOther', e.target.value)} placeholder="What kind of complaint was this?" />
            </FormField>
          )}

          <FormField label="Details of the complaint" error={errors.details}>
            <textarea className="sns-input" rows={4} value={form.details} onChange={(e) => update('details', e.target.value)} placeholder="What happened, in the customer's own words if possible…" />
          </FormField>

          <FormField label="Has this come up before?">
            <div className="flex gap-2">
              <button type="button" onClick={() => update('isRecurring', false)} className={!form.isRecurring ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1 }}>New</button>
              <button type="button" onClick={() => update('isRecurring', true)} className={form.isRecurring ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1, background: form.isRecurring ? 'var(--overdue)' : undefined }}>Recurring</button>
            </div>
          </FormField>

          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Report complaint'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
