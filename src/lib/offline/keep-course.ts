'use client'

import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type OfflineCourse } from './db'
import { forgetUrls, keepUrls } from './worker-messages'

// Courses kept offline (spec 008 US2 scenario 1, Edge Cases; research R3; data-model.md
// offlineCourses.*): opening a course online stores its lesson pages and up to 20 MB of its files.
// When the device runs low on storage, the course opened longest ago gives its pages and files back.

/** data-model.md offlineCourses.bytes: at most this much media per course. */
export const COURSE_BUDGET_BYTES = 20 * 1024 * 1024
/** Storage use above this share of the quota frees the least recently opened course. */
const QUOTA_SHARE = 0.8

export type MediaItem = { url: string; sizeBytes: number | null }

/** The files to keep, in lesson order, skipping any that would cross the budget. */
export function pickMedia(items: MediaItem[], budget = COURSE_BUDGET_BYTES): string[] {
  let room = budget
  const picked: string[] = []
  for (const { url, sizeBytes } of items) {
    const size = sizeBytes ?? 0
    if (size > room) continue
    room -= size
    picked.push(url)
  }
  return picked
}

/** The course to free while storage use is above 80 % of the quota, never the current one. */
export function pickEviction(
  courses: OfflineCourse[],
  currentCourseId: string,
  { usage, quota }: { usage: number; quota: number },
): OfflineCourse | null {
  if (quota <= 0 || usage / quota <= QUOTA_SHARE) return null
  const others = courses.filter((c) => c.courseId !== currentCourseId)
  return others.sort((a, b) => a.openedAt - b.openedAt)[0] ?? null
}

/** What isn't stored yet for this course. */
export function changedSince(
  kept: OfflineCourse | undefined,
  lessonIds: string[],
  mediaUrls: string[],
) {
  return {
    lessonIds: lessonIds.filter((id) => !kept?.lessonIds.includes(id)),
    mediaUrls: mediaUrls.filter((url) => !kept?.mediaUrls.includes(url)),
  }
}

const lessonPage = (lessonId: string) => `/s/lessons/${lessonId}`

async function freeSpaceIfNeeded(userId: string, currentCourseId: string) {
  const estimate = await navigator.storage?.estimate?.()
  if (!estimate?.quota || estimate.usage === undefined) return
  const courses = await db()
    .offlineCourses.where('[userId+openedAt]')
    .between([userId, 0], [userId, Infinity])
    .toArray()
  const victim = pickEviction(courses, currentCourseId, {
    usage: estimate.usage,
    quota: estimate.quota,
  })
  if (!victim) return
  await forgetUrls([...victim.lessonIds.map(lessonPage), ...victim.mediaUrls])
  await db().offlineCourses.delete([victim.userId, victim.courseId])
}

let hasAskedToPersist = false

/**
 * Stores a course for offline use, in the background. `readLesson` loads one lesson's data (which
 * the persisted query cache keeps) and returns its files. One request at a time (R3).
 */
export async function keepCourse({
  userId,
  courseId,
  lessonIds,
  readLesson,
}: {
  userId: string
  courseId: string
  lessonIds: string[]
  readLesson: (lessonId: string) => Promise<MediaItem[]>
}) {
  if (!navigator.serviceWorker?.controller) return
  if (!hasAskedToPersist && window.matchMedia('(display-mode: standalone)').matches) {
    hasAskedToPersist = true
    await navigator.storage?.persist?.()
  }
  await freeSpaceIfNeeded(userId, courseId)

  const media: MediaItem[] = []
  for (const lessonId of lessonIds) media.push(...(await readLesson(lessonId)))
  const kept = await db().offlineCourses.get([userId, courseId])
  const todo = changedSince(
    kept,
    lessonIds,
    media.map((m) => m.url),
  )
  const newMedia = media.filter((m) => todo.mediaUrls.includes(m.url))

  const pages = await keepUrls(todo.lessonIds.map(lessonPage))
  const files = await keepUrls(pickMedia(newMedia, COURSE_BUDGET_BYTES - (kept?.bytes ?? 0)))
  const stored = (list: typeof files) => list.filter((f) => f.ok)

  await db().offlineCourses.put({
    userId,
    courseId,
    openedAt: Date.now(),
    lessonIds: [
      ...new Set([
        ...(kept?.lessonIds ?? []),
        ...stored(pages).map((p) => p.url.slice('/s/lessons/'.length)),
      ]),
    ],
    mediaUrls: [...new Set([...(kept?.mediaUrls ?? []), ...stored(files).map((f) => f.url)])],
    bytes: (kept?.bytes ?? 0) + stored(files).reduce((sum, f) => sum + f.bytes, 0),
  })
}

/**
 * The files this device keeps for a course (the "Not available offline" rows, contracts/ui-routes.md).
 * Only the signed-in user's rows are on the device (R10), so the course id is enough.
 */
export function useKeptMedia(courseId: string): ReadonlySet<string> {
  const [urls, setUrls] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const subscription = liveQuery(() =>
      db()
        .offlineCourses.filter((c) => c.courseId === courseId)
        .first(),
    ).subscribe({ next: (row) => setUrls(new Set(row?.mediaUrls ?? [])) })
    return () => subscription.unsubscribe()
  }, [courseId])
  return urls
}
