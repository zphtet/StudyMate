import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// E2E helper (spec 001 research R5): Supabase admin API with the SECRET key, for fixture users and
// codes. Test code only — never import from src/. Reads .env.local / .env like scripts/test-db.mjs.
config({ path: ['.env.local', '.env'], quiet: true })

let client: SupabaseClient | undefined

export function supabaseAdmin(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
