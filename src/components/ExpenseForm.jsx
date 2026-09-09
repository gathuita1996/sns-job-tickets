import { useState } from 'react'
import { X } from 'lucide-react'
import { FormField } from './shared'
import { EXPENSE_CATEGORIES, defaultExpenseForm } from '../lib/helpers'

// This is the request stage only -- what's needed and roughly how much.
// No receipt, no purchase date -- nothing's been bought yet. Those come
// later, once a Director approves and the person actually makes the
// purchase (see AttachReceiptModal).
export default function ExpenseFormModal({ onClose, onSave }) {
  const [form, setForm] = useState(defaultExpenseForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.description.trim()) e.description = 'Please describe what this is for'
    if (form.amount === '' || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Enter a valid estimated amount'
    if (!form.category) e.category = 'Please select a category'
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

  const categoryCls = `sns-input${form.category === '' ? ' sns-select-placeholder' : ''}`

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Request a purchase</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="What do you need to buy?" error={errors.description}>
            <input className="sns-input" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="e.g. Fiber splicing tool, fuel for site visit…" />
          </FormField>

          <FormField label="Estimated amount (KSh)" error={errors.amount} hint="Doesn't need to be exact — you'll confirm the real amount once you have the receipt.">
            <input type="number" min="0" step="1" className="sns-input" value={form.amount} onChange={(e) => update('amount', e.target.value)} placeholder="0" />
          </FormField>

          <FormField label="Category" error={errors.category}>
            <select className={categoryCls} value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="" disabled>select-category</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Submitting…' : 'Submit request'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
