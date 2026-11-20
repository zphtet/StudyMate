import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Supabase Auth admin API with the SECRET key (research R6). Server-only: never import from client
// code, never expose the key as NEXT_PUBLIC_. Used for account deletion only (e2e helpers build their own).
function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Deletes the auth user; profiles and every row referencing it cascade. Also ends their sessions. */
export async function deleteAuthUser(id: string) {
  const { error } = await adminClient().auth.admin.deleteUser(id)
  if (error) throw error
}
