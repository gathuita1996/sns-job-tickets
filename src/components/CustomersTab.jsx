import { useMemo, useState } from 'react'
import { ArrowLeft, Eye, Pencil, Printer, Trash2, UserCog, Users, X } from 'lucide-react'
import Avatar from './Avatar'
import { EmptyState, SearchInput } from './shared'
import { departmentLabel, formatDateTime, isInPeriod } from '../lib/helpers'

// The admin's Customers tab: the full list, plus a "By staff member" view. Every customer belongs to the staff member who recorded
// them (imported customers start with the admin who imported them and can be handed over one at a time or in bulk).
export default function CustomersTab({ customers, users, userMap, onView, onEdit, onPrint, onDelete, onAssign, onOpenStaff, initialMemberId }) {
  const [view, setView] = useState(initialMemberId ? 'list' : 'list')
  const [search, setSearch] = useState('')
  const [who, setWho] = useState(initialMemberId || 'all')          // 'all' | 'imported' | a staff member's id
  const [selected, setSelected] = useState(() => new Set())
  const [assignTo, setAssignTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const rowsByPerson = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, { user: u, total: 0, thisMonth: 0, imported: 0 }]))
    for (const c of customers) {
      const r = m.get(c.recordedBy); if (!r) continue
      r.total++; if (isInPeriod(c.createdAt, 'month')) r.thisMonth++; if (c.commissionExempt) r.imported++
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.user.fullName.localeCompare(b.user.fullName))
  }, [customers, users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...customers]
      .filter((c) => (who === 'all' ? true : who === 'imported' ? c.commissionExempt : c.recordedBy === who))
      .filter((c) => !q || [c.fullName, c.contact, c.location, userMap[c.recordedBy]?.fullName].some((f) => (f || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [customers, search, who, userMap])

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id))
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((c) => c.id)))
  const target = userMap[assignTo]

  async function assign(ids, memberId) {
    setBusy(true)
    const done = await onAssign(ids, memberId)
    setBusy(false)
    if (done) { setSelected(new Set()); setAssignTo(''); setEditingId(null) }
  }

  const whoLabel = who === 'imported' ? 'Imported customers' : who !== 'all' ? `${userMap[who]?.fullName || 'Staff member'}'s customers` : null

  return (
    <div>
      <div className="no-print flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div className="flex gap-2" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }} onClick={() => setView('list')}>All customers</button>
          <button type="button" role="tab" aria-selected={view === 'members'} className={view === 'members' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }} onClick={() => setView('members')}><Users size={14} /> By staff member</button>
        </div>
      </div>

      {view === 'members' ? (
        <div>
          <p className="sns-text-soft" style={{ fontSize: '0.84rem', marginBottom: '0.8rem' }}>Click a person to see every customer they recorded.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rowsByPerson.map(({ user, total, thisMonth, imported }) => (
              <div key={user.id} className="sns-card" style={{ padding: '1rem' }}>
                <button type="button" onClick={() => { setWho(user.id); setView('list'); setSelected(new Set()) }} aria-label={`Show ${user.fullName}'s customers`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <Avatar name={user.fullName} url={user.avatarUrl} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.fullName}</p>
                    <p className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{departmentLabel(user.department)}{user.role === 'admin' ? ` · ${user.title || 'Admin'}` : ''}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}><p className="sns-mono" style={{ fontWeight: 700, fontSize: '1.2rem' }}>{total}</p><p className="sns-eyebrow sns-text-faint">customers</p></div>
                </button>
                <p className="sns-text-soft" style={{ fontSize: '0.76rem', marginTop: '0.5rem' }}>{thisMonth} this month{imported ? ` · ${imported} imported` : ''}{onOpenStaff && <> · <button type="button" onClick={() => onOpenStaff(user.id)} style={{ background: 'none', border: 'none', color: 'var(--signal-deep)', cursor: 'pointer', padding: 0, fontSize: '0.76rem', textDecoration: 'underline' }}>Profile</button></>}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="no-print flex flex-col sm:flex-row gap-2" style={{ marginBottom: '1rem' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, contact, location or staff member…" />
            <select className="sns-input" style={{ width: 'auto' }} value={who} onChange={(e) => { setWho(e.target.value); setSelected(new Set()) }} aria-label="Recorded by">
              <option value="all">Recorded by: everyone</option>
              <option value="imported">Imported (no commission)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          {whoLabel && (
            <p className="flex items-center gap-2" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
              {who !== 'all' && who !== 'imported' && <button type="button" className="sns-icon-btn" title="Back to staff" aria-label="Back to staff" onClick={() => { setWho('all'); setView('members') }}><ArrowLeft size={15} /></button>}
              Showing <strong>{whoLabel}</strong> ({filtered.length})
              <button type="button" className="sns-icon-btn" title="Show everyone" aria-label="Clear filter" onClick={() => setWho('all')}><X size={14} /></button>
            </p>
          )}
          {selected.size > 0 && (
            <div className="sns-card flex items-center gap-3" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', flexWrap: 'wrap', borderLeft: '4px solid var(--signal)' }} role="region" aria-label="Assign selected customers">
              <strong style={{ fontSize: '0.88rem' }}>{selected.size} selected</strong>
              <select className="sns-input" style={{ width: 'auto' }} value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Record these customers under"><option value="">Record under…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
              <button type="button" className="sns-btn-primary" disabled={!assignTo || busy} onClick={() => assign([...selected], assignTo)}>{busy ? 'Saving…' : `Assign to ${target ? target.fullName.split(' ')[0] : 'staff member'}`}</button>
              <button type="button" className="sns-btn-secondary" onClick={() => setSelected(new Set())}>Clear</button>
              <span className="sns-text-faint" style={{ fontSize: '0.74rem' }}>Imported customers never earn commission, even after they are handed over.</span>
            </div>
          )}
          {filtered.length === 0 ? <EmptyState message={customers.length === 0 ? 'No customers recorded yet.' : 'No customers match.'} /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ width: 32 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all shown" /></th>
                    <th>No.</th><th>Name</th><th>Contact</th><th>Location</th><th>Package installed</th><th>Recorded by</th><th>Date &amp; time</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map((c, idx) => (
                      <tr key={c.id}>
                        <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.fullName}`} /></td>
                        <td className="sns-mono sns-text-faint">{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{c.fullName}{c.commissionExempt && <span className="sns-badge sns-badge-role" style={{ marginLeft: '0.4rem' }} title="Imported: never earns commission">Imported</span>}</td>
                        <td className="sns-text-soft">{c.contact}</td>
                        <td className="sns-text-soft">{c.location}</td>
                        <td className="sns-text-soft">{c.interestedPackage || '—'}</td>
                        <td className="sns-text-soft">
                          {editingId === c.id ? (
                            <select className="sns-input" style={{ width: 'auto', fontSize: '0.8rem' }} autoFocus value={c.recordedBy} aria-label={`Recorded by for ${c.fullName}`} onChange={(e) => assign([c.id], e.target.value)} onBlur={() => setEditingId(null)}>
                              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                            </select>
                          ) : (
                            <span className="flex items-center gap-1">
                              <button type="button" onClick={() => setWho(c.recordedBy)} title="Show everything this person recorded" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', textDecoration: 'underline dotted' }}>{userMap[c.recordedBy]?.fullName || '—'}</button>
                              <button type="button" className="sns-icon-btn" title="Change who recorded this customer" aria-label={`Change who recorded ${c.fullName}`} onClick={() => setEditingId(c.id)}><UserCog size={14} /></button>
                            </span>
                          )}
                        </td>
                        <td className="sns-text-soft">{formatDateTime(c.createdAt)}</td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => onView(c)} title="View" aria-label="View" className="sns-icon-btn"><Eye size={15} /></button>
                            <button onClick={() => onEdit(c)} title="Edit" aria-label="Edit" className="sns-icon-btn"><Pencil size={15} /></button>
                            <button onClick={() => onPrint(c)} title="Print" aria-label="Print" className="sns-icon-btn"><Printer size={15} /></button>
                            <button onClick={() => onDelete(c)} title="Delete" aria-label="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>
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
    </div>
  )
}
