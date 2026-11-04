// Staff contract agreements: labels and the date arithmetic for "renewed on completion".
// The rules themselves (only the Director changes a contract; only a 1-year contract carries annual leave) live in the database.
export const CONTRACT_TYPES = {
  annual: { key: 'annual', label: '1 year contract', short: '1 year', defaultMonths: 12, defaultRenews: false, leave: true },
  short_term: { key: 'short_term', label: 'Short term contract', short: 'Short term', defaultMonths: 3, defaultRenews: true, leave: false },
}
export const contractTypeLabel = (t) => (CONTRACT_TYPES[t] || {}).label || 'No contract'
export const grantsLeave = (t) => t === 'annual'

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
// 31 Jan + 1 month is 28 Feb, not 3 March
export function addMonths(date, n) {
  const x = new Date(date.getFullYear(), date.getMonth() + n, 1)
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(date.getDate(), last)); return x
}
export const termLabel = (m) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? '' : 's'}` : `${m} month${m === 1 ? '' : 's'}`)

// What a contract means on a given day. A contract that renews on completion rolls forward period by period.
export function contractInfo(contract, today = new Date()) {
  if (!contract) return { set: false, eligible: false, status: 'none' }
  const start = parse(contract.startDate), months = Math.max(1, Number(contract.termMonths) || 1), t0 = parse(iso(today))
  const renews = Boolean(contract.renewsOnCompletion)
  let k = 0
  if (renews) while (addMonths(start, (k + 1) * months) <= t0 && k < 600) k++
  const periodStart = addMonths(start, k * months), periodEnd = addDays(addMonths(start, (k + 1) * months), -1)
  let status = 'active'
  if (t0 < start) status = 'not_started'
  else if (!renews && t0 > periodEnd) status = 'ended'
  return {
    set: true, eligible: grantsLeave(contract.contractType), typeLabel: contractTypeLabel(contract.contractType), termLabel: termLabel(months), renews, status,
    start: iso(start), periodStart: iso(periodStart), periodEnd: iso(periodEnd), period: k + 1, renewals: k,
    nextRenewal: renews && status !== 'ended' ? iso(addMonths(start, (k + 1) * months)) : null,
    daysLeft: status === 'active' ? Math.round((periodEnd - t0) / 86400000) : null,
  }
}

// What changing a contract does to annual leave: 'adds' | 'removes' | 'none'
export function leaveEffect(oldType, newType) {
  const was = grantsLeave(oldType), will = grantsLeave(newType)
  return was === will ? 'none' : will ? 'adds' : 'removes'
}
