import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { EmptyState, PeriodSelector } from './shared'
import { formatKSh, getPeriodRange, isInRange } from '../lib/helpers'

// Generic report shared by Commissions and Transport -- entries is just
// {memberId, amount, date} pairs, computed by whichever tab is asking for
// the report. The report itself doesn't care whether that money is
// commission or transport, only how to total and group it by period.
export default function MoneyReportModal({ title, entries, userMap, onClose }) {
  const [granularity, setGranularity] = useState('day')
  const [anchor, setAnchor] = useState(() => new Date())

  const { start, end } = useMemo(() => getPeriodRange(granularity, anchor), [granularity, anchor])

  const rows = useMemo(() => {
    const inPeriod = entries.filter((e) => isInRange(e.date, start, end))
    const byMember = {}
    inPeriod.forEach((e) => {
      if (!byMember[e.memberId]) byMember[e.memberId] = 0
      byMember[e.memberId] += e.amount
    })
    return Object.entries(byMember)
      .map(([memberId, amount]) => ({ memberId, amount, name: userMap?.[memberId]?.fullName || 'Unknown' }))
      .sort((a, b) => b.amount - a.amount)
  }, [entries, start, end, userMap])

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 55 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '30rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1.1rem 1.4rem', position: 'sticky', top: 0, borderRadius: '14px 14px 0 0' }}>
          <h3 className="sns-display" style={{ fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="sns-icon-btn"><X size={18} /></button>
        </div>
        <div style={{ padding: '1.4rem' }}>
          <div style={{ marginBottom: '1.1rem' }}>
            <PeriodSelector
              granularity={granularity}
              anchor={anchor}
              onGranularityChange={setGranularity}
              onAnchorChange={setAnchor}
            />
          </div>

          <div className="sns-card" style={{ padding: '1rem 1.2rem', marginBottom: '1.1rem', background: 'var(--signal-pale)' }}>
            <p className="sns-eyebrow" style={{ color: 'var(--signal-deep)' }}>Total for this period</p>
            <p className="sns-display" style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--signal-deep)' }}>{formatKSh(total)}</p>
          </div>

          {rows.length === 0 ? (
            <EmptyState message="Nothing recorded in this period." />
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <div key={r.memberId} className="flex items-center justify-between" style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{r.name}</span>
                  <span className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
