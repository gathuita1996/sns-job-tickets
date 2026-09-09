import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { FormField } from './shared'
import { EXPENSE_CATEGORIES, defaultExpenseForm, toDateInputValue } from '../lib/helpers'

const MAX_RECEIPT_MB = 8
const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']

export default function ExpenseFormModal({ onClose, onSave }) {
  const [form, setForm] = useState(defaultExpenseForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function handleFileChange(ev) {
    const file = ev.target.files?.[0]
    if (!file) return
    // The accept attribute is only a picker hint, not an enforced rule --
    // some browsers and OS file pickers let people bypass it, so this
    // checks the actual file before it's accepted.
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf')
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type) && !isPdfByName) {
      setErrors((e) => ({ ...e, receiptFile: 'Only PDF or photo files (JPG, PNG, HEIC, etc.) are allowed.' }))
      return
    }
    if (file.size > MAX_RECEIPT_MB * 1024 * 1024) {
      setErrors((e) => ({ ...e, receiptFile: `File is too large — please keep it under ${MAX_RECEIPT_MB}MB.` }))
      return
    }
    update('receiptFile', file)
  }

  function validate() {
    const e = {}
    if (!form.description.trim()) e.description = 'Please describe what this was for'
    if (form.amount === '' || isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Enter a valid amount'
    if (!form.category) e.category = 'Please select a category'
    if (!form.purchaseDate) e.purchaseDate = 'Required'
    if (!form.receiptFile) e.receiptFile = 'Please upload the receipt'
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
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Submit a purchase</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="What was this for?" error={errors.description}>
            <input className="sns-input" value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="e.g. Fiber splicing tool, fuel for site visit…" />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Amount (KSh)" error={errors.amount}>
              <input type="number" min="0" step="1" className="sns-input" value={form.amount} onChange={(e) => update('amount', e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Date of purchase" error={errors.purchaseDate}>
              <input type="date" max={toDateInputValue(new Date())} className="sns-input" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} />
            </FormField>
          </div>

          <FormField label="Category" error={errors.category}>
            <select className={categoryCls} value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="" disabled>select-category</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>

          <FormField label="Upload Receipt" error={errors.receiptFile} hint={`PDF or photo only. Max ${MAX_RECEIPT_MB}MB.`}>
            <label
              className="sns-input"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', borderStyle: 'dashed' }}
            >
              <Upload size={16} />
              <span style={{ fontSize: '0.85rem' }}>{form.receiptFile ? form.receiptFile.name : 'Tap to upload receipt'}</span>
              <input type="file" accept="image/*,.heic,.heif,.pdf" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </FormField>

          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Uploading…' : 'Submit purchase'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
