import { useMemo, useState } from 'react'
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react'
import Avatar from './Avatar'
import { EmptyState } from './shared'
import { departmentLabel, formatDate, formatKSh, formatPeriodLabel, getPeriodRange, shiftAnchor, toDateInputValue } from '../lib/helpers'
import { buildTransportWorkbook, transportReport, tripRoute } from '../lib/reportsCore'
import { loadExcelJS, saveBlob } from '../lib/dataIO'

const MODES = { day: { title: 'Daily transport report', word: 'day' }, month: { title: 'Monthly transport report', word: 'month' } }
const Bar = ({ pct, color = 'var(--signal)' }) => (
  <div aria-hidden="true" style={{ height: 6, borderRadius: 4, background: 'var(--line-soft)', overflow: 'hidden', minWidth: 60 }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} /></div>
)

// A full page (not a pop-up): who spent what on transport in a day or a month, the total, and every trip behind it.
export default function TransportReport({ mode: startMode = 'day', anchor: startAnchor, jobs, users, generatedBy, onBack }) {
  const [mode, setMode] = useState(startMode)
  const [anchor, setAnchor] = useState(() => new Date(startAnchor || Date.now()))
  const [busy, setBusy] = useState(false)
  const { start, end } = useMemo(() => getPeriodRange(mode, anchor), [mode, anchor])
  const report = useMemo(() => transportReport(jobs, users, start, end), [jobs, users, start, end])
  const label = formatPeriodLabel(mode, anchor)
  const now = new Date()
  const isCurrent = mode === 'day' ? toDateInputValue(anchor) === toDateInputValue(now) : anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
  const maxDay = Math.max(1, ...report.byDay.map((d) => d.total))

  async function download() {
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const wb = buildTransportWorkbook(ExcelJS, report, { title: MODES[mode].title, periodLabel: label, generatedBy })
      const buffer = await wb.xlsx.writeBuffer()
      await saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `SNS-Transport-${mode === 'day' ? toDateInputValue(anchor) : toDateInputValue(anchor).slice(0, 7)}.xlsx`)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="print-only" style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.2rem' }}>Swahili Net Solution — {MODES[mode].title}</h1>
        <p style={{ fontSize: '0.85rem' }}>{label} · prepared {formatDate(now)}{generatedBy ? ` by ${generatedBy}` : ''}</p>
      </div>

      <div className="no-print flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <button type="button" onClick={onBack} className="sns-btn-secondary"><ArrowLeft size={16} /> Back to transport</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="sns-btn-secondary"><Printer size={15} /> Print</button>
          <button type="button" onClick={download} disabled={busy || report.rows.length === 0} className="sns-btn-secondary"><FileSpreadsheet size={15} /> {busy ? 'Preparing…' : 'Download Excel'}</button>
        </div>
      </div>

      <div className="sns-card" style={{ padding: '1.2rem 1.4rem', marginBottom: '1rem' }}>
        <div className="no-print flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.8rem', marginBottom: '1rem' }}>
          <div className="flex gap-1" role="tablist" aria-label="Report type">
            {Object.entries(MODES).map(([key, m]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }} onClick={() => setMode(key)}>{key === 'day' ? 'Daily' : 'Monthly'}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="sns-icon-btn" aria-label={`Previous ${MODES[mode].word}`} title={`Previous ${MODES[mode].word}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, -1))}><ChevronLeft size={18} /></button>
            <div style={{ textAlign: 'center', minWidth: '10.5rem' }}><p style={{ fontWeight: 700 }}>{label}</p></div>
            <button type="button" className="sns-icon-btn" aria-label={`Next ${MODES[mode].word}`} title={`Next ${MODES[mode].word}`} onClick={() => setAnchor((a) => shiftAnchor(a, mode, 1))}><ChevronRight size={18} /></button>
            {!isCurrent && <button type="button" className="sns-btn-link" style={{ fontSize: '0.78rem' }} onClick={() => setAnchor(new Date())}>{mode === 'day' ? 'Jump to today' : 'This month'}</button>}
          </div>
        </div>
        <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700 }}>{MODES[mode].title}</h2>
        <p className="sns-text-soft" style={{ fontSize: '0.84rem' }}>{label}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginTop: '1rem' }}>
          <div style={{ background: 'var(--signal-pale)', borderRadius: 12, padding: '0.9rem 1rem' }}><p className="sns-eyebrow" style={{ color: 'var(--signal-deep)' }}>Total spent</p><p className="sns-display" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--signal-deep)' }}>{formatKSh(report.total)}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Trips</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{report.count}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Paid</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--confirmed)' }}>{formatKSh(report.paid)}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Not yet paid</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, color: report.unpaid > 0 ? 'var(--stamp-deep)' : 'inherit' }}>{formatKSh(report.unpaid)}</p></div>
        </div>
      </div>

      {report.rows.length === 0 ? <EmptyState message={`No transport was recorded for this ${MODES[mode].word}.`} /> : (
        <>
          <h3 className="sns-display" style={{ fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>Who spent what</h3>
          <div className="sns-card" style={{ overflow: 'hidden', marginBottom: '1.2rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Who spent what">
                <thead><tr><th>Staff member</th><th>Trips</th><th>Amount spent</th><th>Paid</th><th>Not yet paid</th><th style={{ width: '18%' }}>Share</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.memberId}>
                      <td><div className="flex items-center gap-2"><Avatar name={r.name} url={r.avatarUrl} size={28} /><div><p style={{ fontWeight: 600 }}>{r.name}</p><p className="sns-text-faint" style={{ fontSize: '0.72rem' }}>{departmentLabel(r.department)}</p></div></div></td>
                      <td className="sns-mono">{r.count}</td>
                      <td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(r.total)}</td>
                      <td className="sns-mono">{formatKSh(r.paid)}</td>
                      <td className="sns-mono" style={{ color: r.unpaid > 0 ? 'var(--stamp-deep)' : 'inherit', fontWeight: r.unpaid > 0 ? 700 : 400 }}>{formatKSh(r.unpaid)}</td>
                      <td><Bar pct={report.total ? (r.total / report.total) * 100 : 0} /></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--paper)' }}>
                    <td style={{ fontWeight: 700 }}>Total for {mode === 'day' ? 'the day' : 'the month'}</td><td className="sns-mono" style={{ fontWeight: 700 }}>{report.count}</td>
                    <td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.total)}</td><td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.paid)}</td><td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.unpaid)}</td><td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {mode === 'month' && (
            <>
              <h3 className="sns-display" style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>Day by day</h3>
              <div className="sns-card" style={{ padding: '0.4rem 1.1rem', marginBottom: '1.2rem' }}>
                {report.byDay.map((d, i) => (
                  <div key={d.date} className={`flex items-center gap-3 ${i ? 'sns-border-t' : ''}`} style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>
                    <span style={{ width: '7.5rem', fontWeight: 600 }}>{formatDate(d.date)}</span>
                    <div style={{ flex: 1 }}><Bar pct={(d.total / maxDay) * 100} color="var(--signal)" /></div>
                    <span className="sns-text-faint" style={{ width: '4.5rem', textAlign: 'right' }}>{d.count} trip{d.count === 1 ? '' : 's'}</span>
                    <span className="sns-mono" style={{ width: '6.5rem', textAlign: 'right', fontWeight: 700 }}>{formatKSh(d.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="sns-display" style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>Every trip</h3>
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Every trip">
                <thead><tr><th>Date</th><th>Job</th><th>Route</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <FragmentRows key={r.memberId} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FragmentRows({ row }) {
  return (
    <>
      <tr style={{ background: 'var(--paper)' }}>
        <td colSpan={3} style={{ fontWeight: 700 }}>{row.name}</td>
        <td className="sns-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatKSh(row.total)}</td><td className="sns-text-faint">{row.count} trip{row.count === 1 ? '' : 's'}</td>
      </tr>
      {row.trips.map((j) => (
        <tr key={j.id}>
          <td className="sns-text-soft">{formatDate(j.createdAt)}</td><td><span className="sns-chip-id">{j.jobId}</span></td><td className="sns-text-soft">{tripRoute(j)}</td>
          <td className="sns-mono" style={{ textAlign: 'right' }}>{formatKSh(j.transportAmount)}</td>
          <td>{j.transportPaidAt ? <span className="sns-badge sns-badge-done">Paid</span> : <span className="sns-badge sns-badge-pending">Not yet paid</span>}</td>
        </tr>
      ))}
    </>
  )
}
