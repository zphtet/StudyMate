import 'server-only'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Supabase client for Server Components, Server Actions and Route Handlers.
// Use it for Auth, Storage and Realtime only. Table queries go through Prisma (docs/technical-spec.md §7).
// Create a new client per request; never share one across requests.
export async function createServerClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, where cookies are read-only. Safe to ignore:
            // proxy.ts refreshes the session (and sets the no-cache headers) on every request.
          }
        },
      },
    },
  )
}
