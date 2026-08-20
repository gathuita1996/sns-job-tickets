import { useEffect } from 'react'
import { AlertCircle, Check, Clipboard, Search } from 'lucide-react'
import { STATUS_OPTIONS, PERIODS } from '../lib/helpers'

export function FormField({ label, children, hint, error }) {
  return (
    <div>
      <label className="block" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '0.35rem' }}>{label}</label>
      {children}
      {hint && !error && <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '0.3rem' }}>{hint}</p>}
      {error && <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{error}</p>}
    </div>
  )
}

export function ErrorBanner({ message }) {
  return (
    <div className="flex items-start gap-2" style={{ background: 'var(--danger-pale)', color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '1rem' }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  )
}

export function SuccessBanner({ message }) {
  return (
    <div className="flex items-start gap-2" style={{ background: 'var(--confirmed-pale)', color: 'var(--confirmed)', fontSize: '0.85rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '1rem' }}>
      <Check size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>{message}</span>
    </div>
  )
}

export function StatusBadge({ status, overdue }) {
  if (overdue) return <span className="sns-badge sns-badge-overdue">Overdue</span>
  const cls = status === 'Completed' ? 'sns-badge-done' : status === 'In Progress' ? 'sns-badge-progress' : 'sns-badge-pending'
  return <span className={`sns-badge ${cls}`}>{status}</span>
}

export function PriorityBadge({ priority }) {
  if (!priority || priority === 'Normal' || priority === 'Low') return null
  const cls = priority === 'Urgent' ? 'sns-badge-priority-urgent' : 'sns-badge-priority-high'
  return <span className={`sns-badge ${cls}`}>{priority}</span>
}

export function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="sns-card" style={{ padding: '1rem' }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--ink-faint)', marginBottom: '0.5rem' }}>
        <Icon size={15} />
        <span className="sns-eyebrow">{label}</span>
      </div>
      <p className="sns-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>{value}</p>
    </div>
  )
}

export function EmptyState({ message }) {
  return (
    <div className="text-center" style={{ padding: '3rem 1rem', color: 'var(--ink-faint)' }}>
      <Clipboard size={30} style={{ margin: '0 auto 0.6rem', opacity: 0.5 }} />
      <p style={{ fontSize: '0.85rem' }}>{message}</p>
    </div>
  )
}

export function LoadingScreen({ message }) {
  return (
    <div className="sns-shell flex items-center justify-center">
      <div className="text-center">
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid var(--signal)', borderTopColor: 'transparent', margin: '0 auto 0.75rem' }} className="animate-spin" />
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)' }}>{message || 'Loading Swahili Net Solution…'}</p>
      </div>
    </div>
  )
}

export function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [])
  return (
    <div className="no-print" style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 60 }}>
      <div className="flex items-center gap-2" style={{ background: type === 'error' ? 'var(--danger)' : 'var(--ink)', color: 'white', padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.85rem', fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
        {type === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}
        {message}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, danger }) {
  return (
    <div className="no-print flex items-center justify-center p-4" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 60 }}>
      <div className="sns-card sns-fade-in" style={{ maxWidth: '24rem', width: '100%', padding: '1.5rem' }}>
        <h3 className="sns-display" style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{title}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: '1.4rem' }}>{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="sns-btn-secondary">Cancel</button>
          <button onClick={onConfirm} className={`sns-btn-primary ${danger ? 'sns-btn-danger' : ''}`}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative flex-1" style={{ minWidth: '200px', position: 'relative' }}>
      <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="sns-input" style={{ paddingLeft: '2.25rem' }} />
    </div>
  )
}

export function StatusFilterSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="sns-input" style={{ width: 'auto' }}>
      <option value="all">All statuses</option>
      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}

export function PeriodToggle({ value, onChange }) {
  return (
    <div className="sns-period-toggle">
      {PERIODS.map((p) => (
        <button key={p.key} type="button" className={`sns-period-btn ${value === p.key ? 'active' : ''}`} onClick={() => onChange(p.key)}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

export function NavCard({ icon: Icon, label, description, onClick, badge }) {
  return (
    <button type="button" className="sns-nav-card" onClick={onClick}>
      <div className="flex items-center justify-between" style={{ width: '100%' }}>
        <div className="sns-nav-icon"><Icon size={19} /></div>
        {badge != null && badge > 0 && <span className="sns-badge sns-badge-overdue">{badge}</span>}
      </div>
      <div>
        <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.15rem' }}>{label}</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>{description}</p>
      </div>
    </button>
  )
}
