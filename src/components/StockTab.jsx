import { useEffect, useMemo, useState } from 'react'
import RetrievedRouters from './RetrievedRouters'
import RoutersRemaining from './RoutersRemaining'
import { LinkRoutersModal, RouterItemsModal } from './RouterTools'
import { ArrowDownCircle, ArrowUpCircle, Cpu, Pencil, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react'
import PurchaseEntry from './PurchaseEntry'
import DeviceLog from './DeviceLog'
import { ConfirmDialog, EmptyState, FormField, SearchInput } from './shared'
import { STOCK_CATEGORIES, STOCK_UNITS, defaultStockItemForm, defaultStockInForm, defaultStockOutForm, formatDate, formatKSh, toDateInputValue, customerLabel, INSTALL_TYPES } from '../lib/helpers'
import { computeStock, routerCounts, routerStockSummary, readyRoutersFor } from '../lib/stockCore'

function ItemFormModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item
    ? { itemCode: item.itemCode, itemName: item.itemName, category: item.category, unit: item.unit, reorderLevel: String(item.reorderLevel), unitCost: String(item.unitCost), supplier: item.supplier, notes: item.notes, isDevice: Boolean(item.isDevice) }
    : defaultStockItemForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.itemCode.trim()) e.itemCode = 'Required'
    if (!form.itemName.trim()) e.itemName = 'Required'
    if (!form.unit) e.unit = 'Required'
    if (form.reorderLevel !== '' && (isNaN(Number(form.reorderLevel)) || Number(form.reorderLevel) < 0)) e.reorderLevel = 'Enter a valid number'
    if (form.unitCost !== '' && (isNaN(Number(form.unitCost)) || Number(form.unitCost) < 0)) e.unitCost = 'Enter a valid amount'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSave({ ...form, reorderLevel: form.reorderLevel || 0, unitCost: form.unitCost || 0 })
    setSubmitting(false)
  }

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{item ? 'Edit item' : 'Add item to catalog'}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Item code" error={errors.itemCode}>
              <input className="sns-input" value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} placeholder="e.g. ITM-027" />
            </FormField>
            <FormField label="Unit" error={errors.unit}>
              <select className="sns-input" value={form.unit} onChange={(e) => update('unit', e.target.value)}>
                {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Item name" error={errors.itemName}>
            <input className="sns-input" value={form.itemName} onChange={(e) => update('itemName', e.target.value)} placeholder="e.g. XPON Router" />
          </FormField>
          <FormField label="Category">
            <select className="sns-input" value={form.category} onChange={(e) => update('category', e.target.value)}>
              <option value="">Not specified</option>
              {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Reorder level" error={errors.reorderLevel} hint="Flags as REORDER once stock falls to this or below.">
              <input type="number" min="0" className="sns-input" value={form.reorderLevel} onChange={(e) => update('reorderLevel', e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Unit cost (KES)" error={errors.unitCost}>
              <input type="number" min="0" className="sns-input" value={form.unitCost} onChange={(e) => update('unitCost', e.target.value)} placeholder="0" />
            </FormField>
          </div>
          <FormField label="Supplier">
            <input className="sns-input" value={form.supplier} onChange={(e) => update('supplier', e.target.value)} placeholder="e.g. Data Connect Technology" />
          </FormField>
          <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={Boolean(form.isDevice)} onChange={(e) => update('isDevice', e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: '0.85rem' }}><strong>Field device</strong> (ONU / XPON router)<br />
              <span className="sns-text-soft" style={{ fontSize: '0.78rem' }}>When this item is issued, ask whether it is a new installation or a replacement, and for which customer.</span></span>
          </label>
          <FormField label="Notes">
            <textarea className="sns-input" rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Optional" />
          </FormField>
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Save item'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StockInFormModal({ items, onClose, onSave }) {
  const [form, setForm] = useState(defaultStockInForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function handleItemChange(itemId) {
    const item = items.find((i) => String(i.id) === String(itemId))
    setForm((f) => ({ ...f, itemId, unitCost: item ? String(item.unitCost) : f.unitCost, supplier: item ? item.supplier : f.supplier }))
  }

  function validate() {
    const e = {}
    if (!form.itemId) e.itemId = 'Please select an item'
    if (!form.purchaseDate) e.purchaseDate = 'Required'
    else if (form.purchaseDate > toDateInputValue(new Date())) e.purchaseDate = "You can't record a purchase for a future date."
    if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) e.quantity = 'Enter a valid quantity'
    if (form.unitCost === '' || isNaN(Number(form.unitCost)) || Number(form.unitCost) < 0) e.unitCost = 'Enter a valid amount'
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

  const itemCls = `sns-input${form.itemId === '' ? ' sns-select-placeholder' : ''}`

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Record a purchase</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Item" error={errors.itemId}>
            <select className={itemCls} value={form.itemId} onChange={(e) => handleItemChange(e.target.value)}>
              <option value="" disabled>select-item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.itemName}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date" error={errors.purchaseDate}>
              <input type="date" max={toDateInputValue(new Date())} className="sns-input" value={form.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} />
            </FormField>
            <FormField label="Quantity" error={errors.quantity} hint="How many were bought — or, for this item's first entry after a stock reset, how many you currently have on hand.">
              <input type="number" min="0" step="1" className="sns-input" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} placeholder="0" />
            </FormField>
          </div>
          <FormField label="Unit cost (KES)" error={errors.unitCost} hint="Pre-filled from the catalog — adjust if this purchase's price was different.">
            <input type="number" min="0" className="sns-input" value={form.unitCost} onChange={(e) => update('unitCost', e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Supplier">
            <input className="sns-input" value={form.supplier} onChange={(e) => update('supplier', e.target.value)} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Invoice/Receipt No.">
              <input className="sns-input" value={form.invoiceNo} onChange={(e) => update('invoiceNo', e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField label="Received by">
              <input className="sns-input" value={form.receivedBy} onChange={(e) => update('receivedBy', e.target.value)} placeholder="Optional" />
            </FormField>
          </div>
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Record purchase'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StockOutFormModal({ items, customers, routers = [], onIssueRetrieved, onClose, onSave }) {
  const [form, setForm] = useState(defaultStockOutForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [custSearch, setCustSearch] = useState('')
  const [source, setSource] = useState('new')     // 'new' = bought new, 'retrieved' = a working router taken back from a customer
  const [routerId, setRouterId] = useState('')

  const item = items.find((i) => String(i.id) === String(form.itemId))
  const isDevice = Boolean(item && item.isDevice)
  // Retrieved routers that are working and in the store, oldest first: these can go into a new installation
  const ready = useMemo(() => (isDevice && onIssueRetrieved ? readyRoutersFor(routers, item.id) : []), [isDevice, onIssueRetrieved, routers, item])
  const useRetrieved = source === 'retrieved' && ready.length > 0
  const picked = useRetrieved ? ready.find((r) => String(r.id) === String(routerId)) : null
  const sorted = useMemo(() => [...customers].sort((a, b) => customerLabel(a).localeCompare(customerLabel(b))), [customers])
  const options = useMemo(() => {
    const q = custSearch.trim().toLowerCase()
    const list = q ? sorted.filter((c) => customerLabel(c).toLowerCase().includes(q) || String(c.contact || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))) : sorted
    const shown = list.slice(0, 300)
    const chosen = sorted.find((c) => String(c.id) === String(form.customerId))
    return chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown      // the chosen customer never disappears while filtering
  }, [sorted, custSearch, form.customerId])

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function pickItem(itemId) {
    const it = items.find((i) => String(i.id) === String(itemId))
    setSource('new'); setRouterId('')
    setForm((f) => it && it.isDevice
      ? { ...f, itemId, quantity: f.quantity === '' ? '1' : f.quantity }
      : { ...f, itemId, installType: '', customerId: '', deviceSerial: '' })
    setErrors({})
  }

  function validate() {
    const e = {}
    if (!form.itemId) e.itemId = 'Please select an item'
    if (!form.issueDate) e.issueDate = 'Required'
    if (useRetrieved) {
      if (!picked) e.router = 'Choose which retrieved router'
      else if (form.issueDate && form.issueDate > toDateInputValue(new Date())) e.issueDate = 'The date cannot be in the future'
      else if (form.issueDate && String(picked.retrievedDate).slice(0, 10) > form.issueDate) e.issueDate = 'It cannot be used before it was retrieved'
    } else if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) e.quantity = 'Enter a valid quantity'
    if (isDevice && !form.installType) e.installType = 'Choose new installation or replacement'
    if (isDevice && form.installType === 'replacement' && !form.customerId) e.customerId = 'Choose the customer this device was replaced for'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    if (useRetrieved) await onIssueRetrieved(picked, { ...form, quantity: '1' })    // one step: the Stock Out and the router's own record
    else await onSave(form)
    setSubmitting(false)
  }

  function chooseSource(next) {
    setSource(next); setErrors((e) => ({ ...e, router: undefined, quantity: undefined }))
    if (next === 'retrieved') { setRouterId(ready.length === 1 ? String(ready[0].id) : ''); setForm((f) => ({ ...f, quantity: '1', deviceSerial: '' })) }
  }

  const itemCls = `sns-input${form.itemId === '' ? ' sns-select-placeholder' : ''}`
  const replacement = form.installType === 'replacement'

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Record stock issued</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Item" error={errors.itemId}>
            <select className={itemCls} value={form.itemId} onChange={(e) => pickItem(e.target.value)}>
              <option value="" disabled>select-item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.itemName}{i.isDevice ? '  (field device)' : ''}</option>)}
            </select>
          </FormField>

          {isDevice && (
            <div className="space-y-3" style={{ background: 'rgba(0,117,204,0.06)', border: '1px solid rgba(0,117,204,0.2)', borderRadius: 10, padding: '0.9rem' }}>
              <FormField label="Taken for" error={errors.installType}>
                <div className="flex gap-2">
                  {INSTALL_TYPES.map((o) => (
                    <button type="button" key={o.key} onClick={() => update('installType', o.key)} className={form.installType === o.key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1, fontSize: '0.85rem' }}>{o.label}</button>
                  ))}
                </div>
              </FormField>
              {form.installType && (
                <FormField label={replacement ? 'Replaced for customer' : 'Customer (optional)'} error={errors.customerId} hint={replacement ? 'Pick the customer whose device this one replaces.' : 'Leave empty if the customer is not in the system yet.'}>
                  <input className="sns-input" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Type a name or phone to filter…" style={{ marginBottom: 6 }} />
                  <select className={`sns-input${form.customerId === '' ? ' sns-select-placeholder' : ''}`} value={form.customerId} onChange={(e) => update('customerId', e.target.value)}>
                    <option value="">{replacement ? 'select-customer' : 'No customer yet'}</option>
                    {options.map((c) => <option key={c.id} value={c.id}>{customerLabel(c)}</option>)}
                  </select>
                </FormField>
              )}
              {ready.length > 0 && (
                <FormField label="Which router?" error={errors.router} hint={useRetrieved ? 'This router is taken off the stock list and its record is marked as used again.' : `${ready.length} retrieved router${ready.length === 1 ? ' is' : 's are'} working and ready to use. Choose "A retrieved router" to use one of them.`}>
                  <div className="flex gap-2" role="radiogroup" aria-label="Which router">
                    <button type="button" role="radio" aria-checked={!useRetrieved} onClick={() => chooseSource('new')} className={!useRetrieved ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1, fontSize: '0.85rem' }}>Bought new</button>
                    <button type="button" role="radio" aria-checked={useRetrieved} onClick={() => chooseSource('retrieved')} className={useRetrieved ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ flex: 1, fontSize: '0.85rem' }}>A retrieved router ({ready.length})</button>
                  </div>
                  {useRetrieved && (
                    <select className="sns-input" aria-label="Retrieved router" value={routerId} onChange={(e) => { setRouterId(e.target.value); setErrors((er) => ({ ...er, router: undefined })) }} style={{ marginTop: 6 }}>
                      <option value="" disabled>Choose the router…</option>
                      {ready.map((r) => <option key={r.id} value={r.id}>{r.serialNumber || 'No serial'} — from {r.customerName}, {formatDate(r.retrievedDate)}</option>)}
                    </select>
                  )}
                </FormField>
              )}
              {!useRetrieved && (
                <FormField label="Serial / MAC (optional)">
                  <input className="sns-input" value={form.deviceSerial} onChange={(e) => update('deviceSerial', e.target.value)} placeholder="Printed on the device label" />
                </FormField>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date" error={errors.issueDate}>
              <input type="date" className="sns-input" value={form.issueDate} onChange={(e) => update('issueDate', e.target.value)} />
            </FormField>
            <FormField label="Quantity" error={errors.quantity}>
              <input type="number" min="0" step="1" className="sns-input" value={useRetrieved ? '1' : form.quantity} disabled={useRetrieved} onChange={(e) => update('quantity', e.target.value)} placeholder="0" />
            </FormField>
          </div>
          <FormField label={isDevice ? 'Taken by (technician)' : 'Issued to / Job site'}>
            <input className="sns-input" value={form.issuedTo} onChange={(e) => update('issuedTo', e.target.value)} placeholder={isDevice ? 'e.g. Langat' : 'e.g. Site installation — Langat'} />
          </FormField>
          <FormField label="Purpose">
            <input className="sns-input" value={form.purpose} onChange={(e) => update('purpose', e.target.value)} placeholder="e.g. Site installation" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Reference No.">
              <input className="sns-input" value={form.referenceNo} onChange={(e) => update('referenceNo', e.target.value)} placeholder="Optional" />
            </FormField>
            <FormField label="Issued by">
              <input className="sns-input" value={form.issuedBy} onChange={(e) => update('issuedBy', e.target.value)} placeholder="Optional" />
            </FormField>
          </div>
          <div className="flex gap-3" style={{ paddingTop: '0.4rem', marginBottom: '2rem' }}>
            <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ flex: 1 }}>{submitting ? 'Saving…' : 'Record issue'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Admin (and, since a Director is always an admin, Director) only -- this
// whole tab is only ever rendered inside AdminDashboard, so no extra
// gating is needed here beyond that.
export default function StockTab({ routers, stockItems, stockIn, stockOut, customers, onAddItem, onUpdateItem, onDeleteItem, onAddStockIn, onAddStockInBatch, onAddStockOut }) {
  const [view, setView] = useState('summary') // 'summary' | 'items' | 'in' | 'out'
  const [search, setSearch] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null)
  const [showStockInForm, setShowStockInForm] = useState(false)
  const [showStockOutForm, setShowStockOutForm] = useState(false)
  const [showRouterItems, setShowRouterItems] = useState(false)
  const [linkRouters, setLinkRouters] = useState(null)       // working routers being linked to a router item
  const [refreshing, setRefreshing] = useState(false)

  const itemMap = useMemo(() => { const m = {}; stockItems.forEach((i) => { m[i.id] = i }); return m }, [stockItems])
  const routerList = routers ? routers.rows : undefined
  const routerRows = useMemo(() => routerList || [], [routerList])
  // The router items come from the stock list itself, so ticking "Field device" shows up here straight away.
  const deviceItems = useMemo(() => stockItems.filter((i) => i.isDevice).map((i) => ({ id: i.id, name: i.itemName })), [stockItems])

  // Technicians record retrieved routers while this page may be open, so it reloads the stock figures when it opens.
  async function refresh() {
    if (!routers || !routers.onRefresh) return
    setRefreshing(true)
    try { await routers.onRefresh() } finally { setRefreshing(false) }
  }
  useEffect(() => { refresh() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Computed independently per item (filter each log separately) rather
  // than joined -- joining stock_in and stock_out together on item_id in
  // one pass multiplies rows together (a real bug caught while testing
  // this migration), not something that shows up from reading the code.
  // Current stock = bought new + retrieved (working) - issued - written off (see lib/stockCore.js).
  const stock = useMemo(() => computeStock({ items: stockItems, stockIn, stockOut, routers: routerRows }), [stockItems, stockIn, stockOut, routerRows])
  const summary = useMemo(() => routerStockSummary({ items: stockItems, stockIn, stockOut, routers: routerRows }), [stockItems, stockIn, stockOut, routerRows])
  const summaryRows = useMemo(() => [...stock].sort((a, b) => (a.status === b.status ? 0 : a.status === 'REORDER' ? -1 : 1)), [stock])
  const readyCount = useMemo(() => routerRows.filter(routerCounts).length, [routerRows])
  const reusedOut = useMemo(() => new Set(routerRows.map((r) => r.reissueStockOutId).filter((x) => x != null)), [routerRows])   // Stock Outs that used a retrieved router

  const reorderCount = summaryRows.filter((r) => r.status === 'REORDER').length
  const reorderRows = summaryRows.filter((r) => r.status === 'REORDER')

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase()
    return stockItems.filter((i) => !q || [i.itemCode, i.itemName, i.category, i.supplier].some((f) => (f || '').toLowerCase().includes(q)))
  }, [stockItems, search])

  const sortedStockIn = useMemo(() => [...stockIn].sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)), [stockIn])
  const sortedStockOut = useMemo(() => [...stockOut].sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate)), [stockOut])

  const custMap = useMemo(() => { const m = {}; (customers || []).forEach((c) => { m[c.id] = c }); return m }, [customers])

  return (
    <div>
      <div className="flex gap-2" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button onClick={() => setView('summary')} className={view === 'summary' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Summary</button>
        <button onClick={() => setView('items')} className={view === 'items' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Item Master</button>
        <button onClick={() => setView('in')} className={view === 'in' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Stock In</button>
        <button onClick={() => setView('out')} className={view === 'out' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Stock Out</button>
        <button onClick={() => setView('devices')} className={view === 'devices' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}><Cpu size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />ONU / Router log</button>
        <button onClick={() => setView('reorder')} className={view === 'reorder' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>
          Need Reorder{reorderCount > 0 && <span className="sns-badge sns-badge-overdue" style={{ marginLeft: '0.4rem' }}>{reorderCount}</span>}
        </button>
        {routers && (
          <button onClick={() => setView('retrieved')} className={view === 'retrieved' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>
            Retrieved Routers{readyCount > 0 && <span className="sns-badge sns-badge-done" style={{ marginLeft: '0.4rem' }} title="Working retrieved routers, ready to use again" data-testid="retrieved-tab-count">{readyCount}</span>}
          </button>
        )}
        {routers && routers.onRefresh && (
          <button onClick={refresh} disabled={refreshing} className="sns-btn-secondary" style={{ fontSize: '0.82rem', marginLeft: 'auto' }} title="Reload the stock figures"><RefreshCw size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        )}
      </div>

      {view === 'summary' && (
        <>
          <RoutersRemaining summary={summary}
            onSeeRetrieved={routers ? () => setView('retrieved') : undefined}
            onLink={routers && routers.onLink ? () => setLinkRouters(summary.unlinked) : undefined}
            onSetup={routers && routers.onSetItems ? () => setShowRouterItems(true) : undefined} />
          {summaryRows.length === 0 ? <EmptyState message="No items in the catalog yet." /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>Item</th><th>Unit</th><th>Purchased</th><th title="Working routers taken back from customers and added to the stock">Retrieved</th><th>Issued</th><th>Current stock</th><th>Reorder level</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((r) => (
                      <tr key={r.item.id} data-testid={`stock-row-${r.item.id}`}>
                        <td style={{ fontWeight: 600 }}>{r.item.itemName}{r.item.isDevice && <span className="sns-badge sns-badge-role" style={{ marginLeft: '0.4rem' }}>Router</span>}</td>
                        <td className="sns-text-soft">{r.item.unit}</td>
                        <td className="sns-mono" data-testid={`purchased-${r.item.id}`}>{r.bought}</td>
                        <td className="sns-mono" data-testid={`retrieved-cell-${r.item.id}`}>{r.item.isDevice || r.retrieved > 0
                          ? <>{r.retrieved}{r.notCounted.total > 0 && <span className="sns-text-faint" style={{ fontSize: '0.68rem', marginLeft: '0.35rem', fontWeight: 400 }} title="Faulty, damaged or under-repair routers are not counted in the stock">({r.notCounted.total} not counted)</span>}</>
                          : <span className="sns-text-faint">—</span>}</td>
                        <td className="sns-mono" data-testid={`issued-cell-${r.item.id}`}>{r.issued}{r.writtenOff > 0 && <span className="sns-text-faint" style={{ fontSize: '0.68rem', marginLeft: '0.35rem', fontWeight: 400 }} title="Retrieved routers that were written off">(+{r.writtenOff} written off)</span>}</td>
                        <td className="sns-mono" style={{ fontWeight: 700 }} data-testid={`current-${r.item.id}`}>{r.remaining}{r.retrievedReady > 0 && <span className="sns-text-faint" style={{ fontSize: '0.68rem', marginLeft: '0.35rem', fontWeight: 400 }} title="Of these, retrieved routers that are working and ready to use again">({r.retrievedReady} retrieved)</span>}</td>
                        <td className="sns-text-soft">{r.item.reorderLevel}</td>
                        <td>
                          <span className="sns-badge" style={r.status === 'REORDER' ? { background: 'var(--overdue-pale)', color: 'var(--overdue)' } : { background: 'var(--confirmed-pale)', color: 'var(--confirmed)' }}>{r.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'items' && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by code, name, category, supplier…" />
            <div className="flex gap-2">
              {routers && routers.onSetItems && <button onClick={() => setShowRouterItems(true)} className="sns-btn-secondary"><Settings size={15} style={{ marginRight: 4, verticalAlign: '-2px' }} />Router items</button>}
              <button onClick={() => setShowItemForm(true)} className="sns-btn-primary"><Plus size={16} /> Add item</button>
            </div>
          </div>
          {filteredItems.length === 0 ? <EmptyState message="No items match." /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>Reorder</th><th>Unit cost</th><th>Supplier</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((i) => (
                      <tr key={i.id}>
                        <td className="sns-mono sns-text-soft">{i.itemCode}</td>
                        <td style={{ fontWeight: 600 }}>{i.itemName}{i.isDevice && <span className="sns-badge sns-badge-role" style={{ marginLeft: '0.4rem' }}>Router</span>}</td>
                        <td className="sns-text-soft">{i.category || '—'}</td>
                        <td className="sns-text-soft">{i.unit}</td>
                        <td className="sns-text-soft">{i.reorderLevel}</td>
                        <td className="sns-mono">{formatKSh(i.unitCost)}</td>
                        <td className="sns-text-soft">{i.supplier || '—'}</td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditingItem(i)} title="Edit" className="sns-icon-btn"><Pencil size={15} /></button>
                            <button onClick={() => setConfirmDeleteItem(i)} title="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'in' && (
        <>
          <PurchaseEntry items={stockItems} onRecord={onAddStockInBatch} />

          <div className="flex items-center justify-between" style={{ margin: '2rem 0 0.8rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Purchase history</p>
            <button onClick={() => setShowStockInForm(true)} className="sns-btn-secondary" style={{ fontSize: '0.8rem' }}><ArrowDownCircle size={15} /> Add with invoice details</button>
          </div>
          {sortedStockIn.length === 0 ? <EmptyState message="No purchases recorded yet." /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>Date</th><th>Item</th><th>Qty</th><th>Unit cost</th><th>Total</th><th>Supplier</th><th>Invoice</th><th>Received by</th></tr>
                  </thead>
                  <tbody>
                    {sortedStockIn.map((si) => (
                      <tr key={si.id}>
                        <td className="sns-text-soft">{formatDate(si.purchaseDate)}</td>
                        <td style={{ fontWeight: 600 }}>{itemMap[si.itemId]?.itemName || '—'}</td>
                        <td className="sns-mono">{si.quantity}</td>
                        <td className="sns-mono">{formatKSh(si.unitCost)}</td>
                        <td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(si.quantity * si.unitCost)}</td>
                        <td className="sns-text-soft">{si.supplier || '—'}</td>
                        <td className="sns-text-soft">{si.invoiceNo === 'RETRIEVED' ? <span className="sns-badge sns-badge-role">Retrieved</span> : (si.invoiceNo || '—')}</td>
                        <td className="sns-text-soft">{si.receivedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'out' && (
        <>
          <div className="flex justify-end" style={{ marginBottom: '1rem' }}>
            <button onClick={() => setShowStockOutForm(true)} className="sns-btn-primary"><ArrowUpCircle size={16} /> Record issue</button>
          </div>
          {sortedStockOut.length === 0 ? <EmptyState message="No stock issued yet." /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>Date</th><th>Item</th><th>Qty</th><th>Taken for</th><th>Customer</th><th>Issued to</th><th>Purpose</th><th>Reference</th><th>Issued by</th></tr>
                  </thead>
                  <tbody>
                    {sortedStockOut.map((so) => (
                      <tr key={so.id}>
                        <td className="sns-text-soft">{formatDate(so.issueDate)}</td>
                        <td style={{ fontWeight: 600 }}>{itemMap[so.itemId]?.itemName || '—'}{reusedOut.has(so.id) && <span className="sns-badge sns-badge-role" style={{ marginLeft: '0.4rem' }} title="A router taken back from another customer, used again">Retrieved</span>}</td>
                        <td className="sns-mono">{so.quantity}</td>
                        <td>{so.installType
                          ? <span className={`sns-badge ${so.installType === 'replacement' ? 'sns-badge-progress' : 'sns-badge-done'}`}>{so.installType === 'replacement' ? 'Replacement' : 'New installation'}</span>
                          : <span className="sns-text-faint">—</span>}</td>
                        <td className="sns-text-soft">{so.customerId && custMap[so.customerId] ? customerLabel(custMap[so.customerId]) : '—'}</td>
                        <td className="sns-text-soft">{so.issuedTo || '—'}</td>
                        <td className="sns-text-soft">{so.purpose || '—'}</td>
                        <td className="sns-text-soft">{so.referenceNo || '—'}</td>
                        <td className="sns-text-soft">{so.issuedBy || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'devices' && <DeviceLog stockOut={stockOut} items={stockItems} customers={customers || []} routers={routerRows} />}

      {view === 'retrieved' && routers && (
        <RetrievedRouters rows={routers.rows} customers={customers || []} members={routers.members} userMap={routers.userMap} isAdmin currentUser={routers.currentUser} deviceItems={deviceItems} summary={summary}
          onAdd={routers.onAdd} onUpdate={routers.onUpdate} onSetStatus={routers.onSetStatus} onDelete={routers.onDelete}
          onIssue={routers.onIssue} onUndoReissue={routers.onUndoReissue} onMarkWorking={routers.onMarkWorking}
          onLinkRouters={routers.onLink ? (list) => setLinkRouters(list) : undefined}
          onSetup={routers.onSetItems ? () => setShowRouterItems(true) : undefined} onSeeSummary={() => setView('summary')} />
      )}

      {view === 'reorder' && (
        reorderRows.length === 0 ? <EmptyState message="Nothing needs reordering right now." /> : (
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th>Item</th><th>Unit</th><th>Current stock</th><th>Reorder level</th><th>Supplier</th></tr>
                </thead>
                <tbody>
                  {reorderRows.map((r) => (
                    <tr key={r.item.id}>
                      <td style={{ fontWeight: 600 }}>{r.item.itemName}</td>
                      <td className="sns-text-soft">{r.item.unit}</td>
                      <td className="sns-mono" style={{ fontWeight: 700, color: 'var(--overdue)' }}>{r.remaining}{r.retrievedReady > 0 && <span className="sns-text-faint" style={{ fontSize: '0.68rem', marginLeft: '0.35rem', fontWeight: 400 }} title="Of these, retrieved routers that are working and ready to use again">({r.retrievedReady} retrieved)</span>}</td>
                      <td className="sns-text-soft">{r.item.reorderLevel}</td>
                      <td className="sns-text-soft">{r.item.supplier || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {(showItemForm || editingItem) && (
        <ItemFormModal
          item={editingItem}
          onClose={() => { setShowItemForm(false); setEditingItem(null) }}
          onSave={async (data) => {
            if (editingItem) await onUpdateItem(editingItem.id, data)
            else await onAddItem(data)
            setShowItemForm(false); setEditingItem(null)
          }}
        />
      )}
      {showStockInForm && (
        <StockInFormModal
          items={stockItems}
          onClose={() => setShowStockInForm(false)}
          onSave={async (data) => { await onAddStockIn(data); setShowStockInForm(false) }}
        />
      )}
      {showStockOutForm && (
        <StockOutFormModal
          items={stockItems}
          customers={customers || []}
          routers={routerRows}
          onIssueRetrieved={routers && routers.onIssue ? async (router, f) => { const done = await routers.onIssue(router, f); if (done !== false) setShowStockOutForm(false); return done } : undefined}
          onClose={() => setShowStockOutForm(false)}
          onSave={async (data) => { await onAddStockOut(data); setShowStockOutForm(false) }}
        />
      )}
      {showRouterItems && routers && routers.onSetItems && <RouterItemsModal items={stockItems} onSave={routers.onSetItems} onClose={() => setShowRouterItems(false)} />}
      {linkRouters && routers && routers.onLink && (
        <LinkRoutersModal routers={linkRouters} deviceItems={deviceItems} onClose={() => setLinkRouters(null)}
          onSave={async (links) => { const ok = await routers.onLink(links); if (ok !== false) setLinkRouters(null) }} />
      )}
      {confirmDeleteItem && (
        <ConfirmDialog
          title="Delete item"
          message={`Are you sure you want to delete ${confirmDeleteItem.itemName}? This can't be undone.`}
          danger
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={async () => { await onDeleteItem(confirmDeleteItem); setConfirmDeleteItem(null) }}
        />
      )}
    </div>
  )
}
