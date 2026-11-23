// @vitest-environment node
// Spec 003 US1 (T023): the Assign sheet's save against the dev database (research.md R5, R8, R9).
// Zin (admin) assigns to May (en, Tokyo) and Aki (ja, Tokyo). Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getAssignSheet, saveAssignments, setCourseDeadline, setLessonDeadline } from './repo'
import { effectiveDue } from './status'
import type { SaveAssignmentsInput } from './schemas'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const admin = { id: randomUUID(), displayName: 'Zin' }
const may = randomUUID()
const aki = randomUUID()
const users = [admin.id, may, aki]
const dueA = '2026-12-31T14:59:00.000Z'
const dueB = '2027-01-15T14:59:00.000Z'

async function makeUser(id: string, role: string, name: string, locale = 'en') {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`assign-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { locale, timezone: 'Asia/Tokyo' } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', admin.displayName)
  await makeUser(may, 'student', 'May')
  await makeUser(aki, 'student', 'Aki', 'ja')
  await prisma.studentLink.createMany({
    data: [may, aki].map((studentId) => ({ studentId, adminId: admin.id, status: 'active' })),
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.lesson_deadlines where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

async function makeCourse(
  status: 'draft' | 'active' | 'archived' = 'active',
  { deleted = false, unlockInOrder = true } = {},
) {
  const id = randomUUID()
  await prisma.course.create({
    data: {
      id,
      ownerId: admin.id,
      title: `Grammar ${id.slice(0, 4)}`,
      status,
      unlockInOrder,
      targetDate: new Date('2026-12-31T00:00:00Z'),
      deletedAt: deleted ? new Date() : null,
    },
  })
  const lessonIds = [randomUUID(), randomUUID(), randomUUID()]
  await prisma.lesson.createMany({
    data: [
      { type: unlockInOrder ? 'after_previous' : 'none' },
      { type: unlockInOrder ? 'after_previous' : 'none' },
      { type: 'on_date', date: '2027-01-15' },
    ].map((unlockRule, position) => ({
      id: lessonIds[position],
      courseId: id,
      title: `L${position}`,
      status: 'published' as const,
      position,
      unlockRule,
    })),
  })
  return { id, lessonIds }
}

const input = (
  courseId: string,
  rows: SaveAssignmentsInput['rows'],
  options: Partial<Omit<SaveAssignmentsInput, 'courseId' | 'rows'>> = {},
): SaveAssignmentsInput => ({
  courseId,
  rows,
  unlockInOrder: true,
  addDefaultReminders: false,
  notifyNow: false,
  ...options,
})

const assignments = (courseId: string) =>
  prisma.courseAssignment.findMany({ where: { courseId }, orderBy: { studentId: 'asc' } })
const notices = (sourceId: string) =>
  prisma.notification.findMany({ where: { sourceId }, orderBy: { userId: 'asc' } })

describe('saveAssignments', () => {
  test('creates one active row per ticked student; saving again updates instead of duplicating', async () => {
    const course = await makeCourse()
    const first = await saveAssignments(
      admin,
      input(course.id, [
        { studentId: may, assigned: true, dueAt: dueA },
        { studentId: aki, assigned: true, dueAt: null },
      ]),
    )
    expect(first).toEqual({ assigned: 2, unassigned: 0, updated: 0 })
    expect(await assignments(course.id)).toHaveLength(2)
    const row = (await assignments(course.id)).find((a) => a.studentId === may)
    expect(row).toMatchObject({ assignedBy: admin.id, status: 'active' })
    expect(row?.dueAt?.toISOString()).toBe(dueA)

    const second = await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: dueB }]),
    )
    expect(second).toEqual({ assigned: 0, unassigned: 0, updated: 1 })
    const rows = await assignments(course.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((a) => a.studentId === may)?.dueAt?.toISOString()).toBe(dueB)
  })

  test('unticking removes the assignment but keeps progress, submissions and lesson deadlines; ticking again restores it', async () => {
    const course = await makeCourse()
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: dueA }]),
    )
    const lessonId = course.lessonIds[0]
    await prisma.lessonProgress.create({
      data: { studentId: may, lessonId, status: 'done', completedAt: new Date() },
    })
    await prisma.submission.create({
      data: { studentId: may, lessonId, status: 'submitted', bodyMd: 'My answer' },
    })
    await prisma.lessonDeadline.create({
      data: { lessonId, studentId: may, dueAt: new Date(dueA), setBy: admin.id },
    })

    const removed = await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: false, dueAt: null }]),
    )
    expect(removed).toEqual({ assigned: 0, unassigned: 1, updated: 0 })
    expect((await assignments(course.id))[0].status).toBe('removed')
    expect(await prisma.lessonProgress.count({ where: { studentId: may, lessonId } })).toBe(1)
    expect(await prisma.submission.count({ where: { studentId: may, lessonId } })).toBe(1)
    expect(await prisma.lessonDeadline.count({ where: { studentId: may, lessonId } })).toBe(1)

    const back = await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: dueB }]),
    )
    expect(back).toEqual({ assigned: 1, unassigned: 0, updated: 0 })
    const [row] = await assignments(course.id)
    expect(row.status).toBe('active')
    expect(row.dueAt?.toISOString()).toBe(dueB)
  })

  test.each([
    ['Draft', () => makeCourse('draft')],
    ['Archived', () => makeCourse('archived')],
    ['deleted', () => makeCourse('active', { deleted: true })],
  ])('a %s course → course_not_active', async (_, make) => {
    const course = await make()
    await expect(
      saveAssignments(admin, input(course.id, [{ studentId: may, assigned: true, dueAt: null }])),
    ).rejects.toMatchObject({ code: 'course_not_active' })
    expect(await assignments(course.id)).toHaveLength(0)
  })

  test('default reminders: the 4 rules once per student, also with two saves at once', async () => {
    const course = await makeCourse()
    const save = () =>
      saveAssignments(
        admin,
        input(course.id, [{ studentId: aki, assigned: true, dueAt: null }], {
          addDefaultReminders: true,
        }),
      )
    await Promise.all([save(), save()])
    await save()
    const rules = await prisma.notificationRule.findMany({
      where: { ownerId: admin.id, studentId: aki },
      orderBy: { trigger: 'asc' },
    })
    expect(rules.map((r) => r.trigger).sort()).toEqual(
      ['daily', 'due_soon', 'overdue', 'streak_risk'].sort(),
    )
    expect(rules.find((r) => r.trigger === 'due_soon')).toMatchObject({
      config: { preset: 'default', offsets_h: [24, 2] },
      channels: ['push'],
      enabled: true,
    })
    // 006 FR-008: Daily Mon–Fri; Overdue repeats at `repeat_time`.
    expect(rules.find((r) => r.trigger === 'daily')?.config).toEqual({
      preset: 'default',
      time: '20:00',
      days: [1, 2, 3, 4, 5],
    })
    expect(rules.find((r) => r.trigger === 'overdue')?.config).toEqual({
      preset: 'default',
      repeat_time: '19:00',
      max: 3,
    })
    // Aki's language is Japanese.
    expect(rules.every((r) => /[぀-ヿ一-鿿]/.test(r.message))).toBe(true)
  })

  test('notices: assigned only for new or reassigned students, deadline only when it changed', async () => {
    const course = await makeCourse()
    const both = (dueMay: string | null, options: Partial<SaveAssignmentsInput> = {}) =>
      saveAssignments(
        admin,
        input(
          course.id,
          [
            { studentId: may, assigned: true, dueAt: dueMay },
            { studentId: aki, assigned: true, dueAt: null },
          ],
          options,
        ),
      )

    await both(dueA, { notifyNow: true })
    let rows = await notices(course.id)
    expect(rows.map((n) => n.occurrenceKey)).toEqual(['assigned', 'assigned'])
    const akiNotice = rows.find((n) => n.userId === aki)
    expect(akiNotice?.title).toMatch(/[぀-ヿ一-鿿]/)
    expect(rows.find((n) => n.userId === may)).toMatchObject({
      sourceType: 'system',
      url: `/s/courses/${course.id}`,
      readAt: null,
    })

    // Already assigned: no new `assigned` notice; unchanged deadline → nothing for Aki.
    await both(dueB, { notifyNow: true })
    rows = await notices(course.id)
    expect(rows.filter((n) => n.occurrenceKey === 'assigned')).toHaveLength(2)
    expect(rows.filter((n) => n.occurrenceKey === 'deadline').map((n) => n.userId)).toEqual([may])

    await both(dueB)
    expect(await notices(course.id)).toHaveLength(3)
  })

  test('changing "Unlock lessons in order" rewrites lesson rules like 002’s updateCourse', async () => {
    const course = await makeCourse('active', { unlockInOrder: true })
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: null }], { unlockInOrder: false }),
    )
    const saved = await prisma.course.findUniqueOrThrow({
      where: { id: course.id },
      select: {
        unlockInOrder: true,
        lessons: { orderBy: { position: 'asc' }, select: { unlockRule: true } },
      },
    })
    expect(saved.unlockInOrder).toBe(false)
    expect(saved.lessons.map((l) => l.unlockRule)).toEqual([
      { type: 'none' },
      { type: 'none' },
      { type: 'on_date', date: '2027-01-15' },
    ])
  })
})

describe('getAssignSheet', () => {
  test('lists every actively linked student by name with their assignment and deadline', async () => {
    const course = await makeCourse()
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: dueA }]),
    )
    const sheet = await getAssignSheet(admin.id, course.id)
    expect(sheet.course).toMatchObject({
      id: course.id,
      status: 'active',
      targetDate: '2026-12-31',
      unlockInOrder: true,
    })
    expect(sheet.students).toEqual([
      { id: aki, displayName: 'Aki', timezone: 'Asia/Tokyo', assigned: false, dueAt: null },
      { id: may, displayName: 'May', timezone: 'Asia/Tokyo', assigned: true, dueAt: dueA },
    ])
  })
})

// Spec 003 US2 (T033): course and lesson deadlines (research.md R2, R6, R8).
describe('setCourseDeadline', () => {
  test('updates the course deadline and records a notice only when it changed', async () => {
    const course = await makeCourse()
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: null }]),
    )
    await setCourseDeadline(admin, { courseId: course.id, studentId: may, dueAt: dueA })
    expect((await assignments(course.id))[0].dueAt?.toISOString()).toBe(dueA)
    expect(await notices(course.id)).toHaveLength(1)
    await setCourseDeadline(admin, { courseId: course.id, studentId: may, dueAt: dueA })
    const [notice] = await notices(course.id)
    expect(notice.occurrenceKey).toBe('deadline')
    expect(await notices(course.id)).toHaveLength(1)
  })

  test('a removed assignment → assignment_not_found', async () => {
    const course = await makeCourse()
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: null }]),
    )
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: false, dueAt: null }]),
    )
    await expect(
      setCourseDeadline(admin, { courseId: course.id, studentId: may, dueAt: dueA }),
    ).rejects.toMatchObject({ code: 'assignment_not_found' })
  })
})

describe('setLessonDeadline', () => {
  async function assigned(courseDue: string | null = dueA) {
    const course = await makeCourse()
    await saveAssignments(
      admin,
      input(course.id, [{ studentId: may, assigned: true, dueAt: courseDue }]),
    )
    return course
  }

  test('upserts with set_by = admin; null removes it and the lesson falls back to the course deadline', async () => {
    const course = await assigned()
    const lessonId = course.lessonIds[0]
    const lessonDue = '2026-12-01T12:00:00.000Z'
    expect(await setLessonDeadline(admin, { lessonId, studentId: may, dueAt: lessonDue })).toEqual({
      dueAt: lessonDue,
      effectiveDueAt: lessonDue,
    })
    const row = await prisma.lessonDeadline.findUniqueOrThrow({
      where: { lessonId_studentId: { lessonId, studentId: may } },
    })
    expect(row.setBy).toBe(admin.id)
    expect(await setLessonDeadline(admin, { lessonId, studentId: may, dueAt: null })).toEqual({
      dueAt: null,
      effectiveDueAt: dueA,
    })
    expect(await prisma.lessonDeadline.count({ where: { lessonId, studentId: may } })).toBe(0)
  })

  test('a lesson deadline later than the course deadline is allowed', async () => {
    const course = await assigned()
    await expect(
      setLessonDeadline(admin, { lessonId: course.lessonIds[1], studentId: may, dueAt: dueB }),
    ).resolves.toEqual({ dueAt: dueB, effectiveDueAt: dueB })
  })

  test('no active assignment → assignment_not_found; a Draft lesson → lesson_not_found', async () => {
    const course = await makeCourse()
    await expect(
      setLessonDeadline(admin, { lessonId: course.lessonIds[0], studentId: may, dueAt: dueA }),
    ).rejects.toMatchObject({ code: 'assignment_not_found' })
    await prisma.lesson.update({ where: { id: course.lessonIds[0] }, data: { status: 'draft' } })
    await expect(
      setLessonDeadline(admin, { lessonId: course.lessonIds[0], studentId: may, dueAt: dueA }),
    ).rejects.toMatchObject({ code: 'lesson_not_found' })
  })

  test('a second change after the student read the first leaves one unread notice with the latest text', async () => {
    const course = await assigned()
    const lessonId = course.lessonIds[0]
    await setLessonDeadline(admin, { lessonId, studentId: may, dueAt: '2026-12-01T12:00:00Z' })
    const [first] = await notices(lessonId)
    await prisma.notification.update({ where: { id: first.id }, data: { readAt: new Date() } })
    await setLessonDeadline(admin, { lessonId, studentId: may, dueAt: '2026-12-02T12:00:00Z' })
    const rows = await notices(lessonId)
    expect(rows).toHaveLength(1)
    expect(rows[0].readAt).toBeNull()
    expect(rows[0].title).not.toBe(first.title)
    expect(rows[0].url).toBe(`/s/lessons/${lessonId}`)
  })

  test('the app’s effectiveDue gives the same result as SQL effective_due()', async () => {
    const course = await assigned()
    await setLessonDeadline(admin, {
      lessonId: course.lessonIds[0],
      studentId: may,
      dueAt: '2026-12-01T12:00:00Z',
    })
    const [assignment] = await assignments(course.id)
    for (const lessonId of course.lessonIds) {
      const [sql] = await prisma.$queryRaw<{ due: Date | null }[]>`
        select effective_due(${may}::uuid, ${lessonId}::uuid) as due`
      const own = await prisma.lessonDeadline.findUnique({
        where: { lessonId_studentId: { lessonId, studentId: may } },
      })
      expect(effectiveDue(own?.dueAt, assignment.dueAt)?.toISOString() ?? null).toBe(
        sql.due?.toISOString() ?? null,
      )
    }
  })
})
