import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadQueuedFiles } from './queued-files'
import { db } from './db'
import { enqueue, type EnqueueInput } from './outbox'
import { startSync, syncNow } from './sync'

// Spec 008 research R5, R9, R10: the sync loop sends the outbox in order, runs an op's preparation
// (photo uploads) before sending it, pauses on 401 without losing anything, and retries later.

vi.mock('./queued-files', () => ({
  uploadQueuedFiles: vi.fn(async () => undefined),
  forgetQueuedFiles: vi.fn(async () => undefined),
}))

const ME = '11111111-1111-4111-8111-111111111111'
let stop: () => void

const entry = (bodyMd: string): EnqueueInput => ({
  userId: ME,
  type: 'submission.save',
  recordKey: `submission:${bodyMd}`,
  payload: { lessonId: bodyMd, bodyMd, attachments: [] },
  base: { updatedAt: null },
  label: bodyMd,
})

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

const all = () => db().outbox.orderBy('createdAt').toArray()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] })
})

afterEach(async () => {
  stop?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(db().tables.map((t) => t.clear()))
})

describe('the sync loop', () => {
  it('sends the outbox in order and clears what was applied', async () => {
    const events: string[] = []
    vi.mocked(uploadQueuedFiles).mockImplementation(async (e) => {
      events.push(`prepare ${e.label}`)
    })
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { ops } = JSON.parse(String(init.body)) as { ops: { id: string; bodyMd: string }[] }
      events.push(`send ${ops.map((op) => op.bodyMd).join(',')}`)
      return reply(200, { results: ops.map((op) => ({ id: op.id, status: 'applied' })) })
    })
    vi.stubGlobal('fetch', fetchMock)
    await enqueue(entry('a'))
    await enqueue(entry('b'))

    stop = startSync(ME)
    await syncNow()

    expect(events).toEqual(['prepare a', 'prepare b', 'send a,b'])
    expect(await all()).toEqual([])
  })

  it('a failed preparation (photo upload) sends nothing and keeps the entry for later', async () => {
    vi.mocked(uploadQueuedFiles).mockRejectedValueOnce(new Error('upload failed'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await enqueue(entry('a'))
    stop = startSync(ME)
    await syncNow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await all()).toEqual([expect.objectContaining({ state: 'pending', attempts: 1 })])
  })

  it('a 401 pauses without deleting or counting an attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => reply(401)),
    )
    await enqueue(entry('a'))
    stop = startSync(ME)
    await syncNow()
    expect(await all()).toEqual([expect.objectContaining({ state: 'pending', attempts: 0 })])
  })

  it('a network error or retry is tried again later', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async (_url: string, init: RequestInit) => {
        const { ops } = JSON.parse(String(init.body)) as { ops: { id: string }[] }
        return reply(200, { results: ops.map((op) => ({ id: op.id, status: 'applied' })) })
      })
    vi.stubGlobal('fetch', fetchMock)
    await enqueue(entry('a'))
    stop = startSync(ME)
    await syncNow()
    expect(await all()).toEqual([expect.objectContaining({ state: 'pending', attempts: 1 })])

    await vi.advanceTimersByTimeAsync(5_000)
    await syncNow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await all()).toEqual([])
  })
})
