import assert from 'node:assert/strict'
import { addMonths, contractInfo, leaveEffect, termLabel, contractTypeLabel, grantsLeave } from '../src/lib/contracts.js'
let n = 0; const ok = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1 } }
const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const C = (type, start, months, renews) => ({ contractType: type, startDate: start, termMonths: months, renewsOnCompletion: renews })
const T = day('2026-11-04')
ok('adding months never spills into the next month (31 Jan + 1 month = 28 Feb)', () => { assert.equal(addMonths(day('2027-01-31'), 1).getMonth(), 1); assert.equal(addMonths(day('2027-01-31'), 1).getDate(), 28); assert.equal(addMonths(day('2026-08-04'), 3).getDate(), 4) })
ok('SNS003/4/5/8: a 1-year contract from 1 Aug 2026 runs to 31 Jul 2027 and carries leave', () => {
  const i = contractInfo(C('annual', '2026-08-01', 12, false), T); assert.equal(i.eligible, true); assert.equal(i.status, 'active'); assert.equal(i.periodEnd, '2027-07-31'); assert.equal(i.termLabel, '1 year'); assert.equal(i.renews, false); assert.equal(i.daysLeft, 269)
})
ok('SNS002: a 1-year contract from 1 Nov 2026 runs to 31 Oct 2027', () => { const i = contractInfo(C('annual', '2026-11-01', 12, false), T); assert.equal(i.status, 'active'); assert.equal(i.periodEnd, '2027-10-31'); assert.equal(i.eligible, true) })
ok('SNS006 / SNS010: 3 months from 1 Jul 2026, renewed on completion, is now in its 2nd period', () => {
  const i = contractInfo(C('short_term', '2026-07-01', 3, true), T); assert.equal(i.eligible, false); assert.equal(i.period, 2); assert.equal(i.renewals, 1); assert.equal(i.periodStart, '2026-10-01'); assert.equal(i.periodEnd, '2026-12-31'); assert.equal(i.nextRenewal, '2027-01-01')
})
ok('SNS007: 3 months from 4 Aug 2026 renews on 4 Nov, so on 3 Nov it is period 1 and on 4 Nov period 2', () => {
  const c = C('short_term', '2026-08-04', 3, true); const a = contractInfo(c, day('2026-11-03')), b = contractInfo(c, day('2026-11-04'))
  assert.equal(a.period, 1); assert.equal(a.periodEnd, '2026-11-03'); assert.equal(b.period, 2); assert.equal(b.periodStart, '2026-11-04'); assert.equal(b.periodEnd, '2027-02-03'); assert.equal(b.nextRenewal, '2027-02-04')
})
ok('renewals keep rolling over a long time', () => { const i = contractInfo(C('short_term', '2026-07-01', 3, true), day('2028-05-20')); assert.equal(i.period, 8); assert.equal(i.periodStart, '2028-04-01'); assert.equal(i.periodEnd, '2028-06-30') })
ok('a contract that does not renew ends, and one that has not begun says so', () => {
  assert.equal(contractInfo(C('annual', '2025-08-01', 12, false), T).status, 'ended'); assert.equal(contractInfo(C('annual', '2027-01-01', 12, false), T).status, 'not_started'); assert.equal(contractInfo(C('annual', '2026-08-01', 12, false), day('2027-07-31')).status, 'active')
})
ok('no contract means no leave', () => { const i = contractInfo(null, T); assert.equal(i.set, false); assert.equal(i.eligible, false) })
ok('only a 1-year contract carries annual leave', () => { assert.equal(grantsLeave('annual'), true); assert.equal(grantsLeave('short_term'), false); assert.equal(grantsLeave(undefined), false) })
ok('what a change does to leave', () => { assert.equal(leaveEffect('short_term', 'annual'), 'adds'); assert.equal(leaveEffect(undefined, 'annual'), 'adds'); assert.equal(leaveEffect('annual', 'short_term'), 'removes'); assert.equal(leaveEffect('annual', 'annual'), 'none'); assert.equal(leaveEffect(undefined, 'short_term'), 'none') })
ok('labels', () => { assert.equal(termLabel(12), '1 year'); assert.equal(termLabel(24), '2 years'); assert.equal(termLabel(3), '3 months'); assert.equal(termLabel(1), '1 month'); assert.equal(contractTypeLabel('annual'), '1 year contract'); assert.equal(contractTypeLabel(undefined), 'No contract') })
console.log(`contracts: ${n} checks ran`)
