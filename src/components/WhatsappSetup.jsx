import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Copy, MinusCircle, RefreshCw, X, XCircle } from 'lucide-react'
import { RECEIPT_TEMPLATE } from '../lib/whatsappTemplate'
import { runWhatsappCheck } from '../lib/whatsappApi'

const STATE_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, skip: MinusCircle }
const STATE_COLOR = { ok: 'var(--confirmed)', warn: 'var(--stamp-deep)', bad: 'var(--danger)', skip: 'var(--ink-faint)' }
const STATE_WORD = { ok: 'OK', warn: 'Needs a look', bad: 'Not working', skip: 'Skipped' }

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the text is on the screen to copy by hand */ }
  }
  return <button type="button" className="sns-btn-link sns-link-icon" onClick={copy} aria-label={`Copy ${label}`}>{copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}</button>
}

function Field({ label, value, copy }) {
  return (
    <div style={{ padding: '0.5rem 0', borderTop: '1px solid var(--line-soft)' }}>
      <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginBottom: '0.15rem' }}>{label}</p>
      <div className="flex items-start justify-between" style={{ gap: '0.8rem' }}>
        <p className="sns-mono" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0 }}>{value}</p>
        {copy && <CopyButton text={copy === true ? value : copy} label={label} />}
      </div>
    </div>
  )
}

// What the admin sees for "Check setup": whether automatic WhatsApp sending works, step by step, and what to do in Meta and
// Netlify to switch it on. Receipts still go out the old way (WhatsApp opens, press Send) until everything here is green.
//   client : the database client      status : from useWhatsappStatus      onChecked : called after a check, so the status refreshes
export default function WhatsappSetup({ client, status, onChecked, onClose }) {
  const [state, setState] = useState({ phase: 'idle', result: null, message: '' })     // phase: idle | running | done | failed
  const closeRef = useRef(null)
  const alive = useRef(true)
  const canCheck = !status || status.available !== false || status.problem !== 'unavailable'
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/.netlify/functions/whatsapp-webhook`

  async function run() {
    setState({ phase: 'running', result: null, message: '' })
    const r = await runWhatsappCheck(client)
    if (!alive.current) return
    setState(r.ok ? { phase: 'done', result: r, message: '' } : { phase: 'failed', result: null, message: r.message })
    if (r.ok && onChecked) onChecked()
  }

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (canCheck) run() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => { if (closeRef.current) closeRef.current.focus() }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = before }
  }, [onClose])

  const missing = (status && status.missing) || []
  const t = RECEIPT_TEMPLATE

  return (
    <div className="no-print flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="whatsapp-setup-title" style={{ position: 'fixed', inset: 0, background: 'rgba(27,36,48,0.55)', zIndex: 75 }}>
      <div className="sns-card sns-fade-in" style={{ width: '100%', maxWidth: '38rem', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between sns-border-b sns-bg-card" style={{ padding: '1rem 1.2rem', position: 'sticky', top: 0, zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <h3 id="whatsapp-setup-title" className="sns-display" style={{ fontWeight: 700 }}>WhatsApp sending</h3>
          <button ref={closeRef} type="button" onClick={onClose} className="sns-icon-btn" aria-label="Close"><X size={18} /></button>
        </div>

        <div style={{ padding: '1.1rem 1.2rem 1.4rem' }}>
          <p className="sns-text-soft" style={{ fontSize: '0.86rem', marginBottom: '1rem' }}>
            With automatic sending, a receipt goes straight to the customer from the business WhatsApp number, with the PDF attached, and you can see whether it was delivered and read.
            Until everything below is green, each receipt simply opens WhatsApp for you to press Send, as before.
          </p>

          {/* ---- the check ---------------------------------------------------------------------------------------------- */}
          <div className="flex items-center justify-between" style={{ gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <p className="sns-eyebrow sns-text-faint">Setup check</p>
            {canCheck && <button type="button" className="sns-btn-secondary" style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem' }} onClick={run} disabled={state.phase === 'running'}><RefreshCw size={13} aria-hidden="true" /> {state.phase === 'running' ? 'Checking…' : 'Check again'}</button>}
          </div>
          {!canCheck && (
            <p role="alert" className="flex items-start gap-2" style={{ background: 'var(--stamp-pale)', color: 'var(--stamp-deep)', fontSize: '0.84rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '0.8rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <span>This site cannot reach the WhatsApp function. It only exists on the Netlify site (not when the app runs on a laptop), and only after the update has been deployed there.</span>
            </p>
          )}
          {state.phase === 'running' && <p role="status" className="sns-text-soft" style={{ fontSize: '0.86rem', marginBottom: '0.8rem' }}>Checking the settings, the WhatsApp number and the message template…</p>}
          {state.phase === 'failed' && <p role="alert" style={{ background: 'var(--danger-pale)', color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '0.8rem' }}>{state.message}</p>}
          {state.phase === 'done' && state.result && (
            <div style={{ marginBottom: '1rem' }}>
              <p role="status" style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.5rem', color: state.result.ready ? 'var(--confirmed)' : 'var(--danger)' }}>
                {state.result.ready ? 'Everything needed for sending is working.' : 'Not ready yet. Fix the items marked "Not working".'}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {state.result.checks.map((c) => {
                  const Icon = STATE_ICON[c.state] || AlertTriangle
                  return (
                    <li key={c.id} className="flex items-start gap-2" style={{ padding: '0.55rem 0', borderTop: '1px solid var(--line-soft)' }}>
                      <Icon size={17} style={{ color: STATE_COLOR[c.state], flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.86rem' }}>{c.label} <span className="sns-text-faint" style={{ fontWeight: 400, fontSize: '0.74rem' }}>· {STATE_WORD[c.state]}</span></p>
                        <p className="sns-text-soft" style={{ fontSize: '0.8rem', overflowWrap: 'anywhere' }}>{c.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* ---- what to set up ------------------------------------------------------------------------------------------- */}
          <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.4rem' }}>What to set up (once)</p>
          <details style={{ marginBottom: '0.6rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>1. Settings in Netlify{missing.length ? ` (${missing.length} missing)` : ''}</summary>
            <div style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
              <p className="sns-text-soft" style={{ marginBottom: '0.4rem' }}>Netlify, Site configuration, Environment variables. Then deploy the site again.</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {['SUPABASE_SERVICE_ROLE_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'].map((name) => (
                  <li key={name}><span className="sns-mono">{name}</span>{missing.includes(name) ? <strong style={{ color: 'var(--danger)' }}> · missing</strong> : null}</li>
                ))}
              </ul>
              <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginTop: '0.4rem' }}>The business account ID is only used by this check. The app secret and verify token are for delivery updates.</p>
            </div>
          </details>
          <details style={{ marginBottom: '0.6rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>2. The message template in Meta</summary>
            <div style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
              <p className="sns-text-soft" style={{ marginBottom: '0.4rem' }}>WhatsApp Manager, Message templates, Create template. Enter it exactly like this. Meta usually approves it within minutes to a day.</p>
              <Field label="Name" value={t.name} copy />
              <Field label="Language" value="English (en)" />
              <Field label="Category" value="Utility" />
              <Field label="Header" value="Document (a PDF). For the sample, upload any PDF." />
              <Field label="Body" value={t.body} copy />
              <Field label="Footer" value={t.footer} copy />
              {t.samples.map((sample, i) => <Field key={i} label={`Sample for {{${i + 1}}} (${t.fields[i]})`} value={sample} copy />)}
            </div>
          </details>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>3. Delivery updates (Sent, Delivered, Read)</summary>
            <div style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
              <p className="sns-text-soft" style={{ marginBottom: '0.4rem' }}>Meta for Developers, your app, WhatsApp, Configuration, Webhook. Without this, receipts still go out, but they stay at "Accepted by WhatsApp".</p>
              <Field label="Callback URL" value={webhookUrl} copy />
              <Field label="Verify token" value="The same text you set as WHATSAPP_VERIFY_TOKEN" />
              <Field label="Subscribe to" value="messages" />
              <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginTop: '0.4rem' }}>{status && status.webhookReady ? 'The two settings for delivery updates are filled in.' : 'The app secret and the verify token are not both filled in yet.'}</p>
            </div>
          </details>
          <p className="sns-text-faint" style={{ fontSize: '0.76rem', marginTop: '1rem' }}>The full step-by-step guide is in WHATSAPP-SETUP.md in the project.</p>
        </div>
      </div>
    </div>
  )
}
