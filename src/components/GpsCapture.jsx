import { useState } from 'react'
import { ExternalLink, LocateFixed, RefreshCw } from 'lucide-react'
import { FormField } from './shared'
import { formatDateTime } from '../lib/helpers'
import { accuracyNote, captureLocation, formatCoords, mapsUrl } from '../lib/gps'

// The GPS part of a site-survey job card. The position can only come from the device, never be typed in,
// so what is saved really is where the phone was.
export default function GpsCapture({ value, onChange, error, required }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function capture() {
    setBusy(true); setProblem('')
    try { onChange(await captureLocation(typeof navigator !== 'undefined' ? navigator.geolocation : null)) }
    catch (e) { setProblem(e.message) }
    finally { setBusy(false) }
  }
  const acc = value ? accuracyNote(value.accuracy) : null

  return (
    <FormField label="GPS location at the site" error={error}
      hint={required ? 'Required for a site survey. Stand at the spot you surveyed, then tap the button.' : 'Tap to record, or update, where this survey was done.'}>
      {value && (
        <div style={{ background: 'rgba(0,117,204,0.06)', border: '1px solid rgba(0,117,204,0.2)', borderRadius: 10, padding: '0.8rem 0.9rem', marginBottom: '0.6rem' }}>
          <p className="sns-mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatCoords(value.lat, value.lng)}</p>
          <p className="sns-text-soft" style={{ fontSize: '0.78rem', marginTop: 2 }}>
            {acc.text && <>Accuracy {acc.text} · </>}Recorded {formatDateTime(value.recordedAt)} ·{' '}
            <a href={mapsUrl(value.lat, value.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Open in Maps <ExternalLink size={11} /></a>
          </p>
          {acc.weak && <p style={{ color: 'var(--overdue)', fontSize: '0.78rem', marginTop: 4 }}>Low accuracy ({acc.text}). For a better fix, step outdoors and record it again.</p>}
        </div>
      )}
      <button type="button" onClick={capture} disabled={busy} className={value ? 'sns-btn-secondary' : 'sns-btn-primary'} style={{ width: '100%', justifyContent: 'center' }}>
        {busy ? <><RefreshCw size={15} /> Getting your location…</> : <><LocateFixed size={15} /> {value ? 'Record again' : 'Record GPS location'}</>}
      </button>
      {problem && <p style={{ color: 'var(--overdue)', fontSize: '0.82rem', marginTop: '0.5rem' }}>{problem}</p>}
    </FormField>
  )
}
