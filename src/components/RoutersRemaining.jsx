import { AlertTriangle, Router as RouterIcon, Settings } from 'lucide-react'

// One figure in the sum that ends in the remaining number.
const Cell = ({ label, value, strong, testid }) => (
  <div style={{ textAlign: 'center', minWidth: '4rem' }}>
    <p className="sns-eyebrow sns-text-faint" style={{ fontSize: '0.6rem', lineHeight: 1.2 }}>{label}</p>
    <p className="sns-mono" style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? '1.2rem' : '1rem' }} data-testid={testid}>{value}</p>
  </div>
)
const Op = ({ children }) => <span className="sns-text-faint" aria-hidden="true" style={{ alignSelf: 'flex-end', paddingBottom: '0.1rem', fontWeight: 700 }}>{children}</span>
// A figure together with the sign in front of it, so that on a narrow screen a line never ends on a stray "+" or "−".
const Term = ({ op, children }) => <div className="flex" style={{ gap: '0.45rem', alignItems: 'flex-end' }}>{op && <Op>{op}</Op>}{children}</div>

function notCountedText(n) {
  const parts = []
  if (n.faulty) parts.push(`${n.faulty} faulty`)
  if (n.damaged) parts.push(`${n.damaged} damaged`)
  if (n.underRepair) parts.push(`${n.underRepair} under repair`)
  return parts.join(', ')
}

function ItemCard({ row, onSeeRetrieved }) {
  const id = row.item.id
  return (
    <div className="sns-card" data-testid={`router-item-${id}`} style={{ padding: '1rem 1.1rem' }}>
      <div className="flex items-center justify-between" style={{ gap: '0.6rem', marginBottom: '0.3rem' }}>
        <p style={{ fontWeight: 700 }}>{row.item.itemName}</p>
        <span className={`sns-badge ${row.status === 'REORDER' ? 'sns-badge-overdue' : 'sns-badge-done'}`}>{row.status === 'REORDER' ? 'Reorder' : 'OK'}</span>
      </div>
      <p style={{ marginBottom: '0.6rem' }}>
        <span className="sns-display" data-testid={`remaining-${id}`} style={{ fontSize: '2rem', fontWeight: 800, color: row.remaining <= 0 ? 'var(--overdue)' : 'var(--ink)' }}>{row.remaining}</span>
        <span className="sns-text-soft" style={{ marginLeft: '0.4rem', fontSize: '0.9rem' }}>remaining</span>
      </p>
      <div className="flex" style={{ flexWrap: 'wrap', gap: '0.3rem 0.45rem', marginBottom: '0.5rem' }} role="group" aria-label={`How the remaining ${row.item.itemName} is worked out`}>
        <Term><Cell label="Bought new" value={row.bought} testid={`bought-${id}`} /></Term>
        <Term op="+"><Cell label="Retrieved (working)" value={row.retrieved} testid={`retrieved-${id}`} /></Term>
        <Term op="−"><Cell label="Issued" value={row.issued} testid={`issued-${id}`} /></Term>
        {row.writtenOff > 0 && <Term op="−"><Cell label="Written off" value={row.writtenOff} testid={`writtenoff-${id}`} /></Term>}
        <Term op="="><Cell label="Remaining" value={row.remaining} strong /></Term>
      </div>
      {row.retrievedReady > 0 && (
        <p data-testid={`ready-${id}`} style={{ fontSize: '0.82rem', color: 'var(--confirmed)', fontWeight: 600 }}>
          {row.retrievedReady} of the {row.remaining} {row.retrievedReady === 1 ? 'is a retrieved router' : 'are retrieved routers'}, working and ready to use in a new installation.
          {onSeeRetrieved && <> <button type="button" className="sns-link" style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }} onClick={onSeeRetrieved}>See them</button></>}
        </p>
      )}
      {row.notCounted.total > 0 && (
        <p data-testid={`notcounted-${id}`} className="sns-text-soft" style={{ fontSize: '0.8rem', marginTop: 2 }}>
          Not counted: {notCountedText(row.notCounted)}. {row.notCounted.total === 1 ? 'It stays on the Retrieved Routers list until it is repaired.' : 'They stay on the Retrieved Routers list until they are repaired.'}
        </p>
      )}
    </div>
  )
}

// "Routers remaining": what is physically available to install, and exactly how that number is reached.
export default function RoutersRemaining({ summary, onSeeRetrieved, onLink, onSetup, compact = false }) {
  const { rows, total, unlinked } = summary
  const setupButton = onSetup && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }} onClick={onSetup}><Settings size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />Router items</button>

  if (rows.length === 0) {
    return (
      <div className="sns-card" data-testid="routers-remaining" style={{ padding: '1rem 1.2rem', marginBottom: '1.2rem', borderLeft: '4px solid var(--stamp)' }}>
        <p className="flex items-center gap-2" style={{ fontWeight: 700 }}><RouterIcon size={16} /> Routers remaining</p>
        <p className="sns-text-soft" style={{ fontSize: '0.85rem', margin: '0.4rem 0 0.7rem' }}>No stock items are marked as routers yet, so retrieved routers cannot be counted. Mark your router items (for example the ONU and XPON routers) and they will show here.</p>
        {setupButton}
      </div>
    )
  }

  const unlinkedNote = unlinked.length > 0 && (
    <div role="alert" data-testid="unlinked-note" className="flex items-center justify-between" style={{ gap: '0.6rem', flexWrap: 'wrap', background: 'var(--stamp-pale)', color: 'var(--stamp-deep)', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.82rem', fontWeight: 600, marginTop: '0.8rem' }}>
      <span className="flex items-center gap-2"><AlertTriangle size={15} style={{ flexShrink: 0 }} /> {unlinked.length} working retrieved router{unlinked.length === 1 ? ' is' : 's are'} not linked to a router item, so {unlinked.length === 1 ? 'it is' : 'they are'} not in this count.</span>
      {onLink && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={onLink}>Link {unlinked.length === 1 ? 'it' : 'them'}</button>}
    </div>
  )

  if (compact) {
    return (
      <div data-testid="routers-remaining" style={{ marginBottom: '1.1rem' }}>
        <div className="flex items-center" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="sns-eyebrow sns-text-faint">Routers remaining</span>
          {rows.map((r) => (
            <span key={r.item.id} className={`sns-badge ${r.remaining <= 0 ? 'sns-badge-overdue' : 'sns-badge-done'}`} data-testid={`compact-${r.item.id}`}>
              {r.item.itemName}: {r.remaining}{r.retrievedReady > 0 ? ` (${r.retrievedReady} retrieved)` : ''}
            </span>
          ))}
          {setupButton}
        </div>
        {unlinkedNote}
      </div>
    )
  }

  return (
    <section className="sns-card" data-testid="routers-remaining" aria-label="Routers remaining" style={{ padding: '1.1rem 1.2rem', marginBottom: '1.4rem' }}>
      <div className="flex items-start justify-between" style={{ gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <div>
          <p className="flex items-center gap-2 sns-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}><RouterIcon size={18} /> Routers remaining</p>
          <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginTop: 2 }}>
            What you can install today: <strong data-testid="routers-total">{total.remaining}</strong> in all{total.retrievedReady > 0 ? `, ${total.retrievedReady} of them retrieved and working` : ''}. A retrieved router counts only while it is working and in the store.
          </p>
        </div>
        {setupButton}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => <ItemCard key={r.item.id} row={r} onSeeRetrieved={onSeeRetrieved} />)}
      </div>
      {total.notCounted > 0 && <p data-testid="notcounted-total" className="sns-text-soft" style={{ fontSize: '0.8rem', marginTop: '0.8rem' }}>{total.notCounted} retrieved router{total.notCounted === 1 ? ' is' : 's are'} faulty, damaged or under repair, so {total.notCounted === 1 ? 'it is' : 'they are'} not counted above.</p>}
      {unlinkedNote}
    </section>
  )
}
