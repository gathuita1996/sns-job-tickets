import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { EmptyState, StatusBadge, PriorityBadge } from './shared'
import { formatDate, formatKSh, isOverdue, toWhatsAppNumber } from '../lib/helpers'

const PRIORITY_RANK = { Urgent: 3, High: 2, Normal: 1, Low: 0 }

function SortableTh({ label, sortKey, activeKey, dir, onSort, align }) {
  const active = activeKey === sortKey
  return (
    <th
      className={`sns-th-sortable ${active ? 'active' : ''}`}
      style={align ? { textAlign: align } : undefined}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1" style={align === 'right' ? { justifyContent: 'flex-end' } : undefined}>
        {label}
        <span className="sns-sort-ic">{active && dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
      </span>
    </th>
  )
}

export default function JobsTable({ jobs, showFiledBy, userMap, onView, onEdit, onDelete, selectable, selected, onToggleSelect, onSelectAll, onClearSelect }) {
  const [sortKey, setSortKey] = useState('visitDate')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'visitDate' ? 'desc' : 'asc') }
  }

  const sorted = useMemo(() => {
    const list = [...jobs]
    list.sort((a, b) => {
      let av, bv
      if (sortKey === 'visitDate') { av = new Date(a.visitDate).getTime(); bv = new Date(b.visitDate).getTime() }
      else if (sortKey === 'transportAmount') { av = Number(a.transportAmount) || 0; bv = Number(b.transportAmount) || 0 }
      else if (sortKey === 'priority') { av = PRIORITY_RANK[a.priority] ?? 1; bv = PRIORITY_RANK[b.priority] ?? 1 }
      else if (sortKey === 'filedBy') { av = (userMap?.[a.memberId]?.fullName || '').toLowerCase(); bv = (userMap?.[b.memberId]?.fullName || '').toLowerCase() }
      else { av = (a[sortKey] || '').toString().toLowerCase(); bv = (b[sortKey] || '').toString().toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [jobs, sortKey, sortDir, userMap])

  if (!jobs.length) return <EmptyState message="No job cards found." />

  return (
    <div className="sns-card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {selectable && <th><input type="checkbox" checked={selected.length === jobs.length && jobs.length > 0} onChange={(e) => (e.target.checked ? onSelectAll() : onClearSelect())} /></th>}
              <SortableTh label="Job ID" sortKey="jobId" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Date" sortKey="visitDate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Type" sortKey="jobType" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Location" sortKey="location" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Requested by" sortKey="requestedBy" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              {showFiledBy && <SortableTh label="Filed by" sortKey="filedBy" activeKey={sortKey} dir={sortDir} onSort={handleSort} />}
              <SortableTh label="Transport" sortKey="transportAmount" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortableTh label="Priority" sortKey="priority" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((j) => {
              const overdue = isOverdue(j)
              return (
                <tr key={j.id} style={overdue ? { background: 'var(--overdue-pale)' } : undefined}>
                  {selectable && <td><input type="checkbox" checked={selected.includes(j.id)} onChange={() => onToggleSelect(j.id)} /></td>}
                  <td>
                    <span className="sns-chip-id">{j.jobId}</span>
                    {j.assignedBy && (
                      <div className="sns-text-faint" style={{ fontSize: '0.68rem', fontFamily: "'IBM Plex Sans', sans-serif", marginTop: '0.15rem' }}>
                        Assigned{userMap?.[j.assignedBy]?.fullName ? ` by ${userMap[j.assignedBy].fullName}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="sns-text-soft">{formatDate(j.visitDate)}</td>
                  <td className="sns-text-soft">{j.jobType === 'Other' && j.jobTypeOther ? j.jobTypeOther : j.jobType}</td>
                  <td className="sns-text-soft">{j.location}</td>
                  <td className="sns-text-soft">{j.requestedBy || 'General field visit'}</td>
                  {showFiledBy && <td className="sns-text-soft">{userMap?.[j.memberId]?.fullName || '—'}</td>}
                  <td className="sns-mono">
                    <div style={{ fontWeight: 600 }}>{formatKSh(j.transportAmount)}</div>
                    {(j.transportFrom || (j.transportTo && j.transportTo.length > 0)) && (
                      <div className="sns-text-faint" style={{ fontSize: '0.7rem', fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 500 }}>{[j.transportFrom || '—', ...(j.transportTo && j.transportTo.length ? j.transportTo : ['—'])].join(' → ')}</div>
                    )}
                  </td>
                  <td><StatusBadge status={j.status} overdue={overdue} /></td>
                  <td>{j.priority && j.priority !== 'Normal' && j.priority !== 'Low' ? <PriorityBadge priority={j.priority} /> : <span className="sns-text-faint">{j.priority || 'Normal'}</span>}</td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      {j.assignedBy && userMap?.[j.memberId]?.contact && (
                        <a
                          href={`https://wa.me/${toWhatsAppNumber(userMap[j.memberId].contact)}?text=${encodeURIComponent(`Hi ${userMap[j.memberId].fullName}, you've been assigned a new job: ${j.jobType === 'Other' && j.jobTypeOther ? j.jobTypeOther : j.jobType} at ${j.location}, scheduled for ${formatDate(j.visitDate)}. Please check the job card system for full details.`)}`}
                          target="_blank" rel="noopener noreferrer"
                          title={`Notify ${userMap[j.memberId].fullName} via WhatsApp`}
                          className="sns-icon-btn"
                          style={{ color: 'var(--confirmed)' }}
                        >
                          <MessageCircle size={15} />
                        </a>
                      )}
                      <button onClick={() => onView(j)} title="View / print" className="sns-icon-btn"><Eye size={15} /></button>
                      {onEdit && <button onClick={() => onEdit(j)} title="Edit" className="sns-icon-btn"><Pencil size={15} /></button>}
                      {onDelete && <button onClick={() => onDelete(j)} title="Delete" className="sns-icon-btn danger"><Trash2 size={15} /></button>}
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
