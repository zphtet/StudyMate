// @vitest-environment node
// Spec 008 research R7 (progress, submission and focus rows), R8; contracts/sync-route.md. Replaying
// a queued op against the dev database: applied, duplicate, and each reason it is dropped.
// data-model.md lesson_progress.client_op_id, submissions.client_op_id, study_sessions.client_op_id.
// Zin (admin) teaches May; Aya is another student. Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { completeLesson, startFocus, submitAssignment } from './repo'
import { applyProgressOp, type ProgressOp } from './sync-ops'

vi.setConfig({ testTimeout: 60_000 })

let currentUserId: string | null = null
const storedFiles = new Set<string>()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: currentUserId && { id: currentUserId, email_confirmed_at: '2026-01-01' } },
        error: null,
      }),
    },
    storage: {
      from: () => ({
        exists: async (path: string) => ({ data: storedFiles.has(path), error: null }),
      }),
    },
  }),
}))

const run = Date.now()
const admin = { id: randomUUID() }
const may = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const aya = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const users = [admin.id, may.id, aya.id]

const minutesAgo = (n: number, from = new Date()) => new Date(from.getTime() - n * 60_000)
const iso = (date: Date) => date.toISOString()

async function makeUser(id: string, role: string, name: string) {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    values (${id}::uuid, ${`sync-ops-${run}-${id}@example.test`}, ${meta}::jsonb, now())`
  await prisma.profile.update({ where: { id }, data: { timezone: 'Asia/Tokyo' } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', 'Zin')
  await makeUser(may.id, 'student', 'May')
  await makeUser(aya.id, 'student', 'Aya')
  await prisma.studentLink.createMany({
    data: [
      { studentId: may.id, adminId: admin.id, status: 'active' },
      { studentId: aya.id, adminId: admin.id, status: 'active' },
    ],
  })
})

beforeEach(() => {
  currentUserId = may.id
  storedFiles.clear()
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.lesson_progress where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.study_sessions where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.submissions where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.notifications where user_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

/** An Active, in-order course with three lessons assigned to `student`; lesson 1 has a prompt. */
async function makeCourse({
  requireSubmission = false,
  student = may,
}: { requireSubmission?: boolean; student?: { id: string } } = {}) {
  const id = randomUUID()
  await prisma.course.create({
    data: { id, ownerId: admin.id, title: `Sync ${id.slice(0, 4)}`, status: 'active' },
  })
  const lessonIds = [randomUUID(), randomUUID(), randomUUID()]
  await prisma.lesson.createMany({
    data: lessonIds.map((lessonId, position) => ({
      id: lessonId,
      courseId: id,
      title: `L${position + 1}`,
      status: 'published' as const,
      position,
      estMinutes: 10,
      requireSubmission: position === 0 && requireSubmission,
      assignmentPrompt: position === 0 ? 'Write 5 sentences' : null,
    })),
  })
  await prisma.courseAssignment.create({
    data: { courseId: id, studentId: student.id, assignedBy: admin.id },
  })
  return { id, lessonIds }
}

const progressOf = (lessonId: string) =>
  prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: may.id, lessonId } },
  })
const submissionOf = (lessonId: string) =>
  prisma.submission.findUnique({ where: { studentId_lessonId: { studentId: may.id, lessonId } } })

const apply = (op: ProgressOp, serverNow = new Date()) => applyProgressOp(may, op, serverNow)

function complete(lessonId: string, at = minutesAgo(10)): ProgressOp {
  return {
    id: randomUUID(),
    type: 'progress.complete',
    at: iso(at),
    lessonId,
    base: { wasDone: false },
  }
}

function draft(
  lessonId: string,
  {
    type = 'submission.save',
    base = null,
    at = minutesAgo(5),
    bodyMd = 'こんにちは',
    attachments = [],
  }: {
    type?: 'submission.save' | 'submission.submit'
    base?: string | null
    at?: Date
    bodyMd?: string
    attachments?: { path: string; name: string; size: number }[]
  } = {},
): ProgressOp {
  return {
    id: randomUUID(),
    type,
    at: iso(at),
    lessonId,
    bodyMd,
    attachments,
    base: { updatedAt: base },
  }
}

describe('progress.complete and progress.undo', () => {
  test('applied: done at the time the student acted, with the op id', async () => {
    const { lessonIds } = await makeCourse()
    const op = complete(lessonIds[0])
    expect(await apply(op)).toMatchObject({ id: op.id, status: 'applied' })
    const row = await progressOf(lessonIds[0])
    expect(row).toMatchObject({ status: 'done', clientOpId: op.id })
    expect(row?.completedAt?.toISOString()).toBe(op.at)
  })

  test('duplicate: the same op twice changes nothing the second time', async () => {
    const { lessonIds } = await makeCourse()
    const op = complete(lessonIds[0])
    await apply(op)
    expect(await apply(op)).toEqual({ id: op.id, status: 'duplicate' })
  })

  test('already done on another device: applied without changing the first completion', async () => {
    const { lessonIds } = await makeCourse()
    await completeLesson(may, lessonIds[0])
    const before = await progressOf(lessonIds[0])
    expect(await apply(complete(lessonIds[0]))).toMatchObject({ status: 'applied' })
    expect((await progressOf(lessonIds[0]))?.completedAt).toEqual(before?.completedAt)
  })

  test('dropped: a lesson the Admin deleted meanwhile is unavailable', async () => {
    const { lessonIds } = await makeCourse()
    await prisma.lesson.update({ where: { id: lessonIds[0] }, data: { deletedAt: new Date() } })
    expect(await apply(complete(lessonIds[0]))).toMatchObject({
      status: 'dropped',
      code: 'lesson_unavailable',
    })
  })

  test("dropped: 004's rules still hold (locked, submission required)", async () => {
    const inOrder = await makeCourse()
    expect(await apply(complete(inOrder.lessonIds[1]))).toMatchObject({
      status: 'dropped',
      code: 'lesson_locked',
    })
    const needsWork = await makeCourse({ requireSubmission: true })
    expect(await apply(complete(needsWork.lessonIds[0]))).toMatchObject({
      status: 'dropped',
      code: 'submission_required',
    })
  })

  test('undo: back to not done with the op id; a duplicate is reported as such', async () => {
    const { lessonIds } = await makeCourse()
    await completeLesson(may, lessonIds[0])
    const op: ProgressOp = {
      id: randomUUID(),
      type: 'progress.undo',
      at: iso(minutesAgo(1)),
      lessonId: lessonIds[0],
      base: { wasDone: true },
    }
    expect(await apply(op)).toMatchObject({ status: 'applied' })
    expect(await progressOf(lessonIds[0])).toMatchObject({
      status: 'not_started',
      clientOpId: op.id,
    })
    expect(await apply(op)).toEqual({ id: op.id, status: 'duplicate' })
  })

  test("dropped: another student's lesson is unavailable and untouched", async () => {
    const ayas = await makeCourse({ student: aya })
    expect(await apply(complete(ayas.lessonIds[0]))).toMatchObject({
      status: 'dropped',
      code: 'lesson_unavailable',
    })
    expect(await prisma.lessonProgress.count({ where: { lessonId: ayas.lessonIds[0] } })).toBe(0)
  })
})

describe('submission.save and submission.submit', () => {
  test('applied: a new draft, returning its version and keeping the op id', async () => {
    const { lessonIds } = await makeCourse()
    const op = draft(lessonIds[0])
    const result = await apply(op)
    const row = await submissionOf(lessonIds[0])
    expect(row).toMatchObject({ status: 'draft', bodyMd: 'こんにちは', clientOpId: op.id })
    expect(result).toMatchObject({ status: 'applied', version: row?.updatedAt.toISOString() })
  })

  test('applied on the version the student saw; duplicate on a replay', async () => {
    const { lessonIds } = await makeCourse()
    const first = await apply(draft(lessonIds[0]))
    const version = first.status === 'applied' ? (first.version ?? null) : null
    const op = draft(lessonIds[0], { base: version, bodyMd: 'second' })
    expect(await apply(op)).toMatchObject({ status: 'applied' })
    expect((await submissionOf(lessonIds[0]))?.bodyMd).toBe('second')
    expect(await apply(op)).toMatchObject({ id: op.id, status: 'duplicate' })
  })

  test('dropped: changed on another device since; the server text stays', async () => {
    const { lessonIds } = await makeCourse()
    await apply(draft(lessonIds[0], { bodyMd: 'from the phone' }))
    const stale = draft(lessonIds[0], { base: minutesAgo(60).toISOString(), bodyMd: 'offline' })
    expect(await apply(stale)).toMatchObject({ status: 'dropped', code: 'changed_on_server' })
    expect((await submissionOf(lessonIds[0]))?.bodyMd).toBe('from the phone')
  })

  test('dropped: the Admin reviewed it meanwhile', async () => {
    const { lessonIds } = await makeCourse()
    const saved = await apply(draft(lessonIds[0]))
    const version = saved.status === 'applied' ? (saved.version ?? null) : null
    await submitAssignment(may, { lessonId: lessonIds[0], bodyMd: 'done', attachments: [] })
    await prisma.submission.updateMany({
      where: { studentId: may.id, lessonId: lessonIds[0] },
      data: { status: 'reviewed', reviewedAt: new Date(), updatedAt: new Date() },
    })
    expect(await apply(draft(lessonIds[0], { base: version }))).toMatchObject({
      status: 'dropped',
      code: 'changed_on_server',
    })
  })

  test('dropped: a photo that never reached Storage', async () => {
    const { lessonIds } = await makeCourse()
    const path = `${may.id}/${lessonIds[0]}/${randomUUID()}.webp`
    const op = draft(lessonIds[0], { attachments: [{ path, name: 'page.webp', size: 1000 }] })
    expect(await apply(op)).toMatchObject({ status: 'dropped', code: 'file_missing' })
    storedFiles.add(path)
    expect(await apply({ ...op, id: randomUUID() })).toMatchObject({ status: 'applied' })
  })

  test("dropped: a photo path in another student's folder", async () => {
    const { lessonIds } = await makeCourse()
    const path = `${aya.id}/${lessonIds[0]}/${randomUUID()}.webp`
    storedFiles.add(path)
    const op = draft(lessonIds[0], { attachments: [{ path, name: 'x.webp', size: 10 }] })
    expect(await apply(op)).toMatchObject({ status: 'dropped', code: 'invalid_input' })
  })

  test('submit: submitted at the press time; server time when that is before the version', async () => {
    const { lessonIds } = await makeCourse()
    const at = minutesAgo(7)
    expect(await apply(draft(lessonIds[0], { type: 'submission.submit', at }))).toMatchObject({
      status: 'applied',
    })
    expect((await submissionOf(lessonIds[0]))?.submittedAt?.toISOString()).toBe(iso(at))

    const other = await makeCourse()
    const saved = await apply(draft(other.lessonIds[0]))
    const version = saved.status === 'applied' ? (saved.version ?? null) : null
    const serverNow = new Date()
    const early = draft(other.lessonIds[0], {
      type: 'submission.submit',
      base: version,
      at: minutesAgo(60),
    })
    expect(await apply(early, serverNow)).toMatchObject({ status: 'applied' })
    expect((await submissionOf(other.lessonIds[0]))?.submittedAt).toEqual(serverNow)
  })
})

describe('focus.record and focus.stop', () => {
  const record = (
    lessonId: string,
    startedAt: Date,
    endedAt: Date,
    minutes: 15 | 25 = 25,
  ): ProgressOp => ({
    id: randomUUID(),
    type: 'focus.record',
    at: iso(endedAt),
    lessonId,
    minutes,
    startedAt: iso(startedAt),
    endedAt: iso(endedAt),
  })

  test('applied: a finished session with the op id; the lesson is in progress', async () => {
    const { lessonIds } = await makeCourse()
    const op = record(lessonIds[0], minutesAgo(40), minutesAgo(20))
    expect(await apply(op)).toMatchObject({ status: 'applied' })
    const session = await prisma.studySession.findUnique({ where: { clientOpId: op.id } })
    expect(session).toMatchObject({ studentId: may.id, plannedMinutes: 25 })
    expect(session?.startedAt.toISOString()).toBe(op.type === 'focus.record' && op.startedAt)
    expect((await progressOf(lessonIds[0]))?.status).toBe('in_progress')
    expect(await apply(op)).toEqual({ id: op.id, status: 'duplicate' })
  })

  test('dropped: overlapping a session already recorded', async () => {
    const { lessonIds } = await makeCourse()
    await apply(record(lessonIds[0], minutesAgo(120), minutesAgo(100)))
    expect(await apply(record(lessonIds[0], minutesAgo(110), minutesAgo(90)))).toMatchObject({
      status: 'dropped',
      code: 'focus_overlap',
    })
  })

  test('dropped: longer than its plan', async () => {
    const { lessonIds } = await makeCourse()
    expect(await apply(record(lessonIds[0], minutesAgo(300), minutesAgo(270), 15))).toMatchObject({
      status: 'dropped',
      code: 'invalid_input',
    })
  })

  test('stop: a session started online ends when the student stopped it offline', async () => {
    const { lessonIds } = await makeCourse()
    const { sessionId } = await startFocus(may, { lessonId: lessonIds[0], minutes: 25 })
    // It started 10 minutes ago; the student stopped it 4 minutes ago (one clock for both, so
    // the database's clock skew doesn't matter).
    const stoppedAt = minutesAgo(4)
    await prisma.studySession.update({
      where: { id: sessionId },
      data: { startedAt: minutesAgo(6, stoppedAt) },
    })
    const op: ProgressOp = { id: randomUUID(), type: 'focus.stop', at: iso(stoppedAt), sessionId }
    expect(await apply(op)).toMatchObject({ status: 'applied', data: { countedSeconds: 360 } })
    const session = await prisma.studySession.findUnique({ where: { id: sessionId } })
    expect(Math.abs((session?.endedAt?.getTime() ?? 0) - stoppedAt.getTime())).toBeLessThan(1000)
    // Stopping it again returns what it counted.
    expect(await apply({ ...op, id: randomUUID() })).toMatchObject({
      status: 'applied',
      data: { countedSeconds: 360 },
    })
  })

  test('stop: an unknown session is dropped', async () => {
    const op: ProgressOp = {
      id: randomUUID(),
      type: 'focus.stop',
      at: iso(new Date()),
      sessionId: randomUUID(),
    }
    expect(await apply(op)).toMatchObject({ status: 'dropped', code: 'session_not_found' })
  })
})
