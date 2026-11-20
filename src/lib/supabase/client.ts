'use client'

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'

// Browser Supabase client: Auth and Realtime only. Table reads go through Route Handlers + TanStack
// Query, writes through Server Actions (CLAUDE.md). createBrowserClient returns a singleton.
export function createBrowserClient() {
  return createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
