import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { FormField, ErrorBanner, SuccessBanner } from './shared'

export function AuthLayout({ children }) {
  return (
    <div className="sns-shell">
      <div className="flex flex-col sm:flex-row" style={{ minHeight: '100vh' }}>
        <div className="w-full sm:w-2/5 flex flex-col justify-between p-8 sm:p-10" style={{ background: 'var(--ink)', color: 'white' }}>
          <div className="flex items-center gap-3">
            <div className="sns-brand-mark">SNS</div>
            <div>
              <p className="sns-display" style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.15 }}>Swahili Net Solution</p>
              <p className="sns-eyebrow" style={{ color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Job Card System</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <p className="sns-display" style={{ fontSize: '1.7rem', lineHeight: 1.3, fontWeight: 600, marginBottom: '0.75rem' }}>
              Every site visit,<br />logged and accounted for.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '22rem' }}>
              File job cards from the field, track transport costs, and give the office a clean paper trail — digitally.
            </p>
          </div>
          <div className="sns-eyebrow" style={{ color: 'rgba(255,255,255,0.4)' }}>Internal tool · Members &amp; Admin</div>
        </div>
        <div className="w-full sm:w-3/5 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full sns-fade-in" style={{ maxWidth: '26rem' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoginView({ onLogin, onSwitch, onForgot, error, notice }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting || !email.trim() || !password) return
    setSubmitting(true)
    await onLogin(email.trim(), password)
    setSubmitting(false)
  }

  return (
    <AuthLayout>
      <h2 className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Welcome back</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: '1.5rem' }}>Log in to your job card portal.</p>
      {notice && <SuccessBanner message={notice} />}
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="sns-input" placeholder="you@example.com" autoComplete="email" />
        </FormField>
        <FormField label="Password">
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="sns-input" style={{ paddingRight: '2.5rem' }} autoComplete="current-password" />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)' }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </FormField>
        <div className="flex justify-end">
          <button type="button" onClick={onForgot} className="sns-btn-link">Forgot password?</button>
        </div>
        <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ width: '100%', marginTop: '0.25rem' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginTop: '1.5rem', textAlign: 'center' }}>
        Don't have an account?{' '}
        <button onClick={onSwitch} style={{ background: 'none', border: 'none', color: 'var(--signal-deep)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Sign up</button>
      </p>
    </AuthLayout>
  )
}

export function SignupView({ onSignup, onSwitch, error }) {
  const [form, setForm] = useState({ fullName: '', username: '', email: '', contact: '', password: '', confirmPassword: '', title: '' })
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }))
  }

  function validate() {
    const fe = {}
    if (!form.fullName.trim()) fe.fullName = 'Full name is required.'
    if (!form.username.trim()) fe.username = 'Username is required.'
    else if (!/^[a-zA-Z0-9_.]{3,20}$/.test(form.username.trim())) fe.username = '3–20 characters: letters, numbers, underscore, dot.'
    if (!form.email.trim()) fe.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fe.email = 'Enter a valid email address.'
    if (!form.contact.trim()) fe.contact = 'Contact number is required.'
    else if (!/^(\+?254|0)\d{9}$/.test(form.contact.replace(/\s/g, ''))) fe.contact = 'Enter a valid Kenyan number, e.g. 0712 345 678.'
    if (!form.password) fe.password = 'Password is required.'
    else if (form.password.length < 6) fe.password = 'At least 6 characters.'
    if (form.confirmPassword !== form.password) fe.confirmPassword = 'Passwords do not match.'
    setFieldErrors(fe)
    return Object.keys(fe).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    await onSignup(form)
    setSubmitting(false)
  }

  return (
    <AuthLayout>
      <h2 className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Create your account</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: '1.5rem' }}>Join the Swahili Net Solution job card system.</p>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Full name" error={fieldErrors.fullName}>
          <input className="sns-input" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="e.g. Jane Kamau" />
        </FormField>
        <FormField label="Username" error={fieldErrors.username} hint="Shown on job cards as who filed them.">
          <input className="sns-input" value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="e.g. jkamau" autoComplete="username" />
        </FormField>
        <FormField label="Email" error={fieldErrors.email} hint="Used to log in and for password resets.">
          <input type="email" className="sns-input" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </FormField>
        <FormField label="Contact number" error={fieldErrors.contact} hint="We'll use this to reach you about jobs.">
          <input className="sns-input" value={form.contact} onChange={(e) => update('contact', e.target.value)} placeholder="e.g. 0712 345 678" />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Password" error={fieldErrors.password}>
            <input type="password" className="sns-input" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" />
          </FormField>
          <FormField label="Confirm password" error={fieldErrors.confirmPassword}>
            <input type="password" className="sns-input" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} autoComplete="new-password" />
          </FormField>
        </div>
        <FormField label="Title (optional)" hint="e.g. Director, Operations Manager — relevant if you end up as an admin.">
          <input className="sns-input" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Director" />
        </FormField>
        <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ width: '100%', marginTop: '0.25rem' }}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginTop: '1rem', textAlign: 'center', lineHeight: 1.5 }}>
        The very first account created becomes the admin automatically. Everyone after that starts as a Member — admins can promote teammates from the Team tab.
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginTop: '1rem', textAlign: 'center' }}>
        Already have an account?{' '}
        <button onClick={onSwitch} style={{ background: 'none', border: 'none', color: 'var(--signal-deep)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Log in</button>
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordView({ onRequestReset, onSwitch, error }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting || !email.trim()) return
    setSubmitting(true)
    const ok = await onRequestReset(email.trim())
    setSubmitting(false)
    if (ok) setSent(true)
  }

  return (
    <AuthLayout>
      <h2 className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Reset your password</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: '1.5rem' }}>We'll email you a link to set a new one.</p>
      {error && <ErrorBanner message={error} />}
      {sent ? (
        <div className="sns-card" style={{ padding: '1rem', background: 'var(--confirmed-pale)', border: 'none' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--confirmed)' }}>Check your inbox at <strong>{email}</strong> for a reset link.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="sns-input" placeholder="you@example.com" autoComplete="email" />
          </FormField>
          <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ width: '100%' }}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginTop: '1.5rem', textAlign: 'center' }}>
        <button onClick={onSwitch} style={{ background: 'none', border: 'none', color: 'var(--signal-deep)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Back to log in</button>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordView({ onResetPassword, error }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setFieldError('At least 6 characters.'); return }
    if (password !== confirmPassword) { setFieldError('Passwords do not match.'); return }
    setFieldError('')
    setSubmitting(true)
    await onResetPassword(password)
    setSubmitting(false)
  }

  return (
    <AuthLayout>
      <h2 className="sns-display" style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>Set a new password</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-faint)', marginBottom: '1.5rem' }}>Choose a new password for your account.</p>
      {error && <ErrorBanner message={error} />}
      {fieldError && <ErrorBanner message={fieldError} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="New password">
          <input type="password" className="sns-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm new password">
          <input type="password" className="sns-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <button type="submit" disabled={submitting} className="sns-btn-primary" style={{ width: '100%' }}>
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthLayout>
  )
}
