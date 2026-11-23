import { Fragment, Suspense, lazy, useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, Eye, MessageCircle, Pencil, Printer, Trash2, Users, X } from 'lucide-react'
import Avatar from './Avatar'
import CustomerReceipts, { SubscriptionBadge } from './CustomerReceipts'
import WhatsappSetup from './WhatsappSetup'
import { EmptyState, SearchInput } from './shared'
import { departmentLabel, formatDateTime, isInPeriod } from '../lib/helpers'
import { groupReceipts, subscriptionOf } from '../lib/subscription'
import { messagesByReceipt } from '../lib/receiptMessages'
import useNow from '../lib/useNow'
import useWhatsappStatus from '../lib/useWhatsappStatus'

// The screen for sending a receipt is only downloaded when someone presses "Send receipt" (it carries the receipt artwork).
const SendReceipt = lazy(() => import('./SendReceipt'))
const FILTERS = [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']]

// The admin's Customers tab: the full list, plus a "By staff member" view. Every customer belongs to the staff member who
// recorded them, and that is fixed once the customer is recorded (it cannot be edited here or anywhere else in the app).
//
// Click a customer anywhere on their row to open it: it shows whether they are Active or Inactive, the "Send receipt" button
// and the receipts already sent. A customer is Active until the expiry date on the receipt that was sent to them has passed.
//   receipts : every receipt sent so far      client : the database client      isDirector : only the Director deletes a receipt
//   onReceiptsChanged : reload the receipts   notify(message, type) : a toast
//   messages : the WhatsApp message log (so each receipt shows whether WhatsApp delivered it)      onMessagesChanged : reload it
export default function CustomersTab({ customers, users, userMap, onView, onEdit, onPrint, onDelete, onOpenStaff, initialMemberId, receipts = [], messages = [], client, isDirector = false, onReceiptsChanged = async () => {}, onMessagesChanged = async () => {}, notify = () => {} }) {
  const [view, setView] = useState('list')
  const [search, setSearch] = useState('')
  const [who, setWho] = useState(initialMemberId || 'all')          // 'all' | a staff member's id
  const [subFilter, setSubFilter] = useState('all')                 // 'all' | 'active' | 'inactive'
  const [openId, setOpenId] = useState(null)                        // the customer whose row is open
  const [sending, setSending] = useState(null)                      // the customer a receipt is being sent to
  const [setupOpen, setSetupOpen] = useState(false)                 // the WhatsApp sending set-up and check
  const now = useNow()
  const byCustomer = useMemo(() => groupReceipts(receipts), [receipts])
  const messageMap = useMemo(() => messagesByReceipt(messages), [messages])
  const { status: whatsapp, reload: reloadWhatsapp } = useWhatsappStatus(client, Boolean(client))     // is automatic WhatsApp sending set up?
  const subOf = (c) => subscriptionOf(byCustomer.get(c.id), now)

  const rowsByPerson = useMemo(() => {
    const m = new Map(users.map((u) => [u.id, { user: u, total: 0, thisMonth: 0 }]))
    for (const c of customers) {
      const r = m.get(c.recordedBy); if (!r) continue
      r.total++; if (isInPeriod(c.createdAt, 'month')) r.thisMonth++
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.user.fullName.localeCompare(b.user.fullName))
  }, [customers, users])

  const base = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...customers]
      .filter((c) => (who === 'all' ? true : c.recordedBy === who))
      .filter((c) => !q || [c.fullName, c.contact, c.location, userMap[c.recordedBy]?.fullName].some((f) => (f || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [customers, search, who, userMap])

  const counts = useMemo(() => {
    let active = 0
    for (const c of base) if (subscriptionOf(byCustomer.get(c.id), now).active) active++
    return { all: base.length, active, inactive: base.length - active }
  }, [base, byCustomer, now])
  const filtered = useMemo(() => (subFilter === 'all' ? base : base.filter((c) => subscriptionOf(byCustomer.get(c.id), now).active === (subFilter === 'active'))), [base, subFilter, byCustomer, now])

  // A click anywhere on the row opens it -- except when the click ended a text selection (someone copying a phone number).
  const toggle = (id) => {
    if (typeof window !== 'undefined' && window.getSelection && String(window.getSelection()).length > 0) return
    setOpenId((cur) => (cur === id ? null : id))
  }

  const whoLabel = who !== 'all' ? `${userMap[who]?.fullName || 'Staff member'}'s customers` : null

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
            {rowsByPerson.map(({ user, total, thisMonth }) => (
              <div key={user.id} className="sns-card" style={{ padding: '1rem' }}>
                <button type="button" onClick={() => { setWho(user.id); setView('list') }} aria-label={`Show ${user.fullName}'s customers`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <Avatar name={user.fullName} url={user.avatarUrl} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.fullName}</p>
                    <p className="sns-text-faint" style={{ fontSize: '0.74rem' }}>{departmentLabel(user.department)}{user.role === 'admin' ? ` · ${user.title || 'Admin'}` : ''}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}><p className="sns-mono" style={{ fontWeight: 700, fontSize: '1.2rem' }}>{total}</p><p className="sns-eyebrow sns-text-faint">customers</p></div>
                </button>
                <p className="sns-text-soft" style={{ fontSize: '0.76rem', marginTop: '0.5rem' }}>{thisMonth} this month{onOpenStaff && <> · <button type="button" onClick={() => onOpenStaff(user.id)} style={{ background: 'none', border: 'none', color: 'var(--signal-deep)', cursor: 'pointer', padding: 0, fontSize: '0.76rem', textDecoration: 'underline' }}>Profile</button></>}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <WhatsappStrip status={whatsapp} onOpen={() => setSetupOpen(true)} />
          <div className="no-print flex flex-col sm:flex-row gap-2" style={{ marginBottom: '1rem' }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, contact, location or staff member…" />
            <select className="sns-input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Recorded by">
              <option value="all">Recorded by: everyone</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          {whoLabel && (
            <p className="flex items-center gap-2" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
              <button type="button" className="sns-icon-btn" title="Back to staff" aria-label="Back to staff" onClick={() => { setWho('all'); setView('members') }}><ArrowLeft size={15} /></button>
              Showing <strong>{whoLabel}</strong> ({filtered.length})
              <button type="button" className="sns-icon-btn" title="Show everyone" aria-label="Clear filter" onClick={() => setWho('all')}><X size={14} /></button>
            </p>
          )}
          <div className="no-print flex items-center gap-2" role="group" aria-label="Show customers by subscription" style={{ marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={subFilter === key} className={subFilter === key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={() => setSubFilter(key)}>
                {label} <span className="sns-mono" style={{ opacity: 0.85 }}>{counts[key]}</span>
              </button>
            ))}
            <span className="sns-text-faint" style={{ fontSize: '0.76rem' }}>Click a customer to send a receipt. Active = a receipt was sent and its expiry date has not passed.</span>
          </div>
          {filtered.length === 0 ? <EmptyState message={customers.length === 0 ? 'No customers recorded yet.' : 'No customers match.'} /> : (
            <div className="sns-card" style={{ overflow: 'hidden' }}>
              <div className="sns-scroll-x">
                <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th>No.</th><th>Name</th><th>Subscription</th><th>Contact</th><th>Location</th><th>Package installed</th><th>Recorded by</th><th>Date &amp; time</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map((c, idx) => {
                      const sub = subOf(c), open = openId === c.id, mine = byCustomer.get(c.id) || []
                      const stop = (e) => e.stopPropagation()
                      return (
                        <Fragment key={c.id}>
                          <tr className="sns-row-click" onClick={() => toggle(c.id)} style={open ? { background: 'var(--signal-pale)' } : undefined}>
                            <td className="sns-mono sns-text-faint">{idx + 1}</td>
                            <td style={{ fontWeight: 600 }}>
                              <button type="button" aria-expanded={open} aria-controls={`customer-panel-${c.id}`} aria-label={`${open ? 'Close' : 'Open'} ${c.fullName}`} onClick={(e) => { stop(e); setOpenId(open ? null : c.id) }}
                                className="flex items-center gap-2" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit', fontWeight: 600, textAlign: 'left' }}>
                                <ChevronDown size={15} aria-hidden="true" style={{ transition: 'transform 0.15s ease', transform: open ? 'none' : 'rotate(-90deg)', flexShrink: 0 }} />
                                {c.fullName}
                              </button>
                            </td>
                            <td><SubscriptionBadge sub={sub} /></td>
                            <td className="sns-text-soft">{c.contact}</td>
                            <td className="sns-text-soft">{c.location}</td>
                            <td className="sns-text-soft">{c.interestedPackage || '—'}</td>
                            <td className="sns-text-soft">
                              <button type="button" onClick={(e) => { stop(e); setWho(c.recordedBy) }} title="Show everything this person recorded" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', textDecoration: 'underline dotted' }}>{userMap[c.recordedBy]?.fullName || '—'}</button>
                            </td>
                            <td className="sns-text-soft">{formatDateTime(c.createdAt)}</td>
                            <td onClick={stop}>
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => onView(c)} title="View" aria-label="View" className="sns-icon-btn"><Eye size={15} /></button>
                                <button onClick={() => onEdit(c)} title="Edit" aria-label="Edit" className="sns-icon-btn"><Pencil size={15} /></button>
                                <button onClick={() => onPrint(c)} title="Print" aria-label="Print" className="sns-icon-btn"><Printer size={15} /></button>
                                <button onClick={() => onDelete(c)} title="Delete" aria-label="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={9} style={{ background: 'var(--paper)', padding: 0, cursor: 'default' }}>
                                <div className="sns-row-panel" style={{ padding: '0.9rem 1.1rem' }}>
                                  <CustomerReceipts id={`customer-panel-${c.id}`} customer={c} sub={sub} now={now} mine={mine} messagesByReceipt={messageMap} whatsapp={whatsapp} client={client} isDirector={isDirector}
                                    onSend={setSending} onEdit={onEdit} onChanged={onReceiptsChanged} onRefreshMessages={onMessagesChanged} notify={notify} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {sending && (
        <Suspense fallback={<div role="status" className="no-print flex items-center justify-center" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--paper)', color: 'var(--ink-faint)', fontSize: '0.9rem' }}>Opening…</div>}>
          <SendReceipt customer={sending} receipts={receipts} messages={messages} whatsapp={whatsapp} client={client} onSent={onReceiptsChanged} onRefreshMessages={onMessagesChanged} onClose={() => setSending(null)} />
        </Suspense>
      )}

      {setupOpen && <WhatsappSetup client={client} status={whatsapp} onChecked={reloadWhatsapp} onClose={() => setSetupOpen(false)} />}
    </div>
  )
}

// One line above the customer list: is automatic WhatsApp sending on? Pressing the button opens the set-up and check.
function WhatsappStrip({ status, onOpen }) {
  if (!status || status.problem === 'signin') return null
  const ready = status.available && status.configured
  const badge = ready ? 'sns-badge-done' : status.available ? 'sns-badge-progress' : 'sns-badge-pending'
  const label = ready ? 'WhatsApp sending is on' : status.available ? 'WhatsApp sending is not set up' : 'Automatic WhatsApp sending is not available here'
  const note = ready ? (status.webhookReady ? 'Receipts go out from the business WhatsApp number.' : 'Receipts go out from the business WhatsApp number. Delivery updates are not switched on.') : 'Each receipt opens WhatsApp for you to press Send.'
  return (
    <div className="no-print flex items-center gap-2" style={{ marginBottom: '0.8rem', flexWrap: 'wrap' }}>
      <span className={`sns-badge ${badge}`}><MessageCircle size={12} aria-hidden="true" /> {label}</span>
      <span className="sns-text-faint" style={{ fontSize: '0.76rem' }}>{note}</span>
      <button type="button" className="sns-btn-link" onClick={onOpen}>{ready ? 'Check setup' : status.available ? 'Set up WhatsApp sending' : 'Why?'}</button>
    </div>
  )
}
