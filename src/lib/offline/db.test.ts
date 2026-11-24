import { afterEach, describe, expect, it } from 'vitest'
import { db, deleteOtherUsers } from './db'

// Spec 008 data-model.md §2: the device database and research R10's cleanup when another user
// signs in on the same device.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

afterEach(async () => {
  await Promise.all(db().tables.map((table) => table.clear()))
})

describe('the studymate database', () => {
  it('opens at version 1 with the four tables and their indexes', async () => {
    await db().open()
    expect(db().name).toBe('studymate')
    expect(db().verno).toBe(1)
    const schema = Object.fromEntries(
      db().tables.map((t) => [
        t.name,
        [t.schema.primKey.name, ...t.schema.indexes.map((i) => i.name)],
      ]),
    )
    expect(schema.outbox).toEqual(
      expect.arrayContaining(['id', '[userId+state]', '[userId+recordKey]', 'createdAt']),
    )
    expect(schema.outboxFiles).toEqual(expect.arrayContaining(['path', '[userId+lessonId]']))
    expect(schema.queryCache).toEqual(['userId'])
    expect(schema.offlineCourses).toEqual(
      expect.arrayContaining(['[userId+courseId]', '[userId+openedAt]']),
    )
  })
})

describe('deleteOtherUsers', () => {
  it("removes every other user's rows and keeps the signed-in user's", async () => {
    const entry = (id: string, userId: string) => ({
      id,
      userId,
      type: 'progress.complete' as const,
      recordKey: `progress:${id}`,
      payload: {},
      base: { wasDone: false },
      at: new Date(0).toISOString(),
      createdAt: 0,
      state: 'pending' as const,
      attempts: 0,
      error: null,
      label: 'Lesson',
    })
    await db().outbox.bulkAdd([entry('a', ME), entry('b', OTHER)])
    await db().outboxFiles.bulkAdd([
      {
        path: `${ME}/l/1.webp`,
        userId: ME,
        lessonId: 'l',
        blob: new Blob(['x']),
        name: 'a',
        size: 1,
        uploaded: false,
      },
      {
        path: `${OTHER}/l/2.webp`,
        userId: OTHER,
        lessonId: 'l',
        blob: new Blob(['y']),
        name: 'b',
        size: 1,
        uploaded: false,
      },
    ])
    await db().queryCache.bulkAdd([
      {
        userId: ME,
        client: { timestamp: 0, buster: '', clientState: { queries: [], mutations: [] } },
      },
      {
        userId: OTHER,
        client: { timestamp: 0, buster: '', clientState: { queries: [], mutations: [] } },
      },
    ])
    await db().offlineCourses.bulkAdd([
      { userId: ME, courseId: 'c', openedAt: 1, lessonIds: [], mediaUrls: [], bytes: 0 },
      { userId: OTHER, courseId: 'c', openedAt: 1, lessonIds: [], mediaUrls: [], bytes: 0 },
    ])

    await deleteOtherUsers(ME)

    for (const table of db().tables) {
      const owners = (await table.toArray()).map((row: { userId: string }) => row.userId)
      expect(owners, table.name).toEqual([ME])
    }
  })
})
