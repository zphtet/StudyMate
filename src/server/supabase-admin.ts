import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Supabase admin APIs with the SECRET key (spec 001 research R6). Server-only: never import from
// client code, never expose the key as NEXT_PUBLIC_. Used for account deletion and, in spec 002's
// daily purge (research R8), for removing files of content deleted more than 30 days ago across all
// admins. e2e helpers build their own client.
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

const PAGE = 1000

/** Every file path under `prefix` (e.g. `<course>/` or `<course>/<lesson>/`), searching sub-folders. */
export async function listStoragePrefix(bucket: string, prefix: string): Promise<string[]> {
  const storage = adminClient().storage.from(bucket)
  const folder = prefix.replace(/\/+$/, '')
  const paths: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list(folder, { limit: PAGE, offset })
    if (error) throw error
    for (const entry of data) {
      const path = `${folder}/${entry.name}`
      // Folders come back without an id.
      if (entry.id === null) paths.push(...(await listStoragePrefix(bucket, path)))
      else paths.push(path)
    }
    if (data.length < PAGE) return paths
  }
}

/** Removes files in batches; throws on the first failure so the caller keeps its rows and retries. */
export async function removeStorageObjects(bucket: string, paths: string[]) {
  const storage = adminClient().storage.from(bucket)
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await storage.remove(paths.slice(i, i + PAGE))
    if (error) throw error
  }
}
