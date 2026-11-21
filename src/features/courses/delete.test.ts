// @vitest-environment node
// Spec 002 US3 (T061): deleting, restoring and the delete-impact list against the dev database.
// Fixtures are created through auth.users (trigger handle_new_user makes profiles) and deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as lessonRepo from './lesson-repo'
import * as repo from './repo'
import { studentWork } from './work'

// Each statement is a round trip to the hosted dev database.
vi.setConfig({ testTimeout: 30_000 })

// lesson-repo imports the cookie-based Supabase client for file removal; nothing here touches Storage.
vi.mock('@/lib/supabase/server', () => ({ createServerClient: async () => ({}) }))

const DAY = 24 * 60 * 60 * 1000
const admin = randomUUID()
const otherAdmin = randomUUID()
const may = randomUUID()
const thant = randomUUID()
const removed = randomUUID()
const run = Date.now()

beforeAll(async () => {
  const users: [string, 'admin' | 'student', string][] = [
    [admin, 'admin', 'Delete Repo Admin'],
    [otherAdmin, 'admin', 'Delete Repo Other Admin'],
    [may, 'student', 'May'],
    [thant, 'student', 'Thant'],
    [removed, 'student', 'Aung'],
  ]
  for (const [userId, role, name] of users) {
    const meta = JSON.stringify({ role, display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${userId}::uuid, ${`delete-repo-${run}-${userId}@example.test`}, ${meta}::jsonb)`
  }
})

afterAll(async () => {
  const users = [admin, otherAdmin, may, thant, removed]
  // course_assignments.assigned_by doesn't cascade, so the fixture courses go first.
  await prisma.$executeRaw`delete from course_assignments where assigned_by = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from courses where owner_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

/** A course with `sections` sections and lessons placed by section index (null = no section). */
async function makeCourse({
  sections = 0,
  lessons = [],
}: {
  sections?: number
  lessons?: { section: number | null; status?: 'draft' | 'published' }[]
} = {}) {
  const courseId = randomUUID()
  const title = `Delete ${courseId.slice(0, 6)}`
  await prisma.course.create({ data: { id: courseId, ownerId: admin, title, status: 'active' } })
  const sectionIds = Array.from({ length: sections }, () => randomUUID())
  await prisma.courseSection.createMany({
    data: sectionIds.map((id, i) => ({ id, courseId, title: `Week ${i + 1}`, position: i })),
  })
  const lessonIds = lessons.map(() => randomUUID())
  const next = new Map<string, number>()
  await prisma.lesson.createMany({
    data: lessons.map((l, i) => {
      const sectionId = l.section === null ? null : sectionIds[l.section]
      const key = sectionId ?? 'none'
      const position = next.get(key) ?? 0
      next.set(key, position + 1)
      return {
        id: lessonIds[i],
        courseId,
        sectionId,
        title: `L${i}`,
        position,
        status: l.status ?? 'published',
      }
    }),
  })
  return { courseId, title, sectionIds, lessonIds }
}

/** Lesson titles per group in course order; positions must be gapless 0..n−1. */
async function order(courseId: string, sectionIds: string[]) {
  const lessons = await prisma.lesson.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: { title: true, sectionId: true, position: true },
  })
  const groups: Record<string, string[]> = {}
  for (const key of ['none', ...sectionIds.map((_, i) => String(i))]) {
    const sectionId = key === 'none' ? null : sectionIds[Number(key)]
    const inGroup = lessons.filter((l) => l.sectionId === sectionId)
    expect(inGroup.map((l) => l.position)).toEqual(inGroup.map((_, i) => i))
    groups[key] = inGroup.map((l) => l.title)
  }
  return groups
}

describe('deleteCourse', () => {
  test('needs the exact course title (trimmed)', async () => {
    const { courseId, title } = await makeCourse()
    await expect(repo.deleteCourse(admin, courseId, title.slice(0, -1))).rejects.toMatchObject({
      code: 'title_mismatch',
    })
    await repo.deleteCourse(admin, courseId, `  ${title}  `)
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } })
    expect(course.deletedAt).toBeInstanceOf(Date)
  })

  test("another admin's course is not found", async () => {
    const { courseId, title } = await makeCourse()
    await expect(repo.deleteCourse(otherAdmin, courseId, title)).rejects.toMatchObject({
      code: 'course_not_found',
    })
  })
})

describe('restoreCourse', () => {
  test('within 30 days brings back its lessons and leaves progress untouched', async () => {
    const { courseId, title, lessonIds } = await makeCourse({
      lessons: [{ section: null }, { section: null }],
    })
    const completedAt = new Date('2026-11-01T10:00:00Z')
    await prisma.lessonProgress.create({
      data: { studentId: may, lessonId: lessonIds[0], status: 'done', completedAt },
    })

    await repo.deleteCourse(admin, courseId, title)
    await repo.restoreCourse(admin, courseId)

    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } })
    expect(course.deletedAt).toBeNull()
    const detail = await repo.getAdminCourse(admin, courseId)
    expect(detail.course.lessonCount).toBe(2)
    const progress = await prisma.lessonProgress.findUniqueOrThrow({
      where: { studentId_lessonId: { studentId: may, lessonId: lessonIds[0] } },
    })
    expect(progress).toMatchObject({ status: 'done', completedAt })
  })

  test('after 30 days fails with restore_expired', async () => {
    const { courseId } = await makeCourse()
    await prisma.course.update({
      where: { id: courseId },
      data: { deletedAt: new Date(Date.now() - 31 * DAY) },
    })
    await expect(repo.restoreCourse(admin, courseId)).rejects.toMatchObject({
      code: 'restore_expired',
    })
  })
})

describe('deleteLesson and restoreLesson', () => {
  test('deleting renumbers its group; restoring puts it back in its old place', async () => {
    const { courseId, sectionIds, lessonIds } = await makeCourse({
      sections: 1,
      lessons: [{ section: 0 }, { section: 0 }, { section: 0 }],
    })
    await lessonRepo.deleteLesson(admin, lessonIds[1])
    expect(await order(courseId, sectionIds)).toEqual({ none: [], 0: ['L0', 'L2'] })

    await lessonRepo.restoreLesson(admin, lessonIds[1])
    expect(await order(courseId, sectionIds)).toEqual({ none: [], 0: ['L0', 'L1', 'L2'] })
  })

  test('a restored first lesson goes back to the front', async () => {
    const { courseId, sectionIds, lessonIds } = await makeCourse({
      lessons: [{ section: null }, { section: null }],
    })
    await lessonRepo.deleteLesson(admin, lessonIds[0])
    // The remaining lesson is edited after the delete, so a tie on position can't decide the order.
    await prisma.lesson.update({ where: { id: lessonIds[1] }, data: { updatedAt: new Date() } })
    await lessonRepo.restoreLesson(admin, lessonIds[0])
    expect(await order(courseId, sectionIds)).toEqual({ none: ['L0', 'L1'] })
  })

  test('a lesson whose section is gone comes back under "no section"', async () => {
    const { courseId, sectionIds, lessonIds } = await makeCourse({
      sections: 1,
      lessons: [{ section: 0 }, { section: null }],
    })
    await lessonRepo.deleteLesson(admin, lessonIds[0])
    await lessonRepo.deleteSection(admin, sectionIds[0])
    await lessonRepo.restoreLesson(admin, lessonIds[0])
    const groups = await order(courseId, [])
    expect([...groups.none].sort()).toEqual(['L0', 'L1'])
  })

  test('after 30 days fails with restore_expired', async () => {
    const { lessonIds } = await makeCourse({ lessons: [{ section: null }] })
    await prisma.lesson.update({
      where: { id: lessonIds[0] },
      data: { deletedAt: new Date(Date.now() - 31 * DAY) },
    })
    await expect(lessonRepo.restoreLesson(admin, lessonIds[0])).rejects.toMatchObject({
      code: 'restore_expired',
    })
  })

  test('a lesson of a deleted course comes back only with the course', async () => {
    const { courseId, title, lessonIds } = await makeCourse({ lessons: [{ section: null }] })
    await lessonRepo.deleteLesson(admin, lessonIds[0])
    await repo.deleteCourse(admin, courseId, title)
    await expect(lessonRepo.restoreLesson(admin, lessonIds[0])).rejects.toMatchObject({
      code: 'lesson_not_found',
    })
  })
})

describe('listRecentlyDeleted', () => {
  test('lists deleted courses and lessons of live courses from the last 30 days', async () => {
    const live = await makeCourse({ lessons: [{ section: null }, { section: null }] })
    const gone = await makeCourse({ lessons: [{ section: null }] })
    const old = await makeCourse()
    await lessonRepo.deleteLesson(admin, live.lessonIds[0])
    await lessonRepo.deleteLesson(admin, gone.lessonIds[0])
    await repo.deleteCourse(admin, gone.courseId, gone.title)
    await prisma.course.update({
      where: { id: old.courseId },
      data: { deletedAt: new Date(Date.now() - 31 * DAY) },
    })

    const result = await repo.listRecentlyDeleted(admin)
    const courseIds = result.courses.map((c) => c.id)
    const lessonIds = result.lessons.map((l) => l.id)
    expect(courseIds).toContain(gone.courseId)
    expect(courseIds).not.toContain(old.courseId)
    expect(lessonIds).toContain(live.lessonIds[0])
    // Lessons of a deleted course come back with the course, so they aren't listed on their own.
    expect(lessonIds).not.toContain(gone.lessonIds[0])

    const listed = result.courses.find((c) => c.id === gone.courseId)!
    const purgeIn = new Date(listed.purgeAt).getTime() - new Date(listed.deletedAt).getTime()
    expect(purgeIn).toBe(30 * DAY)
    expect((await repo.listRecentlyDeleted(otherAdmin)).courses).toHaveLength(0)
  })
})

describe('studentWork', () => {
  test('follows data-model.md › Student work', () => {
    expect(studentWork('reviewed', 'done')).toBe('reviewed')
    expect(studentWork('submitted', null)).toBe('submitted')
    expect(studentWork('needs_redo', 'in_progress')).toBe('submitted')
    expect(studentWork('draft', 'done')).toBe('draft_assignment')
    expect(studentWork(null, 'done')).toBe('done')
    expect(studentWork(null, 'in_progress')).toBe('in_progress')
    expect(studentWork(null, 'not_started')).toBe('not_started')
    expect(studentWork(null, null)).toBe('not_started')
  })
})

describe('getLessonImpact', () => {
  test('lists actively assigned students by name with their work on the lesson', async () => {
    const { courseId, lessonIds } = await makeCourse({ lessons: [{ section: null }] })
    await prisma.courseAssignment.createMany({
      data: [
        { courseId, studentId: thant, assignedBy: admin },
        { courseId, studentId: may, assignedBy: admin },
        { courseId, studentId: removed, assignedBy: admin, status: 'removed' },
      ],
    })
    await prisma.submission.create({
      data: { studentId: may, lessonId: lessonIds[0], status: 'draft', bodyMd: 'My answer' },
    })
    await prisma.lessonProgress.create({
      data: { studentId: thant, lessonId: lessonIds[0], status: 'done', completedAt: new Date() },
    })

    expect(await lessonRepo.getLessonImpact(admin, lessonIds[0])).toEqual({
      students: [
        { id: may, displayName: 'May', work: 'draft_assignment' },
        { id: thant, displayName: 'Thant', work: 'done' },
      ],
    })
    await expect(lessonRepo.getLessonImpact(otherAdmin, lessonIds[0])).rejects.toMatchObject({
      code: 'lesson_not_found',
    })
  })
})
