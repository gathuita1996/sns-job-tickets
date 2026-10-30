import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Router as RouterIcon, Trash2, X } from 'lucide-react'
import { ConfirmDialog, EmptyState, FormField, SearchInput, StatCard } from './shared'
import { ROUTER_CONDITIONS, ROUTER_MODELS, ROUTER_STATUSES, RETRIEVED_REASONS, customerLabel, formatDate, formatKSh, reasonLabel, routerStatusLabel, toDateInputValue } from '../lib/helpers'

const STATUS_BADGE = { in_store: 'sns-badge-done', under_repair: 'sns-badge-pending', reissued: 'sns-badge-progress', written_off: 'sns-badge-overdue' }
const conditionLabel = (k) => (ROUTER_CONDITIONS.find((c) => c.key === k) || {}).label || k

function RouterForm({ initial, customers, members, isAdmin, currentUser, rows, onSave, onClose }) {
  const startModel = initial && !ROUTER_MODELS.includes(initial.routerModel) ? 'Other' : (initial?.routerModel || 'ONU')
  const [f, setF] = useState(initial ? { ...initial, routerModel: startModel, modelOther: startModel === 'Other' ? initial.routerModel : '' } : {
    retrievedDate: toDateInputValue(new Date()), customerId: '', customerName: '', customerContact: '', location: '', routerModel: 'ONU', modelOther: '', serialNumber: '',
    reason: '', reasonNotes: '', amountOwed: '', condition: 'working', accessories: '', retrievedBy: currentUser.id,
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const pickCustomer = (id) => {
    const c = customers.find((x) => String(x.id) === String(id))
    setF((x) => ({ ...x, customerId: id, ...(c ? { customerName: customerLabel(c).split(' — ')[0], customerContact: c.contact || '', location: c.location && c.location !== 'Not specified' ? c.location : x.location } : {}) }))
    setErrors((e) => ({ ...e, customerName: undefined }))
  }
  const dupe = f.serialNumber.trim() && rows.some((r) => r.id !== initial?.id && r.status === 'in_store' && r.serialNumber && r.serialNumber.toLowerCase() === f.serialNumber.trim().toLowerCase())
  const sortedCustomers = useMemo(() => [...customers].sort((a, b) => customerLabel(a).localeCompare(customerLabel(b))), [customers])

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.customerName.trim()) er.customerName = 'Choose the customer, or type the name'
    const model = f.routerModel === 'Other' ? f.modelOther.trim() : f.routerModel
    if (!model) er.routerModel = 'Say which router it is'
    if (!f.reason) er.reason = 'Choose why it was taken back'
    if (f.reason === 'other' && !f.reasonNotes.trim()) er.reasonNotes = 'Please say why it was taken back'
    if (f.reason === 'failed_to_pay' && f.amountOwed !== '' && !(Number(f.amountOwed) >= 0)) er.amountOwed = 'Enter an amount, or leave it empty'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true); await onSave({ ...f, routerModel: model }); setBusy(false)
  }
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 50 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label="Retrieved router" style={{ width: '100%', maxWidth: '32rem', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{initial ? 'Edit retrieved router' : 'Record a retrieved router'}</h3>
          <button onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Date retrieved"><input type="date" className="sns-input" max={toDateInputValue(new Date())} value={f.retrievedDate} onChange={(e) => set('retrievedDate', e.target.value)} /></FormField>
          <FormField label="Customer" error={errors.customerName} hint="Pick a customer from the system, or leave it on “Not in the system” and type the name.">
            <select className="sns-input" value={f.customerId || ''} onChange={(e) => pickCustomer(e.target.value)} aria-label="Customer">
              <option value="">Not in the system</option>
              {sortedCustomers.map((c) => <option key={c.id} value={c.id}>{customerLabel(c)}</option>)}
            </select>
          </FormField>
          <FormField label="Customer name" error={errors.customerName}><input className="sns-input" value={f.customerName} onChange={(e) => set('customerName', e.target.value)} /></FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Phone (optional)"><input className="sns-input" value={f.customerContact} onChange={(e) => set('customerContact', e.target.value)} /></FormField>
            <FormField label="Location (optional)"><input className="sns-input" value={f.location} onChange={(e) => set('location', e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Router" error={errors.routerModel}>
              <select className="sns-input" value={f.routerModel} onChange={(e) => set('routerModel', e.target.value)}>{ROUTER_MODELS.map((m) => <option key={m}>{m}</option>)}</select>
            </FormField>
            <FormField label="Serial / MAC"><input className="sns-input sns-mono" value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></FormField>
          </div>
          {f.routerModel === 'Other' && <FormField label="Which router?" error={errors.routerModel}><input className="sns-input" value={f.modelOther} onChange={(e) => set('modelOther', e.target.value)} /></FormField>}
          {dupe && <p role="alert" className="flex items-center gap-2" style={{ color: 'var(--stamp-deep)', fontSize: '0.82rem', fontWeight: 600 }}><AlertTriangle size={15} /> A router with this serial is already recorded as in store.</p>}
          <FormField label="Why was it taken back?" error={errors.reason}>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label="Reason">
              {RETRIEVED_REASONS.map((r) => <button key={r.key} type="button" role="radio" aria-checked={f.reason === r.key} className={f.reason === r.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }} onClick={() => set('reason', r.key)}>{r.label}</button>)}
            </div>
          </FormField>
          {f.reason === 'failed_to_pay' && <FormField label="Amount the customer owed (KSh, optional)" error={errors.amountOwed}><input type="number" min="0" className="sns-input" value={f.amountOwed} onChange={(e) => set('amountOwed', e.target.value)} /></FormField>}
          <FormField label={f.reason === 'other' ? 'Explain the reason' : 'Notes (optional)'} error={errors.reasonNotes}><textarea className="sns-input" rows={3} value={f.reasonNotes} onChange={(e) => set('reasonNotes', e.target.value)} placeholder="e.g. Moved out of the area; unpaid since August" /></FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Condition"><select className="sns-input" value={f.condition} onChange={(e) => set('condition', e.target.value)}>{ROUTER_CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></FormField>
            <FormField label="Accessories returned (optional)"><input className="sns-input" value={f.accessories} onChange={(e) => set('accessories', e.target.value)} placeholder="Power adapter, cable" /></FormField>
          </div>
          {isAdmin && <FormField label="Retrieved by"><select className="sns-input" value={f.retrievedBy || ''} onChange={(e) => set('retrievedBy', e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</select></FormField>}
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={busy} className="sns-btn-primary" style={{ flex: 1 }}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Record router'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatusModal({ row, onSave, onClose }) {
  const [status, setStatus] = useState(row.status)
  const [note, setNote] = useState(row.statusNote || '')
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label="What happened to the router" style={{ width: '100%', maxWidth: '26rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}><h3 className="sns-display" style={{ fontWeight: 700 }}>What happened to it?</h3><button onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button></div>
        <div style={{ padding: '1.4rem' }} className="space-y-4">
          <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>{row.routerModel} {row.serialNumber ? `(${row.serialNumber})` : ''} from {row.customerName}</p>
          <FormField label="Now"><select className="sns-input" value={status} onChange={(e) => setStatus(e.target.value)}>{ROUTER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></FormField>
          <FormField label="Note" hint="For example who it was given to, or what was wrong with it."><input className="sns-input" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
          <button type="button" className="sns-btn-primary" style={{ width: '100%' }} onClick={() => onSave(row, status, note.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function RetrievedRouters({ rows, customers, members, userMap, isAdmin, currentUser, onAdd, onUpdate, onSetStatus, onDelete }) {
  const [reason, setReason] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)       // null | 'new' | row
  const [statusRow, setStatusRow] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const month = toDateInputValue(new Date()).slice(0, 7)
  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.retrievedDate).localeCompare(String(a.retrievedDate)) || b.id - a.id), [rows])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sorted.filter((r) => (reason === 'all' || r.reason === reason) && (status === 'all' || r.status === status)
      && (!q || [r.customerName, r.serialNumber, r.location, r.routerModel, r.customerContact].some((x) => String(x || '').toLowerCase().includes(q))))
  }, [sorted, reason, status, search])
  const owed = rows.filter((r) => r.reason === 'failed_to_pay' && r.status !== 'written_off').reduce((s, r) => s + (Number(r.amountOwed) || 0), 0)
  const canEdit = (r) => isAdmin || (r.recordedBy === currentUser.id && r.status === 'in_store')
  const name = (id) => userMap?.[id]?.fullName || '—'

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1.2rem' }}>
        <StatCard label="In store now" value={rows.filter((r) => r.status === 'in_store').length} icon={RouterIcon} tone="success" />
        <StatCard label="Failed to pay" value={rows.filter((r) => r.reason === 'failed_to_pay').length} icon={AlertTriangle} tone="warning" onClick={() => setReason('failed_to_pay')} />
        <StatCard label="Customer requested" value={rows.filter((r) => r.reason === 'customer_requested').length} icon={RouterIcon} onClick={() => setReason('customer_requested')} />
        <StatCard label="This month" value={rows.filter((r) => String(r.retrievedDate).startsWith(month)).length} icon={RouterIcon} />
      </div>
      {isAdmin && owed > 0 && <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.8rem' }}>Unpaid amounts recorded on routers taken back for non-payment: <strong>{formatKSh(owed)}</strong>.</p>}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={reason === 'all' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => setReason('all')}>All</button>
          {RETRIEVED_REASONS.map((r) => <button key={r.key} type="button" className={reason === r.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => setReason(r.key)}>{r.label}</button>)}
          <select className="sns-input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="all">Any status</option>{ROUTER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search customer, serial, place…" />
        </div>
        <button type="button" className="sns-btn-primary" onClick={() => setForm('new')}><Plus size={16} /> Record a retrieved router</button>
      </div>
      {shown.length === 0 ? <EmptyState message={rows.length === 0 ? 'No routers have been recorded as retrieved yet.' : 'Nothing matches those filters.'} /> : (
        <div className="sns-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}>
          <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th>Date</th><th>Customer</th><th>Router</th><th>Why</th><th>Condition</th><th>Status</th><th>Retrieved by</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}>
                <td className="sns-text-soft">{formatDate(r.retrievedDate)}</td>
                <td><span style={{ fontWeight: 600 }}>{r.customerName}</span><br /><span className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{[r.customerContact, r.location].filter(Boolean).join(' · ')}</span></td>
                <td>{r.routerModel}<br /><span className="sns-mono sns-text-faint" style={{ fontSize: '0.74rem' }}>{r.serialNumber || 'no serial'}</span></td>
                <td><span className={`sns-badge ${r.reason === 'failed_to_pay' ? 'sns-badge-overdue' : 'sns-badge-role'}`}>{reasonLabel(r.reason)}</span>{r.amountOwed !== '' && <span className="sns-mono" style={{ fontSize: '0.74rem', marginLeft: '0.4rem' }}>{formatKSh(r.amountOwed)}</span>}{r.reasonNotes && <p className="sns-text-faint" style={{ fontSize: '0.74rem', maxWidth: '16rem' }}>{r.reasonNotes}</p>}</td>
                <td className="sns-text-soft">{conditionLabel(r.condition)}</td>
                <td><span className={`sns-badge ${STATUS_BADGE[r.status]}`}>{routerStatusLabel(r.status)}</span>{r.statusNote && <p className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{r.statusNote}</p>}</td>
                <td className="sns-text-soft">{name(r.retrievedBy || r.recordedBy)}</td>
                <td><div className="flex items-center justify-end gap-1">
                  {isAdmin && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.55rem' }} onClick={() => setStatusRow(r)}>Status</button>}
                  {canEdit(r) && <button type="button" className="sns-icon-btn" title="Edit" aria-label="Edit" onClick={() => setForm(r)}><Pencil size={15} /></button>}
                  {isAdmin && <button type="button" className="sns-icon-btn danger" title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(r)}><Trash2 size={15} /></button>}
                </div></td>
              </tr>))}</tbody>
          </table></div></div>
      )}
      {form && <RouterForm initial={form === 'new' ? null : form} customers={customers} members={members} isAdmin={isAdmin} currentUser={currentUser} rows={rows} onClose={() => setForm(null)} onSave={async (data) => { const done = form === 'new' ? await onAdd(data) : await onUpdate(form.id, data); if (done !== false) setForm(null) }} />}
      {statusRow && <StatusModal row={statusRow} onClose={() => setStatusRow(null)} onSave={async (row, s, n) => { await onSetStatus(row, s, n); setStatusRow(null) }} />}
      {confirmDelete && <ConfirmDialog title="Delete record" message={`Delete the record of ${confirmDelete.routerModel} retrieved from ${confirmDelete.customerName}? This cannot be undone.`} danger onCancel={() => setConfirmDelete(null)} onConfirm={async () => { await onDelete(confirmDelete); setConfirmDelete(null) }} />}
    </div>
  )
}
