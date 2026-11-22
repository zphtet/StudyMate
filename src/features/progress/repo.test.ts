// @vitest-environment node
// Spec 004 against the dev database. US1 (T017): completion, undo, the Admin's mark done / reopen with
// its audit row, the completion credit (research.md R1, R2; data-model.md › Lesson progress).
// Zin (admin) teaches May (Tokyo). Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { ActionFailure } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { completeLesson, getLessonWork, setLessonDone, undoCompletion } from './repo'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const admin = { id: randomUUID() }
const may = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const users = [admin.id, may.id]

async function makeUser(id: string, role: string, name: string) {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`progress-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone: 'Asia/Tokyo' } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', 'Zin')
  await makeUser(may.id, 'student', 'May')
  await prisma.studentLink.create({
    data: { studentId: may.id, adminId: admin.id, status: 'active' },
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.audit_log where actor_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.lesson_progress where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

/** An Active, in-order course with three Published lessons (12, 20 and 30 min), assigned to May. */
async function makeCourse({
  status = 'active',
  requireSubmission = false,
}: { status?: 'active' | 'archived'; requireSubmission?: boolean } = {}) {
  const id = randomUUID()
  await prisma.course.create({
    data: { id, ownerId: admin.id, title: `Grammar ${id.slice(0, 4)}`, status },
  })
  const lessonIds = [randomUUID(), randomUUID(), randomUUID()]
  await prisma.lesson.createMany({
    data: [12, 20, 30].map((estMinutes, position) => ({
      id: lessonIds[position],
      courseId: id,
      title: `L${position + 1}`,
      status: 'published' as const,
      position,
      estMinutes,
      requireSubmission: position === 0 && requireSubmission,
      assignmentPrompt: position === 0 && requireSubmission ? 'Write 5 sentences' : null,
    })),
  })
  await prisma.courseAssignment.create({
    data: { courseId: id, studentId: may.id, assignedBy: admin.id },
  })
  return { id, lessonIds }
}

const progressOf = (lessonId: string) =>
  prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: may.id, lessonId } },
  })

async function percentOf(courseId: string) {
  const [row] = await prisma.$queryRaw<{ percent: number | null }[]>`
    select percent::int from course_progress where student_id = ${may.id}::uuid and course_id = ${courseId}::uuid`
  return row?.percent ?? null
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ActionFailure)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('completeLesson', () => {
  test('marks the lesson done by the student, credits its estimate and updates progress', async () => {
    const course = await makeCourse()
    const before = Date.now()
    const result = await completeLesson(may, course.lessonIds[0])

    expect(result.nextLessonId).toBe(course.lessonIds[1])
    const row = await progressOf(course.lessonIds[0])
    expect(row).toMatchObject({ status: 'done', completedBy: may.id, minutesSpent: 12 })
    expect(row?.completedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(await percentOf(course.id)).toBe(33)
  })

  test('no estimate credit when the student used a focus timer on the lesson (FR-007)', async () => {
    const course = await makeCourse()
    await prisma.studySession.create({
      data: {
        studentId: may.id,
        lessonId: course.lessonIds[0],
        startedAt: new Date(Date.now() - 20 * 60_000),
        endedAt: new Date(Date.now() - 5 * 60_000),
        plannedMinutes: 15,
      },
    })
    await completeLesson(may, course.lessonIds[0])
    expect((await progressOf(course.lessonIds[0]))?.minutesSpent).toBe(0)
  })

  test('completing twice keeps the first completion', async () => {
    const course = await makeCourse()
    const first = await completeLesson(may, course.lessonIds[0])
    const second = await completeLesson(may, course.lessonIds[0])
    expect(second.completedAt).toBe(first.completedAt)
  })

  test('a locked lesson → lesson_locked; nothing is written', async () => {
    const course = await makeCourse()
    await expect(completeLesson(may, course.lessonIds[1])).rejects.toMatchObject({
      code: 'lesson_locked',
    })
    expect(await progressOf(course.lessonIds[1])).toBeNull()
  })

  test('"submit before complete" without a submission → submission_required', async () => {
    const course = await makeCourse({ requireSubmission: true })
    await expectCode(completeLesson(may, course.lessonIds[0]), 'submission_required')
    await prisma.submission.create({
      data: { studentId: may.id, lessonId: course.lessonIds[0], status: 'draft' },
    })
    await expectCode(completeLesson(may, course.lessonIds[0]), 'submission_required')
    await prisma.submission.update({
      where: { studentId_lessonId: { studentId: may.id, lessonId: course.lessonIds[0] } },
      data: { status: 'needs_redo' },
    })
    await expect(completeLesson(may, course.lessonIds[0])).resolves.toBeDefined()
  })

  test('an Archived course → course_not_active', async () => {
    const course = await makeCourse({ status: 'archived' })
    await prisma.lessonProgress.create({
      data: {
        studentId: may.id,
        lessonId: course.lessonIds[0],
        status: 'done',
        completedAt: new Date(),
      },
    })
    // The completed lesson is still readable in the Archived course, but can't change.
    await expectCode(undoCompletion(may, course.lessonIds[0]), 'course_not_active')
  })
})

describe('undoCompletion', () => {
  test('back to not_started without a session; the credit is cleared and progress drops', async () => {
    const course = await makeCourse()
    await completeLesson(may, course.lessonIds[0])
    await expect(undoCompletion(may, course.lessonIds[0])).resolves.toEqual({
      status: 'not_started',
    })
    expect(await progressOf(course.lessonIds[0])).toMatchObject({
      status: 'not_started',
      completedAt: null,
      completedBy: null,
      minutesSpent: 0,
    })
    expect(await percentOf(course.id)).toBe(0)
  })

  test('back to in_progress when the student has a focus session on the lesson', async () => {
    const course = await makeCourse()
    await prisma.studySession.create({
      data: {
        studentId: may.id,
        lessonId: course.lessonIds[0],
        startedAt: new Date(Date.now() - 30 * 60_000),
        endedAt: new Date(Date.now() - 15 * 60_000),
        plannedMinutes: 15,
      },
    })
    await completeLesson(may, course.lessonIds[0])
    await expect(undoCompletion(may, course.lessonIds[0])).resolves.toEqual({
      status: 'in_progress',
    })
  })

  test('undo does not touch later lessons (spec Edge Cases)', async () => {
    const course = await makeCourse()
    await completeLesson(may, course.lessonIds[0])
    await completeLesson(may, course.lessonIds[1])
    await undoCompletion(may, course.lessonIds[0])
    expect((await progressOf(course.lessonIds[1]))?.status).toBe('done')
    // Lesson 2 is done, so it stays open and its work can be read.
    await expect(getLessonWork(may, course.lessonIds[1])).resolves.toMatchObject({
      progress: { done: true },
    })
  })
})

describe('setLessonDone (Admin, FR-002)', () => {
  test('marks done for the student, records who did it and writes one audit row', async () => {
    const course = await makeCourse({ requireSubmission: true })
    await expect(setLessonDone(admin, may.id, course.lessonIds[0], true)).resolves.toEqual({
      done: true,
    })
    expect(await progressOf(course.lessonIds[0])).toMatchObject({
      status: 'done',
      completedBy: admin.id,
      minutesSpent: 12,
    })
    const audit = await prisma.auditLog.findMany({
      where: { actorId: admin.id, target: { path: ['lessonId'], equals: course.lessonIds[0] } },
    })
    expect(audit.map((a) => [a.action, a.target])).toEqual([
      ['lesson.complete', { studentId: may.id, lessonId: course.lessonIds[0] }],
    ])
  })

  test('reopen clears the completion and is audited; asking again writes nothing', async () => {
    const course = await makeCourse()
    await setLessonDone(admin, may.id, course.lessonIds[0], true)
    await setLessonDone(admin, may.id, course.lessonIds[0], false)
    await setLessonDone(admin, may.id, course.lessonIds[0], false)
    expect(await progressOf(course.lessonIds[0])).toMatchObject({
      status: 'not_started',
      completedBy: null,
    })
    const actions = await prisma.auditLog.findMany({
      where: { actorId: admin.id, target: { path: ['lessonId'], equals: course.lessonIds[0] } },
      orderBy: { id: 'asc' },
    })
    expect(actions.map((a) => a.action)).toEqual(['lesson.complete', 'lesson.reopen'])
  })

  test('an Archived course → course_not_active', async () => {
    const course = await makeCourse({ status: 'archived' })
    await expectCode(setLessonDone(admin, may.id, course.lessonIds[0], true), 'course_not_active')
  })
})

describe('getLessonWork', () => {
  test('names the completer only when it isn’t the student, and gives the next lesson', async () => {
    const course = await makeCourse()
    await completeLesson(may, course.lessonIds[0])
    await expect(getLessonWork(may, course.lessonIds[0])).resolves.toMatchObject({
      progress: { done: true, completedByName: null, minutes: 12 },
      nextLessonId: course.lessonIds[1],
      submission: null,
    })

    await setLessonDone(admin, may.id, course.lessonIds[1], true)
    await expect(getLessonWork(may, course.lessonIds[1])).resolves.toMatchObject({
      progress: { done: true, completedByName: 'Zin' },
      nextLessonId: course.lessonIds[2],
    })
  })

  test('minutes add focus time (capped at the plan) to the completion credit', async () => {
    const course = await makeCourse()
    // An open session started 3 h ago counts its full 15 minutes (FR-007).
    await prisma.studySession.create({
      data: {
        studentId: may.id,
        lessonId: course.lessonIds[0],
        startedAt: new Date(Date.now() - 3 * 3600_000),
        plannedMinutes: 15,
      },
    })
    await expect(getLessonWork(may, course.lessonIds[0])).resolves.toMatchObject({
      progress: { done: false, minutes: 15 },
      nextLessonId: course.lessonIds[1],
    })
  })
})
