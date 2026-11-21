// @vitest-environment node
// Spec 002 US3 (T060): purging content deleted more than 30 days ago, against the dev database with
// Storage mocked. `purgeExpired` is scoped to this file's admin so other dev data is never touched.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { purgeExpired } from './purge'

vi.setConfig({ testTimeout: 60_000 })

const storage = vi.hoisted(() => ({
  removed: [] as { bucket: string; paths: string[] }[],
  listed: [] as { bucket: string; prefix: string }[],
  failRemove: false,
}))

vi.mock('@/server/supabase-admin', () => ({
  listStoragePrefix: async (bucket: string, prefix: string) => {
    storage.listed.push({ bucket, prefix })
    return [`${prefix}file.png`]
  },
  removeStorageObjects: async (bucket: string, paths: string[]) => {
    if (storage.failRemove) throw new Error('storage down')
    storage.removed.push({ bucket, paths })
  },
}))

const DAY = 24 * 60 * 60 * 1000
const admin = randomUUID()
const student = randomUUID()
const run = Date.now()
const now = new Date()
const ago = (days: number) => new Date(now.getTime() - days * DAY)

beforeAll(async () => {
  for (const [userId, role] of [
    [admin, 'admin'],
    [student, 'student'],
  ]) {
    const meta = JSON.stringify({ role, display_name: `Purge ${role}` })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${userId}::uuid, ${`purge-${run}-${userId}@example.test`}, ${meta}::jsonb)`
  }
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${[admin, student]}::uuid[])`
  await prisma.$disconnect()
})

beforeEach(() => {
  storage.removed = []
  storage.listed = []
  storage.failRemove = false
})

async function course(deletedAt: Date | null) {
  const id = randomUUID()
  await prisma.course.create({
    data: { id, ownerId: admin, title: `Purge ${id.slice(0, 6)}`, deletedAt },
  })
  return id
}

async function lesson(courseId: string, deletedAt: Date | null, position = 0) {
  const id = randomUUID()
  await prisma.lesson.create({
    data: { id, courseId, title: `L ${id.slice(0, 4)}`, position, deletedAt },
  })
  return id
}

async function submissionWithFile(lessonId: string) {
  const path = `${student}/${lessonId}/photo.jpg`
  await prisma.submission.create({
    data: {
      studentId: student,
      lessonId,
      status: 'submitted',
      bodyMd: 'Answer',
      attachments: [{ path, name: 'photo.jpg', size: 1000 }],
    },
  })
  return path
}

describe('purgeExpired', () => {
  test('removes files, then rows, of content deleted more than 30 days ago only', async () => {
    const expiredCourse = await course(ago(31))
    const expiredCourseLesson = await lesson(expiredCourse, null)
    const courseFile = await submissionWithFile(expiredCourseLesson)
    const recentCourse = await course(ago(30)) // exactly 30 days: kept

    const liveCourse = await course(null)
    const expiredLesson = await lesson(liveCourse, ago(31), 0)
    const lessonFile = await submissionWithFile(expiredLesson)
    const recentLesson = await lesson(liveCourse, ago(29), 1)
    const liveLesson = await lesson(liveCourse, null, 0)

    const result = await purgeExpired(now, { ownerIds: [admin] })

    expect(result).toEqual({ courses: 1, lessons: 1, files: 4 })
    expect(storage.listed).toEqual(
      expect.arrayContaining([
        { bucket: 'lesson-files', prefix: `${expiredCourse}/` },
        { bucket: 'lesson-files', prefix: `${liveCourse}/${expiredLesson}/` },
      ]),
    )
    const removedPaths = (bucket: string) =>
      storage.removed.filter((r) => r.bucket === bucket).flatMap((r) => r.paths)
    expect(removedPaths('lesson-files').sort()).toEqual(
      [`${expiredCourse}/file.png`, `${liveCourse}/${expiredLesson}/file.png`].sort(),
    )
    expect(removedPaths('submissions').sort()).toEqual([courseFile, lessonFile].sort())

    expect(await prisma.course.findUnique({ where: { id: expiredCourse } })).toBeNull()
    expect(await prisma.lesson.findUnique({ where: { id: expiredLesson } })).toBeNull()
    // FK cascades take the submissions with them.
    expect(await prisma.submission.count({ where: { lessonId: expiredLesson } })).toBe(0)
    expect(await prisma.course.findUnique({ where: { id: recentCourse } })).not.toBeNull()
    expect(await prisma.lesson.findUnique({ where: { id: recentLesson } })).not.toBeNull()
    expect(await prisma.lesson.findUnique({ where: { id: liveLesson } })).not.toBeNull()

    // A second run finds nothing left to do.
    storage.removed = []
    expect(await purgeExpired(now, { ownerIds: [admin] })).toEqual({
      courses: 0,
      lessons: 0,
      files: 0,
    })
    expect(storage.removed).toEqual([])
  })

  test('keeps the rows when removing files fails, so the next run retries', async () => {
    const expired = await course(ago(40))
    storage.failRemove = true
    await expect(purgeExpired(now, { ownerIds: [admin] })).rejects.toThrow('storage down')
    expect(await prisma.course.findUnique({ where: { id: expired } })).not.toBeNull()

    storage.failRemove = false
    expect(await purgeExpired(now, { ownerIds: [admin] })).toMatchObject({ courses: 1 })
    expect(await prisma.course.findUnique({ where: { id: expired } })).toBeNull()
  })
})
