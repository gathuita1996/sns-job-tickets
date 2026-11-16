import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { FormField, SearchInput } from './shared'
import { INSTALL_TYPES, customerLabel, formatDate, toDateInputValue } from '../lib/helpers'
import { linkEffect, suggestItemFor } from '../lib/stockCore'

const overlay = (z) => ({ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: z })
function Shell({ title, label, z = 55, width = '30rem', onClose, children }) {
  return (
    <div className="no-print flex items-center justify-center p-4" style={overlay(z)}>
      <div className="sns-card sns-fade-in" role="dialog" aria-label={label || title} style={{ width: '100%', maxWidth: width, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button type="button" onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---- use a retrieved working router in a new installation (or a replacement) -----------------------------------
export function IssueRouterModal({ router, itemName, customers, onSave, onClose }) {
  const today = toDateInputValue(new Date())
  const [f, setF] = useState({ installType: '', customerId: '', issueDate: today, issuedTo: '', purpose: '', referenceNo: '', issuedBy: '' })
  const [q, setQ] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const sorted = useMemo(() => [...customers].sort((a, b) => customerLabel(a).localeCompare(customerLabel(b))), [customers])
  const options = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? sorted.filter((c) => customerLabel(c).toLowerCase().includes(s) || String(c.contact || '').replace(/\s/g, '').includes(s.replace(/\s/g, ''))) : sorted
    const shown = list.slice(0, 300)
    const chosen = sorted.find((c) => String(c.id) === String(f.customerId))
    return chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown
  }, [sorted, q, f.customerId])
  const replacement = f.installType === 'replacement'

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!f.installType) er.installType = 'Choose new installation or replacement'
    if (replacement && !f.customerId) er.customerId = 'Choose the customer this router replaces'
    if (!f.issueDate) er.issueDate = 'Required'
    else if (f.issueDate > today) er.issueDate = 'The date cannot be in the future'
    else if (router.retrievedDate && f.issueDate < String(router.retrievedDate).slice(0, 10)) er.issueDate = 'It cannot be used before it was retrieved'
    setErrors(er)
    if (Object.keys(er).length) return
    setBusy(true); await onSave(f); setBusy(false)
  }

  return (
    <Shell title="Use this router in an installation" label="Use in installation" onClose={onClose}>
      <form onSubmit={submit} style={{ padding: '1.4rem' }} className="space-y-4">
        <div style={{ background: 'var(--confirmed-pale)', borderRadius: 10, padding: '0.8rem 0.9rem', fontSize: '0.85rem' }}>
          <p style={{ fontWeight: 700 }}>{itemName || router.routerModel} <span className="sns-mono sns-text-soft" style={{ fontWeight: 500 }}>{router.serialNumber || 'no serial'}</span></p>
          <p className="sns-text-soft" style={{ fontSize: '0.8rem' }}>Retrieved from {router.customerName} on {formatDate(router.retrievedDate)}. Working condition.</p>
          <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Using it takes <strong>1</strong> off the stock list and marks this router as used again.</p>
        </div>
        <FormField label="Taken for" error={errors.installType}>
          <div className="flex gap-2" role="radiogroup" aria-label="Taken for">
            {INSTALL_TYPES.map((o) => (
              <button type="button" role="radio" aria-checked={f.installType === o.key} key={o.key} onClick={() => set('installType', o.key)} className={f.installType === o.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1, fontSize: '0.85rem' }}>{o.label}</button>
            ))}
          </div>
        </FormField>
        {f.installType && (
          <FormField label={replacement ? 'Replaced for customer' : 'Customer (optional)'} error={errors.customerId} hint={replacement ? 'Pick the customer whose device this one replaces.' : 'Leave empty if the customer is not in the system yet.'}>
            <input className="sns-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or phone to filter…" aria-label="Find a customer" style={{ marginBottom: 6 }} />
            <select className="sns-input" aria-label="Customer" value={f.customerId} onChange={(e) => set('customerId', e.target.value)}>
              <option value="">{replacement ? 'select-customer' : 'No customer yet'}</option>
              {options.map((c) => <option key={c.id} value={c.id}>{customerLabel(c)}</option>)}
            </select>
          </FormField>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Date" error={errors.issueDate}><input type="date" className="sns-input" min={String(router.retrievedDate || '').slice(0, 10)} max={today} value={f.issueDate} onChange={(e) => set('issueDate', e.target.value)} /></FormField>
          <FormField label="Taken by (technician)"><input className="sns-input" value={f.issuedTo} onChange={(e) => set('issuedTo', e.target.value)} placeholder="e.g. Langat" /></FormField>
        </div>
        <FormField label="Purpose"><input className="sns-input" value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="e.g. Site installation" /></FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Reference No."><input className="sns-input" value={f.referenceNo} onChange={(e) => set('referenceNo', e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Issued by"><input className="sns-input" value={f.issuedBy} onChange={(e) => set('issuedBy', e.target.value)} placeholder="Optional" /></FormField>
        </div>
        <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '1.2rem' }}>
          <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" disabled={busy} className="sns-btn-primary" style={{ flex: 1 }}>{busy ? 'Saving…' : 'Issue this router'}</button>
        </div>
      </form>
    </Shell>
  )
}

// ---- working routers that were recorded without a stock item: link them so they are counted -------------------------
export function LinkRoutersModal({ routers, deviceItems, onSave, onClose }) {
  const [pick, setPick] = useState(() => Object.fromEntries(routers.map((r) => [r.id, suggestItemFor(r, deviceItems) || ''])))
  const [busy, setBusy] = useState(false)
  const links = routers.map((r) => ({ id: r.id, stockItemId: pick[r.id] ? Number(pick[r.id]) : null }))
  const effect = linkEffect(links, deviceItems)
  async function save() { setBusy(true); await onSave(links.filter((l) => l.stockItemId)); setBusy(false) }
  return (
    <Shell title="Link routers to the stock list" label="Link routers" width="38rem" onClose={onClose}>
      <div style={{ padding: '1.4rem' }} className="space-y-4">
        <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>These routers are working but were recorded without a router item, so they are not in the stock count. Choose which router each one is. Each one you link is added to the stock (+1). Leave one on “Do not link” to keep it out of the count.</p>
        {deviceItems.length === 0 && <p role="alert" className="flex items-center gap-2" style={{ color: 'var(--stamp-deep)', fontSize: '0.82rem', fontWeight: 600 }}><AlertTriangle size={15} /> No router items are set up yet. Close this and use “Router items” first.</p>}
        <ul className="space-y-3">
          {routers.map((r) => (
            <li key={r.id} className="flex items-center justify-between" style={{ gap: '0.8rem', flexWrap: 'wrap', borderBottom: '1px solid var(--line-soft)', paddingBottom: '0.7rem' }}>
              <div style={{ minWidth: '11rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.88rem' }}>{r.customerName}</p>
                <p className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{r.routerModel} · <span className="sns-mono">{r.serialNumber || 'no serial'}</span> · {formatDate(r.retrievedDate)}</p>
              </div>
              <select className="sns-input" style={{ width: 'auto', minWidth: '12rem' }} aria-label={`Router item for ${r.customerName} ${r.serialNumber || r.id}`} value={pick[r.id]} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}>
                <option value="">Do not link</option>
                {deviceItems.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <p role="status" className="sns-text-soft" style={{ fontSize: '0.84rem' }}>
          {effect.length === 0 ? 'Nothing will be added to the stock.' : <>This adds to the stock: {effect.map((e, i) => <span key={e.itemId}>{i > 0 ? ', ' : ''}<strong>{e.name} +{e.count}</strong></span>)}.</>}
        </p>
        <div className="flex gap-3" style={{ marginBottom: '1.2rem' }}>
          <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="button" disabled={busy || effect.length === 0} onClick={save} className="sns-btn-primary" style={{ flex: 1 }}>{busy ? 'Saving…' : 'Link and add to stock'}</button>
        </div>
      </div>
    </Shell>
  )
}

// ---- which stock items are routers ---------------------------------------------------------------------------------
export function RouterItemsModal({ items, onSave, onClose }) {
  const [on, setOn] = useState(() => new Set(items.filter((i) => i.isDevice).map((i) => i.id)))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const shown = items.filter((i) => !q.trim() || `${i.itemName} ${i.itemCode} ${i.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (id) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const turnOn = items.filter((i) => !i.isDevice && on.has(i.id)).map((i) => i.id)
  const turnOff = items.filter((i) => i.isDevice && !on.has(i.id)).map((i) => i.id)
  async function save() { setBusy(true); const ok = await onSave(turnOn, turnOff); setBusy(false); if (ok !== false) onClose() }
  return (
    <Shell title="Router items" label="Router items" onClose={onClose}>
      <div style={{ padding: '1.4rem' }} className="space-y-4">
        <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>Tick the stock items that are routers (for example ONU and XPON routers). A retrieved router can only be added to the stock list as one of these, and when one is issued the system asks whether it is a new installation or a replacement.</p>
        <SearchInput value={q} onChange={setQ} placeholder="Search the stock list…" />
        <ul style={{ maxHeight: '18rem', overflowY: 'auto' }}>
          {shown.map((i) => (
            <li key={i.id}>
              <label className="flex items-center gap-2" style={{ padding: '0.4rem 0.2rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                <input type="checkbox" checked={on.has(i.id)} onChange={() => toggle(i.id)} aria-label={i.itemName} />
                <span style={{ fontWeight: 600 }}>{i.itemName}</span><span className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{i.category || ''}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="sns-text-soft" style={{ fontSize: '0.85rem', padding: '0.5rem' }}>No items match.</li>}
        </ul>
        <div className="flex gap-3" style={{ marginBottom: '1.2rem' }}>
          <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="button" disabled={busy || (turnOn.length === 0 && turnOff.length === 0)} onClick={save} className="sns-btn-primary" style={{ flex: 1 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Shell>
  )
}

export function StockEffect({ effect }) {
  const tone = { success: ['var(--confirmed-pale)', 'var(--confirmed)'], warning: ['var(--stamp-pale)', 'var(--stamp-deep)'], info: ['var(--signal-pale)', 'var(--signal-deep)'], muted: ['var(--line-soft)', 'var(--ink-soft)'] }[effect.tone] || ['var(--line-soft)', 'var(--ink-soft)']
  return (
    <div role="status" data-testid="stock-effect" data-counted={effect.counted ? 'yes' : 'no'} className="flex items-start gap-2" style={{ background: tone[0], color: tone[1], borderRadius: 10, padding: '0.65rem 0.8rem', fontSize: '0.82rem', fontWeight: 600 }}>
      {effect.counted ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{effect.message}</span>
    </div>
  )
}
