// Spec 004 research.md R10: open screens refetch when the other side writes. The browser Supabase
// client is mocked; the hook must subscribe (after setting the user's token) with the table and
// filter, invalidate every given key once per burst of events, skip events `when` rejects, and
// remove its channel on unmount.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useRealtimeInvalidate } from './realtime'

type Listener = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => void

const realtime = vi.hoisted(() => {
  const state = {
    subscriptions: [] as { event: string; options: Record<string, unknown> }[],
    listeners: [] as Listener[],
    removed: [] as unknown[],
    channel: null as unknown,
  }
  const channel = {
    on: (event: string, options: Record<string, unknown>, listener: Listener) => {
      state.subscriptions.push({ event, options })
      state.listeners.push(listener)
      return channel
    },
    subscribe: () => channel,
  }
  state.channel = channel
  return {
    state,
    client: {
      realtime: { setAuth: () => Promise.resolve() },
      channel: () => channel,
      removeChannel: (c: unknown) => {
        state.removed.push(c)
        return Promise.resolve('ok')
      },
    },
  }
})

vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: () => realtime.client }))

async function setup(options: Parameters<typeof useRealtimeInvalidate>[0]) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useRealtimeInvalidate(options), { wrapper })
  await waitFor(() => expect(realtime.state.subscriptions).toHaveLength(1))
  return { hook, invalidate }
}

const event = (row: Record<string, unknown> = { id: '1' }) => ({ new: row, old: {} })

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  realtime.state.subscriptions = []
  realtime.state.listeners = []
  realtime.state.removed = []
})

describe('useRealtimeInvalidate', () => {
  test('subscribes to postgres_changes on the table with the filter', async () => {
    await setup({ table: 'submissions', filter: 'student_id=eq.abc', queryKeys: [['lesson', '1']] })
    expect(realtime.state.subscriptions).toEqual([
      {
        event: 'postgres_changes',
        options: {
          event: '*',
          schema: 'public',
          table: 'submissions',
          filter: 'student_id=eq.abc',
        },
      },
    ])
  })

  test('without a filter it listens to every row the RLS lets through', async () => {
    await setup({ table: 'lesson_progress', queryKeys: [['admin']] })
    expect(realtime.state.subscriptions[0].options).toEqual({
      event: '*',
      schema: 'public',
      table: 'lesson_progress',
    })
  })

  test('a burst of events invalidates every given key once', async () => {
    const keys = [
      ['lesson', '1', 'work'],
      ['lesson', '1', 'notes'],
    ]
    const { invalidate } = await setup({ table: 'comments', queryKeys: keys })
    vi.useFakeTimers()
    // A review updates the submission and inserts a comment in one transaction.
    realtime.state.listeners[0](event())
    realtime.state.listeners[0](event())
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(keys)
  })

  test('events on two subscriptions in one burst refetch each key once', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const queryKeys = [['lesson', '1', 'work']]
    renderHook(
      () => {
        useRealtimeInvalidate({ table: 'submissions', queryKeys })
        useRealtimeInvalidate({ table: 'comments', queryKeys })
      },
      { wrapper },
    )
    await waitFor(() => expect(realtime.state.listeners).toHaveLength(2))
    vi.useFakeTimers()
    realtime.state.listeners[0](event())
    realtime.state.listeners[1](event())
    vi.advanceTimersByTime(200)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  test('events that `when` rejects are ignored', async () => {
    const { invalidate } = await setup({
      table: 'submissions',
      queryKeys: [['x']],
      when: (row) => row.status === 'submitted',
    })
    vi.useFakeTimers()
    realtime.state.listeners[0](event({ status: 'draft' }))
    vi.advanceTimersByTime(200)
    expect(invalidate).not.toHaveBeenCalled()
    realtime.state.listeners[0](event({ status: 'submitted' }))
    vi.advanceTimersByTime(200)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  test('unmounting removes the channel', async () => {
    const { hook } = await setup({ table: 'comments', queryKeys: [['x']] })
    expect(realtime.state.removed).toEqual([])
    hook.unmount()
    expect(realtime.state.removed).toEqual([realtime.state.channel])
  })
})
