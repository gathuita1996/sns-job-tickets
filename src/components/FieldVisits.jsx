import { useMemo, useState } from 'react'
import { Archive, Calendar, Flag, Info, MapPin, Plus, Route, Sparkles, Target, Trash2, TrendingUp, X } from 'lucide-react'
import { ConfirmDialog, EmptyState, FormField, SearchInput, StatCard } from './shared'
import { formatDate, toDateInputValue } from '../lib/helpers'
import { OUTCOMES, PLACE_CATEGORIES, PURPOSES, RULES, addDays, analyzePlaces, labelOf, monthSummary, mostVisited, relativeDays, routeByArea, suggestions, teamActivity, uncoveredAreas } from '../lib/visitsIntel'

const TONE = { good: 'sns-badge-done', warn: 'sns-badge-progress', bad: 'sns-badge-overdue', info: 'sns-badge-role', neutral: 'sns-badge-pending' }
const PRIORITY = { high: 'sns-badge-overdue', medium: 'sns-badge-progress', low: 'sns-badge-pending' }
const outcomeBadge = (key) => {
  const o = OUTCOMES.find((x) => x.key === key)
  return o ? <span className={`sns-badge ${TONE[o.tone]}`}>{o.label}</span> : <span className="sns-text-faint">—</span>
}

function Modal({ title, onClose, children }) {
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>{children}</div>
      </div>
    </div>
  )
}

function PlaceFields({ value, onChange, areas, errors = {} }) {
  return (
    <>
      <FormField label="Place name" error={errors.name}>
        <input className="sns-input" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Coast Dishes, Palm Villas, Ukunda Market" />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Area">
          <input className="sns-input" list="visit-areas" value={value.area} onChange={(e) => onChange({ ...value, area: e.target.value })} placeholder="e.g. Diani" />
          <datalist id="visit-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
        </FormField>
        <FormField label="Type of place">
          <select className="sns-input" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
            {PLACE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </FormField>
      </div>
    </>
  )
}

function PlaceModal({ preset, areas, onClose, onSave }) {
  const [p, setP] = useState({ name: preset?.name || '', area: preset?.area || '', category: 'other' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!p.name.trim()) { setErrors({ name: 'Required' }); return }
    setSaving(true); const ok = await onSave(p); setSaving(false)
    if (ok) onClose()
  }
  return (
    <Modal title="Add a place" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <PlaceFields value={p} onChange={setP} areas={areas} errors={errors} />
        <div className="flex gap-3" style={{ marginBottom: '1.5rem' }}>
          <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" disabled={saving} className="sns-btn-primary" style={{ flex: 1 }}>{saving ? 'Saving…' : 'Add place'}</button>
        </div>
      </form>
    </Modal>
  )
}

function VisitModal({ places, areas, presetPlaceId, onClose, onSave }) {
  const today = toDateInputValue(new Date())
  const [placeId, setPlaceId] = useState(presetPlaceId ? String(presetPlaceId) : '')
  const [np, setNp] = useState({ name: '', area: '', category: 'other' })
  const [visitDate, setVisitDate] = useState(today)
  const [purpose, setPurpose] = useState('marketing')
  const [outcome, setOutcome] = useState('')
  const [leads, setLeads] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [touched, setTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const isNew = placeId === '__new__'
  const sorted = useMemo(() => places.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)), [places])

  // The follow-up date is suggested from the outcome until the person types their own.
  function suggest(nextOutcome, nextDate) {
    if (touched) return
    const o = OUTCOMES.find((x) => x.key === nextOutcome)
    setFollowUp(o && o.followUpDays ? addDays(nextDate, o.followUpDays) : '')
  }
  function pickOutcome(key) { setOutcome(key); suggest(key, visitDate); setErrors((e) => ({ ...e, outcome: undefined })) }
  function pickDate(d) { setVisitDate(d); if (outcome && d) suggest(outcome, d) }

  async function submit(e) {
    e.preventDefault()
    const er = {}
    if (!placeId) er.placeId = 'Choose a place'
    if (isNew && !np.name.trim()) er.name = 'Required'
    if (!visitDate) er.visitDate = 'Required'
    else if (visitDate > today) er.visitDate = "A visit can't be in the future"
    if (!outcome) er.outcome = 'Choose how the visit went'
    if (leads !== '' && (isNaN(Number(leads)) || Number(leads) < 0)) er.leads = 'Enter 0 or more'
    if (followUp && visitDate && followUp < visitDate) er.followUp = 'Must be on or after the visit date'
    setErrors(er)
    if (Object.keys(er).length) return
    setSaving(true)
    const ok = await onSave({ placeId: isNew ? null : Number(placeId), newPlace: isNew ? np : null, visitDate, purpose, outcome, leads: leads || 0, followUpDate: followUp, notes })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal title="Record a visit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Place" error={errors.placeId}>
          <select className={`sns-input${placeId === '' ? ' sns-select-placeholder' : ''}`} value={placeId} onChange={(e) => { setPlaceId(e.target.value); setErrors((x) => ({ ...x, placeId: undefined })) }}>
            <option value="" disabled>select-place</option>
            <option value="__new__">+ Add a new place…</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}{p.area ? ` (${p.area})` : ''}</option>)}
          </select>
        </FormField>
        {isNew && <div className="space-y-3" style={{ background: 'rgba(0,117,204,0.06)', border: '1px solid rgba(0,117,204,0.2)', borderRadius: 10, padding: '0.9rem' }}><PlaceFields value={np} onChange={setNp} areas={areas} errors={errors} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Date" error={errors.visitDate}>
            <input type="date" max={today} className="sns-input" value={visitDate} onChange={(e) => pickDate(e.target.value)} />
          </FormField>
          <FormField label="Purpose">
            <select className="sns-input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
          </FormField>
        </div>
        <FormField label="How did it go?" error={errors.outcome}>
          <select className={`sns-input${outcome === '' ? ' sns-select-placeholder' : ''}`} value={outcome} onChange={(e) => pickOutcome(e.target.value)}>
            <option value="" disabled>select-outcome</option>
            {OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Leads found" error={errors.leads} hint="People who asked about service.">
            <input type="number" min="0" step="1" className="sns-input" value={leads} onChange={(e) => setLeads(e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Go back on" error={errors.followUp} hint="Suggested from the outcome. Change it if you agreed another day.">
            <input type="date" min={visitDate} className="sns-input" value={followUp} onChange={(e) => { setTouched(true); setFollowUp(e.target.value) }} />
          </FormField>
        </div>
        <FormField label="Notes">
          <textarea className="sns-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who you spoke to, what they need, what was promised…" />
        </FormField>
        <div className="flex gap-3" style={{ marginBottom: '1.5rem' }}>
          <button type="button" onClick={onClose} className="sns-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="submit" disabled={saving} className="sns-btn-primary" style={{ flex: 1 }}>{saving ? 'Saving…' : 'Save visit'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Places visited, most visited, still to visit, to revisit -- with suggestions on where to go next.
export default function FieldVisits({ places, visits, customers, nameOf, currentUser, isAdmin, onAddPlace, onRecordVisit, onDeleteVisit, onSetPlaceActive }) {
  const today = toDateInputValue(new Date())
  const [filter, setFilter] = useState('all')
  const [purpose, setPurpose] = useState('all')
  const [area, setArea] = useState('all')
  const [search, setSearch] = useState('')
  const [visitModal, setVisitModal] = useState(null)
  const [placeModal, setPlaceModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showRules, setShowRules] = useState(false)

  const placeMap = useMemo(() => Object.fromEntries(places.map((p) => [p.id, p])), [places])
  const areas = useMemo(() => [...new Set(places.map((p) => (p.area || '').trim()).filter(Boolean))].sort(), [places])
  const scoped = useMemo(() => (purpose === 'all' ? visits : visits.filter((v) => v.purpose === purpose || v.purpose === 'both')), [visits, purpose])
  const stats = useMemo(() => analyzePlaces({ places, visits: scoped, customers, today }), [places, scoped, customers, today])
  const next = useMemo(() => suggestions(stats, 6), [stats])
  const route = useMemo(() => routeByArea(next), [next])
  const uncovered = useMemo(() => uncoveredAreas({ places, customers }).slice(0, 5), [places, customers])
  const month = useMemo(() => monthSummary(visits, today), [visits, today])
  const team = useMemo(() => teamActivity(visits, today), [visits, today])
  const recent = useMemo(() => [...scoped].sort((a, b) => String(b.visitDate).localeCompare(String(a.visitDate)) || b.id - a.id).slice(0, 10), [scoped])

  const counts = { visited: stats.filter((s) => s.visitCount > 0).length, fresh: stats.filter((s) => s.needVisit).length, revisit: stats.filter((s) => s.needRevisit).length }
  const list = useMemo(() => {
    let l
    if (filter === 'visited') l = stats.filter((s) => s.visitCount > 0).sort((a, b) => String(b.lastVisitDate).localeCompare(String(a.lastVisitDate)))
    else if (filter === 'most') l = mostVisited(stats, 100)
    else if (filter === 'new') l = stats.filter((s) => s.needVisit).sort((a, b) => b.score - a.score)
    else if (filter === 'revisit') l = stats.filter((s) => s.needRevisit).sort((a, b) => b.score - a.score)
    else l = [...stats].sort((a, b) => (Number(b.needRevisit || b.needVisit) - Number(a.needRevisit || a.needVisit)) || b.score - a.score || a.place.name.localeCompare(b.place.name))
    const q = search.trim().toLowerCase()
    return l.filter((s) => (area === 'all' || (s.place.area || '').trim() === area) && (!q || `${s.place.name} ${s.place.area}`.toLowerCase().includes(q)))
  }, [stats, filter, area, search])

  const chip = (key, label, n) => (
    <button key={key} onClick={() => setFilter(key)} className={filter === key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>
      {label}{n != null && <span style={{ opacity: 0.8, marginLeft: 6 }}>{n}</span>}
    </button>
  )

  return (
    <div>
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
        <p className="sns-text-soft" style={{ fontSize: '0.85rem', maxWidth: '38rem' }}>Record where you have been for marketing and site surveys. The list below works out where to go next.</p>
        <div className="flex gap-2">
          <button onClick={() => setPlaceModal({})} className="sns-btn-secondary"><MapPin size={16} /> Add place</button>
          <button onClick={() => setVisitModal({})} className="sns-btn-primary"><Plus size={16} /> Record a visit</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" style={{ marginBottom: '1.4rem' }}>
        <StatCard label="Visits this month" value={month.visits} icon={Calendar} />
        <StatCard label="Leads this month" value={month.leads} icon={TrendingUp} tone="success" />
        <StatCard label="Became customers" value={month.conversions} icon={Flag} tone="success" />
        <StatCard label="Need a revisit" value={counts.revisit} icon={Target} tone={counts.revisit ? 'danger' : 'default'} onClick={() => setFilter('revisit')} />
        <StatCard label="Not visited yet" value={counts.fresh} icon={MapPin} tone="warning" onClick={() => setFilter('new')} />
      </div>

      {next.length > 0 && (
        <div className="sns-card" style={{ padding: '1.1rem 1.3rem', marginBottom: '1.4rem', borderLeft: '4px solid var(--signal, #0075CC)' }}>
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
            <p className="flex items-center gap-2" style={{ fontWeight: 700 }}><Sparkles size={17} /> Where to go next</p>
            <button onClick={() => setShowRules((s) => !s)} className="sns-text-soft flex items-center gap-1" style={{ fontSize: '0.78rem', background: 'none', border: 'none', cursor: 'pointer' }}><Info size={13} /> How are these chosen?</button>
          </div>
          {showRules && (
            <ul className="sns-text-soft" style={{ fontSize: '0.8rem', margin: '0.6rem 0 0.2rem 1.1rem', listStyle: 'disc' }}>
              <li>A follow-up date that has arrived puts a place at the top.</li>
              <li>"Interested" or "follow-up needed" with no visit for {RULES.interestedDays} days; "nobody available" after {RULES.noOneDays} days; a survey with no decision after {RULES.surveyCheckDays} days.</li>
              <li>Anything not visited for {RULES.staleDays} days, unless it became a customer or said no.</li>
              <li>"Not interested" is only suggested again after {RULES.recheckNotInterestedDays} days, at low priority.</li>
              <li>Places never visited rank higher when existing customers already live there, and for hotels, estates, schools and businesses.</li>
              <li>More leads found and more customers nearby also push a place up.</li>
            </ul>
          )}
          <div style={{ marginTop: '0.8rem' }}>
            {next.map((s) => (
              <div key={s.place.id} className="flex items-start justify-between gap-3" style={{ padding: '0.65rem 0', borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 16rem' }}>
                  <p style={{ fontWeight: 600 }}>{s.place.name} <span className="sns-text-soft" style={{ fontWeight: 400, fontSize: '0.8rem' }}>{s.place.area ? `· ${s.place.area}` : ''} · {labelOf(PLACE_CATEGORIES, s.place.category)}</span></p>
                  <ul className="sns-text-soft" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0 1rem', listStyle: 'disc' }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`sns-badge ${PRIORITY[s.priority]}`}>{s.needVisit ? 'First visit' : 'Revisit'} · {s.priority}</span>
                  <button onClick={() => setVisitModal({ placeId: s.place.id })} className="sns-btn-secondary" style={{ fontSize: '0.78rem' }}>Record visit</button>
                </div>
              </div>
            ))}
          </div>
          {route.length > 1 && (
            <p className="flex items-center gap-2" style={{ fontSize: '0.82rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
              <Route size={15} /> <strong>Suggested route:</strong> {route.map((g) => `${g.area} (${g.items.length})`).join('  →  ')}
            </p>
          )}
        </div>
      )}

      {uncovered.length > 0 && (
        <div className="sns-card" style={{ padding: '1rem 1.3rem', marginBottom: '1.4rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Customers live here, but no place is recorded</p>
          <p className="sns-text-soft" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0.5rem' }}>Neighbours of existing customers are the easiest people to sign up. Add these to your list to start visiting them.</p>
          {uncovered.map((u) => (
            <div key={u.label} className="flex items-center justify-between" style={{ padding: '0.4rem 0', borderTop: '1px solid var(--line-soft)', fontSize: '0.85rem' }}>
              <span><strong>{u.label}</strong> <span className="sns-text-soft">· {u.customers} customer{u.customers === 1 ? '' : 's'}</span></span>
              <button onClick={() => setPlaceModal({ name: u.label, area: u.label })} className="sns-btn-secondary" style={{ fontSize: '0.78rem' }}>Add as place</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {chip('all', 'All places', stats.length)}{chip('visited', 'Visited', counts.visited)}{chip('most', 'Most visited')}{chip('new', 'Need to visit', counts.fresh)}{chip('revisit', 'Need to revisit', counts.revisit)}
        </div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <select className="sns-input" value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Purpose">
            <option value="all">Marketing and surveys</option><option value="marketing">Marketing only</option><option value="site_survey">Site surveys only</option>
          </select>
          <select className="sns-input" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            <option value="all">All areas</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <SearchInput value={search} onChange={setSearch} placeholder="Search places…" />
        </div>
      </div>

      {places.length === 0 ? <EmptyState message='No places yet. Tap "Add place" or "Record a visit" and add the first one.' /> : list.length === 0 ? <EmptyState message="Nothing matches this view." /> : (
        <div className="sns-card" style={{ overflow: 'hidden', marginBottom: '1.6rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{filter === 'most' && <th>#</th>}<th>Place</th><th>Visits</th><th>Last visit</th><th>Last outcome</th><th>Leads</th><th>Customers nearby</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {list.map((s, i) => (
                  <tr key={s.place.id}>
                    {filter === 'most' && <td className="sns-mono">{i + 1}</td>}
                    <td>
                      <p style={{ fontWeight: 600 }}>{s.place.name}</p>
                      <p className="sns-text-soft" style={{ fontSize: '0.75rem' }}>{[s.place.area, labelOf(PLACE_CATEGORIES, s.place.category)].filter(Boolean).join(' · ')}</p>
                      {(s.needVisit || s.needRevisit) && s.reasons[0] && <p style={{ fontSize: '0.75rem', color: 'var(--overdue)', marginTop: 2 }}>{s.reasons[0]}</p>}
                    </td>
                    <td className="sns-mono">{s.visitCount}</td>
                    <td className="sns-text-soft">{s.lastVisitDate ? <>{formatDate(s.lastVisitDate)}<br /><span style={{ fontSize: '0.75rem' }}>{relativeDays(s.daysSince)}</span></> : 'Never'}</td>
                    <td>{s.lastOutcome ? outcomeBadge(s.lastOutcome) : <span className="sns-text-faint">—</span>}</td>
                    <td className="sns-mono">{s.leadsTotal}</td>
                    <td className="sns-mono">{s.customersNearby}</td>
                    <td>{s.needRevisit ? <span className="sns-badge sns-badge-overdue">Needs revisit</span> : s.needVisit ? <span className="sns-badge sns-badge-progress">Not visited yet</span> : <span className="sns-badge sns-badge-done">{s.conversions ? 'Customer' : 'Visited'}</span>}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setVisitModal({ placeId: s.place.id })} className="sns-btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>Record visit</button>
                        {isAdmin && <button onClick={() => onSetPlaceActive(s.place, false)} title="Archive this place" className="sns-icon-btn"><Archive size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: '0.4rem 0 0.7rem' }}>Recent visits</p>
      {recent.length === 0 ? <EmptyState message="No visits recorded yet." /> : (
        <div className="sns-card" style={{ overflow: 'hidden', marginBottom: '1.6rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Date</th><th>Place</th><th>By</th><th>Purpose</th><th>Outcome</th><th>Leads</th><th>Go back on</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {recent.map((v) => (
                  <tr key={v.id}>
                    <td className="sns-text-soft">{formatDate(v.visitDate)}</td>
                    <td style={{ fontWeight: 600 }}>{placeMap[v.placeId]?.name || '—'}</td>
                    <td className="sns-text-soft">{nameOf(v.visitedBy) || '—'}</td>
                    <td className="sns-text-soft">{labelOf(PURPOSES, v.purpose)}</td>
                    <td>{outcomeBadge(v.outcome)}</td>
                    <td className="sns-mono">{v.leads}</td>
                    <td className="sns-text-soft">{v.followUpDate ? formatDate(v.followUpDate) : '—'}</td>
                    <td className="sns-text-soft" style={{ maxWidth: '16rem' }}>{v.notes || '—'}</td>
                    <td>{(isAdmin || v.visitedBy === currentUser.id) && <button onClick={() => setConfirmDelete(v)} title="Delete this visit" className="sns-icon-btn danger"><Trash2 size={15} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdmin && team.length > 0 && (
        <>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: '0.4rem 0 0.7rem' }}>Team activity this month</p>
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th>Person</th><th>Visits</th><th>Different places</th><th>Leads</th><th>Became customers</th></tr></thead>
              <tbody>{team.map((r) => <tr key={r.id}><td style={{ fontWeight: 600 }}>{nameOf(r.id) || '—'}</td><td className="sns-mono">{r.visits}</td><td className="sns-mono">{r.places}</td><td className="sns-mono">{r.leads}</td><td className="sns-mono">{r.conversions}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      {visitModal && <VisitModal places={places} areas={areas} presetPlaceId={visitModal.placeId} onClose={() => setVisitModal(null)} onSave={onRecordVisit} />}
      {placeModal && <PlaceModal preset={placeModal} areas={areas} onClose={() => setPlaceModal(null)} onSave={onAddPlace} />}
      {confirmDelete && (
        <ConfirmDialog title="Delete visit" danger message={`Delete the visit to ${placeMap[confirmDelete.placeId]?.name || 'this place'} on ${formatDate(confirmDelete.visitDate)}? This can't be undone.`}
          onCancel={() => setConfirmDelete(null)} onConfirm={async () => { await onDeleteVisit(confirmDelete); setConfirmDelete(null) }} />
      )}
    </div>
  )
}
