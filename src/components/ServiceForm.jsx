import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { toDateInputValue } from '../lib/helpers'

// Admin-only, for paying someone who isn't SNS staff (a cleaner, a
// one-off repair person, etc.) -- no receipt involved, since this is
// about a service rendered, not a purchased item with a paper trail.
export default function ServiceFormModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    description: '',
    providerName: '',
    providerContact: '',
    serviceDate: toDateInputValue(new Date()),
    amount: '',
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.description.trim()) e.description = 'Please describe the service'
    if (!form.providerName.trim()) e.providerName = 'Required'
    if (!form.providerContact.trim()) e.providerContact = 'Required'
    if (!form.serviceDate) e.serviceDate = 'Required'
    if (form.amount === '' || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Enter a valid amount'
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

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Log a service</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="What service was this?" error={errors.description}>
            <input className="sns-input" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="e.g. General office cleaning" />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Provider's name" error={errors.providerName}>
              <input className="sns-input" value={form.providerName} onChange={(e) => update('providerName', e.target.value)} placeholder="Full name" />
            </FormField>
            <FormField label="Provider's contact" error={errors.providerContact}>
              <input className="sns-input" value={form.providerContact} onChange={(e) => update('providerContact', e.target.value)} placeholder="e.g. 0712 345 678" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date of service" error={errors.serviceDate}>
              <input type="date" max={toDateInputValue(new Date())} className="sns-input" value={form.serviceDate} onChange={(e) => update('serviceDate', e.target.value)} />
            </FormField>
            <FormField label="Amount (KSh)" error={errors.amount}>
              <input type="number" min="0" step="1" className="sns-input" value={form.amount} onChange={(e) => update('amount', e.target.value)} placeholder="0" />
            </FormField>
          </div>

          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Submitting…' : 'Submit for approval'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
