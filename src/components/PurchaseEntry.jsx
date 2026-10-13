import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { EmptyState } from './shared'
import { formatKSh, toDateInputValue } from '../lib/helpers'

let lineKey = 1
const blankLine = () => ({ key: lineKey++, itemId: '', qty: '', cost: '' })

// Record purchases without a long list: pick the item from a drop-down, enter how many.
// "Add another item" adds a line when several things were bought on the same day.
export default function PurchaseEntry({ items, onRecord }) {
  const [date, setDate] = useState(() => toDateInputValue(new Date()))
  const [lines, setLines] = useState(() => [blankLine()])
  const [error, setError] = useState('')
  const [flagged, setFlagged] = useState([])
  const [saving, setSaving] = useState(false)

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.itemName.localeCompare(b.itemName)), [items])
  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [String(i.id), i])), [items])
  const used = new Set(lines.map((l) => l.itemId).filter(Boolean))

  const rows = lines.map((l) => {
    const qty = Number(l.qty), cost = Number(l.cost)
    return { ...l, item: itemMap[l.itemId], qtyNum: isNaN(qty) ? 0 : qty, costNum: isNaN(cost) ? 0 : cost }
  })
  const ready = rows.filter((r) => r.item && r.qtyNum > 0)
  const total = ready.reduce((s, r) => s + r.qtyNum * r.costNum, 0)

  function patch(key, p) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)))
    setFlagged((f) => f.filter((k) => k !== key)); setError('')
  }
  function pickItem(key, itemId) {
    const it = itemMap[itemId]
    patch(key, { itemId, cost: it ? String(it.unitCost) : '' })          // price comes from the catalogue; change it if this purchase cost differently
  }
  function removeLine(key) {
    setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((l) => l.key !== key)))
    setFlagged((f) => f.filter((k) => k !== key)); setError('')
  }

  async function record() {
    if (!date) { setError('Please choose a date.'); return }
    if (date > toDateInputValue(new Date())) { setError("You can't record a purchase for a future date."); return }
    const started = rows.filter((r) => r.itemId || (r.qty !== '' && r.qty != null))
    const bad = started.filter((r) => !r.item || !(r.qtyNum > 0) || r.cost === '' || isNaN(Number(r.cost)) || Number(r.cost) < 0).map((r) => r.key)
    if (bad.length) { setFlagged(bad); setError('Check the highlighted lines: each needs an item, a quantity above 0, and a valid unit cost.'); return }
    if (started.length === 0) { setError('Choose an item from the list and enter a quantity.'); return }
    setSaving(true)
    const ok = await onRecord(started.map((r) => ({ itemId: r.item.id, purchaseDate: date, quantity: r.qtyNum, unitCost: r.costNum, supplier: r.item.supplier || '', invoiceNo: '', receivedBy: '' })))
    setSaving(false)
    if (ok) { setLines([blankLine()]); setFlagged([]); setError('') }      // only cleared on success, so a failed save never wipes what was typed
  }

  return (
    <div>
      <div className="flex items-end justify-between" style={{ flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>Record purchases</p>
          <p className="sns-text-soft" style={{ fontSize: '0.8rem', marginTop: 2 }}>Click the item box, pick what you bought, then enter how many. Use "Add another item" if you bought several things.</p>
        </div>
        <div className="flex items-end gap-2" style={{ flexWrap: 'wrap' }}>
          <div>
            <label className="sns-eyebrow sns-text-faint" style={{ display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" max={toDateInputValue(new Date())} className="sns-input" value={date} onChange={(e) => { setDate(e.target.value); setError('') }} />
          </div>
          <button onClick={record} disabled={ready.length === 0 || saving} className="sns-btn-primary">
            {saving ? 'Saving…' : ready.length > 0 ? `Record ${ready.length} purchase${ready.length === 1 ? '' : 's'}` : 'Record purchases'}
          </button>
        </div>
      </div>
      {error && <p style={{ color: 'var(--overdue)', fontSize: '0.82rem', marginBottom: '0.8rem' }}>{error}</p>}

      {items.length === 0 ? <EmptyState message="Add items to the Item Master first." /> : (
        <div className="sns-card" style={{ padding: '1rem' }}>
          {rows.map((r) => {
            const warn = flagged.includes(r.key) ? { borderColor: 'var(--overdue)' } : {}
            return (
              <div key={r.key} className="flex items-end gap-2" style={{ flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
                  <label className="sns-eyebrow sns-text-faint" style={{ display: 'block', marginBottom: 4 }}>Item</label>
                  <select className={`sns-input${r.itemId === '' ? ' sns-select-placeholder' : ''}`} style={{ width: '100%', ...warn }} value={r.itemId} onChange={(e) => pickItem(r.key, e.target.value)} aria-label="Item">
                    <option value="" disabled>Select item…</option>
                    {sortedItems.map((i) => (
                      <option key={i.id} value={i.id} disabled={used.has(String(i.id)) && String(i.id) !== r.itemId}>
                        {i.itemName} ({i.unit}){used.has(String(i.id)) && String(i.id) !== r.itemId ? ' - already added' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="sns-eyebrow sns-text-faint" style={{ display: 'block', marginBottom: 4 }}>Quantity</label>
                  <input type="number" inputMode="numeric" min="0" step="1" className="sns-input" aria-label="Quantity" style={{ width: '6rem', ...warn }} value={r.qty} placeholder="0" onChange={(e) => patch(r.key, { qty: e.target.value })} />
                </div>
                <div>
                  <label className="sns-eyebrow sns-text-faint" style={{ display: 'block', marginBottom: 4 }}>Unit cost (KES)</label>
                  <input type="number" min="0" className="sns-input" aria-label="Unit cost" style={{ width: '8rem', ...warn }} value={r.cost} onChange={(e) => patch(r.key, { cost: e.target.value })} />
                </div>
                <div style={{ minWidth: '6.5rem', textAlign: 'right', paddingBottom: '0.6rem' }} className="sns-mono">
                  {r.item && r.qtyNum > 0 ? <strong>{formatKSh(r.qtyNum * r.costNum)}</strong> : <span className="sns-text-faint">—</span>}
                </div>
                <button type="button" onClick={() => removeLine(r.key)} className="sns-icon-btn" title="Remove this line" style={{ marginBottom: 2 }}><X size={16} /></button>
              </div>
            )
          })}
          <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} disabled={lines.some((l) => !l.itemId)} className="sns-btn-secondary" style={{ fontSize: '0.82rem' }}>
            <Plus size={15} /> Add another item
          </button>
        </div>
      )}
      {ready.length > 0 && <p className="sns-mono" style={{ textAlign: 'right', fontWeight: 700, marginTop: '0.7rem' }}>Total to record: {formatKSh(total)}</p>}
    </div>
  )
}
