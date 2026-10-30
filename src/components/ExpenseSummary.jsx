import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatKSh, formatPeriodLabel, getPeriodRange, shiftAnchor } from '../lib/helpers'
import { summarizeExpenses } from '../lib/reportsCore'

const Line = ({ label, amount, count, tone }) => (
  <div className="flex items-center justify-between" style={{ fontSize: '0.8rem', padding: '0.18rem 0' }}>
    <span className="sns-text-soft">{label}{count != null ? <span className="sns-text-faint"> · {count}</span> : null}</span>
    <span className="sns-mono" style={{ fontWeight: 600, color: tone || 'inherit' }}>{formatKSh(amount)}</span>
  </div>
)

function Snapshot({ title, sub, s }) {
  return (
    <div className="sns-card" style={{ padding: '1rem 1.2rem' }} aria-label={title}>
      <p className="sns-eyebrow sns-text-faint">{title}</p>
      <p className="sns-text-faint" style={{ fontSize: '0.72rem', marginBottom: '0.3rem' }}>{sub}</p>
      <p className="sns-display" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatKSh(s.total)}</p>
      <p className="sns-text-soft" style={{ fontSize: '0.78rem', marginBottom: '0.5rem' }}>{s.count} item{s.count === 1 ? '' : 's'}</p>
      <Line label="Paid" amount={s.paid.amount} tone="var(--confirmed)" />
      <Line label="Approved, to be paid" amount={s.owing.amount} />
      <Line label="Waiting for approval" amount={s.requested.amount} tone={s.requested.amount > 0 ? 'var(--stamp-deep)' : undefined} />
    </div>
  )
}

// Weekly and monthly totals for purchases and services: at a glance, then by category and by person for any week or month.
export default function ExpenseSummary({ expenses, userMap }) {
  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const nameOf = (id) => (userMap && userMap[id] && userMap[id].fullName) || ''
  const now = new Date()
  const week = useMemo(() => summarizeExpenses(expenses, ...Object.values(getPeriodRange('week', new Date())), nameOf), [expenses]) // eslint-disable-line react-hooks/exhaustive-deps
  const month = useMemo(() => summarizeExpenses(expenses, ...Object.values(getPeriodRange('month', new Date())), nameOf), [expenses]) // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => getPeriodRange(mode, anchor), [mode, anchor])
  const s = useMemo(() => summarizeExpenses(expenses, range.start, range.end, nameOf), [expenses, range, userMap]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = mode === 'week' ? getPeriodRange('week', now).start.getTime() === range.start.getTime() : getPeriodRange('month', now).start.getTime() === range.start.getTime()

  return (
    <div style={{ marginBottom: '1.4rem' }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginBottom: '1rem' }}>
        <Snapshot title="This week" sub={formatPeriodLabel('week', now)} s={week} />
        <Snapshot title="This month" sub={formatPeriodLabel('month', now)} s={month} />
      </div>

      <div className="sns-card" style={{ padding: '1rem 1.2rem' }}>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.7rem', marginBottom: '0.8rem' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>Summary by period</h3>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="flex gap-1" role="tablist" aria-label="Summary period">
              {['week', 'month'].map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.78rem', padding: '0.35rem 0.85rem' }} onClick={() => setMode(m)}>{m === 'week' ? 'Weekly' : 'Monthly'}</button>)}
            </div>
            <button type="button" className="sns-icon-btn" aria-label={`Previous ${mode}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, -1))}><ChevronLeft size={17} /></button>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', minWidth: '8.5rem', textAlign: 'center' }}>{formatPeriodLabel(mode, anchor)}</span>
            <button type="button" className="sns-icon-btn" aria-label={`Next ${mode}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, 1))}><ChevronRight size={17} /></button>
            {!current && <button type="button" className="sns-btn-link" style={{ fontSize: '0.76rem' }} onClick={() => setAnchor(new Date())}>Back to now</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '0.9rem' }}>
          <div><p className="sns-eyebrow sns-text-faint">Total</p><p className="sns-display" style={{ fontWeight: 700, fontSize: '1.15rem' }}>{formatKSh(s.total)}</p></div>
          <div><p className="sns-eyebrow sns-text-faint">Paid</p><p className="sns-mono" style={{ fontWeight: 700, color: 'var(--confirmed)' }}>{formatKSh(s.paid.amount)}</p></div>
          <div><p className="sns-eyebrow sns-text-faint">Approved, to be paid</p><p className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(s.owing.amount)}</p></div>
          <div><p className="sns-eyebrow sns-text-faint">Waiting for approval</p><p className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(s.requested.amount)}</p></div>
        </div>
        {s.count === 0 ? <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>Nothing was bought or requested in this {mode}.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.3rem' }}>By category</p>{s.byCategory.map((c) => <Line key={c.key} label={c.label} count={c.count} amount={c.amount} />)}</div>
            <div><p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.3rem' }}>Who spent what</p>{s.byPerson.map((p) => <Line key={p.key} label={p.label} count={p.count} amount={p.amount} />)}</div>
          </div>
        )}
        <p className="sns-text-faint" style={{ fontSize: '0.72rem', marginTop: '0.8rem' }}>Counted on the purchase date (or the request date until it is bought). Rejected requests are left out.{s.rejected.count > 0 ? ` ${s.rejected.count} rejected in this ${mode} (${formatKSh(s.rejected.amount)}) not counted.` : ''}</p>
      </div>
    </div>
  )
}
