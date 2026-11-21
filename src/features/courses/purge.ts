import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { listStoragePrefix, removeStorageObjects } from '@/server/supabase-admin'
import { RESTORE_MS } from './retention'
import type { PurgeResult } from './types'

// Daily purge (spec 002 FR-006, research.md R8), run by GET /api/cron/purge. Finds courses and
// lessons deleted more than 30 days ago, removes their files first (lesson files and the attachments
// of submissions on them), then hard-deletes the rows; FK cascades take sections, lessons,
// resources, progress, submissions and deadlines with them. If removing files fails, nothing is
// deleted and the next run retries, so the job is idempotent.

const LESSON_FILES = 'lesson-files'
const SUBMISSIONS = 'submissions'

/** data-model.md Submission.attachments: `[{ path, name, size }]`; anything else is ignored. */
const attachmentsSchema = z.array(z.object({ path: z.string().min(1) }).loose()).catch([])

export async function purgeExpired(
  now = new Date(),
  /** Tests limit the purge to their own fixtures so other dev data is never touched. */
  { ownerIds }: { ownerIds?: string[] } = {},
): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - RESTORE_MS)
  const owner = ownerIds ? { ownerId: { in: ownerIds } } : {}

  const courses = await prisma.course.findMany({
    where: { deletedAt: { lt: cutoff }, ...owner },
    select: { id: true },
  })
  const courseIds = courses.map((c) => c.id)
  // Lessons of an expired course go with it; these are lessons deleted on their own.
  const lessons = await prisma.lesson.findMany({
    where: { deletedAt: { lt: cutoff }, courseId: { notIn: courseIds }, course: owner },
    select: { id: true, courseId: true },
  })
  const lessonIds = lessons.map((l) => l.id)
  if (courseIds.length === 0 && lessonIds.length === 0) return { courses: 0, lessons: 0, files: 0 }

  const submissions = await prisma.submission.findMany({
    where: { OR: [{ lesson: { courseId: { in: courseIds } } }, { lessonId: { in: lessonIds } }] },
    select: { attachments: true },
  })
  const submissionFiles = submissions.flatMap((s) =>
    attachmentsSchema.parse(s.attachments).map((a) => a.path),
  )
  const lessonFiles = (
    await Promise.all([
      ...courseIds.map((id) => listStoragePrefix(LESSON_FILES, `${id}/`)),
      ...lessons.map((l) => listStoragePrefix(LESSON_FILES, `${l.courseId}/${l.id}/`)),
    ])
  ).flat()

  // Files first: once the rows are gone, nothing would point at leftover files any more.
  if (lessonFiles.length > 0) await removeStorageObjects(LESSON_FILES, lessonFiles)
  if (submissionFiles.length > 0) await removeStorageObjects(SUBMISSIONS, submissionFiles)

  await prisma.$transaction([
    prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } }),
    prisma.course.deleteMany({ where: { id: { in: courseIds } } }),
  ])
  return {
    courses: courseIds.length,
    lessons: lessonIds.length,
    files: lessonFiles.length + submissionFiles.length,
  }
}
