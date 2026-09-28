import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ConfirmDialog, EmptyState, FormField, SearchInput } from './shared'
import { STOCK_CATEGORIES, STOCK_UNITS, defaultStockItemForm, defaultStockInForm, defaultStockOutForm, formatDate, formatKSh, toDateInputValue } from '../lib/helpers'

function ItemFormModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item
    ? { itemCode: item.itemCode, itemName: item.itemName, category: item.category, unit: item.unit, reorderLevel: String(item.reorderLevel), unitCost: String(item.unitCost), supplier: item.supplier, notes: item.notes }
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

function StockOutFormModal({ items, onClose, onSave }) {
  const [form, setForm] = useState(defaultStockOutForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.itemId) e.itemId = 'Please select an item'
    if (!form.issueDate) e.issueDate = 'Required'
    if (form.quantity === '' || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) e.quantity = 'Enter a valid quantity'
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
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Record stock issued</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.4rem' }} className="space-y-4">
          <FormField label="Item" error={errors.itemId}>
            <select className={itemCls} value={form.itemId} onChange={(e) => update('itemId', e.target.value)}>
              <option value="" disabled>select-item</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.itemName}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Date" error={errors.issueDate}>
              <input type="date" className="sns-input" value={form.issueDate} onChange={(e) => update('issueDate', e.target.value)} />
            </FormField>
            <FormField label="Quantity" error={errors.quantity}>
              <input type="number" min="0" step="1" className="sns-input" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} placeholder="0" />
            </FormField>
          </div>
          <FormField label="Issued to / Job site">
            <input className="sns-input" value={form.issuedTo} onChange={(e) => update('issuedTo', e.target.value)} placeholder="e.g. Site installation — Langat" />
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
export default function StockTab({ stockItems, stockIn, stockOut, onAddItem, onUpdateItem, onDeleteItem, onAddStockIn, onAddStockInBatch, onAddStockOut }) {
  const [view, setView] = useState('summary') // 'summary' | 'items' | 'in' | 'out'
  const [search, setSearch] = useState('')
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null)
  const [showStockInForm, setShowStockInForm] = useState(false)
  const [showStockOutForm, setShowStockOutForm] = useState(false)

  // Quick-entry grid on Stock In: every item in the Item Master starts at 0.
  // A missing key means "untouched" -- quantity reads 0 and unit cost falls
  // back to the catalog price (which the user can override, since it varies).
  const [quantities, setQuantities] = useState({})
  const [costs, setCosts] = useState({})
  const [batchDate, setBatchDate] = useState(() => toDateInputValue(new Date()))
  const [batchError, setBatchError] = useState('')
  const [invalidIds, setInvalidIds] = useState([])
  const [batchSaving, setBatchSaving] = useState(false)

  const itemMap = useMemo(() => { const m = {}; stockItems.forEach((i) => { m[i.id] = i }); return m }, [stockItems])

  // Computed independently per item (filter each log separately) rather
  // than joined -- joining stock_in and stock_out together on item_id in
  // one pass multiplies rows together (a real bug caught while testing
  // this migration), not something that shows up from reading the code.
  const summaryRows = useMemo(() => {
    return stockItems.map((item) => {
      const totalPurchased = stockIn.filter((si) => si.itemId === item.id).reduce((s, si) => s + si.quantity, 0)
      const totalIssued = stockOut.filter((so) => so.itemId === item.id).reduce((s, so) => s + so.quantity, 0)
      const currentStock = totalPurchased - totalIssued
      return { item, totalPurchased, totalIssued, currentStock, status: currentStock <= item.reorderLevel ? 'REORDER' : 'OK' }
    }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'REORDER' ? -1 : 1))
  }, [stockItems, stockIn, stockOut])

  const reorderCount = summaryRows.filter((r) => r.status === 'REORDER').length
  const reorderRows = summaryRows.filter((r) => r.status === 'REORDER')

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase()
    return stockItems.filter((i) => !q || [i.itemCode, i.itemName, i.category, i.supplier].some((f) => (f || '').toLowerCase().includes(q)))
  }, [stockItems, search])

  const sortedStockIn = useMemo(() => [...stockIn].sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)), [stockIn])
  const sortedStockOut = useMemo(() => [...stockOut].sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate)), [stockOut])

  const entryRows = useMemo(() => stockItems.map((item) => {
    const qtyStr = quantities[item.id] ?? '0'
    const costStr = costs[item.id] ?? String(item.unitCost)
    const qtyNum = Number(qtyStr)
    const costNum = Number(costStr)
    return { item, qtyStr, costStr, qtyNum: isNaN(qtyNum) ? 0 : qtyNum, costNum: isNaN(costNum) ? 0 : costNum }
  }), [stockItems, quantities, costs])
  const enteredRows = entryRows.filter((r) => r.qtyNum > 0)
  const batchTotal = enteredRows.reduce((sum, r) => sum + r.qtyNum * r.costNum, 0)

  function clearRowError(id) {
    setInvalidIds((ids) => ids.filter((x) => x !== id))
    setBatchError('')
  }

  function setQty(id, raw) {
    // "0" followed by a typed digit would read "05" -- strip the leading zero.
    setQuantities((q) => ({ ...q, [id]: raw.replace(/^0+(?=\d)/, '') }))
    clearRowError(id)
  }

  function setCost(id, raw) {
    setCosts((c) => ({ ...c, [id]: raw }))
    clearRowError(id)
  }

  async function handleRecordBatch() {
    if (!batchDate) { setBatchError('Please choose a date.'); return }
    if (batchDate > toDateInputValue(new Date())) { setBatchError("You can't record a purchase for a future date."); return }
    const bad = entryRows.filter((r) => {
      const qtyBad = r.qtyStr !== '' && (isNaN(Number(r.qtyStr)) || Number(r.qtyStr) < 0)
      const costBad = r.qtyNum > 0 && (r.costStr === '' || isNaN(Number(r.costStr)) || Number(r.costStr) < 0)
      return qtyBad || costBad
    }).map((r) => r.item.id)
    if (bad.length > 0) {
      setInvalidIds(bad)
      setBatchError('Check the highlighted rows: quantities and costs must be valid, non-negative numbers.')
      return
    }
    if (enteredRows.length === 0) { setBatchError('Enter a quantity for at least one item.'); return }
    setBatchSaving(true)
    const ok = await onAddStockInBatch(enteredRows.map((r) => ({
      itemId: r.item.id, purchaseDate: batchDate, quantity: r.qtyNum, unitCost: r.costNum,
      supplier: r.item.supplier || '', invoiceNo: '', receivedBy: '',
    })))
    setBatchSaving(false)
    // Only reset on success, so a failed save never wipes what was typed.
    if (ok) { setQuantities({}); setCosts({}); setInvalidIds([]); setBatchError('') }
  }

  return (
    <div>
      <div className="flex gap-2" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button onClick={() => setView('summary')} className={view === 'summary' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Summary</button>
        <button onClick={() => setView('items')} className={view === 'items' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Item Master</button>
        <button onClick={() => setView('in')} className={view === 'in' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Stock In</button>
        <button onClick={() => setView('out')} className={view === 'out' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Stock Out</button>
        <button onClick={() => setView('reorder')} className={view === 'reorder' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>
          Need Reorder{reorderCount > 0 && <span className="sns-badge sns-badge-overdue" style={{ marginLeft: '0.4rem' }}>{reorderCount}</span>}
        </button>
      </div>

      {view === 'summary' && (
        summaryRows.length === 0 ? <EmptyState message="No items in the catalog yet." /> : (
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th>Item</th><th>Unit</th><th>Purchased</th><th>Issued</th><th>Current stock</th><th>Reorder level</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.item.id}>
                      <td style={{ fontWeight: 600 }}>{r.item.itemName}</td>
                      <td className="sns-text-soft">{r.item.unit}</td>
                      <td className="sns-mono">{r.totalPurchased}</td>
                      <td className="sns-mono">{r.totalIssued}</td>
                      <td className="sns-mono" style={{ fontWeight: 700 }}>{r.currentStock}</td>
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
        )
      )}

      {view === 'items' && (
        <>
          <div className="flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by code, name, category, supplier…" />
            <button onClick={() => setShowItemForm(true)} className="sns-btn-primary"><Plus size={16} /> Add item</button>
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
                        <td style={{ fontWeight: 600 }}>{i.itemName}</td>
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
          <div className="flex items-end justify-between" style={{ flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Record purchases</p>
              <p className="sns-text-soft" style={{ fontSize: '0.8rem', marginTop: 2 }}>Enter a quantity against each item you are recording. Items left at 0 are skipped.</p>
            </div>
            <div className="flex items-end gap-2" style={{ flexWrap: 'wrap' }}>
              <div>
                <label className="sns-eyebrow sns-text-faint" style={{ display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" max={toDateInputValue(new Date())} className="sns-input" value={batchDate} onChange={(e) => { setBatchDate(e.target.value); setBatchError('') }} />
              </div>
              <button onClick={handleRecordBatch} disabled={enteredRows.length === 0 || batchSaving} className="sns-btn-primary">
                {batchSaving ? 'Saving…' : enteredRows.length > 0 ? `Record ${enteredRows.length} purchase${enteredRows.length === 1 ? '' : 's'}` : 'Record purchases'}
              </button>
            </div>
          </div>
          {batchError && <p style={{ color: 'var(--overdue)', fontSize: '0.82rem', marginBottom: '0.8rem' }}>{batchError}</p>}
          {stockItems.length === 0 ? <EmptyState message="Add items to the Item Master first." /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th>Item</th><th>Unit</th><th>Quantity</th><th>Unit cost (KES)</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                  </thead>
                  <tbody>
                    {entryRows.map((r) => {
                      const flagged = invalidIds.includes(r.item.id)
                      const flagStyle = flagged ? { borderColor: 'var(--overdue)' } : {}
                      return (
                        <tr key={r.item.id}>
                          <td style={{ fontWeight: 600 }}>{r.item.itemName}</td>
                          <td className="sns-text-soft">{r.item.unit}</td>
                          <td>
                            <input
                              type="number" inputMode="numeric" min="0" step="1" className="sns-input"
                              aria-label={`Quantity for ${r.item.itemName}`}
                              style={{ width: '5.5rem', ...flagStyle }}
                              value={r.qtyStr}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setQty(r.item.id, e.target.value)}
                              onBlur={() => { if (r.qtyStr === '') setQty(r.item.id, '0') }}
                            />
                          </td>
                          <td>
                            <input
                              type="number" min="0" className="sns-input"
                              aria-label={`Unit cost for ${r.item.itemName}`}
                              style={{ width: '7rem', ...flagStyle }}
                              value={r.costStr}
                              onChange={(e) => setCost(r.item.id, e.target.value)}
                            />
                          </td>
                          <td className="sns-mono" style={{ textAlign: 'right', fontWeight: r.qtyNum > 0 ? 700 : 400 }}>
                            {r.qtyNum > 0 ? formatKSh(r.qtyNum * r.costNum) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {enteredRows.length > 0 && (
            <p className="sns-mono" style={{ textAlign: 'right', fontWeight: 700, marginTop: '0.7rem' }}>Total to record: {formatKSh(batchTotal)}</p>
          )}

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
                        <td className="sns-text-soft">{si.invoiceNo || '—'}</td>
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
                    <tr><th>Date</th><th>Item</th><th>Qty</th><th>Issued to</th><th>Purpose</th><th>Reference</th><th>Issued by</th></tr>
                  </thead>
                  <tbody>
                    {sortedStockOut.map((so) => (
                      <tr key={so.id}>
                        <td className="sns-text-soft">{formatDate(so.issueDate)}</td>
                        <td style={{ fontWeight: 600 }}>{itemMap[so.itemId]?.itemName || '—'}</td>
                        <td className="sns-mono">{so.quantity}</td>
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
                      <td className="sns-mono" style={{ fontWeight: 700, color: 'var(--overdue)' }}>{r.currentStock}</td>
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
          onClose={() => setShowStockOutForm(false)}
          onSave={async (data) => { await onAddStockOut(data); setShowStockOutForm(false) }}
        />
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
