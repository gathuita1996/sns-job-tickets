// What the server needs to know, read from Netlify's environment variables (Project configuration -> Environment
// variables). Nothing here is ever logged or sent to the browser; only the NAMES of missing settings are reported.
import { RECEIPT_TEMPLATE } from '../../src/lib/whatsappTemplate.js'

export const DEFAULT_API_VERSION = 'v24.0'

const clean = (value) => String(value == null ? '' : value).trim()

export function readConfig(env = {}) {
  const c = {
    supabaseUrl: clean(env.SUPABASE_URL || env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
    anonKey: clean(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY),
    serviceKey: clean(env.SUPABASE_SERVICE_ROLE_KEY),
    token: clean(env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(env.WHATSAPP_PHONE_NUMBER_ID),
    wabaId: clean(env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    appSecret: clean(env.WHATSAPP_APP_SECRET),
    verifyToken: clean(env.WHATSAPP_VERIFY_TOKEN),
    templateName: clean(env.WHATSAPP_TEMPLATE_NAME) || RECEIPT_TEMPLATE.name,
    templateLanguage: clean(env.WHATSAPP_TEMPLATE_LANGUAGE) || RECEIPT_TEMPLATE.language,
    apiVersion: /^v\d+\.\d+$/.test(clean(env.WHATSAPP_API_VERSION)) ? clean(env.WHATSAPP_API_VERSION) : DEFAULT_API_VERSION,
  }
  const need = (pairs) => pairs.filter(([key]) => !c[key]).map(([, name]) => name)
  // sending a receipt needs the app's own database settings and the WhatsApp account
  c.missingForSend = need([['supabaseUrl', 'SUPABASE_URL'], ['anonKey', 'SUPABASE_ANON_KEY'], ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY'], ['token', 'WHATSAPP_ACCESS_TOKEN'], ['phoneNumberId', 'WHATSAPP_PHONE_NUMBER_ID']])
  // hearing back about delivery needs the app secret (to know the news really comes from WhatsApp) and the verify token
  c.missingForWebhook = need([['supabaseUrl', 'SUPABASE_URL'], ['serviceKey', 'SUPABASE_SERVICE_ROLE_KEY'], ['appSecret', 'WHATSAPP_APP_SECRET'], ['verifyToken', 'WHATSAPP_VERIFY_TOKEN']])
  return c
}
