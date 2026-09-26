import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import { FormField } from './shared'
import { formatDate, formatKSh, toDateInputValue } from '../lib/helpers'

const MAX_RECEIPT_MB = 8
const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']

// Shown once a request has been Approved -- the person has now actually
// gone and made the purchase, and this is where they attach proof.
// Deliberately locked down to just the receipt: the amount was fixed at
// approval time (the database itself rejects a change here, this UI just
// doesn't offer one), and the purchase date is today, not something to
// pick -- this step is "prove it happened," not "revise the request."
export default function AttachReceiptModal({ expense, onClose, onSave }) {
  const [receiptFile, setReceiptFile] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const today = toDateInputValue(new Date())

  function handleFileChange(ev) {
    const file = ev.target.files?.[0]
    if (!file) return
    const isPdfByName = file.name.toLowerCase().endsWith('.pdf')
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type) && !isPdfByName) {
      setError('Only PDF or photo files (JPG, PNG, HEIC, etc.) are allowed.')
      return
    }
    if (file.size > MAX_RECEIPT_MB * 1024 * 1024) {
      setError(`File is too large — please keep it under ${MAX_RECEIPT_MB}MB.`)
      return
    }
    setError('')
    setReceiptFile(file)
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!receiptFile) { setError('Please upload the receipt'); return }
    setSubmitting(true)
    await onSave({ amount: expense.amount, purchaseDate: today, receiptFile })
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Attach receipt</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
            <strong>{expense.description}</strong> was approved. Attach a photo or PDF of the receipt to confirm the purchase was made.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Approved amount (KSh)">
              <div className="sns-input" style={{ background: 'var(--paper)', color: 'var(--ink-soft)', cursor: 'not-allowed' }}>
                {formatKSh(expense.amount)}
              </div>
            </FormField>
            <FormField label="Date of purchase">
              <div className="sns-input" style={{ background: 'var(--paper)', color: 'var(--ink-soft)', cursor: 'not-allowed' }}>
                {formatDate(today)}
              </div>
            </FormField>
          </div>

          <FormField label="Upload Receipt" error={error} hint={`PDF or photo only. Max ${MAX_RECEIPT_MB}MB.`}>
            <label
              className="sns-input"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', borderStyle: 'dashed' }}
            >
              <Upload size={16} />
              <span style={{ fontSize: '0.85rem' }}>{receiptFile ? receiptFile.name : 'Tap to upload receipt'}</span>
              <input type="file" accept="image/*,.heic,.heif,.pdf" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          </FormField>

          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Uploading…' : 'Save receipt'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
