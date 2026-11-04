import { useState } from 'react'
import { X } from 'lucide-react'
import { ConfirmDialog, FormField } from './shared'
import { CONTRACT_TYPES, contractInfo, leaveEffect } from '../lib/contracts'
import { formatDate } from '../lib/helpers'

// The Director's form for a contract. If the change adds or removes annual leave, it says so and asks first.
export default function ContractModal({ member, contract, policyDays = 21, onSave, onClose }) {
  const [f, setF] = useState(contract
    ? { contractType: contract.contractType, startDate: contract.startDate, termMonths: contract.termMonths, renewsOnCompletion: contract.renewsOnCompletion, notes: contract.notes || '' }
    : { contractType: 'annual', startDate: '', termMonths: 12, renewsOnCompletion: false, notes: '' })
  const [errors, setErrors] = useState({})
  const [ask, setAsk] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const pickType = (type) => setF((x) => ({ ...x, contractType: type, termMonths: CONTRACT_TYPES[type].defaultMonths, renewsOnCompletion: CONTRACT_TYPES[type].defaultRenews }))
  const info = f.startDate ? contractInfo({ ...f, termMonths: Number(f.termMonths) || 1 }) : null
  const effect = leaveEffect(contract && contract.contractType, f.contractType)

  async function save() {
    setAsk(null); setBusy(true)
    const done = await onSave({ ...f, termMonths: Number(f.termMonths) })
    setBusy(false); if (done !== false) onClose()
  }
  function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.startDate) er.startDate = 'Choose the day the contract started'
    const m = Number(f.termMonths); if (!Number.isInteger(m) || m < 1 || m > 60) er.termMonths = 'Use a whole number of months, from 1 to 60'
    setErrors(er); if (Object.keys(er).length) return
    if (effect !== 'none') setAsk(effect); else save()
  }
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label="Contract agreement" style={{ width: '100%', maxWidth: '30rem', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Contract: {member.fullName}</h3>
          <button onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Contract type">
            <select className="sns-input" aria-label="Contract type" value={f.contractType} onChange={(e) => pickType(e.target.value)}>
              <option value="annual">1 year contract (annual leave)</option><option value="short_term">Short term contract (no annual leave)</option>
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Started on" error={errors.startDate}><input type="date" className="sns-input" aria-label="Started on" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></FormField>
            <FormField label="Term (months)" error={errors.termMonths}><input type="number" min="1" max="60" className="sns-input" aria-label="Term in months" value={f.termMonths} onChange={(e) => set('termMonths', e.target.value)} /></FormField>
          </div>
          <label className="flex items-center gap-2" style={{ fontSize: '0.85rem' }}><input type="checkbox" checked={f.renewsOnCompletion} onChange={(e) => set('renewsOnCompletion', e.target.checked)} /> Renewed on completion (starts the next term by itself)</label>
          <FormField label="Notes (optional)"><input className="sns-input" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Probation, agreed salary review" /></FormField>
          {info && <p role="status" className="sns-text-soft" style={{ fontSize: '0.82rem' }}>{info.renews ? `Renews every ${info.termLabel}. Current period: ${formatDate(info.periodStart)} to ${formatDate(info.periodEnd)}.` : `Ends on ${formatDate(info.periodEnd)}.`}</p>}
          {effect === 'adds' && <p className="sns-text-soft" style={{ fontSize: '0.82rem', fontWeight: 600 }}>This adds annual leave ({policyDays} days a year) to {member.fullName}'s profile.</p>}
          {effect === 'removes' && <p className="sns-text-soft" style={{ fontSize: '0.82rem', fontWeight: 600 }}>This removes annual leave from {member.fullName}'s profile. Leave already recorded is kept.</p>}
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '0.5rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={busy} className="sns-btn-primary" style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save contract'}</button>
          </div>
        </form>
      </div>
      {ask === 'adds' && <ConfirmDialog title="Add annual leave?" message={`${member.fullName} will get ${policyDays} days of annual leave a year, and can apply for it straight away. Leave already recorded for them is kept and counted.`} onCancel={() => setAsk(null)} onConfirm={save} />}
      {ask === 'removes' && <ConfirmDialog title="Remove annual leave?" message={`${member.fullName} will no longer have annual leave, and the Leave section disappears from their profile. Leave already recorded is kept, and comes back if they return to a 1-year contract.`} danger onCancel={() => setAsk(null)} onConfirm={save} />}
    </div>
  )
}
