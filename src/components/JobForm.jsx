import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { JOB_TYPES, STATUS_OPTIONS, defaultJobForm } from '../lib/helpers'

export default function JobFormModal({ initialJob, onClose, onSave }) {
  const [form, setForm] = useState(initialJob ? {
    jobType: initialJob.jobType, location: initialJob.location, requestedBy: initialJob.requestedBy,
    requesterContact: initialJob.requesterContact || '', visitDate: initialJob.visitDate,
    transportAmount: initialJob.transportAmount, status: initialJob.status, notes: initialJob.notes || '',
  } : defaultJobForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.location.trim()) e.location = 'Required'
    if (!form.requestedBy.trim()) e.requestedBy = 'Required'
    if (!form.visitDate) e.visitDate = 'Required'
    if (form.transportAmount === '' || isNaN(Number(form.transportAmount)) || Number(form.transportAmount) < 0) e.transportAmount = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSave({ ...form, transportAmount: Number(form.transportAmount) })
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{initialJob ? 'Edit job card' : 'File a new job card'}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Job type">
            <select className="sns-input" value={form.jobType} onChange={(e) => update('jobType', e.target.value)}>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Location / site" error={errors.location} hint="Where the job was carried out.">
            <input className="sns-input" value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="e.g. Eldoret CBD, ABC Plaza" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Requested by" error={errors.requestedBy}>
              <input className="sns-input" value={form.requestedBy} onChange={(e) => update('requestedBy', e.target.value)} placeholder="Client / contact name" />
            </FormField>
            <FormField label="Requester contact">
              <input className="sns-input" value={form.requesterContact} onChange={(e) => update('requesterContact', e.target.value)} placeholder="Optional" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date of visit" error={errors.visitDate}>
              <input type="date" className="sns-input" value={form.visitDate} onChange={(e) => update('visitDate', e.target.value)} />
            </FormField>
            <FormField label="Transport amount (KSh)" error={errors.transportAmount}>
              <input type="number" min="0" step="1" className="sns-input" value={form.transportAmount} onChange={(e) => update('transportAmount', e.target.value)} placeholder="0" />
            </FormField>
          </div>
          <FormField label="Status">
            <select className="sns-input" value={form.status} onChange={(e) => update('status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Job details / notes">
            <textarea className="sns-input" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Describe the issue and the work carried out…" />
          </FormField>
          <div className="flex gap-3" style={{ paddingTop: '0.4rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : (initialJob ? 'Save changes' : 'File job card')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
