import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { ConfirmDialog } from './shared'
import { daysSinceBackup, getLastBackup } from '../lib/dataCore'
import { downloadCustomerTemplate, exportAll, importCustomers, inspectBackupFile, inspectCustomerFile, restoreFromParsed } from '../lib/dataIO'
import { formatDate } from '../lib/helpers'

const box = { padding: '1.2rem 1.4rem', marginBottom: '1.2rem' }

export default function DataTab({ currentUser, users, customers, onDataChanged }) {
  const [includePersonal, setIncludePersonal] = useState(false)
  const [working, setWorking] = useState(null)
  const [notice, setNotice] = useState(null)
  const [, bump] = useState(0)
  const [mode, setMode] = useState('customers')
  const custInput = useRef(null), restoreInput = useRef(null)
  const [custPlan, setCustPlan] = useState(null)
  const [restoreInfo, setRestoreInfo] = useState(null)
  const [allowNonEmpty, setAllowNonEmpty] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [progress, setProgress] = useState('')

  const days = daysSinceBackup(), last = getLastBackup()
  const fail = (e) => setNotice({ type: 'error', text: e && e.message ? e.message : String(e) })

  async function save(kind) {
    setWorking(kind); setNotice(null)
    try {
      const saved = await exportAll({ kind, includePersonal, exportedBy: currentUser.fullName })
      if (saved) setNotice({ type: 'ok', text: kind === 'backup' ? 'Backup saved. Keep a second copy on a flash disk or in Google Drive.' : 'Excel file saved.' })
      bump((n) => n + 1)
    } catch (e) { fail(e) } finally { setWorking(null) }
  }

  async function pickCustomers(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = ''
    if (!file) return
    setNotice(null); setCustPlan(null); setWorking('read')
    try { setCustPlan(await inspectCustomerFile(file, customers)) } catch (err) { fail(err) } finally { setWorking(null) }
  }
  async function runCustomers() {
    setConfirm(null); setWorking('import')
    try {
      const { inserted } = await importCustomers({ toInsert: custPlan.toInsert, adminId: currentUser.id, status: 'Converted' })
      setNotice({ type: 'ok', text: `${inserted} customers imported.` }); setCustPlan(null); await onDataChanged()
    } catch (err) { fail(err) } finally { setWorking(null) }
  }

  async function pickBackup(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = ''
    if (!file) return
    setNotice(null); setRestoreInfo(null); setAllowNonEmpty(false); setWorking('read')
    try { setRestoreInfo(await inspectBackupFile(file, users)) } catch (err) { fail(err) } finally { setWorking(null) }
  }
  async function runRestore() {
    setConfirm(null); setWorking('restore'); setProgress('Starting…')
    try {
      const report = await restoreFromParsed({ parsed: restoreInfo.parsed, users, adminId: currentUser.id, onProgress: setProgress })
      const done = Object.values(report.tables).filter((t) => t.inserted || t.reused || t.skipped)
      const skipped = done.reduce((s, t) => s + t.skipped, 0)
      setNotice({ type: 'ok', text: `Restore finished: ${done.map((t) => `${t.sheet} ${t.inserted}${t.reused ? ` (+${t.reused} already there)` : ''}`).join(', ') || 'nothing to restore'}.${skipped ? ` ${skipped} records were skipped because what they belonged to was missing.` : ''}${report.reassigned ? ` ${report.reassigned} records were given to you because the staff member has not signed up yet.` : ''}` })
      setRestoreInfo(null); await onDataChanged()
    } catch (err) { fail(err) } finally { setWorking(null); setProgress('') }
  }

  const busy = working != null
  const age = days == null ? { color: 'var(--overdue)', text: 'No backup has been made on this computer yet.' }
    : days > 7 ? { color: 'var(--overdue)', text: `Last backup: ${days} days ago (${formatDate(last)}). It is time for a new one.` }
    : { color: 'var(--confirmed)', text: days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago.` }
  const needsTick = restoreInfo && restoreInfo.preview.nonEmpty.length > 0

  return (
    <div style={{ maxWidth: '58rem' }}>
      {notice && (
        <div className="sns-card flex items-start gap-3" style={{ ...box, borderLeft: `4px solid ${notice.type === 'ok' ? 'var(--confirmed)' : 'var(--overdue)'}` }}>
          {notice.type === 'ok' ? <CheckCircle2 size={18} style={{ color: 'var(--confirmed)', flexShrink: 0 }} /> : <AlertTriangle size={18} style={{ color: 'var(--overdue)', flexShrink: 0 }} />}
          <p style={{ fontSize: '0.88rem' }}>{notice.text}</p>
        </div>
      )}

      <div className="sns-card" style={box}>
        <div className="flex items-center gap-2" style={{ marginBottom: '0.3rem' }}><DatabaseBackup size={18} /><h3 className="sns-display" style={{ fontWeight: 700 }}>Back up to this computer</h3></div>
        <p style={{ color: age.color, fontWeight: 600, fontSize: '0.88rem', margin: '0.3rem 0' }}>{age.text}</p>
        <p className="sns-text-soft" style={{ fontSize: '0.82rem', marginBottom: '0.9rem' }}>Saves everything in one Excel file: jobs, customers, expenses, complaints, stock, visits and the team list. In Chrome or Edge you choose the folder; other browsers save to Downloads. Receipt photos are not included. Back up at least once a week, and keep a copy off this computer.</p>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => save('backup')} disabled={busy} className="sns-btn-primary"><DatabaseBackup size={16} /> {working === 'backup' ? 'Preparing…' : 'Back up now'}</button>
          <button onClick={() => save('export')} disabled={busy} className="sns-btn-secondary"><FileSpreadsheet size={16} /> {working === 'export' ? 'Preparing…' : 'Export to Excel'}</button>
        </div>
        <label className="flex items-start gap-2" style={{ marginTop: '0.9rem', cursor: 'pointer', fontSize: '0.82rem' }}>
          <input type="checkbox" checked={includePersonal} onChange={(e) => setIncludePersonal(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Include staff personal details (ID number, KRA PIN, SHA number, date of birth). Leave this off unless you need them, because anyone who opens the file can read them.</span>
        </label>
        <p className="sns-text-soft" style={{ fontSize: '0.78rem', marginTop: '0.6rem' }}>"Back up now" and "Export to Excel" make the same complete file. Either can be loaded back with Import below.</p>
      </div>

      <div className="sns-card" style={box}>
        <div className="flex items-center gap-2" style={{ marginBottom: '0.7rem' }}><Upload size={18} /><h3 className="sns-display" style={{ fontWeight: 700 }}>Import</h3></div>
        <div className="flex gap-2" style={{ marginBottom: '1rem' }}>
          <button onClick={() => setMode('customers')} className={mode === 'customers' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Customer list</button>
          <button onClick={() => setMode('restore')} className={mode === 'restore' ? 'sns-btn-primary' : 'sns-btn-secondary'} style={{ fontSize: '0.82rem' }}>Restore a backup</button>
        </div>

        {mode === 'customers' && (
          <div>
            <p className="sns-text-soft" style={{ fontSize: '0.84rem', marginBottom: '0.8rem' }}>Add many customers at once from an Excel file with Name, Phone and Location columns. Customers whose phone number is already in the system are skipped, so importing twice is safe. Imported customers never earn commission.</p>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <button onClick={() => downloadCustomerTemplate().catch(fail)} className="sns-btn-secondary" style={{ fontSize: '0.82rem' }}><Download size={15} /> Download the template</button>
              <button onClick={() => custInput.current && custInput.current.click()} disabled={busy} className="sns-btn-primary" style={{ fontSize: '0.82rem' }}><Upload size={15} /> {working === 'read' ? 'Reading…' : 'Choose an Excel file'}</button>
              <input ref={custInput} type="file" accept=".xlsx" onChange={pickCustomers} style={{ display: 'none' }} />
            </div>
            {custPlan && (
              <div style={{ marginTop: '1rem', fontSize: '0.86rem' }}>
                <p><strong>{custPlan.toInsert.length}</strong> customers ready to import · <strong>{custPlan.duplicates.length}</strong> already in the system (skipped) · <strong>{custPlan.skipped.length}</strong> rows skipped</p>
                {custPlan.skipped.length > 0 && <ul className="sns-text-soft" style={{ margin: '0.4rem 0 0 1.1rem', listStyle: 'disc', fontSize: '0.8rem' }}>{custPlan.skipped.slice(0, 8).map((s) => <li key={s.line}>Row {s.line}: {s.reason}</li>)}{custPlan.skipped.length > 8 && <li>…and {custPlan.skipped.length - 8} more</li>}</ul>}
                {custPlan.toInsert.length > 0 && (
                  <div className="flex items-center gap-3" style={{ marginTop: '0.9rem', flexWrap: 'wrap' }}>
                    <button onClick={() => setConfirm('customers')} disabled={busy} className="sns-btn-primary">{working === 'import' ? 'Importing…' : `Import ${custPlan.toInsert.length} customers`}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'restore' && (
          <div>
            <p className="sns-text-soft" style={{ fontSize: '0.84rem', marginBottom: '0.6rem' }}>Load a backup file made by this system. Use it on a new or emptied system. Staff accounts cannot come from a file, so ask your team to sign up again first: people are matched by username, then by full name, and anyone who is not found has their records given to you.</p>
            <button onClick={() => restoreInput.current && restoreInput.current.click()} disabled={busy} className="sns-btn-primary" style={{ fontSize: '0.82rem' }}><Upload size={15} /> {working === 'read' ? 'Reading…' : 'Choose a backup file'}</button>
            <input ref={restoreInput} type="file" accept=".xlsx" onChange={pickBackup} style={{ display: 'none' }} />
            {restoreInfo && (
              <div style={{ marginTop: '1rem', fontSize: '0.86rem' }}>
                <p className="sns-text-soft">Backup made {restoreInfo.preview.exportedAt ? formatDate(restoreInfo.preview.exportedAt) : ''}{restoreInfo.preview.exportedBy ? ` by ${restoreInfo.preview.exportedBy}` : ''}.</p>
                <div className="sns-card" style={{ overflow: 'hidden', margin: '0.7rem 0' }}>
                  <table className="sns-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th>Sheet</th><th>In the file</th><th>Already in the system</th></tr></thead>
                    <tbody>{restoreInfo.preview.sheets.filter((s) => s.inFile || s.existing).map((s) => <tr key={s.sheet}><td style={{ fontWeight: 600 }}>{s.sheet}</td><td className="sns-mono">{s.inFile}</td><td className="sns-mono">{s.existing}</td></tr>)}</tbody>
                  </table>
                </div>
                <p>Staff matched: <strong>{restoreInfo.preview.matched}</strong>{restoreInfo.preview.unmatched.length > 0 && <> · not signed up yet: <strong>{restoreInfo.preview.unmatched.join(', ')}</strong> (their records will be given to you)</>}</p>
                {needsTick && (
                  <label className="flex items-start gap-2" style={{ marginTop: '0.7rem', color: 'var(--overdue)', cursor: 'pointer', fontSize: '0.84rem' }}>
                    <input type="checkbox" checked={allowNonEmpty} onChange={(e) => setAllowNonEmpty(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>The system already has records in: {restoreInfo.preview.nonEmpty.join(', ')}. Restoring now adds the file's records on top, which can create duplicates. I understand.</span>
                  </label>
                )}
                <button onClick={() => setConfirm('restore')} disabled={busy || (needsTick && !allowNonEmpty)} className="sns-btn-primary" style={{ marginTop: '0.9rem' }}>{working === 'restore' ? progress || 'Restoring…' : 'Restore this backup'}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirm === 'customers' && <ConfirmDialog title="Import customers" message={`Add ${custPlan.toInsert.length} customers to the system?`} onCancel={() => setConfirm(null)} onConfirm={runCustomers} />}
      {confirm === 'restore' && <ConfirmDialog title="Restore backup" message="Load this backup into the system? This cannot be undone, and it should only be done once." onCancel={() => setConfirm(null)} onConfirm={runRestore} />}
    </div>
  )
}
