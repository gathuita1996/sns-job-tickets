import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { JOB_TYPES, LOCATIONS, STATUS_OPTIONS, PRIORITY_OPTIONS, defaultJobForm, isOverdue } from '../lib/helpers'

export default function JobFormModal({ initialJob, onClose, onSave }) {
  const editingOverdue = Boolean(initialJob) && isOverdue(initialJob)

  const [form, setForm] = useState(initialJob ? {
    jobType: initialJob.jobType, jobTypeOther: initialJob.jobTypeOther || '', location: initialJob.location,
    requestedBy: initialJob.requestedBy, requesterContact: initialJob.requesterContact || '',
    visitDate: initialJob.visitDate, transportAmount: initialJob.transportAmount, status: initialJob.status,
    priority: initialJob.priority || 'Normal', notes: initialJob.notes || '', overdueReason: initialJob.overdueReason || '',
  } : defaultJobForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.jobType) e.jobType = 'Please select a job type'
    if (form.jobType === 'Other' && !form.jobTypeOther.trim()) e.jobTypeOther = 'Please describe the job type'
    if (!form.location) e.location = 'Please select a location'
    if (!form.requestedBy.trim()) e.requestedBy = 'Required'
    if (!form.visitDate) e.visitDate = 'Required'
    if (form.transportAmount === '' || isNaN(Number(form.transportAmount)) || Number(form.transportAmount) < 0) e.transportAmount = 'Enter a valid amount'
    if (!form.status) e.status = 'Please select a status'
    if (!form.notes.trim()) e.notes = 'Job details are required'
    if (editingOverdue) {
      if (!form.overdueReason.trim()) e.overdueReason = 'Please explain why this job is overdue'
      if (form.status === 'Pending') e.status = 'An overdue job must move to In Progress or Completed to be saved'
    }
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

  const jobTypeCls = `sns-input${form.jobType === '' ? ' sns-select-placeholder' : ''}`
  const locationCls = `sns-input${form.location === '' ? ' sns-select-placeholder' : ''}`
  const statusCls = `sns-input${form.status === '' ? ' sns-select-placeholder' : ''}`

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{initialJob ? 'Edit job card' : 'File a new job card'}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          {editingOverdue && (
            <div className="sns-alert-banner">This job has been Pending for over 24 hours and is overdue. Explain why below, and move it to In Progress or Completed to close it out.</div>
          )}

          <FormField label="Job type" error={errors.jobType}>
            <select className={jobTypeCls} value={form.jobType} onChange={(e) => update('jobType', e.target.value)}>
              <option value="" disabled>select-job-type</option>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>

          {form.jobType === 'Other' && (
            <FormField label="Describe the job type" error={errors.jobTypeOther}>
              <input className="sns-input" value={form.jobTypeOther} onChange={(e) => update('jobTypeOther', e.target.value)} placeholder="What kind of job was this?" />
            </FormField>
          )}

          <FormField label="Location / site" error={errors.location}>
            <select className={locationCls} value={form.location} onChange={(e) => update('location', e.target.value)}>
              <option value="" disabled>select-location/site</option>
              {LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Requested by" error={errors.requestedBy}>
              <input className="sns-input" value={form.requestedBy} onChange={(e) => update('requestedBy', e.target.value)} placeholder="Client / contact name" />
            </FormField>
            <FormField label="Requester contact" hint="Optional">
              <input className="sns-input" value={form.requesterContact} onChange={(e) => update('requesterContact', e.target.value)} placeholder="Optional" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date of visit" error={errors.visitDate}>
              <input type="date" className="sns-input" value={form.visitDate} onChange={(e) => update('visitDate', e.target.value)} />
            </FormField>
            <FormField label="Priority">
              <select className="sns-input" value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Transport amount (KSh)" error={errors.transportAmount} hint="Total for the round trip — to the site and back, combined into one figure.">
            <input type="number" min="0" step="1" className="sns-input" value={form.transportAmount} onChange={(e) => update('transportAmount', e.target.value)} placeholder="0" />
          </FormField>

          <FormField label="Status" error={errors.status}>
            <select className={statusCls} value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="" disabled>select-status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>

          <FormField label="Job details" error={errors.notes}>
            <textarea className="sns-input" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Describe the issue and the work carried out…" />
          </FormField>

          {editingOverdue && (
            <FormField label="Why was this overdue?" error={errors.overdueReason}>
              <textarea className="sns-input" rows={2} value={form.overdueReason} onChange={(e) => update('overdueReason', e.target.value)} placeholder="Explain the delay…" />
            </FormField>
          )}

          <div className="flex gap-3" style={{ paddingTop: '0.4rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : (initialJob ? 'Save changes' : 'File job card')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
