// @vitest-environment node
// Spec 003 US3 (T044): what a student sees as due and late, against the dev database. May is in
// Tokyo, Thant in Yangon; both are linked to Zin and assigned the same course. One fixed `now`.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { getStudentCourse, listStudentCourses } from '@/features/courses/student-repo'
import { prisma } from '@/lib/prisma'
import { getToday } from './student-repo'

vi.setConfig({ testTimeout: 30_000 })

const run = Date.now()
const now = new Date('2026-11-20T10:00:00Z') // 19:00 Tokyo, 16:30 Yangon
const admin = randomUUID()
const may = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const thant = { id: randomUUID(), timezone: 'Asia/Yangon' }
const course = { grammar: randomUUID(), archived: randomUUID(), removed: randomUUID() }
const courseDue = new Date('2026-12-31T14:59:00Z') // 23:59 Tokyo, 31 Dec

// Grammar lessons in course order. `unlock` none unless stated, so locks don't hide statuses.
const L = {
  late3: randomUUID(), // 17 Nov 21:00 Tokyo → 3 days late
  late2: randomUUID(), // 18 Nov 21:00 Tokyo → 2 days late
  tonight: randomUUID(), // 20 Nov 21:00 Tokyo
  evening: randomUUID(), // 20 Nov 20:00 Tokyo
  lateNight: randomUUID(), // 02:00 Tokyo on the 21st = 23:30 Yangon on the 20th
  locked: randomUUID(), // after_previous, course deadline only
  done: randomUUID(), // missed deadline but done
  upcoming: randomUUID(), // course deadline only
  draft: randomUUID(),
  deleted: randomUUID(),
  archived: randomUUID(),
  removed: randomUUID(),
}

async function makeUser(id: string, role: 'admin' | 'student', name: string, timezone?: string) {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`student-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  if (timezone) await prisma.profile.update({ where: { id }, data: { timezone } })
}

beforeAll(async () => {
  await makeUser(admin, 'admin', 'Zin')
  await makeUser(may.id, 'student', 'May', may.timezone)
  await makeUser(thant.id, 'student', 'Thant', thant.timezone)
  await prisma.studentLink.createMany({
    data: [may.id, thant.id].map((studentId) => ({ studentId, adminId: admin, status: 'active' })),
  })
  await prisma.course.createMany({
    data: [
      { id: course.grammar, ownerId: admin, title: 'JLPT N4 Grammar', status: 'active' },
      { id: course.archived, ownerId: admin, title: 'Old kanji', status: 'archived' },
      { id: course.removed, ownerId: admin, title: 'Dropped', status: 'active' },
    ],
  })
  await prisma.courseAssignment.createMany({
    data: [
      { courseId: course.grammar, studentId: may.id, assignedBy: admin, dueAt: courseDue },
      { courseId: course.grammar, studentId: thant.id, assignedBy: admin },
      { courseId: course.archived, studentId: may.id, assignedBy: admin, dueAt: courseDue },
      { courseId: course.removed, studentId: may.id, assignedBy: admin, status: 'removed' },
    ],
  })
  const none = { type: 'none' }
  const lesson = (
    id: string,
    title: string,
    position: number,
    extra: { status?: 'draft'; deletedAt?: Date; courseId?: string; unlockRule?: object } = {},
  ) => ({
    id,
    title,
    position,
    courseId: extra.courseId ?? course.grammar,
    status: extra.status ?? ('published' as const),
    deletedAt: extra.deletedAt ?? null,
    unlockRule: extra.unlockRule ?? none,
    estMinutes: 15,
  })
  await prisma.lesson.createMany({
    data: [
      lesson(L.late3, 'Late three', 0),
      lesson(L.late2, 'Late two', 1),
      lesson(L.tonight, 'Tonight', 2),
      lesson(L.evening, 'Evening', 3),
      lesson(L.lateNight, 'Late night', 4),
      lesson(L.locked, 'Locked', 5, { unlockRule: { type: 'after_previous' } }),
      lesson(L.done, 'Done', 6),
      lesson(L.upcoming, 'Upcoming', 7),
      lesson(L.draft, 'Draft', 8, { status: 'draft' }),
      lesson(L.deleted, 'Deleted', 9, { deletedAt: new Date() }),
      lesson(L.archived, 'Archived', 0, { courseId: course.archived }),
      lesson(L.removed, 'Removed', 0, { courseId: course.removed }),
    ],
  })
  const deadline = (lessonId: string, dueAt: string, studentId = may.id) => ({
    lessonId,
    studentId,
    dueAt: new Date(dueAt),
    setBy: admin,
  })
  await prisma.lessonDeadline.createMany({
    data: [
      deadline(L.late3, '2026-11-17T12:00:00Z'),
      deadline(L.late2, '2026-11-18T12:00:00Z'),
      deadline(L.tonight, '2026-11-20T12:00:00Z'),
      deadline(L.evening, '2026-11-20T11:00:00Z'),
      deadline(L.lateNight, '2026-11-20T17:00:00Z'),
      deadline(L.done, '2026-11-19T00:00:00Z'),
      deadline(L.draft, '2026-11-19T00:00:00Z'),
      deadline(L.deleted, '2026-11-16T12:00:00Z'),
      deadline(L.archived, '2026-11-19T00:00:00Z'),
      deadline(L.removed, '2026-11-19T00:00:00Z'),
      deadline(L.lateNight, '2026-11-20T17:00:00Z', thant.id),
    ],
  })
  await prisma.lessonProgress.createMany({
    data: [L.done, L.archived].map((lessonId) => ({
      studentId: may.id,
      lessonId,
      status: 'done' as const,
      completedAt: now,
    })),
  })
})

afterAll(async () => {
  const users = [may.id, thant.id, admin]
  await prisma.$executeRaw`delete from public.lesson_deadlines where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const ids = (items: { lessonId: string }[]) => items.map((i) => i.lessonId)

describe('getToday', () => {
  test('overdue oldest first, then due today earliest first, in the student’s zone', async () => {
    const today = await getToday(may, now)
    expect(ids(today.overdue)).toEqual([L.late3, L.late2])
    expect(today.overdue.map((i) => i.due.daysLate)).toEqual([3, 2])
    expect(ids(today.dueToday)).toEqual([L.evening, L.tonight])
    expect(today.dueToday[0]).toMatchObject({
      title: 'Evening',
      estMinutes: 15,
      courseId: course.grammar,
      courseTitle: 'JLPT N4 Grammar',
      due: { dueAt: '2026-11-20T11:00:00.000Z', status: 'due_soon', daysLate: 0 },
    })
  })

  test('23:30 in Yangon is due today there, but tomorrow for the Tokyo student', async () => {
    expect(ids((await getToday(thant, now)).dueToday)).toEqual([L.lateNight])
    expect(ids((await getToday(may, now)).dueToday)).not.toContain(L.lateNight)
  })

  test('only counting lessons: done, Draft, deleted, Archived-course and removed ones are left out', async () => {
    const today = await getToday(may, now)
    const shown = [...ids(today.overdue), ...ids(today.dueToday)]
    for (const hidden of [L.done, L.draft, L.deleted, L.archived, L.removed]) {
      expect(shown).not.toContain(hidden)
    }
  })

  test('a soft-deleted lesson’s deadline comes back when the lesson is restored', async () => {
    await prisma.lesson.update({ where: { id: L.deleted }, data: { deletedAt: null } })
    try {
      expect(ids((await getToday(may, now)).overdue)).toEqual([L.deleted, L.late3, L.late2])
    } finally {
      await prisma.lesson.update({ where: { id: L.deleted }, data: { deletedAt: new Date() } })
    }
  })
})

describe('listStudentCourses (spec 003 additions)', () => {
  test('each active course has the student’s own course deadline and overdue count', async () => {
    const mine = await listStudentCourses(may.id, now)
    expect(mine.active).toHaveLength(1)
    expect(mine.active[0]).toMatchObject({
      id: course.grammar,
      dueAt: courseDue.toISOString(),
      overdueCount: 2,
    })
    const theirs = await listStudentCourses(thant.id, now)
    expect(theirs.active[0]).toMatchObject({ id: course.grammar, dueAt: null, overdueCount: 0 })
  })

  test('archived courses have no deadline and no overdue count', async () => {
    const { archived } = await listStudentCourses(may.id, now)
    expect(archived[0]).toMatchObject({ id: course.archived, dueAt: null, overdueCount: 0 })
  })
})

describe('getStudentCourse (spec 003 additions)', () => {
  const lessonsOf = async (student: typeof may, courseId: string) => {
    const view = await getStudentCourse(student, courseId, now)
    return {
      view,
      byId: new Map(view.groups.flatMap((g) => g.lessons).map((l) => [l.id, l])),
    }
  }

  test('the course deadline and each lesson’s done flag and due status', async () => {
    const { view, byId } = await lessonsOf(may, course.grammar)
    expect(view.course.dueAt).toBe(courseDue.toISOString())
    expect(byId.get(L.late3)).toMatchObject({
      done: false,
      due: { dueAt: '2026-11-17T12:00:00.000Z', status: 'overdue', daysLate: 3 },
    })
    expect(byId.get(L.tonight)?.due?.status).toBe('due_soon')
    expect(byId.get(L.done)).toMatchObject({ done: true, due: { status: 'done' } })
    // No lesson deadline: falls back to the course deadline.
    expect(byId.get(L.upcoming)?.due).toEqual({
      dueAt: courseDue.toISOString(),
      status: 'upcoming',
      daysLate: 0,
    })
    expect(byId.get(L.locked)?.due?.status).toBe('locked')
  })

  test('a lesson with no effective deadline has due null', async () => {
    const { view, byId } = await lessonsOf(thant, course.grammar)
    expect(view.course.dueAt).toBeNull()
    expect(byId.get(L.late3)?.due).toBeNull()
    expect(byId.get(L.lateNight)?.due?.status).toBe('due_soon')
  })

  test('an Archived course shows no deadlines', async () => {
    const { view, byId } = await lessonsOf(may, course.archived)
    expect(view.course.dueAt).toBeNull()
    expect(byId.get(L.archived)).toMatchObject({ done: true, due: null })
  })
})

// Spec 004 US1 (T024): progress from the course_progress view (FR-005). Grammar has 8 Published,
// non-deleted lessons (Draft and deleted ones don't count); May has done 1, Thant none.
describe('course progress (spec 004 additions)', () => {
  test('each active card has the student’s percent and done count', async () => {
    const mine = await listStudentCourses(may.id, now)
    expect(mine.active[0]).toMatchObject({ id: course.grammar, percent: 13, doneCount: 1 })
    const theirs = await listStudentCourses(thant.id, now)
    expect(theirs.active[0]).toMatchObject({ id: course.grammar, percent: 0, doneCount: 0 })
  })

  test('the course screen has percent, done and total', async () => {
    const view = await getStudentCourse(may, course.grammar, now)
    expect(view.course.progress).toEqual({ percent: 13, done: 1, total: 8 })
  })
})
