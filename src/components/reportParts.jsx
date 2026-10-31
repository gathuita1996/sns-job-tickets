// Small pieces shared by the full-page reports.
export const Bar = ({ pct, color = 'var(--signal)' }) => (
  <div aria-hidden="true" style={{ height: 6, borderRadius: 4, background: 'var(--line-soft)', overflow: 'hidden', minWidth: 60 }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} /></div>
)
