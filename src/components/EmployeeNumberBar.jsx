import { useState } from 'react'
import { Hash } from 'lucide-react'
import { ConfirmDialog } from './shared'

// Top of the Staff tab: how many people still have no employee number, the button that gives everyone one, and whatever
// the page puts next to it (the Leave button). Numbers already given are never changed, so pressing it again is always safe.
export default function EmployeeNumberBar({ users, onAssign, after }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!users.length) return null
  const missing = users.filter((u) => !u.employeeNumber).length
  const hasDirector = users.some((u) => u.isDirector)

  async function run() { setConfirm(false); setBusy(true); try { await onAssign() } finally { setBusy(false) } }

  const message = 'SNS001 goes to the Director, SNS002 to you, and everyone else gets a random number from SNS003. Numbers already given are never changed.'
    + (hasDirector ? '' : ' No one is marked as Director yet, so SNS001 would stay unused and the Director would be given a different number. If you want the Director to be SNS001, cancel, open the Director\'s page and press "Make Director" first.')

  return (
    <div className="sns-card flex items-center justify-between" style={{ padding: '0.9rem 1.1rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
      <p style={{ fontSize: '0.85rem' }}>
        {missing === 0
          ? <><strong>Everyone has an employee number.</strong> <span className="sns-text-soft">New staff show up here until they are given one.</span></>
          : <><strong>{missing}</strong> of {users.length} staff member{users.length === 1 ? '' : 's'} {missing === 1 ? 'has' : 'have'} no employee number yet.</>}
      </p>
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <button onClick={() => setConfirm(true)} disabled={busy || missing === 0} className="sns-btn-primary" style={{ fontSize: '0.82rem' }}>
          <Hash size={15} /> {busy ? 'Assigning…' : 'Assign employee numbers'}
        </button>
        {after}
      </div>
      {confirm && <ConfirmDialog title="Assign employee numbers" message={message} onCancel={() => setConfirm(false)} onConfirm={run} />}
    </div>
  )
}
