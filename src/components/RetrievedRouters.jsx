import { useMemo, useState } from 'react'
import { AlertTriangle, Pencil, Plus, Router as RouterIcon, Trash2, X } from 'lucide-react'
import { ConfirmDialog, EmptyState, FormField, SearchInput, StatCard } from './shared'
import RoutersRemaining from './RoutersRemaining'
import { IssueRouterModal, StockEffect } from './RouterTools'
import { ROUTER_CONDITIONS, ROUTER_MODELS, RETRIEVED_REASONS, customerLabel, formatDate, formatKSh, reasonLabel, toDateInputValue } from '../lib/helpers'
import { routerFormEffect, routerStockState } from '../lib/stockCore'

const TONE_BADGE = { success: 'sns-badge-done', warning: 'sns-badge-progress', info: 'sns-badge-role', muted: 'sns-badge-pending' }
const COND_BADGE = { working: 'sns-badge-done', faulty: 'sns-badge-progress', damaged: 'sns-badge-overdue' }
const STATUS_CHOICES = [
  { key: 'in_store', label: 'In store' }, { key: 'under_repair', label: 'Under repair' }, { key: 'written_off', label: 'Written off' },
]
const STATUS_HINT = {
  in_store: 'In the store. If it is working it is counted in the stock list; if it is faulty or damaged it is not.',
  under_repair: 'Being repaired. It is not counted in the stock list until it is working again (use "Repaired: now working").',
  written_off: 'Thrown away. A working router leaves the stock list (a write-off is recorded in Stock Out); a faulty one was never counted, so the stock does not change.',
  reissued: 'Marked as used again under the older rules. The stock follows the Stock Out you recorded for it.',
}
const STATE_FILTERS = [
  { key: 'all', label: 'Any state' }, { key: 'ready', label: 'Ready to reuse (counted)' }, { key: 'not_counted', label: 'Not counted: faulty, damaged or under repair' },
  { key: 'unlinked', label: 'Not linked to a stock item' }, { key: 'used', label: 'Used again' }, { key: 'written_off', label: 'Written off' },
]
const matchesState = (key, f) => f === 'all' || (f === 'ready' && key === 'counted') || (f === 'not_counted' && (key === 'not_working' || key === 'under_repair'))
  || (f === 'unlinked' && key === 'unlinked') || (f === 'used' && (key === 'reissued' || key === 'reissued_old')) || (f === 'written_off' && key === 'written_off')
const conditionLabel = (k) => (ROUTER_CONDITIONS.find((c) => c.key === k) || {}).label || k

function RouterForm({ initial, customers, members, isAdmin, currentUser, rows, deviceItems = [], onSave, onClose, onSetup }) {
  const stale = initial && initial.stockItemId && !deviceItems.some((d) => d.id === initial.stockItemId) ? { id: initial.stockItemId, name: initial.routerModel } : null   // linked to an item that is no longer marked as a router
  const items = stale ? [...deviceItems, stale] : deviceItems
  const hasItems = items.length > 0
  const startModel = initial && !ROUTER_MODELS.includes(initial.routerModel) ? 'Other' : (initial?.routerModel || 'ONU')
  const [pick, setPick] = useState(initial ? (initial.stockItemId ? String(initial.stockItemId) : (hasItems ? 'other' : '')) : '')
  const [f, setF] = useState(initial
    ? { ...initial, modelOther: (hasItems ? !initial.stockItemId : startModel === 'Other') ? initial.routerModel : '', routerModel: hasItems ? initial.routerModel : startModel }
    : {
      retrievedDate: toDateInputValue(new Date()), customerId: '', customerName: '', customerContact: '', location: '', routerModel: hasItems ? '' : 'ONU', modelOther: '', serialNumber: '',
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
  const pickedItem = hasItems && pick && pick !== 'other' ? items.find((d) => String(d.id) === pick) : null
  const effect = routerFormEffect({ condition: f.condition, stockItemId: pickedItem ? pickedItem.id : null, status: initial?.status || 'in_store', itemName: pickedItem?.name })
  const otherModel = hasItems ? pick === 'other' : f.routerModel === 'Other'

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.customerName.trim()) er.customerName = 'Choose the customer, or type the name'
    if (hasItems && !pick) er.router = 'Choose which router it is'
    const model = hasItems ? (pick === 'other' ? f.modelOther.trim() : pickedItem?.name || '') : (f.routerModel === 'Other' ? f.modelOther.trim() : f.routerModel)
    if (!er.router && !model) er.router = 'Say which router it is'
    if (!f.reason) er.reason = 'Choose why it was taken back'
    if (f.reason === 'other' && !f.reasonNotes.trim()) er.reasonNotes = 'Please say why it was taken back'
    if (f.reason === 'failed_to_pay' && f.amountOwed !== '' && !(Number(f.amountOwed) >= 0)) er.amountOwed = 'Enter an amount, or leave it empty'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true); await onSave({ ...f, routerModel: model, stockItemId: pickedItem ? pickedItem.id : null }); setBusy(false)
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
            <FormField label="Router" error={otherModel ? undefined : errors.router} hint={hasItems ? 'Choose the router. A working one is added to the stock list when you save.' : (onSetup ? 'No router items are set up in the stock list, so nothing can be counted yet.' : 'Ask an admin to mark the router items in the stock list, so retrieved routers are counted.')}>
              {hasItems ? (
                <select className="sns-input" aria-label="Router" value={pick} onChange={(e) => { setPick(e.target.value); setErrors((er) => ({ ...er, router: undefined })) }}>
                  <option value="" disabled>Choose the router…</option>
                  {items.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                  <option value="other">Another router (not in the stock list)</option>
                </select>
              ) : (
                <select className="sns-input" aria-label="Router" value={f.routerModel} onChange={(e) => set('routerModel', e.target.value)}>{ROUTER_MODELS.map((m) => <option key={m}>{m}</option>)}</select>
              )}
            </FormField>
            <FormField label="Serial / MAC"><input className="sns-input sns-mono" value={f.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></FormField>
          </div>
          {!hasItems && onSetup && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.78rem' }} onClick={onSetup}>Set up router items</button>}
          {otherModel && <FormField label="Which router?" error={errors.router}><input className="sns-input" value={f.modelOther} onChange={(e) => set('modelOther', e.target.value)} /></FormField>}
          {dupe && <p role="alert" className="flex items-center gap-2" style={{ color: 'var(--stamp-deep)', fontSize: '0.82rem', fontWeight: 600 }}><AlertTriangle size={15} /> A router with this serial is already recorded as in store.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Condition" hint="Only a working router is counted in the stock.">
              <select className="sns-input" aria-label="Condition" value={f.condition} onChange={(e) => set('condition', e.target.value)}>{ROUTER_CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.key === 'working' ? 'Working (good condition)' : c.label}</option>)}</select>
            </FormField>
            <FormField label="Accessories returned (optional)"><input className="sns-input" value={f.accessories} onChange={(e) => set('accessories', e.target.value)} placeholder="Power adapter, cable" /></FormField>
          </div>
          <StockEffect effect={effect} />
          <FormField label="Why was it taken back?" error={errors.reason}>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }} role="radiogroup" aria-label="Reason">
              {RETRIEVED_REASONS.map((r) => <button key={r.key} type="button" role="radio" aria-checked={f.reason === r.key} className={f.reason === r.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }} onClick={() => set('reason', r.key)}>{r.label}</button>)}
            </div>
          </FormField>
          {f.reason === 'failed_to_pay' && <FormField label="Amount the customer owed (KSh, optional)" error={errors.amountOwed}><input type="number" min="0" className="sns-input" value={f.amountOwed} onChange={(e) => set('amountOwed', e.target.value)} /></FormField>}
          <FormField label={f.reason === 'other' ? 'Explain the reason' : 'Notes (optional)'} error={errors.reasonNotes}><textarea className="sns-input" rows={3} value={f.reasonNotes} onChange={(e) => set('reasonNotes', e.target.value)} placeholder="e.g. Moved out of the area; unpaid since August" /></FormField>
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
  const choices = row.status === 'reissued' ? [{ key: 'reissued', label: 'Re-issued (older record)' }, ...STATUS_CHOICES] : STATUS_CHOICES
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label="What happened to the router" style={{ width: '100%', maxWidth: '26rem' }}>
        <div className="flex items-center justify-between sns-border-b" style={{ padding: '1.1rem 1.4rem' }}><h3 className="sns-display" style={{ fontWeight: 700 }}>What happened to it?</h3><button onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button></div>
        <div style={{ padding: '1.4rem' }} className="space-y-4">
          <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>{row.routerModel} {row.serialNumber ? `(${row.serialNumber})` : ''} from {row.customerName}</p>
          <FormField label="Now"><select className="sns-input" aria-label="Now" value={status} onChange={(e) => setStatus(e.target.value)}>{choices.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></FormField>
          <FormField label="Note" hint="For example what was wrong with it."><input className="sns-input" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
          <p className="sns-text-soft" data-testid="status-hint" style={{ fontSize: '0.8rem' }}>{STATUS_HINT[status]}</p>
          <p className="sns-text-faint" style={{ fontSize: '0.78rem' }}>To give a working router to a customer, use <strong>Use in installation</strong> on the list instead: it records the Stock Out for you.</p>
          <button type="button" className="sns-btn-primary" style={{ width: '100%' }} onClick={() => onSave(row, status, note.trim())}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default function RetrievedRouters({ rows, customers, members, userMap, isAdmin, currentUser, deviceItems = [], summary, onAdd, onUpdate, onSetStatus, onDelete, onIssue, onUndoReissue, onMarkWorking, onLinkRouters, onSetup, onSeeSummary }) {
  const [reason, setReason] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)       // null | 'new' | row
  const [statusRow, setStatusRow] = useState(null)
  const [useRow, setUseRow] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmUndo, setConfirmUndo] = useState(null)
  const month = toDateInputValue(new Date()).slice(0, 7)
  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.retrievedDate).localeCompare(String(a.retrievedDate)) || b.id - a.id), [rows])
  const withState = useMemo(() => sorted.map((r) => ({ r, st: routerStockState(r) })), [sorted])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return withState.filter(({ r, st }) => (reason === 'all' || r.reason === reason) && matchesState(st.key, stateFilter)
      && (!q || [r.customerName, r.serialNumber, r.location, r.routerModel, r.customerContact].some((x) => String(x || '').toLowerCase().includes(q))))
  }, [withState, reason, stateFilter, search])
  const count = (f) => withState.filter(({ st }) => matchesState(st.key, f)).length
  const owed = rows.filter((r) => r.reason === 'failed_to_pay' && r.status !== 'written_off').reduce((s, r) => s + (Number(r.amountOwed) || 0), 0)
  const canEdit = (r) => isAdmin || (r.recordedBy === currentUser.id && r.status === 'in_store')
  const name = (id) => userMap?.[id]?.fullName || '—'
  const itemName = (r) => deviceItems.find((d) => d.id === r.stockItemId)?.name || r.routerModel
  const small = { fontSize: '0.72rem', padding: '0.3rem 0.55rem' }

  return (
    <div>
      {isAdmin && summary && <RoutersRemaining compact summary={summary} onLink={onLinkRouters ? () => onLinkRouters(summary.unlinked) : undefined} onSetup={onSetup} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '0.8rem' }}>
        <StatCard label="Ready to reuse" value={count('ready')} icon={RouterIcon} tone="success" onClick={() => setStateFilter('ready')} />
        <StatCard label="Not counted" value={count('not_counted')} icon={AlertTriangle} tone="warning" onClick={() => setStateFilter('not_counted')} />
        <StatCard label="Used again" value={count('used')} icon={RouterIcon} onClick={() => setStateFilter('used')} />
        <StatCard label="This month" value={rows.filter((r) => String(r.retrievedDate).startsWith(month)).length} icon={RouterIcon} />
      </div>
      <p className="sns-text-soft" style={{ fontSize: '0.8rem', marginBottom: '0.9rem' }}>
        A retrieved router counts in the stock only when it is <strong>working</strong> and in the store. Faulty, damaged and under-repair routers stay on this list but are not counted. A working one can be used again in a new installation.
        {onSeeSummary && <> <button type="button" onClick={onSeeSummary} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}>See the stock summary</button></>}
      </p>
      {isAdmin && owed > 0 && <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.8rem' }}>Unpaid amounts recorded on routers taken back for non-payment: <strong>{formatKSh(owed)}</strong>.</p>}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className={reason === 'all' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => setReason('all')}>All</button>
          {RETRIEVED_REASONS.map((r) => <button key={r.key} type="button" className={reason === r.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={() => setReason(r.key)}>{r.label}</button>)}
          <select className="sns-input" style={{ width: 'auto' }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label="Stock state">{STATE_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search customer, serial, place…" />
        </div>
        <button type="button" className="sns-btn-primary" onClick={() => setForm('new')}><Plus size={16} /> Record a retrieved router</button>
      </div>
      {shown.length === 0 ? <EmptyState message={rows.length === 0 ? 'No routers have been recorded as retrieved yet.' : 'Nothing matches those filters.'} /> : (
        <div className="sns-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}>
          <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th>Date</th><th>Customer</th><th>Router</th><th>Why</th><th>Condition</th><th>In the stock?</th><th>Retrieved by</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>{shown.map(({ r, st }) => (
              <tr key={r.id} data-testid={`row-${r.id}`}>
                <td className="sns-text-soft">{formatDate(r.retrievedDate)}</td>
                <td><span style={{ fontWeight: 600 }}>{r.customerName}</span><br /><span className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{[r.customerContact, r.location].filter(Boolean).join(' · ')}</span></td>
                <td>{r.routerModel}<br /><span className="sns-mono sns-text-faint" style={{ fontSize: '0.74rem' }}>{r.serialNumber || 'no serial'}</span></td>
                <td><span className={`sns-badge ${r.reason === 'failed_to_pay' ? 'sns-badge-overdue' : 'sns-badge-role'}`}>{reasonLabel(r.reason)}</span>{r.amountOwed !== '' && <span className="sns-mono" style={{ fontSize: '0.74rem', marginLeft: '0.4rem' }}>{formatKSh(r.amountOwed)}</span>}{r.reasonNotes && <p className="sns-text-faint" style={{ fontSize: '0.74rem', maxWidth: '16rem' }}>{r.reasonNotes}</p>}</td>
                <td><span className={`sns-badge ${COND_BADGE[r.condition] || 'sns-badge-pending'}`}>{conditionLabel(r.condition)}</span></td>
                <td><span className={`sns-badge ${TONE_BADGE[st.tone]}`} title={st.why} data-testid={`state-${r.id}`} data-state={st.key}>{st.label}</span>{r.statusNote && <p className="sns-text-faint" style={{ fontSize: '0.74rem', maxWidth: '14rem' }}>{r.statusNote}</p>}</td>
                <td className="sns-text-soft">{name(r.retrievedBy || r.recordedBy)}</td>
                <td><div className="flex items-center justify-end gap-1" style={{ flexWrap: 'wrap' }}>
                  {isAdmin && st.key === 'counted' && onIssue && <button type="button" className="sns-btn-primary" style={small} onClick={() => setUseRow(r)}>Use in installation</button>}
                  {isAdmin && (st.key === 'not_working' || st.key === 'under_repair') && onMarkWorking && <button type="button" className="sns-btn-secondary" style={small} onClick={() => onMarkWorking(r)}>Repaired: now working</button>}
                  {isAdmin && st.key === 'unlinked' && onLinkRouters && <button type="button" className="sns-btn-secondary" style={small} onClick={() => onLinkRouters([r])}>Link to stock</button>}
                  {isAdmin && st.key === 'reissued' && onUndoReissue && <button type="button" className="sns-btn-secondary" style={small} onClick={() => setConfirmUndo(r)}>Undo re-issue</button>}
                  {isAdmin && st.key !== 'reissued' && <button type="button" className="sns-btn-secondary" style={small} onClick={() => setStatusRow(r)}>Status</button>}
                  {canEdit(r) && <button type="button" className="sns-icon-btn" title="Edit" aria-label="Edit" onClick={() => setForm(r)}><Pencil size={15} /></button>}
                  {isAdmin && st.key !== 'reissued' && <button type="button" className="sns-icon-btn danger" title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(r)}><Trash2 size={15} /></button>}
                </div></td>
              </tr>))}</tbody>
          </table></div></div>
      )}
      {form && <RouterForm initial={form === 'new' ? null : form} deviceItems={deviceItems} customers={customers} members={members} isAdmin={isAdmin} currentUser={currentUser} rows={rows} onSetup={isAdmin ? onSetup : undefined} onClose={() => setForm(null)} onSave={async (data) => { const done = form === 'new' ? await onAdd(data) : await onUpdate(form.id, data); if (done !== false) setForm(null) }} />}
      {statusRow && <StatusModal row={statusRow} onClose={() => setStatusRow(null)} onSave={async (row, s, n) => { await onSetStatus(row, s, n); setStatusRow(null) }} />}
      {useRow && <IssueRouterModal router={useRow} itemName={itemName(useRow)} customers={customers} onClose={() => setUseRow(null)} onSave={async (f) => { const done = await onIssue(useRow, f); if (done !== false) setUseRow(null) }} />}
      {confirmUndo && <ConfirmDialog title="Undo re-issue" message={`Undo the re-issue of ${confirmUndo.routerModel} ${confirmUndo.serialNumber ? `(${confirmUndo.serialNumber}) ` : ''}from ${confirmUndo.customerName}? The Stock Out recorded for it is removed and the router goes back in the store (and is counted again if it is working).`} onCancel={() => setConfirmUndo(null)} onConfirm={async () => { await onUndoReissue(confirmUndo); setConfirmUndo(null) }} />}
      {confirmDelete && <ConfirmDialog title="Delete record" message={`Delete the record of ${confirmDelete.routerModel} retrieved from ${confirmDelete.customerName}? ${routerStockState(confirmDelete).counted ? 'This also takes it off the stock list, and cannot be undone.' : 'This cannot be undone.'}`} danger onCancel={() => setConfirmDelete(null)} onConfirm={async () => { await onDelete(confirmDelete); setConfirmDelete(null) }} />}
    </div>
  )
}
