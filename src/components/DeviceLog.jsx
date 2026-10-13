import { useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Cpu, Repeat, Wifi } from 'lucide-react'
import { EmptyState, SearchInput, StatCard } from './shared'
import { INSTALL_TYPES, customerLabel, formatDate, toDateInputValue } from '../lib/helpers'

const typeLabel = (k) => (INSTALL_TYPES.find((t) => t.key === k) || {}).label

// Every ONU / XPON router taken out of the store: new installation or replacement, and for whom.
export default function DeviceLog({ stockOut, items, customers }) {
  const [type, setType] = useState('all')
  const [itemId, setItemId] = useState('all')
  const [search, setSearch] = useState('')

  const deviceItems = useMemo(() => items.filter((i) => i.isDevice), [items])
  const itemMap = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items])
  const custMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers])

  const all = useMemo(() => {
    const ids = new Set(deviceItems.map((i) => i.id))
    return stockOut.filter((so) => ids.has(so.itemId))
      .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || b.id - a.id)
  }, [stockOut, deviceItems])

  const month = toDateInputValue(new Date()).slice(0, 7)
  const sum = (rows) => rows.reduce((s, r) => s + r.quantity, 0)
  const stats = {
    total: sum(all), fresh: sum(all.filter((r) => r.installType === 'new_installation')),
    repl: sum(all.filter((r) => r.installType === 'replacement')), thisMonth: sum(all.filter((r) => String(r.issueDate).startsWith(month))),
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((r) => {
      if (type === 'none' ? r.installType : type !== 'all' && r.installType !== type) return false
      if (itemId !== 'all' && String(r.itemId) !== itemId) return false
      if (!q) return true
      const c = r.customerId && custMap[r.customerId] ? customerLabel(custMap[r.customerId]) : ''
      return [c, r.issuedTo, r.deviceSerial, r.referenceNo].some((f) => String(f || '').toLowerCase().includes(q))
    })
  }, [all, type, itemId, search, custMap])

  // Replaced more than once usually means the cause is the line, the power or the placement, not the device.
  const repeats = useMemo(() => {
    const by = new Map()
    all.filter((r) => r.installType === 'replacement' && r.customerId != null).forEach((r) => {
      const g = by.get(r.customerId) || { id: r.customerId, count: 0, last: r.issueDate }
      g.count += r.quantity; if (String(r.issueDate) > String(g.last)) g.last = r.issueDate; by.set(r.customerId, g)
    })
    return [...by.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count)
  }, [all])

  if (deviceItems.length === 0) {
    return <EmptyState message='No device items yet. Open the Item Master, edit your ONU / XPON router items and tick "Field device".' />
  }

  const chip = (key, label) => (
    <button key={key} onClick={() => setType(key)} className={type === key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>{label}</button>
  )

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '1.2rem' }}>
        <StatCard label="Devices taken out" value={stats.total} icon={Cpu} />
        <StatCard label="New installations" value={stats.fresh} icon={Wifi} tone="success" />
        <StatCard label="Replacements" value={stats.repl} icon={Repeat} tone="warning" />
        <StatCard label="This month" value={stats.thisMonth} icon={Calendar} />
      </div>

      {repeats.length > 0 && (
        <div className="sns-card" style={{ padding: '1rem 1.2rem', marginBottom: '1.2rem', borderLeft: '4px solid var(--overdue)' }}>
          <p className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: '0.9rem' }}><AlertTriangle size={16} /> Customers whose device was replaced more than once</p>
          <ul style={{ margin: '0.5rem 0 0.4rem 1.1rem', fontSize: '0.85rem', listStyle: 'disc' }}>
            {repeats.map((g) => <li key={g.id}><strong>{custMap[g.id] ? customerLabel(custMap[g.id]) : 'A customer'}</strong>: {g.count} replacements, last on {formatDate(g.last)}</li>)}
          </ul>
          <p className="sns-text-soft" style={{ fontSize: '0.78rem' }}>Repeated replacements often point to the line, the power supply or where the device is placed, not the device itself. A site check may save more devices.</p>
        </div>
      )}

      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {chip('all', 'All')}{chip('new_installation', 'New installations')}{chip('replacement', 'Replacements')}{chip('none', 'Not recorded (older)')}
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <select className="sns-input" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Device">
            <option value="all">All devices</option>
            {deviceItems.map((i) => <option key={i.id} value={i.id}>{i.itemName}</option>)}
          </select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search customer, technician, serial…" />
        </div>
      </div>

      {rows.length === 0 ? <EmptyState message={all.length === 0 ? 'No devices have been issued yet. Use Stock Out, pick an ONU or XPON router, and choose new installation or replacement.' : 'Nothing matches these filters.'} /> : (
        <div className="sns-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Date</th><th>Device</th><th>Qty</th><th>Taken for</th><th>Customer</th><th>Taken by</th><th>Serial / MAC</th><th>Reference</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="sns-text-soft">{formatDate(r.issueDate)}</td>
                    <td style={{ fontWeight: 600 }}>{itemMap[r.itemId]?.itemName || '—'}</td>
                    <td className="sns-mono">{r.quantity}</td>
                    <td>{r.installType
                      ? <span className={`sns-badge ${r.installType === 'replacement' ? 'sns-badge-progress' : 'sns-badge-done'}`}>{typeLabel(r.installType)}</span>
                      : <span className="sns-text-faint">Not recorded</span>}</td>
                    <td>{r.customerId && custMap[r.customerId] ? customerLabel(custMap[r.customerId]) : <span className="sns-text-faint">—</span>}</td>
                    <td className="sns-text-soft">{r.issuedTo || '—'}</td>
                    <td className="sns-mono sns-text-soft">{r.deviceSerial || '—'}</td>
                    <td className="sns-text-soft">{r.referenceNo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
