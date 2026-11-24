'use client'

import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useId, useRef } from 'react'

// Live screens without push (spec 004 research.md R10; technical spec §7). Subscribes to row changes
// of one table and refetches the given queries when one arrives. Realtime applies the subscriber's
// SELECT policies, so a client only hears about rows it may read. Invalidating instead of patching the
// cache keeps one read path.

/** One write can send several events (a review updates the submission and adds a comment). */
const GROUP_MS = 150

/** Keys waiting to refetch, shared by every subscription so one write means one refetch per key. */
const waiting = new Map<QueryClient, Map<string, QueryKey>>()

function refetchSoon(queryClient: QueryClient, queryKeys: QueryKey[]) {
  let batch = waiting.get(queryClient)
  if (!batch) {
    const keys = new Map<string, QueryKey>()
    batch = keys
    waiting.set(queryClient, keys)
    setTimeout(() => {
      waiting.delete(queryClient)
      for (const queryKey of keys.values()) void queryClient.invalidateQueries({ queryKey })
    }, GROUP_MS)
  }
  for (const queryKey of queryKeys) batch.set(JSON.stringify(queryKey), queryKey)
}

export type ChangedRow = Record<string, unknown>

/** A timestamp column of a changed row (or a cached ISO string) as milliseconds; null when unset. */
export const instantOf = (value: unknown) => (typeof value === 'string' ? Date.parse(value) : null)

export function useRealtimeInvalidate({
  table,
  filter,
  queryKeys,
  when,
}: {
  table: 'submissions' | 'comments' | 'lesson_progress' | 'student_links'
  /** A Realtime filter such as `student_id=eq.<id>`. */
  filter?: string
  queryKeys: QueryKey[]
  /** Skips events that can't change the screen, e.g. the viewer's own autosaves. */
  when?: (row: ChangedRow) => boolean
}) {
  const queryClient = useQueryClient()
  const id = useId()
  // Read when an event arrives, so new values each render don't resubscribe.
  const latest = useRef({ queryKeys, when })
  useEffect(() => {
    latest.current = { queryKeys, when }
  })

  useEffect(() => {
    let closed = false
    let unsubscribe: (() => void) | undefined
    // supabase-js loads after the first paint: it was the largest unused script on the lesson
    // screen's first load (spec 004 T082).
    void import('./supabase/client').then(async ({ createBrowserClient }) => {
      if (closed) return
      const supabase = createBrowserClient()
      // Join with the user's token: a channel that joins before the session is read stays
      // anonymous, and RLS then hides every change from it.
      await supabase.realtime.setAuth()
      if (closed) return
      const channel = supabase
        .channel(`${table}:${filter ?? 'all'}:${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filter && { filter }) },
          (payload) => {
            const row = Object.keys(payload.new).length > 0 ? payload.new : payload.old
            if (latest.current.when && !latest.current.when(row)) return
            refetchSoon(queryClient, latest.current.queryKeys)
          },
        )
        .subscribe()
      unsubscribe = () => void supabase.removeChannel(channel)
    })
    return () => {
      closed = true
      unsubscribe?.()
    }
  }, [table, filter, id, queryClient])
}
