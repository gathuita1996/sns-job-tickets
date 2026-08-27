import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { JOB_TYPES, LOCATIONS, TRANSPORT_LOCATIONS, STATUS_OPTIONS, PRIORITY_OPTIONS, MAX_TRANSPORT, defaultJobForm, isOverdue, toDateInputValue, formatDate, formatKSh } from '../lib/helpers'

// A saved job's transport_from/to is just resolved text -- this figures out
// whether that text matches a known location (so the dropdown can show it
// directly) or was custom-typed via "Other" (so "Other" should be selected
// and the typed text restored into the accompanying text field).
function resolveTransportField(storedValue) {
  if (!storedValue) return { selected: '', other: '' }
  if (TRANSPORT_LOCATIONS.includes(storedValue)) return { selected: storedValue, other: '' }
  return { selected: 'Other', other: storedValue }
}

// technicalMembers is only passed when an admin opens this form (to assign
// or reassign a job to a technician) -- its presence switches on admin mode.
// reassignOnly further restricts that: used when the job was filed by a
// member directly (not originally admin-assigned) -- admin can hand it to
// a technician, but can't touch any of its other details.
// allMembers (everyone, any department) powers the "raised by" field.
// availableCustomers is the not-yet-installed leads a member filing a New
// Installation can pick from, to link the job back to that customer record.
export default function JobFormModal({ initialJob, technicalMembers, allMembers, availableCustomers, reassignOnly, onClose, onSave }) {
  const adminMode = Boolean(technicalMembers)
  const isNewAdminAssignment = adminMode && !initialJob
  const editingOverdue = Boolean(initialJob) && isOverdue(initialJob)
  const fromResolved = initialJob ? resolveTransportField(initialJob.transportFrom) : null
  const toResolved = initialJob ? resolveTransportField(initialJob.transportTo) : null

  const [form, setForm] = useState(initialJob ? {
    jobType: initialJob.jobType, jobTypeOther: initialJob.jobTypeOther || '', location: initialJob.location,
    requestedBy: initialJob.requestedBy, requesterContact: initialJob.requesterContact || '',
    visitDate: initialJob.visitDate,
    transportFrom: fromResolved.selected, transportFromOther: fromResolved.other,
    transportTo: toResolved.selected, transportToOther: toResolved.other,
    transportAmount: initialJob.transportAmount, status: initialJob.status,
    priority: initialJob.priority || 'Normal', notes: initialJob.notes || '', overdueReason: initialJob.overdueReason || '',
    assignedTo: initialJob.memberId || '', raisedBy: initialJob.raisedBy || '', customerId: initialJob.customerId || null,
  } : { ...defaultJobForm(), status: adminMode ? 'Pending' : '', assignedTo: '', raisedBy: '', customerId: null })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function selectExistingCustomer(customerId) {
    if (!customerId) { update('customerId', null); return }
    const c = availableCustomers.find((c) => String(c.id) === String(customerId))
    setForm((f) => ({
      ...f,
      customerId: customerId ? Number(customerId) : null,
      requestedBy: c ? c.fullName : f.requestedBy,
      requesterContact: c ? c.contact : f.requesterContact,
      location: c ? c.location : f.location,
    }))
  }

  function validate() {
    if (reassignOnly) {
      const e = {}
      if (!form.assignedTo) e.assignedTo = 'Please choose who this job goes to'
      setErrors(e)
      return Object.keys(e).length === 0
    }
    const e = {}
    if (!form.jobType) e.jobType = 'Please select a job type'
    if (form.jobType === 'Other' && !form.jobTypeOther.trim()) e.jobTypeOther = 'Please describe the job type'
    if (!form.location) e.location = 'Please select a location'
    if (!form.requestedBy.trim()) e.requestedBy = 'Required'
    if (!form.visitDate) e.visitDate = 'Required'
    else if (!adminMode && form.visitDate > toDateInputValue(new Date())) e.visitDate = "You can't file a job for a future date — please choose today or an earlier date."
    if (!isNewAdminAssignment) {
      if (!form.transportFrom) e.transportFrom = 'Please select a starting point'
      else if (form.transportFrom === 'Other' && !form.transportFromOther.trim()) e.transportFromOther = 'Please specify the starting location'
      if (!form.transportTo) e.transportTo = 'Please select a destination'
      else if (form.transportTo === 'Other' && !form.transportToOther.trim()) e.transportToOther = 'Please specify the destination'
      if (form.transportAmount === '' || isNaN(Number(form.transportAmount)) || Number(form.transportAmount) < 0) e.transportAmount = 'Enter a valid amount'
      else if (Number(form.transportAmount) > MAX_TRANSPORT) e.transportAmount = `Transport can't exceed KSh ${MAX_TRANSPORT} for this leg.`
    }
    if (!form.status) e.status = 'Please select a status'
    if (!form.notes.trim()) e.notes = 'Job details are required'
    if (adminMode && !form.assignedTo) e.assignedTo = 'Please choose who this job goes to'
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
    await onSave({
      ...form,
      transportFrom: form.transportFrom === 'Other' ? form.transportFromOther.trim() : form.transportFrom,
      transportTo: form.transportTo === 'Other' ? form.transportToOther.trim() : form.transportTo,
      transportAmount: form.transportAmount === '' ? 0 : Number(form.transportAmount),
    })
    setSubmitting(false)
  }

  const jobTypeCls = `sns-input${form.jobType === '' ? ' sns-select-placeholder' : ''}`
  const locationCls = `sns-input${form.location === '' ? ' sns-select-placeholder' : ''}`
  const statusCls = `sns-input${form.status === '' ? ' sns-select-placeholder' : ''}`
  const assigneeCls = `sns-input${form.assignedTo === '' ? ' sns-select-placeholder' : ''}`

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{reassignOnly ? 'Reassign job' : (initialJob ? (adminMode ? 'Edit / reassign job card' : 'Edit job card') : (adminMode ? 'Assign a new job' : 'File a new job card'))}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          {reassignOnly ? (
            <>
              <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                This job was filed directly by a member, so its details aren't editable here — reassigning who it belongs to is the one thing admin can change.
              </p>
              <div className="sns-card" style={{ padding: '0.9rem 1.1rem', background: 'var(--paper)' }}>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>{initialJob.jobId} — {initialJob.jobType === 'Other' && initialJob.jobTypeOther ? initialJob.jobTypeOther : initialJob.jobType}</p>
                <p className="sns-text-soft" style={{ fontSize: '0.82rem' }}>{initialJob.location} · {formatDate(initialJob.visitDate)} · {formatKSh(initialJob.transportAmount)}</p>
                {initialJob.notes && <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginTop: '0.4rem' }}>{initialJob.notes}</p>}
              </div>
              <FormField label="Reassign to" error={errors.assignedTo} hint="Only Technical department members can be assigned a job.">
                <select className={assigneeCls} value={form.assignedTo} onChange={(e) => update('assignedTo', e.target.value)}>
                  <option value="" disabled>select-technician</option>
                  {technicalMembers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </FormField>
              <div className="flex gap-3" style={{ paddingTop: '0.4rem' }}>
                <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Reassign'}</button>
              </div>
            </>
          ) : (
          <>
          {editingOverdue && (
            <div className="sns-alert-banner">This job is overdue. Explain why below, and move it to In Progress or Completed to close it out.</div>
          )}

          {adminMode && (
            <>
              <FormField label="Assign to" error={errors.assignedTo} hint="Only Technical department members can be assigned a job.">
                <select className={assigneeCls} value={form.assignedTo} onChange={(e) => update('assignedTo', e.target.value)}>
                  <option value="" disabled>select-technician</option>
                  {technicalMembers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </FormField>
              <FormField label="Raised by (optional)" hint="Which team member reported or flagged this, if applicable.">
                <select className="sns-input" value={form.raisedBy} onChange={(e) => update('raisedBy', e.target.value)}>
                  <option value="">— Not specified —</option>
                  {(allMembers || []).map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </FormField>
            </>
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

          {!adminMode && form.jobType === 'New Installation' && availableCustomers && availableCustomers.length > 0 && (
            <FormField label="Link to a recorded customer (optional)" hint="Pick a previously recorded lead to auto-fill their details below. Already-installed customers won't appear here again.">
              <select className="sns-input" value={form.customerId || ''} onChange={(e) => selectExistingCustomer(e.target.value)}>
                <option value="">— Not linked to a recorded customer —</option>
                {availableCustomers.map((c) => <option key={c.id} value={c.id}>{c.fullName} — {c.location}</option>)}
              </select>
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
            <FormField label="Date of visit" error={errors.visitDate} hint={adminMode ? 'Can be a future date if this is scheduled ahead of time.' : undefined}>
              <input type="date" max={adminMode ? undefined : toDateInputValue(new Date())} className="sns-input" value={form.visitDate} onChange={(e) => update('visitDate', e.target.value)} />
            </FormField>
            <FormField label="Priority">
              <select className="sns-input" value={form.priority} onChange={(e) => update('priority', e.target.value)}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </div>

          {!isNewAdminAssignment && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="From" error={errors.transportFrom}>
                  <select className="sns-input" value={form.transportFrom} onChange={(e) => update('transportFrom', e.target.value)}>
                    {TRANSPORT_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                    <option value="Other">Other</option>
                  </select>
                </FormField>
                <FormField label="To" error={errors.transportTo}>
                  <select className={`sns-input${form.transportTo === '' ? ' sns-select-placeholder' : ''}`} value={form.transportTo} onChange={(e) => update('transportTo', e.target.value)}>
                    <option value="" disabled>select-destination</option>
                    {TRANSPORT_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                    <option value="Other">Other</option>
                  </select>
                </FormField>
              </div>

              {form.transportFrom === 'Other' && (
                <FormField label="Specify starting location" error={errors.transportFromOther}>
                  <input className="sns-input" value={form.transportFromOther} onChange={(e) => update('transportFromOther', e.target.value)} placeholder="Where did the trip start?" />
                </FormField>
              )}
              {form.transportTo === 'Other' && (
                <FormField label="Specify destination" error={errors.transportToOther}>
                  <input className="sns-input" value={form.transportToOther} onChange={(e) => update('transportToOther', e.target.value)} placeholder="Where did the trip end?" />
                </FormField>
              )}

              <FormField label="Transport amount (KSh)" error={errors.transportAmount} hint={`Cost for this leg only, ${form.transportFrom === 'Other' ? (form.transportFromOther || '—') : form.transportFrom} to ${form.transportTo === 'Other' ? (form.transportToOther || '—') : (form.transportTo || '—')}. Maximum KSh ${MAX_TRANSPORT}.`}>
                <input type="number" min="0" max={MAX_TRANSPORT} step="1" className="sns-input" value={form.transportAmount} onChange={(e) => update('transportAmount', e.target.value)} placeholder="0" />
              </FormField>
            </>
          )}

          <FormField label="Status" error={errors.status}>
            <select className={statusCls} value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="" disabled>select-status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>

          <FormField label={adminMode ? 'Job details (guidance for the technician)' : 'Job details'} error={errors.notes} hint={adminMode ? 'Include everything the technician needs to handle this in the field — what was reported, by whom, and any relevant history.' : undefined}>
            <textarea className="sns-input" rows={adminMode ? 4 : 3} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder={adminMode ? 'What was reported, and what does the technician need to know?' : 'Describe the issue and the work carried out…'} />
          </FormField>

          {editingOverdue && (
            <FormField label="Why was this overdue?" error={errors.overdueReason}>
              <textarea className="sns-input" rows={2} value={form.overdueReason} onChange={(e) => update('overdueReason', e.target.value)} placeholder="Explain the delay…" />
            </FormField>
          )}

          <div className="flex gap-3" style={{ paddingTop: '0.4rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : (initialJob ? 'Save changes' : (adminMode ? 'Assign job' : 'File job card'))}</button>
          </div>
          </>
          )}
        </form>
      </div>
    </div>
  )
}
