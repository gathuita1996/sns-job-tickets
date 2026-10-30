import assert from 'node:assert/strict'
import { currentLeaveYear, leaveYearLabel, formatLeaveRange, dayCount, easterSunday, kenyanHolidays, holidaysForLeaveYear, canCancel, awayNowIds, upcomingLeave, onLeaveOn } from '../src/lib/leave.js'
let n = 0; const ok = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 } }
ok('leave year starts in August', () => { assert.equal(currentLeaveYear(8, new Date(2026, 9, 23)), 2026); assert.equal(currentLeaveYear(8, new Date(2027, 6, 31)), 2026); assert.equal(currentLeaveYear(8, new Date(2027, 7, 1)), 2027); assert.equal(currentLeaveYear(1, new Date(2027, 0, 1)), 2027) })
ok('leave year label', () => { assert.match(leaveYearLabel(2026, 8), /Aug 2026.*Jul 2027/) })
ok('date ranges read naturally', () => { assert.match(formatLeaveRange('2026-11-03', '2026-11-03'), /Tue.*3 Nov 2026/); assert.match(formatLeaveRange('2026-11-03', '2026-11-05'), /^3 – 5 Nov 2026$/); assert.match(formatLeaveRange('2026-11-30', '2026-12-02'), /^30 Nov – 2 Dec 2026$/) })
ok('day counts', () => { assert.equal(dayCount(1), '1 day'); assert.equal(dayCount(3), '3 days'); assert.equal(dayCount(0), '0 days') })
ok('Easter Sunday is calculated correctly', () => { const f = (y) => { const d = easterSunday(y); return `${y}-${d.getMonth() + 1}-${d.getDate()}` }; assert.equal(f(2026), '2026-4-5'); assert.equal(f(2027), '2027-3-28'); assert.equal(f(2025), '2025-4-20'); assert.equal(f(2024), '2024-3-31') })
ok('Kenyan holidays for 2027 include Good Friday, Easter Monday and the fixed days', () => {
  const h = Object.fromEntries(kenyanHolidays(2027).map((x) => [x.day, x.name]))
  assert.equal(h['2027-03-26'], 'Good Friday'); assert.equal(h['2027-03-29'], 'Easter Monday'); assert.equal(h['2027-06-01'], 'Madaraka Day'); assert.equal(h['2027-10-20'], 'Mashujaa Day'); assert.equal(h['2027-12-12'].replace(' (observed)', ''), 'Jamhuri Day')
})
ok('a holiday on a Sunday moves to Monday (Jamhuri Day 2027 is a Sunday)', () => { const h = Object.fromEntries(kenyanHolidays(2027).map((x) => [x.day, x.name])); assert.equal(h['2027-12-13'], 'Jamhuri Day (observed)') })
ok('the 2026 leave year holds Oct 2026 to Jul 2027 holidays only', () => { const days = holidaysForLeaveYear(2026, 8).map((x) => x.day); assert.ok(days.includes('2026-10-20')); assert.ok(days.includes('2027-03-26')); assert.ok(!days.some((d) => d < '2026-08-01' || d > '2027-07-31')) })
const req = (o) => ({ id: 1, memberId: 'a', startDate: '2026-11-03', endDate: '2026-11-05', status: 'approved', ...o })
ok('who may cancel what (mirrors the database)', () => {
  assert.equal(canCancel(req({ status: 'pending' }), 'a', false), true); assert.equal(canCancel(req({ status: 'pending' }), 'b', false), false); assert.equal(canCancel(req({ status: 'pending' }), 'x', true), true)
  assert.equal(canCancel(req(), 'a', false, '2026-11-01'), true); assert.equal(canCancel(req(), 'a', false, '2026-11-03'), false); assert.equal(canCancel(req(), 'x', true, '2026-11-04'), true)
  assert.equal(canCancel(req({ status: 'rejected' }), 'x', true), false); assert.equal(canCancel(req({ status: 'cancelled' }), 'a', false), false)
})
ok('who is away today, and what is coming up', () => {
  const rs = [req(), req({ id: 2, memberId: 'b', startDate: '2026-11-20', endDate: '2026-11-21' }), req({ id: 3, memberId: 'c', status: 'pending' }), req({ id: 4, memberId: 'd', startDate: '2026-12-30', endDate: '2026-12-31' })]
  assert.deepEqual([...awayNowIds(rs, '2026-11-04')], ['a']); assert.equal(onLeaveOn(rs, '2026-11-04').length, 1)
  assert.deepEqual(upcomingLeave(rs, '2026-11-04', 30).map((r) => r.id), [1, 2])
})
console.log(`leave helpers: ${n} checks ran`)
