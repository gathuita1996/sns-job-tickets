// What the 5:31 pm late-payment email needs to know, read from Netlify's environment variables (Project configuration ->
// Environment variables). Nothing here is ever logged or sent to the browser; only the NAMES of missing settings are reported.
// The steps for setting these up are in EMAIL-ALERT-SETUP.md.

// Resend lets a brand-new account send from this address, but only to the email the Resend account was opened with. Once a
// domain is verified in Resend, put a sender on that domain in ALERT_EMAIL_FROM.
export const DEFAULT_SENDER = 'Swahili Net Solution <onboarding@resend.dev>'

const clean = (value) => String(value == null ? '' : value).trim()
// a plain address: something, an @, then a web address with at least one dot and no empty parts (no spaces, commas or angle brackets)
export const EMAIL_ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;.]+(\.[^\s@<>,;.]+)+$/

export function readAlertConfig(env = {}) {
  const to = clean(env.ALERT_EMAIL_TO).split(/[\s,;]+/).filter(Boolean)
  const site = clean(env.ALERT_APP_URL || env.URL).replace(/\/+$/, '')
  const c = {
    supabaseUrl: clean(env.SUPABASE_URL || env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
    serviceKey: clean(env.SUPABASE_SERVICE_ROLE_KEY),
    resendKey: clean(env.RESEND_API_KEY),
    from: clean(env.ALERT_EMAIL_FROM) || DEFAULT_SENDER,
    // empty = the Director's own email address in the app
    to,
    badTo: to.filter((address) => !EMAIL_ADDRESS.test(address)),
    // shown as a link at the bottom of the email; left out when it is not a web address
    appUrl: /^https?:\/\/[^\s]+$/i.test(site) ? site : '',
  }
  const need = (pairs) => pairs.filter(([key]) => !c[key]).map(([, name]) => name)
  c.missing = need([['supabaseUrl', 'SUPABASE_URL'], ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY'], ['resendKey', 'RESEND_API_KEY']])
  return c
}
