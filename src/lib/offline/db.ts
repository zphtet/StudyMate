import type { PersistedClient } from '@tanstack/react-query-persist-client'
import { Dexie, type EntityTable } from 'dexie'

// The device database (spec 008 data-model.md §2). Every row carries the user it belongs to: sign-out
// deletes the database (research R11), and another user signing in deletes everyone else's rows
// first (R10).

/** data-model.md outbox.type: the ops /api/sync accepts (contracts/sync-route.md). */
export type OpType =
  | 'progress.complete'
  | 'progress.undo'
  | 'submission.save'
  | 'submission.submit'
  | 'focus.record'
  | 'focus.stop'
  | 'shift.save'
  | 'shift.delete'

/** data-model.md outbox.state */
export type OutboxState = 'pending' | 'syncing' | 'dropped'

/** data-model.md outbox.base: what the student saw when acting (research R7). */
export type OpBase = { wasDone: boolean } | { updatedAt: string | null } | null

export type OutboxEntry = {
  /** The op id, sent as the idempotency key. */
  id: string
  userId: string
  type: OpType
  /** Coalescing key, e.g. `submission:<lessonId>` (research R5). */
  recordKey: string
  payload: Record<string, unknown>
  base: OpBase
  /** When the student acted (ISO). */
  at: string
  /** Replay order. */
  createdAt: number
  state: OutboxState
  /** Network failures only. */
  attempts: number
  /** The `errors.*` code once dropped. */
  error: string | null
  /** The lesson title or shift date, for the "Not saved" sheet. */
  label: string
}

/** data-model.md outboxFiles: a photo of a queued draft (research R9). */
export type OutboxFile = {
  /** Final Storage path `<studentId>/<lessonId>/<uuid>.<ext>`. */
  path: string
  userId: string
  lessonId: string
  blob: Blob
  name: string
  size: number
  uploaded: boolean
}

/** data-model.md queryCache: one persisted query client per user (research R4). */
export type QueryCacheRow = { userId: string; client: PersistedClient }

/** data-model.md offlineCourses: a course kept offline (research R3). */
export type OfflineCourse = {
  userId: string
  courseId: string
  openedAt: number
  lessonIds: string[]
  mediaUrls: string[]
  bytes: number
}

type StudyMateDb = Dexie & {
  outbox: EntityTable<OutboxEntry, 'id'>
  outboxFiles: EntityTable<OutboxFile, 'path'>
  queryCache: EntityTable<QueryCacheRow, 'userId'>
  offlineCourses: Dexie.Table<OfflineCourse, [string, string]>
}

let instance: StudyMateDb | undefined

/** Opened on first use, so server rendering never touches IndexedDB. */
export function db(): StudyMateDb {
  if (!instance) {
    const created = new Dexie('studymate') as StudyMateDb
    created.version(1).stores({
      outbox: 'id, [userId+state], [userId+recordKey], createdAt',
      outboxFiles: 'path, [userId+lessonId]',
      queryCache: 'userId',
      offlineCourses: '[userId+courseId], [userId+openedAt]',
    })
    instance = created
  }
  return instance
}

/** Forgets the open handle after the database was deleted (sign-out, research R11). */
export function closeDb() {
  instance?.close()
  instance = undefined
}

/** Research R10: rows of any other user never stay on a device someone else signed in to. */
export async function deleteOtherUsers(userId: string) {
  const database = db()
  await database.transaction('rw', database.tables, () =>
    Promise.all(database.tables.map((table) => table.where('userId').notEqual(userId).delete())),
  )
}
