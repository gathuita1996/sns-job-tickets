import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clipboard, Eye, EyeOff, Search } from 'lucide-react'
import { STATUS_OPTIONS, PERIODS, formatPeriodLabel, shiftAnchor, toDateInputValue } from '../lib/helpers'

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

// Animates a number counting up (or down) to its new value whenever it
// changes -- e.g. a stat card ticking from 4 to 7 rather than just jumping.
// Non-numeric values (strings like "KSh 2,000", or the masked "••••••")
// pass straight through untouched.
function useCountUp(value, duration = 650) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef(null)

  useEffect(() => {
    const isNumeric = typeof value === 'number' && typeof prevRef.current === 'number'
    if (!isNumeric || value === prevRef.current) {
      setDisplay(value)
      prevRef.current = value
      return undefined
    }
    const start = prevRef.current
    const startTime = performance.now()
    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + (value - start) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = value
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return display
}

export function StatCard({ label, value, icon: Icon, masked, tone = 'default', onClick }) {
  const [revealed, setRevealed] = useState(false)
  const showValue = !masked || revealed
  const animatedValue = useCountUp(showValue ? value : null)
  function toggle() { setRevealed((r) => !r) }
  const clickable = masked || Boolean(onClick)
  function handleClick() { if (masked) toggle(); else if (onClick) onClick() }
  return (
    <div
      className="sns-card sns-stat-card"
      style={{ padding: '1rem', cursor: clickable ? 'pointer' : 'default', userSelect: clickable ? 'none' : 'auto' }}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={masked ? (revealed ? 'Click to hide' : 'Click to reveal') : (onClick ? 'Click to view' : undefined)}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: '0.6rem' }}>
        <div className="flex items-center gap-2">
          <span className={`sns-stat-icon tone-${tone}`}><Icon size={14} /></span>
          <span className="sns-eyebrow sns-text-faint">{label}</span>
        </div>
        {masked && (revealed ? <EyeOff size={13} style={{ color: 'var(--ink-faint)' }} /> : <Eye size={13} style={{ color: 'var(--ink-faint)' }} />)}
      </div>
      <p className="sns-display" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>{showValue ? animatedValue : '••••••'}</p>
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
      <div className="flex items-center gap-2" style={{ background: type === 'error' ? 'var(--danger)' : 'var(--ink-fixed-dark)', color: 'white', padding: '0.7rem 1rem', borderRadius: 10, fontSize: '0.85rem', fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
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

export function PeriodSelector({ granularity, anchor, onGranularityChange, onAnchorChange }) {
  const [open, setOpen] = useState(false)
  const label = formatPeriodLabel(granularity, anchor)

  function goPrev() { onAnchorChange(shiftAnchor(anchor, granularity, -1)) }
  function goNext() { onAnchorChange(shiftAnchor(anchor, granularity, 1)) }
  function goToday() {
    onGranularityChange('day')
    onAnchorChange(new Date())
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="sns-btn-secondary" onClick={() => setOpen((o) => !o)} style={{ fontSize: '0.82rem' }}>
        <Calendar size={14} /> {label} <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
          <div className="sns-card sns-fade-in" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, padding: '0.85rem', minWidth: '18rem' }}>
            <div className="sns-period-toggle" style={{ width: '100%', marginBottom: '0.75rem' }}>
              {PERIODS.map((p) => (
                <button key={p.key} type="button" className={`sns-period-btn ${granularity === p.key ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => onGranularityChange(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ marginBottom: '0.75rem' }}>
              <button type="button" onClick={goPrev} className="sns-icon-btn" title="Previous"><ChevronLeft size={16} /></button>
              <button type="button" onClick={goToday} className="sns-btn-link" style={{ fontSize: '0.78rem' }}>Jump to today</button>
              <button type="button" onClick={goNext} className="sns-icon-btn" title="Next"><ChevronRight size={16} /></button>
            </div>
            <FormField label="Or pick a specific date">
              <input
                type="date"
                className="sns-input"
                value={toDateInputValue(anchor)}
                onChange={(e) => e.target.value && onAnchorChange(new Date(e.target.value + 'T00:00:00'))}
              />
            </FormField>
          </div>
        </>
      )}
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
