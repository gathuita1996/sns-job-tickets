import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardPaste, Copy, Download, ExternalLink, FileText, Info, Loader2, Maximize2, MessageCircle, RefreshCw } from 'lucide-react'
import ReceiptPreview from './ReceiptPreview'
import MessageStatus from './MessageStatus'
import { FormField } from './shared'
import { parseMpesaMessage } from '../lib/mpesa'
import { addDaysToKey, eatDateKey, endOfDayKey, formatDayKey, formatEatDate, formatEatDateTime, formatEatTime } from '../lib/eat'
import { SUBSCRIPTION_DAYS, describeSubscription, groupReceipts, subscriptionOf, suggestExpiry } from '../lib/subscription'
import { formatWhatsappNumber, whatsappNumber } from '../lib/phone'
import { openPendingWindow } from '../lib/whatsapp'
import { MAX_EXPIRY_DAYS, buildWhatsAppMessage, checkExpiry, checkReceiptNo, customerDisplayName, issueReceipt, namesAlike, planReceiptFile, receiptModel, suggestReceiptNo, whatsappUrl } from '../lib/receipts'
import { formatReceiptMoney, receiptFileName } from '../lib/receiptText'
import { RECEIPT_TEMPLATE, renderTemplate, templateParams } from '../lib/whatsappTemplate'
import { sendReceiptViaApi } from '../lib/whatsappApi'
import { messagesByReceipt } from '../lib/receiptMessages'

const STEPS = [['paste', 'Paste message'], ['check', 'Check details'], ['send', 'Send']]
const LOGGED = ['accepted', 'sent', 'delivered', 'read']          // stages of the message log that mean WhatsApp took the message
const FAR_DAYS = 100                                              // an expiry date further than this after the payment is questioned

// Sending a receipt to one customer, on its own full screen: paste the M-Pesa message -> Submit -> check what was read and
// the expiry date -> OK -> see the receipt and the WhatsApp message -> Send.
// Pressing Send makes the receipt, keeps a copy and records it (which is what makes the customer Active until the expiry
// date). Then, when automatic sending is set up, the receipt goes to the customer from the business WhatsApp number; when it
// is not (or the person chooses so), WhatsApp opens with the message ready and they press Send there.
//   customer : the customer
//   receipts : every receipt sent so far (for the next invoice number, the days a customer still has left, and to catch the same payment twice)
//   messages : the WhatsApp message log (rows of receipt_messages), so delivery shows up live
//   whatsapp : is automatic sending set up? (useWhatsappStatus) -- null while that is still being asked
//   client   : the database client
//   onSent   : called after a receipt was saved, so the lists on the page refresh
//   onRefreshMessages : load the message log again
//   onClose  : leave this screen
export default function SendReceipt({ customer, receipts, messages = [], whatsapp = null, client, onSent, onRefreshMessages, onClose }) {
  const name = customerDisplayName(customer)
  const number = useMemo(() => whatsappNumber(customer.contact), [customer.contact])
  const apiReady = Boolean(whatsapp && whatsapp.available && whatsapp.configured)
  const [stage, setStage] = useState('paste')            // paste | check | send | done
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [payment, setPayment] = useState(null)
  const [receiptNo, setReceiptNo] = useState('')
  const [noError, setNoError] = useState('')
  const [expiresOn, setExpiresOn] = useState('')         // the date the subscription runs through, "2026-12-21"
  const [suggestion, setSuggestion] = useState(null)     // what suggestExpiry worked out for this payment
  const [expiryError, setExpiryError] = useState('')
  const [plan, setPlan] = useState(null)                 // where the PDF will be kept and the link to it
  const [byHand, setByHand] = useState(false)            // the person chose to open WhatsApp themselves even though sending is automatic
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')
  const [result, setResult] = useState(null)             // { receipt, link, filePath, manualUrl, message, mode: 'api' | 'manual', opened, api }
  const [copied, setCopied] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [zoom, setZoom] = useState(false)                // the receipt shown larger
  const headingRef = useRef(null)
  const textRef = useRef(null)
  const zoomBtnRef = useRef(null)
  const wasZoomed = useRef(false)
  const alive = useRef(true)
  const sending = useRef(false)                           // a send or a retry is under way: set at once, where `busy` only changes after the next redraw
  const canReadClipboard = typeof navigator !== 'undefined' && Boolean(navigator.clipboard && navigator.clipboard.readText)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [])
  // Escape closes the larger receipt first, and only then leaves the screen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { if (zoom) setZoom(false); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose, zoom])
  // when the larger receipt is closed, the keyboard goes back to the button that opened it
  useEffect(() => {
    if (zoom) wasZoomed.current = true
    else if (wasZoomed.current) { wasZoomed.current = false; if (zoomBtnRef.current) zoomBtnRef.current.focus() }
  }, [zoom])
  useEffect(() => { if (stage === 'paste' && textRef.current) textRef.current.focus(); else if (headingRef.current) headingRef.current.focus() }, [stage])
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  const mine = useMemo(() => groupReceipts(receipts).get(customer.id) || [], [receipts, customer.id])

  function submitMessage() {
    const parsed = parseMpesaMessage(text, { now: new Date() })
    if (!parsed.ok) { setError(parsed.error); return }
    const dup = (receipts || []).find((r) => String(r.mpesaCode).toUpperCase() === parsed.payment.code)
    if (dup) { setError(`A receipt has already been sent for this M-Pesa payment (${parsed.payment.code}): invoice no. ${dup.receiptNo}, to ${dup.customerName}, paid ${formatEatDateTime(dup.paidAt)}.`); return }
    setError('')
    setPayment(parsed.payment)
    setReceiptNo(suggestReceiptNo(parsed.payment.paidAt, receipts))
    setNoError('')
    // the expiry date: 30 days after the payment, or after what the customer still had left when they paid again early
    const s = suggestExpiry({ paidAt: parsed.payment.paidAt, days: SUBSCRIPTION_DAYS, receipts: mine })
    setSuggestion(s); setExpiresOn(s.key); setExpiryError('')
    setStage('check')
  }

  async function pasteFromClipboard() {
    try { const t = await navigator.clipboard.readText(); if (t) { setText(t); setError('') } else setError('The clipboard is empty. Copy the M-Pesa message first.') }
    catch { setError('The browser did not allow pasting from the clipboard. Press and hold in the box and choose Paste (or press Ctrl+V).') }
  }

  function confirmDetails() {
    let good = true
    const chk = checkReceiptNo(receiptNo)
    if (!chk.ok) { setNoError(chk.error); good = false }
    else {
      const clash = (receipts || []).find((r) => String(r.receiptNo).toLowerCase() === chk.value.toLowerCase())
      if (clash) { setNoError(`Invoice number ${chk.value} was already used (for ${clash.customerName}). Use a different number.`); good = false }
    }
    const exp = checkExpiry(payment.paidAt, expiresOn)
    if (!exp.ok) { setExpiryError(exp.error); good = false }
    if (!good) return
    setReceiptNo(chk.value); setNoError(''); setExpiryError('')
    setPlan(planReceiptFile(client, chk.value))
    setSendError('')
    setStage('send')
  }

  const sendsAutomatically = apiReady && !byHand
  const message = useMemo(() => (payment && plan ? buildWhatsAppMessage({ firstName: customer.firstName, amount: payment.amount, code: payment.code, paidAt: payment.paidAt, receiptNo, days: SUBSCRIPTION_DAYS, expiresOn, link: plan.link }) : ''), [payment, plan, receiptNo, customer.firstName, expiresOn])
  const model = useMemo(() => (payment ? receiptModel({ customerName: name, paidAt: payment.paidAt, amount: payment.amount, code: payment.code, receiptNo: receiptNo || '—', days: SUBSCRIPTION_DAYS, expiresOn: expiresOn || undefined }) : null), [payment, name, receiptNo, expiresOn])
  // what the customer reads when it goes out automatically: the approved template with its blanks filled in
  const templateText = useMemo(() => (payment ? renderTemplate(templateParams({ firstName: customer.firstName, amount: payment.amount, code: payment.code, paidAt: payment.paidAt, receiptNo, expiresOn })) : ''), [payment, customer.firstName, receiptNo, expiresOn])

  function refreshLog() {
    try { const p = onRefreshMessages && onRefreshMessages(); if (p && typeof p.catch === 'function') p.catch(() => {}) } catch { /* the log refreshes by itself when it changes */ }
  }

  // sends a receipt that is saved, through the WhatsApp Business API; the screen shows each stage of it
  async function deliver(receipt, filePath) {
    setResult((r) => (r ? { ...r, api: { state: 'sending' } } : r))
    const r = await sendReceiptViaApi(client, { receiptId: receipt.id, filePath, to: number })
    if (!alive.current) return
    setResult((cur) => (cur ? { ...cur, api: r.ok ? { state: 'sent', at: new Date().toISOString(), ...r } : { state: 'failed', ...r } } : cur))
    refreshLog()
  }

  async function send() {
    if (sending.current || busy || !number) return
    sending.current = true
    setBusy(true); setSendError('')
    const automatic = sendsAutomatically
    const waiting = automatic ? null : openPendingWindow()      // opened now, inside the click, or the browser would block it
    try {
      const out = await issueReceipt({ client, customer, payment, receiptNo, expiresOn, file: plan })
      const url = whatsappUrl(number, message)
      let made = ''
      try { made = URL.createObjectURL(new Blob([out.pdf], { type: 'application/pdf' })) } catch { made = '' }
      if (!alive.current) { if (made) URL.revokeObjectURL(made); return }
      setPdfUrl(made)
      const base = { receipt: out.receipt, link: plan.link, filePath: plan.path, manualUrl: url, message }
      if (automatic) {
        setResult({ ...base, mode: 'api', api: { state: 'sending' } })
        setStage('done')
        if (onSent) onSent(out.receipt)
        await deliver(out.receipt, plan.path)
      } else {
        const opened = waiting.go(url)
        setResult({ ...base, mode: 'manual', opened })
        setStage('done')
        if (onSent) onSent(out.receipt)
      }
    } catch (e) {
      if (waiting) waiting.close()
      if (alive.current) setSendError((e && e.message) || 'The receipt could not be sent. Please try again.')
    } finally {
      sending.current = false
      if (alive.current) setBusy(false)
    }
  }

  async function retryDelivery() {
    if (sending.current || busy || !result) return
    sending.current = true
    setBusy(true)
    try { await deliver(result.receipt, result.filePath) } finally { sending.current = false; if (alive.current) setBusy(false) }
  }

  async function copyMessage() {
    try { await navigator.clipboard.writeText(result.message); setCopied(true); setTimeout(() => { if (alive.current) setCopied(false) }, 2500) } catch { /* the message is on the screen to copy by hand */ }
  }

  // ---- what to warn about on the "check" step ------------------------------------------------------------------------
  const now = new Date()
  const checkedExpiry = payment ? checkExpiry(payment.paidAt, expiresOn) : null
  const daysAfter = checkedExpiry && checkedExpiry.ok ? checkedExpiry.days : null
  const firstName = String(customer.firstName || '').trim()
  const subject = firstName || 'The customer'              // for the start of a sentence
  const person = firstName || 'this customer'              // in the middle of one
  const warnings = []
  if (stage === 'check' && payment) {
    if (!namesAlike(name, payment.payerName)) warnings.push({ key: 'payer', tone: 'warn', text: `The message says this was paid by ${payment.payerName}, who is not named like ${name}. That is fine if someone paid on their behalf. Just make sure this is the right customer.` })
    if (suggestion && suggestion.carried) warnings.push({ key: 'carried', tone: 'info', text: `${subject} still had ${suggestion.leftDays} ${suggestion.leftDays === 1 ? 'day' : 'days'} left (their subscription ran until ${formatDayKey(suggestion.previousKey)}), so the new ${SUBSCRIPTION_DAYS} days start from then and end on ${formatDayKey(suggestion.key)}. Change the date below if that is not right.` })
    else if (mine.length === 0) warnings.push({ key: 'first', tone: 'info', text: `No earlier receipt for ${person} is in this system. If they paid early and still had days left from before, choose the date their old subscription would have run out, plus ${SUBSCRIPTION_DAYS} days.` })
    if (daysAfter != null && endOfDayKey(expiresOn).getTime() <= now.getTime()) warnings.push({ key: 'past', tone: 'warn', text: `This expiry date has already passed, so ${firstName || 'the customer'} would stay Inactive. Check the date, and that you pasted the right message.` })
    else if (daysAfter != null && daysAfter < SUBSCRIPTION_DAYS) warnings.push({ key: 'short', tone: 'warn', text: `That is only ${daysAfter} ${daysAfter === 1 ? 'day' : 'days'} after the payment, but the receipt says the subscription is valid for ${SUBSCRIPTION_DAYS} days. Check the date.` })
    else if (daysAfter != null && daysAfter > FAR_DAYS) warnings.push({ key: 'far', tone: 'warn', text: `That is ${daysAfter} days after the payment, much longer than ${SUBSCRIPTION_DAYS}. Check the year and the month.` })
  }

  const stepIndex = stage === 'done' ? STEPS.length : STEPS.findIndex(([k]) => k === stage)
  const heading = { paste: 'Paste the M-Pesa message', check: 'Check the details', send: 'Send the receipt', done: 'Receipt saved' }[stage]
  const resultSub = result ? subscriptionOf([result.receipt, ...mine], new Date()) : null
  const sentLog = result ? (messagesByReceipt(messages).get(result.receipt.id) || [])[0] : null
  const api = result && result.mode === 'api' ? result.api : null
  // the log can show that WhatsApp took the message even when this screen never heard back (a dropped connection)
  const wentOut = Boolean(api && (api.state === 'sent' || (api.state === 'failed' && api.unknown && sentLog && LOGGED.includes(sentLog.status))))
  const shownLog = sentLog || (api && api.state === 'sent' ? { id: 'local', receiptId: result.receipt.id, status: 'accepted', createdAt: api.at, updatedAt: api.at } : null)
  const paymentDay = payment ? eatDateKey(payment.paidAt) : ''

  return (
    <div className="no-print" role="dialog" aria-modal="true" aria-labelledby="send-receipt-title" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--paper)', color: 'var(--ink)', overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--card)', borderBottom: '1px solid var(--line)' }}>
        <div className="flex items-center gap-2" style={{ maxWidth: '44rem', margin: '0 auto', padding: '0.7rem 1rem' }}>
          <button type="button" className="sns-icon-btn" onClick={onClose} disabled={busy} aria-label="Close and go back to customers" title="Back to customers"><ArrowLeft size={18} /></button>
          <div style={{ minWidth: 0 }}>
            <p id="send-receipt-title" className="sns-display" style={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>Send receipt</p>
            <p className="sns-text-soft" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '44rem', margin: '0 auto', padding: '1.1rem 1rem 3rem' }}>
        <ol aria-label="Steps" className="flex items-center" style={{ gap: '0.4rem', listStyle: 'none', padding: 0, margin: '0 0 1.1rem', flexWrap: 'wrap' }}>
          {STEPS.map(([key, label], i) => {
            const done = i < stepIndex, here = i === stepIndex
            return (
              <li key={key} aria-current={here ? 'step' : undefined} className="flex items-center gap-2" style={{ fontSize: '0.76rem', fontWeight: 600, color: here ? 'var(--signal-deep)' : done ? 'var(--confirmed)' : 'var(--ink-faint)' }}>
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', background: here ? 'var(--signal)' : done ? 'var(--confirmed-pale)' : 'var(--line-soft)', color: here ? '#fff' : done ? 'var(--confirmed)' : 'var(--ink-faint)' }}>{done ? <Check size={12} /> : i + 1}</span>
                {label}{i < STEPS.length - 1 && <span aria-hidden="true" className="sns-text-faint" style={{ margin: '0 0.15rem' }}>›</span>}
              </li>
            )
          })}
        </ol>

        <h2 ref={headingRef} tabIndex={-1} className="sns-display" style={{ fontWeight: 700, fontSize: '1.15rem', marginBottom: '0.35rem', outline: 'none' }}>{heading}</h2>

        {/* ---- 1. paste -------------------------------------------------------------------------------------------- */}
        {stage === 'paste' && (
          <div>
            <p className="sns-text-soft" style={{ fontSize: '0.86rem', marginBottom: '0.9rem' }}>
              Copy the payment message from M-Pesa and paste it below exactly as it came. The date and time of the payment on the receipt are taken from it.
            </p>
            {!number && <NoNumber contact={customer.contact} />}
            <FormField label="M-Pesa message" htmlFor="receipt-mpesa-message" error={error ? <span role="alert">{error}</span> : ''}>
              <textarea id="receipt-mpesa-message" ref={textRef} className="sns-input" rows={6} value={text} onChange={(e) => { setText(e.target.value); if (error) setError('') }}
                placeholder="UKL41383DB Confirmed. KES 2,000.00 received from … for account … on 21/11/26 at 05:50 PM."
                aria-invalid={error ? 'true' : undefined} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.82rem', resize: 'vertical' }} />
            </FormField>
            <div className="flex items-center gap-2" style={{ marginTop: '0.9rem', flexWrap: 'wrap' }}>
              <button type="button" className="sns-btn-primary" onClick={submitMessage} disabled={!text.trim()}>Submit</button>
              {canReadClipboard && <button type="button" className="sns-btn-secondary" onClick={pasteFromClipboard}><ClipboardPaste size={15} /> Paste from clipboard</button>}
            </div>
          </div>
        )}

        {/* ---- 2. check what was read, and the expiry date ----------------------------------------------------------------- */}
        {stage === 'check' && payment && (
          <div>
            <p className="sns-text-soft" style={{ fontSize: '0.86rem', marginBottom: '0.9rem' }}>This is what was read from the message. If anything is wrong, go back and paste the message again.</p>
            <div className="sns-card" style={{ padding: '0.4rem 1.1rem', marginBottom: '0.9rem' }}>
              <Row label="Customer" value={name} />
              <Row label="M-Pesa code" value={payment.code} mono />
              <Row label="Amount paid" value={formatReceiptMoney(payment.amount)} strong />
              <Row label="Date and time paid" value={`${formatEatDate(payment.paidAt)} at ${formatEatTime(payment.paidAt)}`} strong hint="Kenya time, taken from the message" />
              {payment.payerName && <Row label="Paid by" value={payment.payerName} />}
              {payment.account && <Row label="Account number" value={payment.account} />}
              <Row label="Subscription" value={expiresOn && formatDayKey(expiresOn) ? `${SUBSCRIPTION_DAYS} days, expires on ${formatDayKey(expiresOn)}` : `${SUBSCRIPTION_DAYS} days`} last />
            </div>
            {warnings.map((w) => <Notice key={w.key} tone={w.tone}>{w.text}</Notice>)}
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              <FormField label="Subscription expires on" htmlFor="receipt-expiry" error={expiryError ? <span role="alert">{expiryError}</span> : ''}
                hint="The customer stays Active through the end of this day (Kenya time). It is worked out from the payment; change it only when they still had days left from before, or for any other reason you know of.">
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  <input id="receipt-expiry" type="date" className="sns-input" value={expiresOn} onChange={(e) => { setExpiresOn(e.target.value); if (expiryError) setExpiryError('') }}
                    min={addDaysToKey(paymentDay, 1) || undefined} max={addDaysToKey(paymentDay, MAX_EXPIRY_DAYS) || undefined} aria-invalid={expiryError ? 'true' : undefined} style={{ maxWidth: '12rem' }} />
                  {daysAfter != null && <span className="sns-text-soft" style={{ fontSize: '0.8rem' }}>{daysAfter} {daysAfter === 1 ? 'day' : 'days'} after the payment</span>}
                  {suggestion && expiresOn !== suggestion.key && <button type="button" className="sns-btn-link" onClick={() => { setExpiresOn(suggestion.key); setExpiryError('') }}>Use the suggested date ({formatDayKey(suggestion.key)})</button>}
                </div>
              </FormField>
              <FormField label="Invoice number" htmlFor="receipt-invoice-no" error={noError ? <span role="alert">{noError}</span> : ''} hint="Suggested: the next number after the last one used (the last part counts up with every invoice, the middle part is the year). Change it only if you need to.">
                <input id="receipt-invoice-no" className="sns-input" value={receiptNo} onChange={(e) => { setReceiptNo(e.target.value); if (noError) setNoError('') }} maxLength={30} inputMode="text" autoComplete="off" aria-invalid={noError ? 'true' : undefined} style={{ maxWidth: '12rem' }} />
              </FormField>
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: '1.1rem', flexWrap: 'wrap' }}>
              <button type="button" className="sns-btn-secondary" onClick={() => setStage('paste')}>Back</button>
              <button type="button" className="sns-btn-primary" onClick={confirmDetails}><Check size={15} /> OK</button>
            </div>
          </div>
        )}

        {/* ---- 3. the receipt and the message, then Send ----------------------------------------------------------------- */}
        {stage === 'send' && payment && plan && model && (
          <div>
            <p className="sns-text-soft" style={{ fontSize: '0.86rem', marginBottom: '0.9rem' }}>
              {sendsAutomatically ? 'This is the receipt and the message that will be sent to the customer on WhatsApp. Check them, then press Send on WhatsApp.' : 'This is the receipt and the message that will open in WhatsApp. Check them, then press Send.'}
            </p>
            {!number && <NoNumber contact={customer.contact} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1rem', alignItems: 'start' }}>
              <div>
                <ReceiptPreview model={model} />
                <button ref={zoomBtnRef} type="button" className="sns-btn-link sns-link-icon" onClick={() => setZoom(true)} aria-haspopup="dialog" style={{ marginTop: '0.55rem', fontSize: '0.8rem' }}><Maximize2 size={13} aria-hidden="true" /> View full size</button>
              </div>
              <div>
                <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.3rem' }}>To</p>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.8rem' }}>{name}{number && <span className="sns-text-soft" style={{ fontWeight: 400 }}> · WhatsApp {formatWhatsappNumber(number)}</span>}</p>
                <p className="sns-eyebrow sns-text-faint" style={{ marginBottom: '0.3rem' }}>Message</p>
                {sendsAutomatically ? (
                  <div style={{ background: 'var(--confirmed-pale)', borderRadius: 10, padding: '0.8rem 0.9rem' }}>
                    <p className="flex items-center gap-2" style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.5rem', overflowWrap: 'anywhere' }}><FileText size={14} aria-hidden="true" style={{ flexShrink: 0 }} /> {receiptFileName(receiptNo)}</p>
                    <pre aria-label="WhatsApp message" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>{templateText}</pre>
                    <p className="sns-text-faint" style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}>{RECEIPT_TEMPLATE.footer}</p>
                  </div>
                ) : (
                  <pre aria-label="WhatsApp message" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', fontFamily: "'IBM Plex Sans', sans-serif", fontSize: '0.82rem', lineHeight: 1.5, background: 'var(--confirmed-pale)', borderRadius: 10, padding: '0.8rem 0.9rem', margin: 0 }}>{message}</pre>
                )}
                <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginTop: '0.5rem' }}>
                  {sendsAutomatically ? 'It is sent from the business WhatsApp number, with the receipt attached as a PDF.' : 'The receipt is attached as a PDF link in the message.'}
                </p>
                {apiReady && (
                  <button type="button" className="sns-btn-link" style={{ marginTop: '0.4rem' }} onClick={() => setByHand((v) => !v)}>
                    {byHand ? 'Send automatically instead' : 'Open WhatsApp myself instead'}
                  </button>
                )}
                {whatsapp && whatsapp.available && !whatsapp.configured && (
                  <p className="sns-text-faint" style={{ fontSize: '0.74rem', marginTop: '0.5rem' }}>Automatic sending is not set up yet, so WhatsApp will open for you to press Send. (Customers tab, “Set up WhatsApp sending”.)</p>
                )}
              </div>
            </div>
            {sendError && <div role="alert" className="flex items-start gap-2" style={{ background: 'var(--danger-pale)', color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginTop: '1rem' }}><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /><span>{sendError}</span></div>}
            <div className="flex items-center gap-2" style={{ marginTop: '1.1rem', flexWrap: 'wrap' }}>
              <button type="button" className="sns-btn-secondary" onClick={() => setStage('check')} disabled={busy}>Back</button>
              <button type="button" className="sns-btn-primary" onClick={send} disabled={busy || !number}><MessageCircle size={16} /> {busy ? 'Sending…' : sendsAutomatically ? 'Send on WhatsApp' : 'Send'}</button>
            </div>
          </div>
        )}

        {/* ---- the receipt, larger (on a phone the page can be moved around inside this window) ---------------------------------- */}
        {zoom && model && (
          <div role="dialog" aria-modal="true" aria-label={`Receipt ${model.receiptNo}, full size`} onClick={() => setZoom(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(12,22,32,0.88)', overflow: 'auto', padding: '0.8rem' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: 'none', margin: '0 auto' }}>
              <div style={{ position: 'sticky', left: 0, display: 'flex', justifyContent: 'flex-start', marginBottom: '0.6rem' }}>
                <button type="button" className="sns-btn-primary" autoFocus onClick={() => setZoom(false)}>Close</button>
              </div>
              <ReceiptPreview model={model} />
            </div>
          </div>
        )}

        {/* ---- 4. done ------------------------------------------------------------------------------------------------------ */}
        {stage === 'done' && result && (
          <div>
            <div className="sns-card" style={{ padding: '1.3rem', marginBottom: '1rem' }}>
              <div className="flex items-start gap-3">
                {api && api.state === 'sending' ? <Loader2 size={28} className="sns-spin" style={{ color: 'var(--signal)', flexShrink: 0 }} aria-hidden="true" />
                  : api && !wentOut ? <AlertTriangle size={28} style={{ color: api.unknown ? 'var(--stamp-deep)' : 'var(--danger)', flexShrink: 0 }} aria-hidden="true" />
                    : <CheckCircle2 size={28} style={{ color: 'var(--confirmed)', flexShrink: 0 }} aria-hidden="true" />}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Receipt {result.receipt.receiptNo} is saved.</p>
                  {!api && (
                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-soft)' }}>
                      {result.opened
                        ? <>WhatsApp has opened with the receipt ready for {name} ({formatWhatsappNumber(number)}). <strong>Press Send in WhatsApp</strong> to deliver it.</>
                        : <>Your browser did not open the WhatsApp window. Press <strong>Open WhatsApp</strong> below, then press Send in WhatsApp to deliver the receipt.</>}
                    </p>
                  )}
                  {api && api.state === 'sending' && <p role="status" style={{ fontSize: '0.86rem', color: 'var(--ink-soft)' }}>Sending it to {name} on WhatsApp…</p>}
                  {wentOut && (
                    <div style={{ fontSize: '0.86rem', color: 'var(--ink-soft)' }}>
                      <p role="status" style={{ marginBottom: '0.5rem' }}>It was sent to {name} on WhatsApp ({formatWhatsappNumber(api.state === 'sent' && api.to ? api.to : number)}).</p>
                      {shownLog && <MessageStatus message={shownLog} webhookReady={whatsapp ? whatsapp.webhookReady : true} detail="always" />}
                      {api.state === 'sent' && api.recorded === false && <p className="sns-text-faint" style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>It went out, but it could not be written to the message log, so its delivery will not show here.</p>}
                    </div>
                  )}
                  {api && api.state === 'failed' && !wentOut && (
                    <div role="alert" style={{ fontSize: '0.86rem' }}>
                      <p style={{ fontWeight: 600, color: api.unknown ? 'var(--stamp-deep)' : 'var(--danger)', marginBottom: '0.25rem' }}>{api.unknown ? 'It is not certain that the WhatsApp message was sent.' : 'The WhatsApp message was not sent.'}</p>
                      <p style={{ color: 'var(--ink-soft)' }}>{api.message}</p>
                      <p className="sns-text-faint" style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>The receipt itself is saved, and the customer is Active until its expiry date.</p>
                    </div>
                  )}
                  {resultSub && (
                    <p style={{ fontSize: '0.86rem', marginTop: '0.7rem' }}>
                      <span className={`sns-badge ${resultSub.active ? 'sns-badge-done' : 'sns-badge-pending'}`}>{resultSub.active ? 'Active' : 'Inactive'}</span>{' '}
                      <span className="sns-text-soft">{describeSubscription(resultSub, new Date())}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
              {!api && <a className="sns-btn-primary" href={result.manualUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><ExternalLink size={15} /> Open WhatsApp</a>}
              {api && api.state === 'failed' && !wentOut && api.retry && <button type="button" className="sns-btn-primary" onClick={retryDelivery} disabled={busy}><RefreshCw size={15} /> {api.unknown ? 'Send again anyway' : 'Try again'}</button>}
              {api && api.state === 'failed' && !wentOut && api.unknown && onRefreshMessages && <button type="button" className="sns-btn-secondary" onClick={refreshLog}><RefreshCw size={15} /> Check status</button>}
              {api && api.state === 'failed' && !wentOut && <a className="sns-btn-secondary" href={result.manualUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><ExternalLink size={15} /> Open WhatsApp instead</a>}
              {pdfUrl && <a className="sns-btn-secondary" href={pdfUrl} download={receiptFileName(result.receipt.receiptNo)} style={{ textDecoration: 'none' }}><Download size={15} /> Download PDF</a>}
              {(!api || (api.state === 'failed' && !wentOut)) && <button type="button" className="sns-btn-secondary" onClick={copyMessage}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy message'}</button>}
              <button type="button" className="sns-btn-secondary" onClick={onClose} disabled={busy}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, strong, mono, hint, last }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: '1rem', padding: '0.65rem 0', borderBottom: last ? 'none' : '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
      <span className="sns-text-faint" style={{ fontSize: '0.84rem' }}>{label}</span>
      <span style={{ textAlign: 'right', fontWeight: strong ? 700 : 600, fontSize: '0.88rem', fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined, overflowWrap: 'anywhere' }}>
        {value}
        {hint && <span className="sns-text-faint" style={{ display: 'block', fontWeight: 400, fontSize: '0.72rem' }}>{hint}</span>}
      </span>
    </div>
  )
}

function Notice({ tone, children }) {
  const warn = tone === 'warn'
  const Icon = warn ? AlertTriangle : Info
  return (
    <div role={warn ? 'alert' : 'note'} className="flex items-start gap-2" style={{ background: warn ? 'var(--stamp-pale)' : 'var(--signal-pale)', color: warn ? 'var(--stamp-deep)' : 'var(--signal-deep)', fontSize: '0.84rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '0.9rem' }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function NoNumber({ contact }) {
  return (
    <div role="alert" className="flex items-start gap-2" style={{ background: 'var(--danger-pale)', color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 9, padding: '0.7rem 0.85rem', marginBottom: '0.9rem' }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <span>There is no usable WhatsApp number for this customer{contact ? ` ("${contact}")` : ''}. Close this screen, press the pencil on the customer to fix the phone number, then send the receipt again.</span>
    </div>
  )
}
