export const JOB_TYPES = [
  'New Installation',
  'Network Troubleshooting',
  'Router / Equipment Repair',
  'Routine Maintenance',
  'Fibre / Cable Repair',
  'Equipment Upgrade',
  'Site Survey',
  'Other',
]

export const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed']

export const CHART_COLORS = ['#0E7C7B', '#C98A2C', '#4B7B5C', '#5B6472', '#0A5F5E', '#8993A1', '#B3432F', '#DCE1E4']

export function formatDate(isoOrDate) {
  if (!isoOrDate) return '—'
  return new Date(isoOrDate).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatKSh(amount) {
  const n = Number(amount) || 0
  return `KSh ${n.toLocaleString('en-KE')}`
}

export function defaultJobForm() {
  return {
    jobType: JOB_TYPES[0],
    location: '',
    requestedBy: '',
    requesterContact: '',
    visitDate: new Date().toISOString().slice(0, 10),
    transportAmount: '',
    status: 'Completed',
    notes: '',
  }
}
