import { Eye, Pencil, Trash2 } from 'lucide-react'
import { EmptyState, StatusBadge, PriorityBadge } from './shared'
import { formatDate, formatKSh, isOverdue } from '../lib/helpers'

export default function JobsTable({ jobs, showFiledBy, userMap, onView, onEdit, onDelete, selectable, selected, onToggleSelect, onSelectAll, onClearSelect }) {
  if (!jobs.length) return <EmptyState message="No job cards found." />
  return (
    <div className="sns-card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {selectable && <th><input type="checkbox" checked={selected.length === jobs.length && jobs.length > 0} onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelect())} /></th>}
              <th>Job ID</th><th>Date</th><th>Type</th><th>Location</th><th>Requested by</th>
              {showFiledBy && <th>Filed by</th>}
              <th>Transport</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const overdue = isOverdue(j)
              return (
                <tr key={j.id} style={overdue ? { background: 'var(--overdue-pale)' } : undefined}>
                  {selectable && <td><input type="checkbox" checked={selected.includes(j.id)} onChange={() => onToggleSelect(j.id)} /></td>}
                  <td><span className="sns-chip-id">{j.jobId}</span></td>
                  <td className="sns-text-soft">{formatDate(j.visitDate)}</td>
                  <td className="sns-text-soft">{j.jobType === 'Other' && j.jobTypeOther ? j.jobTypeOther : j.jobType}</td>
                  <td className="sns-text-soft">{j.location}</td>
                  <td className="sns-text-soft">{j.requestedBy}</td>
                  {showFiledBy && <td className="sns-text-soft">{userMap?.[j.memberId]?.fullName || '—'}</td>}
                  <td className="sns-mono" style={{ fontWeight: 600 }}>{formatKSh(j.transportAmount)}</td>
                  <td>
                    <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                      <StatusBadge status={j.status} overdue={overdue} />
                      <PriorityBadge priority={j.priority} />
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onView(j)} title="View / print" className="sns-icon-btn"><Eye size={15} /></button>
                      <button onClick={() => onEdit(j)} title="Edit" className="sns-icon-btn"><Pencil size={15} /></button>
                      <button onClick={() => onDelete(j)} title="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
