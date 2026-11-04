import Collapsible from './Collapsible'
import { contractInfo, contractTypeLabel } from '../lib/contracts'
import { formatDate } from '../lib/helpers'

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4" style={{ fontSize: '0.86rem', padding: '0.4rem 0' }}>
    <span className="sns-text-faint">{label}</span><span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{children}</span>
  </div>
)

// A staff member's contract agreement. Everyone sees their own; only the Director can change it (canEdit + onEdit).
export default function ContractCard({ contract, history = [], userMap = {}, canEdit = false, onEdit, policyDays = 21, today, heading = false }) {
  const info = contractInfo(contract, today)
  const who = (id) => (userMap[id] && userMap[id].fullName) || 'the Director'
  const line = (h) => (h.action === 'set' ? `Contract entered: ${contractTypeLabel(h.contractType)} from ${formatDate(h.startDate)}`
    : h.previousType !== h.contractType ? `Changed from ${contractTypeLabel(h.previousType)} to ${contractTypeLabel(h.contractType)}` : `Terms updated: ${contractTypeLabel(h.contractType)} from ${formatDate(h.startDate)}`)
  return (
    <div aria-label="Contract agreement">
      {heading && <h4 className="sns-display" style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.5rem' }}>Contract agreement</h4>}
      {!info.set ? (
        <div>
          <p className="sns-text-soft" style={{ fontSize: '0.85rem' }}>No contract is on file yet. Without a 1-year contract there is no annual leave.</p>
          {canEdit && <button type="button" className="sns-btn-secondary" style={{ marginTop: '0.6rem', fontSize: '0.8rem' }} onClick={onEdit}>Add contract</button>}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', marginBottom: '0.3rem' }}>
            <span className={`sns-badge ${info.eligible ? 'sns-badge-done' : 'sns-badge-pending'}`}>{info.typeLabel}</span>
            {info.status === 'ended' && <span className="sns-badge sns-badge-overdue">Ended {formatDate(info.periodEnd)}</span>}
            {info.status === 'not_started' && <span className="sns-badge sns-badge-progress">Starts {formatDate(info.start)}</span>}
          </div>
          <Row label="Term">{info.termLabel}{info.renews ? ', renewed on completion' : ''}</Row>
          <Row label="Started">{formatDate(info.start)}</Row>
          {info.renews ? (
            <>
              <Row label="Current period">{formatDate(info.periodStart)} – {formatDate(info.periodEnd)}<span className="sns-text-faint" style={{ fontWeight: 400, fontSize: '0.78rem' }}> (period {info.period}{info.renewals ? `, renewed ${info.renewals} time${info.renewals === 1 ? '' : 's'}` : ''})</span></Row>
              {info.nextRenewal && <Row label="Next renewal">{formatDate(info.nextRenewal)}</Row>}
            </>
          ) : (
            <Row label="Ends">{formatDate(info.periodEnd)}{info.status === 'active' ? <span className="sns-text-faint" style={{ fontWeight: 400, fontSize: '0.78rem' }}> ({info.daysLeft} day{info.daysLeft === 1 ? '' : 's'} left)</span> : null}</Row>
          )}
          <Row label="Annual leave">{info.eligible ? `Eligible: ${policyDays} days a year` : 'Not eligible'}</Row>
          {!info.eligible && <p className="sns-text-faint" style={{ fontSize: '0.78rem', margin: '0.2rem 0 0.4rem' }}>A short-term contract has no leave days. They are added when the Director changes the contract to a 1-year term, and any leave already recorded is kept.</p>}
          {contract.notes && <Row label="Notes">{contract.notes}</Row>}
          {history.length > 0 && (
            <div style={{ marginTop: '0.6rem' }}>
              <Collapsible title="Contract history" summary={`${history.length} entr${history.length === 1 ? 'y' : 'ies'}`}>
                <div className="sns-card" style={{ padding: '0.3rem 1rem' }}>
                  {history.map((h, i) => (
                    <div key={h.id} className={i ? 'sns-border-t' : ''} style={{ fontSize: '0.82rem', padding: '0.5rem 0' }}>
                      <span style={{ fontWeight: 600 }}>{line(h)}</span><br /><span className="sns-text-faint">{formatDate(h.changedAt)} · {who(h.changedBy)}</span>
                    </div>
                  ))}
                </div>
              </Collapsible>
            </div>
          )}
        </div>
      )}
      {info.set && (canEdit
        ? <button type="button" className="sns-btn-secondary" style={{ marginTop: '0.7rem', fontSize: '0.8rem' }} onClick={onEdit}>Edit contract</button>
        : <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginTop: '0.6rem' }}>Only the Director can change a contract.</p>)}
    </div>
  )
}
