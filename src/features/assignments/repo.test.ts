// @vitest-environment node
// Spec 003 US1 (T023): the Assign sheet's save against the dev database (research.md R5, R8, R9).
// Zin (admin) assigns to May (en, Tokyo) and Aki (ja, Tokyo). Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getAssignSheet, saveAssignments } from './repo'
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
      where: { adminId: admin.id, studentId: aki },
      orderBy: { trigger: 'asc' },
    })
    expect(rules.map((r) => r.trigger).sort()).toEqual(
      ['daily', 'due_soon', 'overdue', 'streak_risk'].sort(),
    )
    expect(rules.find((r) => r.trigger === 'due_soon')).toMatchObject({
      config: { preset: 'default', offsets_h: [24, 2] },
      channels: ['push', 'inapp'],
      enabled: true,
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
