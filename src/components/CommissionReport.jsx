import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from 'lucide-react'
import Avatar from './Avatar'
import { EmptyState } from './shared'
import { Bar } from './reportParts'
import { COMMISSION_DEPARTMENTS, departmentLabel, formatDate, formatKSh, formatPeriodLabel, getPeriodRange, shiftAnchor, toDateInputValue } from '../lib/helpers'
import { buildCommissionWorkbook, commissionReport } from '../lib/reportsCore'
import { loadExcelJS, saveBlob } from '../lib/dataIO'

// The whole month's commission on one page: who earned what, the total, and every customer behind it.
export default function CommissionReport({ customers, users, commissionRate, generatedBy, onBack }) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const { start, end } = useMemo(() => getPeriodRange('month', anchor), [anchor])
  const report = useMemo(() => commissionReport(customers, users, start, end, commissionRate, COMMISSION_DEPARTMENTS), [customers, users, start, end, commissionRate])
  const label = formatPeriodLabel('month', anchor)
  const now = new Date()
  const isCurrent = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()

  async function download() {
    setBusy(true)
    try {
      const ExcelJS = await loadExcelJS()
      const wb = buildCommissionWorkbook(ExcelJS, report, { title: 'Monthly commission report', periodLabel: label, generatedBy })
      const buffer = await wb.xlsx.writeBuffer()
      await saveBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `SNS-Commission-${toDateInputValue(anchor).slice(0, 7)}.xlsx`)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="print-only" style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontWeight: 700, fontSize: '1.2rem' }}>Swahili Net Solution — Monthly commission report</h1>
        <p style={{ fontSize: '0.85rem' }}>{label} · prepared {formatDate(now)}{generatedBy ? ` by ${generatedBy}` : ''}</p>
      </div>

      <div className="no-print flex items-center justify-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <button type="button" onClick={onBack} className="sns-btn-secondary"><ArrowLeft size={16} /> Back to commissions</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="sns-btn-secondary"><Printer size={15} /> Print</button>
          <button type="button" onClick={download} disabled={busy || report.rows.length === 0} className="sns-btn-secondary"><FileSpreadsheet size={15} /> {busy ? 'Preparing…' : 'Download Excel'}</button>
        </div>
      </div>

      <div className="sns-card" style={{ padding: '1.2rem 1.4rem', marginBottom: '1rem' }}>
        <div className="no-print flex items-center justify-end gap-2" style={{ marginBottom: '0.8rem', flexWrap: 'wrap' }}>
          <button type="button" className="sns-icon-btn" aria-label="Previous month" title="Previous month" onClick={() => setAnchor((a) => shiftAnchor(a, 'month', -1))}><ChevronLeft size={18} /></button>
          <div style={{ textAlign: 'center', minWidth: '10.5rem' }}><p style={{ fontWeight: 700 }}>{label}</p></div>
          <button type="button" className="sns-icon-btn" aria-label="Next month" title="Next month" onClick={() => setAnchor((a) => shiftAnchor(a, 'month', 1))}><ChevronRight size={18} /></button>
          {!isCurrent && <button type="button" className="sns-btn-link" style={{ fontSize: '0.78rem' }} onClick={() => setAnchor(new Date())}>This month</button>}
        </div>
        <h2 className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700 }}>Monthly commission report</h2>
        <p className="sns-text-soft" style={{ fontSize: '0.84rem' }}>{label} · KSh {Number(commissionRate).toLocaleString('en-KE')} for each new customer. Imported customers never earn commission.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginTop: '1rem' }}>
          <div style={{ background: 'var(--signal-pale)', borderRadius: 12, padding: '0.9rem 1rem' }}><p className="sns-eyebrow" style={{ color: 'var(--signal-deep)' }}>Total earned</p><p className="sns-display" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--signal-deep)' }}>{formatKSh(report.total)}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Customers</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{report.count}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Paid</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--confirmed)' }}>{formatKSh(report.paid)}</p></div>
          <div style={{ padding: '0.9rem 1rem' }}><p className="sns-eyebrow sns-text-faint">Not yet paid</p><p className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, color: report.unpaid > 0 ? 'var(--stamp-deep)' : 'inherit' }}>{formatKSh(report.unpaid)}</p></div>
        </div>
      </div>

      {report.rows.length === 0 ? <EmptyState message="No commission was earned in this month." /> : (
        <>
          <h3 className="sns-display" style={{ fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>Who earned what</h3>
          <div className="sns-card" style={{ overflow: 'hidden', marginBottom: '1.2rem' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Who earned what">
                <thead><tr><th>Staff member</th><th>Customers</th><th>Commission earned</th><th>Paid</th><th>Not yet paid</th><th style={{ width: '18%' }}>Share</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.memberId}>
                      <td><div className="flex items-center gap-2"><Avatar name={r.name} url={r.avatarUrl} size={28} /><div><p style={{ fontWeight: 600 }}>{r.name}</p><p className="sns-text-faint" style={{ fontSize: '0.72rem' }}>{departmentLabel(r.department)}</p></div></div></td>
                      <td className="sns-mono">{r.count}</td>
                      <td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(r.earned)}</td>
                      <td className="sns-mono">{formatKSh(r.paid)}</td>
                      <td className="sns-mono" style={{ color: r.unpaid > 0 ? 'var(--stamp-deep)' : 'inherit', fontWeight: r.unpaid > 0 ? 700 : 400 }}>{formatKSh(r.unpaid)}</td>
                      <td><Bar pct={report.total ? (r.earned / report.total) * 100 : 0} /></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--paper)' }}>
                    <td style={{ fontWeight: 700 }}>Total for the month</td><td className="sns-mono" style={{ fontWeight: 700 }}>{report.count}</td>
                    <td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.total)}</td><td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.paid)}</td><td className="sns-mono" style={{ fontWeight: 700 }}>{formatKSh(report.unpaid)}</td><td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="sns-display" style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>Every customer recorded</h3>
          <div className="sns-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Every customer recorded">
                <thead><tr><th>Date</th><th>Customer</th><th>Location</th><th style={{ textAlign: 'right' }}>Commission</th><th>Status</th></tr></thead>
                <tbody>
                  {report.rows.map((r) => (
                    <CustomerRows key={r.memberId} row={r} rate={report.rate} />
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

function CustomerRows({ row, rate }) {
  return (
    <>
      <tr style={{ background: 'var(--paper)' }}>
        <td colSpan={3} style={{ fontWeight: 700 }}>{row.name}</td>
        <td className="sns-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatKSh(row.earned)}</td><td className="sns-text-faint">{row.count} customer{row.count === 1 ? '' : 's'}</td>
      </tr>
      {row.customers.map((c) => (
        <tr key={c.id}>
          <td className="sns-text-soft">{formatDate(c.createdAt)}</td><td style={{ fontWeight: 600 }}>{c.fullName}</td><td className="sns-text-soft">{c.location || '—'}</td>
          <td className="sns-mono" style={{ textAlign: 'right' }}>{formatKSh(rate)}</td>
          <td>{c.commissionPaidAt ? <span className="sns-badge sns-badge-done">Paid {formatDate(c.commissionPaidAt)}</span> : <span className="sns-badge sns-badge-pending">Not yet paid</span>}</td>
        </tr>
      ))}
    </>
  )
}
