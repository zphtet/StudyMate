import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createDexiePersister } from './persister'

// Spec 008 research R4; data-model.md queryCache.client: one persisted query client per user.

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const client = (key: string): PersistedClient => ({
  timestamp: 1,
  buster: 'build-1',
  clientState: {
    mutations: [],
    queries: [
      {
        queryKey: [key],
        queryHash: JSON.stringify([key]),
        dehydratedAt: 1,
        state: {
          data: { hello: key },
          dataUpdateCount: 1,
          dataUpdatedAt: 1,
          error: null,
          errorUpdateCount: 0,
          errorUpdatedAt: 0,
          fetchFailureCount: 0,
          fetchFailureReason: null,
          fetchMeta: null,
          isInvalidated: false,
          status: 'success',
          fetchStatus: 'idle',
        },
      },
    ],
  },
})

afterEach(async () => {
  await db().queryCache.clear()
})

describe('createDexiePersister', () => {
  it('persists, restores and removes one client per user', async () => {
    const mine = createDexiePersister(ME)
    await mine.persistClient(client('today'))
    expect(await mine.restoreClient()).toEqual(client('today'))
    await mine.persistClient(client('courses'))
    expect(await mine.restoreClient()).toEqual(client('courses'))
    await mine.removeClient()
    expect(await mine.restoreClient()).toBeUndefined()
  })

  it("never restores another user's client", async () => {
    await createDexiePersister(ME).persistClient(client('today'))
    expect(await createDexiePersister(OTHER).restoreClient()).toBeUndefined()
  })
})
