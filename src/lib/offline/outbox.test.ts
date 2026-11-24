import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  dismissDropped,
  droppedEntries,
  enqueue,
  markSyncing,
  nextBatch,
  pendingCount,
  recoverSyncing,
  resolve,
  sendFailed,
  type EnqueueInput,
} from './outbox'

// Spec 008 research R5; data-model.md outbox.recordKey, outbox.state, outbox.base, outbox.at,
// › State transitions and Coalescing.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const LESSON = 'lesson-1'

afterEach(async () => {
  await Promise.all(db().tables.map((t) => t.clear()))
})

const draft = (bodyMd: string, at: string, extra: Partial<EnqueueInput> = {}): EnqueueInput => ({
  userId: ME,
  type: 'submission.save',
  recordKey: `submission:${LESSON}`,
  payload: { lessonId: LESSON, bodyMd, attachments: [] },
  base: { updatedAt: '2026-11-24T00:00:00.000Z' },
  at,
  label: 'Particles',
  ...extra,
})

const pending = () =>
  db()
    .outbox.orderBy('createdAt')
    .filter((e) => e.state === 'pending')
    .toArray()
const all = () => db().outbox.orderBy('createdAt').toArray()

describe('enqueue', () => {
  it('adds a pending entry for the user with a fresh op id', async () => {
    const entry = await enqueue(draft('a', '2026-11-24T01:00:00.000Z'))
    expect(entry).toMatchObject({ userId: ME, state: 'pending', attempts: 0, error: null })
    expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('a save after a save replaces the content and keeps the op id, base and first time', async () => {
    const first = await enqueue(draft('a', '2026-11-24T01:00:00.000Z'))
    await enqueue(
      draft('ab', '2026-11-24T01:05:00.000Z', { base: { updatedAt: '2026-11-24T09:00:00.000Z' } }),
    )
    expect(await all()).toEqual([
      expect.objectContaining({
        id: first?.id,
        payload: expect.objectContaining({ bodyMd: 'ab' }),
        base: { updatedAt: '2026-11-24T00:00:00.000Z' },
        at: '2026-11-24T01:00:00.000Z',
      }),
    ])
  })

  it('Submit after a save becomes one Submit with the press time', async () => {
    await enqueue(draft('a', '2026-11-24T01:00:00.000Z'))
    await enqueue(draft('final', '2026-11-24T02:00:00.000Z', { type: 'submission.submit' }))
    expect(await all()).toEqual([
      expect.objectContaining({
        type: 'submission.submit',
        at: '2026-11-24T02:00:00.000Z',
        payload: expect.objectContaining({ bodyMd: 'final' }),
      }),
    ])
  })

  it('complete then undo of the same lesson cancels out', async () => {
    const lesson = { recordKey: `progress:${LESSON}`, payload: { lessonId: LESSON } }
    await enqueue({
      ...draft('', 'x'),
      ...lesson,
      type: 'progress.complete',
      base: { wasDone: false },
    })
    const kept = await enqueue({
      ...draft('', 'y'),
      ...lesson,
      type: 'progress.undo',
      base: { wasDone: true },
    })
    expect(kept).toBeNull()
    expect(await all()).toEqual([])
  })

  it('a new shift then its deletion cancels out; an edit then its deletion becomes one delete', async () => {
    const created = { recordKey: 'shift:new-1', type: 'shift.save' as const, base: null }
    await enqueue({ ...draft('', 'a'), ...created, payload: { shift: { date: '2026-12-01' } } })
    await enqueue({ ...draft('', 'b'), ...created, type: 'shift.delete', payload: {} })
    expect(await all()).toEqual([])

    const edited = { recordKey: 'shift:s-9', base: { updatedAt: 'v1' } }
    await enqueue({ ...draft('', 'a'), ...edited, type: 'shift.save', payload: { shift: {} } })
    await enqueue({
      ...draft('', 'b'),
      ...edited,
      type: 'shift.delete',
      base: { updatedAt: 'v1' },
      payload: { shiftId: 's-9' },
    })
    expect(await all()).toEqual([
      expect.objectContaining({ type: 'shift.delete', base: { updatedAt: 'v1' } }),
    ])
  })

  it('never merges into an entry already sent, syncing or dropped', async () => {
    const first = await enqueue(draft('a', '2026-11-24T01:00:00.000Z'))
    await sendFailed([first!.id])
    await enqueue(draft('b', '2026-11-24T01:05:00.000Z'))
    expect(await all()).toHaveLength(2)
  })
})

describe('nextBatch', () => {
  it("is the user's pending entries, oldest first, at most 50", async () => {
    for (let i = 0; i < 52; i += 1) {
      await enqueue({ ...draft(String(i), 'x'), recordKey: `submission:l${i}` })
    }
    await enqueue({ ...draft('theirs', 'x'), userId: OTHER, recordKey: 'submission:other' })
    const batch = await nextBatch(ME)
    expect(batch).toHaveLength(50)
    expect(batch.map((e) => (e.payload as { bodyMd: string }).bodyMd)).toEqual(
      Array.from({ length: 50 }, (_, i) => String(i)),
    )
  })
})

describe('resolve', () => {
  it('removes applied and duplicate entries, keeps dropped ones with their reason', async () => {
    const a = await enqueue({ ...draft('a', 'x'), recordKey: 'submission:a' })
    const b = await enqueue({ ...draft('b', 'x'), recordKey: 'submission:b' })
    const c = await enqueue({ ...draft('c', 'x'), recordKey: 'submission:c' })
    const sent = await nextBatch(ME)
    await markSyncing(sent.map((e) => e.id))
    await resolve(sent, [
      { id: a!.id, status: 'applied' },
      { id: b!.id, status: 'duplicate' },
      { id: c!.id, status: 'dropped', code: 'changed_on_server' },
    ])
    expect(await all()).toEqual([
      expect.objectContaining({ id: c!.id, state: 'dropped', error: 'changed_on_server' }),
    ])
    expect(await droppedEntries(ME)).toHaveLength(1)
    await dismissDropped([c!.id])
    expect(await all()).toEqual([])
  })

  it('a retry goes back to pending with one more attempt; ops after it go back untouched', async () => {
    const a = await enqueue({ ...draft('a', 'x'), recordKey: 'submission:a' })
    const b = await enqueue({ ...draft('b', 'x'), recordKey: 'submission:b' })
    const sent = await nextBatch(ME)
    await markSyncing(sent.map((e) => e.id))
    await resolve(sent, [{ id: a!.id, status: 'retry' }])
    expect(await pending()).toEqual([
      expect.objectContaining({ id: a!.id, attempts: 1 }),
      expect.objectContaining({ id: b!.id, attempts: 0 }),
    ])
  })

  it('rebases later entries of the same record on the new version', async () => {
    const first = await enqueue(draft('a', 'x'))
    await sendFailed([first!.id]) // sent once, so the next change gets its own entry
    const second = await enqueue(draft('b', 'y'))
    await markSyncing([first!.id])
    await resolve([first!], [{ id: first!.id, status: 'applied', version: 'v2' }])
    expect(await pending()).toEqual([
      expect.objectContaining({ id: second!.id, base: { updatedAt: 'v2' } }),
    ])
  })
})

describe('recoverSyncing and pendingCount', () => {
  it('turns entries left syncing (app closed mid-request) back into pending', async () => {
    const a = await enqueue(draft('a', 'x'))
    await markSyncing([a!.id])
    expect(await pendingCount(ME)).toBe(1)
    const b = await enqueue({ ...draft('b', 'x'), recordKey: 'submission:b' })
    const sent = await nextBatch(ME)
    await resolve(sent, [{ id: b!.id, status: 'dropped', code: 'lesson_unavailable' }])
    await recoverSyncing()
    expect(await pending()).toEqual([expect.objectContaining({ id: a!.id })])
    expect(await droppedEntries(ME)).toEqual([expect.objectContaining({ id: b!.id })])
  })

  it("counts only the user's entries still to send", async () => {
    await enqueue(draft('a', 'x'))
    await enqueue({ ...draft('b', 'x'), userId: OTHER })
    expect(await pendingCount(ME)).toBe(1)
  })
})
