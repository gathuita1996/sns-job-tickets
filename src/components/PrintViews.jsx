import { ArrowLeft, Printer } from 'lucide-react'
import { StatusBadge } from './shared'
import { formatDate, formatDateTime, formatKSh } from '../lib/helpers'

function PrintField({ label, value, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.2rem' }}>{label}</p>
      <p style={{ fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'pre-wrap' }}>{value}</p>
    </div>
  )
}

export function JobPrintView({ job, filedByUser, onBack }) {
  return (
    <div className="sns-shell print-page" style={{ padding: '2rem 1rem' }}>
      <div className="no-print flex justify-between mx-auto" style={{ maxWidth: '38rem', marginBottom: '1rem' }}>
        <button onClick={onBack} className="sns-btn-secondary"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => window.print()} className="sns-btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      <div className="sns-card mx-auto" style={{ maxWidth: '38rem', padding: '2rem' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: '1.1rem', marginBottom: '1.5rem' }}>
          <div className="flex items-center gap-3">
            <div className="sns-brand-mark">SNS</div>
            <div>
              <p className="sns-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>Swahili Net Solution</p>
              <p className="sns-eyebrow sns-text-faint">Job Card</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: 3 }}>Job ID</p>
            <span className="sns-chip-id" style={{ fontSize: '0.95rem', transform: 'rotate(-1.5deg)', display: 'inline-block' }}>{job.jobId}</span>
          </div>
        </div>
        <div style={{ borderBottom: '1px dashed var(--line)', marginBottom: '1.5rem' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginBottom: '1.5rem' }}>
          <PrintField label="Job Type" value={job.jobType} />
          <PrintField label="Status" value={job.status} />
          <PrintField label="Location / Site" value={job.location} full />
          <PrintField label="Requested By" value={job.requestedBy} />
          <PrintField label="Requester Contact" value={job.requesterContact || '—'} />
          <PrintField label="Date of Visit" value={formatDate(job.visitDate)} />
          <PrintField label="Transport Amount" value={formatKSh(job.transportAmount)} />
          <PrintField label="Job Details" value={job.notes || '—'} full />
        </div>
        <p className="sns-text-faint" style={{ fontSize: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '1rem', marginBottom: '2.5rem' }}>
          Filed by {filedByUser?.fullName || 'Unknown'} on {formatDateTime(job.createdAt)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div><div style={{ borderBottom: '1px solid var(--ink-faint)', height: 36 }} /><p className="sns-eyebrow sns-text-faint" style={{ marginTop: 4 }}>Technician Signature</p></div>
          <div><div style={{ borderBottom: '1px solid var(--ink-faint)', height: 36 }} /><p className="sns-eyebrow sns-text-faint" style={{ marginTop: 4 }}>Client Signature</p></div>
        </div>
      </div>
    </div>
  )
}

export function BatchPrintView({ jobs, userMap, onBack, generatedBy }) {
  const total = jobs.reduce((s, j) => s + (Number(j.transportAmount) || 0), 0)
  return (
    <div className="sns-shell print-page" style={{ padding: '2rem 1rem' }}>
      <div className="no-print flex justify-between mx-auto" style={{ maxWidth: '56rem', marginBottom: '1rem' }}>
        <button onClick={onBack} className="sns-btn-secondary"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => window.print()} className="sns-btn-primary"><Printer size={16} /> Print / Save as PDF</button>
      </div>
      <div className="sns-card mx-auto" style={{ maxWidth: '56rem', padding: '2rem' }}>
        <div className="flex items-center justify-between" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: '1.1rem', marginBottom: '1.5rem' }}>
          <div className="flex items-center gap-3">
            <div className="sns-brand-mark">SNS</div>
            <div>
              <p className="sns-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>Swahili Net Solution</p>
              <p className="sns-eyebrow sns-text-faint">Job Card Report</p>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.78rem' }} className="sns-text-faint">
            <p>{jobs.length} job{jobs.length === 1 ? '' : 's'}</p>
            <p>Generated {formatDateTime(new Date().toISOString())}</p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th>Job ID</th><th>Date</th><th>Type</th><th>Location</th><th>Requested By</th><th>Filed By</th><th>Transport</th><th>Status</th></tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="sns-mono">{j.jobId}</td>
                  <td>{formatDate(j.visitDate)}</td>
                  <td>{j.jobType}</td>
                  <td>{j.location}</td>
                  <td>{j.requestedBy}</td>
                  <td>{userMap[j.memberId]?.fullName || '—'}</td>
                  <td className="sns-mono">{formatKSh(j.transportAmount)}</td>
                  <td><StatusBadge status={j.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700 }}>
                <td colSpan={6} style={{ textAlign: 'right', padding: '0.7rem' }}>Total Transport</td>
                <td className="sns-mono" style={{ padding: '0.7rem' }}>{formatKSh(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="sns-text-faint" style={{ fontSize: '0.72rem', marginTop: '1.5rem' }}>Prepared by {generatedBy?.fullName} ({generatedBy?.title || 'Admin'}) — Swahili Net Solution</p>
      </div>
    </div>
  )
}
