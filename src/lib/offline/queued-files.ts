'use client'

import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type OutboxEntry } from './db'

// Photos of drafts written offline (spec 008 FR-003a; research R9; data-model.md outboxFiles.*).
// They upload to 004's `submissions` bucket, with the student's own token so Storage RLS applies,
// just before the draft that names them is sent. Their final path was chosen when added, so an
// upload that already happened counts as done.

const BUCKET = 'submissions'

function attachmentPaths(entry: OutboxEntry): string[] {
  const { attachments } = entry.payload
  if (!Array.isArray(attachments)) return []
  return attachments.flatMap((a: unknown) =>
    typeof a === 'object' && a !== null && 'path' in a && typeof a.path === 'string'
      ? [a.path]
      : [],
  )
}

/** Uploads the entry's photos still on the device. Throws when one can't upload yet. */
export async function uploadQueuedFiles(entry: OutboxEntry) {
  const paths = attachmentPaths(entry)
  if (paths.length === 0) return
  const waiting = await db()
    .outboxFiles.where('path')
    .anyOf(paths)
    .filter((file) => !file.uploaded)
    .toArray()
  if (waiting.length === 0) return
  const bucket = (await import('@/lib/supabase/client')).createBrowserClient().storage.from(BUCKET)
  for (const file of waiting) {
    const { error } = await bucket.upload(file.path, file.blob, {
      contentType: file.blob.type,
      upsert: false,
    })
    if (error && !/already exists/i.test(error.message)) throw error
    await db().outboxFiles.update(file.path, { uploaded: true })
  }
}

/** The draft is saved: its photos live in Storage now. */
export async function forgetQueuedFiles(entry: OutboxEntry) {
  const paths = attachmentPaths(entry)
  if (paths.length > 0) await db().outboxFiles.bulkDelete(paths)
}

/** Paths of a lesson's photos still waiting to upload: their "Will sync" badge (FR-003a). */
export function useQueuedFilePaths(lessonId: string): ReadonlySet<string> {
  const [paths, setPaths] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const subscription = liveQuery(() =>
      db()
        .outboxFiles.filter((file) => file.lessonId === lessonId && !file.uploaded)
        .primaryKeys(),
    ).subscribe({ next: (keys) => setPaths(new Set(keys)) })
    return () => subscription.unsubscribe()
  }, [lessonId])
  return paths
}
