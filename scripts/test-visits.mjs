import assert from 'node:assert/strict'
import { analyzePlaces, suggestions, mostVisited, routeByArea, uncoveredAreas, monthSummary, teamActivity, addDays, daysBetween, relativeDays, normalize } from '../src/lib/visitsIntel.js'
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('PASS', name) }
const today = '2026-10-13'
const P = (id, name, area, category, createdAt = '2026-09-01') => ({ id, name, area, category, active: true, createdAt })
const places = [P(1, 'Coast Dishes', 'Diani', 'business'), P(2, 'Mvindeni Estate', 'Mvindeni', 'estate', '2026-10-01'), P(3, 'Palm Hotel', 'Diani', 'hotel'),
  P(4, 'Old Market', 'Ukunda', 'market'), P(5, 'Sunrise School', 'Ukunda', 'school'), P(6, 'Galu Villas', 'Galu', 'estate', '2026-10-12'),
  P(7, 'Future Plaza', 'Ukunda', 'business'), P(8, 'Closed Door Cafe', 'Diani', 'business'), { ...P(9, 'Archived Spot', 'Diani', 'other'), active: false }]
const V = (id, placeId, visitDate, outcome, o = {}) => ({ id, placeId, visitDate, purpose: 'marketing', outcome, leads: 0, followUpDate: null, visitedBy: 'u1', createdAt: visitDate + 'T08:00:00Z', ...o })
const visits = [
  V(1, 1, '2026-09-20', 'follow_up', { leads: 2, followUpDate: '2026-10-05' }),
  V(2, 3, '2026-08-01', 'interested'), V(3, 3, '2026-09-01', 'interested'), V(4, 3, '2026-10-01', 'converted', { leads: 1, visitedBy: 'u2' }),
  V(5, 4, '2026-07-01', 'interested', { leads: 3 }), V(6, 5, '2026-06-20', 'not_interested'),
  V(7, 7, '2026-10-10', 'follow_up', { followUpDate: '2026-10-20' }), V(8, 8, '2026-10-09', 'no_one_available'),
]
const customers = [...Array(3)].map(() => ({ location: 'Mvindeni Estate block B' })).concat([...Array(2)].map(() => ({ location: 'Msambweni Town' })), [{ location: 'Diani Beach Road near Coast Dishes' }, { location: 'Not specified' }])
const stats = analyzePlaces({ places, visits, customers, today })
const by = (id) => stats.find((s) => s.place.id === id)

ok('archived places are left out', () => assert.equal(by(9), undefined))
ok('an overdue follow-up needs a return visit, and says how overdue', () => { assert.ok(by(1).needRevisit); assert.ok(by(1).reasons.some((r) => r.includes('due 8 days ago'))); assert.ok(by(1).score > 80) })
ok('a place that became a customer is not sent back to', () => { assert.equal(by(3).needRevisit, false); assert.equal(by(3).visitCount, 3); assert.equal(by(3).conversions, 1) })
ok('interest left unanswered for months is flagged twice over (interest + stale)', () => { const s = by(4); assert.ok(s.needRevisit); assert.ok(s.reasons.some((r) => r.includes('Showed interest 104 days ago'))); assert.ok(s.reasons.some((r) => r.includes('Not visited for 104 days'))) })
ok('"not interested" is only re-checked after 90 days, with a low priority', () => { const s = by(5); assert.ok(s.needRevisit); assert.ok(s.score < 15); assert.equal(s.priority, 'low') })
ok('a follow-up that is not due yet does not nag', () => assert.equal(by(7).needRevisit, false))
ok('"no one available" is retried after 3 days', () => { assert.ok(by(8).needRevisit); assert.ok(by(8).reasons[0].includes('Nobody was available')) })
ok('a never-visited place near existing customers outranks one with none', () => { assert.ok(by(2).needVisit); assert.equal(by(2).customersNearby, 3); assert.ok(by(2).score > by(6).score); assert.ok(by(2).reasons[0].includes('3 customers already here')) })
ok('customers are matched to places by name, not by luck', () => assert.equal(by(1).customersNearby, 1))

const sug = suggestions(stats, 10)
ok('suggestions: the two overdue/interested places lead, never-visited next, "said no" last', () => {
  assert.deepEqual(new Set(sug.slice(0, 2).map((s) => s.place.id)), new Set([1, 4]))
  assert.equal(sug[sug.length - 1].place.id, 5)
  assert.ok(sug.findIndex((s) => s.place.id === 2) < sug.findIndex((s) => s.place.id === 6))
  assert.ok(!sug.some((s) => s.place.id === 3 || s.place.id === 7))
})
ok('most visited ranks by number of visits', () => { const m = mostVisited(stats); assert.equal(m[0].place.id, 3); assert.equal(m[0].visitCount, 3) })
ok('route groups the suggestions by area, busiest area first (Diani has two places needing attention)', () => { const r = routeByArea(sug); assert.deepEqual(r.map((g) => g.area), ['Diani', 'Ukunda', 'Mvindeni', 'Galu']); assert.equal(r[0].items.length, 2) })
ok('areas with customers but no place are suggested (and covered ones are not)', () => assert.deepEqual(uncoveredAreas({ places, customers }), [{ label: 'Msambweni Town', customers: 2 }]))
ok('this-month summary counts only this month', () => assert.deepEqual(monthSummary(visits, today), { visits: 3, places: 3, leads: 1, conversions: 1, surveys: 0 }))
ok('team activity splits by person', () => { const t = teamActivity(visits, today); assert.equal(t.find((r) => r.id === 'u2').conversions, 1); assert.equal(t[0].id, 'u1') })
ok('date helpers', () => { assert.equal(addDays('2026-10-13', 7), '2026-10-20'); assert.equal(addDays('2026-12-30', 3), '2027-01-02'); assert.equal(daysBetween('2026-10-05', today), 8); assert.equal(relativeDays(0), 'today'); assert.equal(relativeDays(104), '3 months ago'); assert.equal(normalize('  Diani,  Beach-Rd! '), 'diani beach rd') })
console.log(`\n${n} checks passed`)
