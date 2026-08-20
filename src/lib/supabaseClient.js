import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // This will show up loudly in the browser console rather than failing silently.
  console.error(
    'Missing Supabase environment variables. Create a .env.local file (see .env.example) ' +
    'with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or set them in your Netlify site settings.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, }, })