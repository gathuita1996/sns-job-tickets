import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { LOCATIONS, PACKAGES, defaultCustomerForm, toDateInputValue } from '../lib/helpers'

export default function CustomerFormModal({ initialCustomer, onClose, onSave }) {
  const [form, setForm] = useState(initialCustomer ? {
    firstName: initialCustomer.firstName, lastName: initialCustomer.lastName, contact: initialCustomer.contact,
    location: initialCustomer.location, interestedPackage: initialCustomer.interestedPackage || PACKAGES[0],
    notes: initialCustomer.notes || '', desiredDate: initialCustomer.desiredDate || '',
  } : defaultCustomerForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'Required'
    if (!form.lastName.trim()) e.lastName = 'Required'
    if (!form.contact.trim()) e.contact = 'Required'
    if (!form.location) e.location = 'Please select a location'
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

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{initialCustomer ? 'Edit customer' : 'Record a new customer'}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="First name" error={errors.firstName}>
              <input className="sns-input" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="First name" />
            </FormField>
            <FormField label="Last name" error={errors.lastName}>
              <input className="sns-input" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Last name" />
            </FormField>
          </div>
          <FormField label="Contact number" error={errors.contact}>
            <input className="sns-input" value={form.contact} onChange={(e) => update('contact', e.target.value)} placeholder="e.g. 0712 345 678" />
          </FormField>
          <FormField label="Location / area" error={errors.location}>
            <select className={locationCls} value={form.location} onChange={(e) => update('location', e.target.value)}>
              <option value="" disabled>select-location/site</option>
              {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </FormField>
          <FormField label="Interested package">
            <select className="sns-input" value={form.interestedPackage} onChange={(e) => update('interestedPackage', e.target.value)}>
              {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormField>
          <FormField
            label="Wants service on (optional)"
            hint={initialCustomer
              ? 'Changing this only updates the note on file — it will not move any job already scheduled.'
              : 'If they gave you a date (e.g. "next Monday"), pick it here — a Pending job gets scheduled for that date automatically, so this follow-up is tracked, not just noted.'}
          >
            <input type="date" min={toDateInputValue(new Date())} className="sns-input" value={form.desiredDate} onChange={(e) => update('desiredDate', e.target.value)} />
          </FormField>
          <FormField label="Notes" hint="Optional — how you met them, best time to reach them, anything useful for follow-up.">
            <textarea className="sns-input" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional notes…" />
          </FormField>
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : (initialCustomer ? 'Save changes' : 'Record customer')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
