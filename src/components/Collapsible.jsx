import { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// A titled section that stays closed until it is clicked. The content stays in the page (only hidden with display:none), so a printout can still include it: the print rule overrides it.
export default function Collapsible({ title, summary, badge, defaultOpen = false, children, style }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section style={style}>
      <h3 style={{ margin: 0 }}>
        <button type="button" id={`${id}-head`} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)} className="sns-collapsible-head">
          {open ? <ChevronDown size={18} className="sns-collapsible-chevron" aria-hidden="true" /> : <ChevronRight size={18} className="sns-collapsible-chevron" aria-hidden="true" />}
          <span className="sns-display" style={{ fontWeight: 700, fontSize: '0.98rem' }}>{title}</span>
          {badge}
          {summary ? <span className="sns-text-faint" style={{ fontSize: '0.8rem' }}>{summary}</span> : null}
          <span className="sns-collapsible-hint no-print">{open ? 'Click to hide' : 'Click to show'}</span>
        </button>
      </h3>
      <div id={`${id}-body`} role="region" aria-labelledby={`${id}-head`} className="sns-collapsible-body" style={open ? undefined : { display: 'none' }}>{children}</div>
    </section>
  )
}
