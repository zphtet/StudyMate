// @vitest-environment node
// Spec 004 against the dev database. US1 (T017): completion, undo, the Admin's mark done / reopen with
// its audit row, the completion credit (research.md R1, R2; data-model.md › Lesson progress).
// US2 (T033): drafts, submit, review, notices and Notes (research.md R7–R9; data-model.md
// Submission.body_md, Submission.attachments, Submission.status, Submission.submitted_at,
// Submission.reviewed_at, Comment.target_type, Comment.target_id).
// Zin (admin) teaches May (Tokyo, reads Japanese); Aung (admin) only has a pending request from May.
// Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import ja from '@/i18n/messages/ja.json'
import { ActionFailure } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import {
  completeLesson,
  getLessonWork,
  getNotes,
  postNote,
  reviewSubmission,
  saveDraft,
  setLessonDone,
  submitAssignment,
  undoCompletion,
} from './repo'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const admin = { id: randomUUID(), displayName: 'Zin' }
const aung = { id: randomUUID() }
const may = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const users = [admin.id, aung.id, may.id]

async function makeUser(id: string, role: string, name: string) {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`progress-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone: 'Asia/Tokyo' } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', 'Zin')
  await makeUser(aung.id, 'admin', 'Aung')
  await makeUser(may.id, 'student', 'May')
  await prisma.profile.update({ where: { id: may.id }, data: { locale: 'ja' } })
  await prisma.studentLink.createMany({
    data: [
      { studentId: may.id, adminId: admin.id, status: 'active' },
      { studentId: may.id, adminId: aung.id, status: 'pending' },
    ],
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
/** Lesson 1 has an assignment prompt when `prompt` or `requireSubmission` is set. */
async function makeCourse({
  status = 'active',
  requireSubmission = false,
  prompt = false,
}: { status?: 'active' | 'archived'; requireSubmission?: boolean; prompt?: boolean } = {}) {
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
      assignmentPrompt:
        position === 0 && (requireSubmission || prompt) ? 'Write 5 sentences' : null,
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

// ── US2: submissions (research.md R7) ─────────────────────────────────────────────────────────

const photo = (lessonId: string, size = 1000) => ({
  path: `${may.id}/${lessonId}/${randomUUID()}.webp`,
  name: 'photo.webp',
  size,
})

const submissionOf = (lessonId: string) =>
  prisma.submission.findUniqueOrThrow({
    where: { studentId_lessonId: { studentId: may.id, lessonId } },
  })

/** What requireSubmissionReviewer hands the repo. */
async function reviewerView(lessonId: string) {
  const { id, studentId, status } = await submissionOf(lessonId)
  return { id, studentId, lessonId, status }
}

const noticesOf = (submissionId: string) =>
  prisma.notification.findMany({
    where: { sourceId: submissionId },
    select: {
      userId: true,
      occurrenceKey: true,
      title: true,
      url: true,
      readAt: true,
      sentAt: true,
    },
    orderBy: { userId: 'asc' },
  })

describe('saveDraft', () => {
  test('creates a draft, then updates it and keeps the status', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    const first = await saveDraft(may, { lessonId, bodyMd: 'Hello', attachments: [] })
    expect(first.status).toBe('draft')

    const image = photo(lessonId)
    const second = await saveDraft(may, { lessonId, bodyMd: 'Hello again', attachments: [image] })
    expect(second).toMatchObject({ submissionId: first.submissionId, status: 'draft' })
    expect(await submissionOf(lessonId)).toMatchObject({
      status: 'draft',
      bodyMd: 'Hello again',
      attachments: [image],
      submittedAt: null,
    })
  })

  test('a Needs redo answer stays Needs redo while the student edits it', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await submitAssignment(may, { lessonId, bodyMd: 'v1', attachments: [] })
    await reviewSubmission(admin, await reviewerView(lessonId), { status: 'needs_redo' })
    await expect(
      saveDraft(may, { lessonId, bodyMd: 'v2', attachments: [] }),
    ).resolves.toMatchObject({ status: 'needs_redo' })
  })

  test.each(['submitted', 'reviewed'] as const)(
    'refuses in %s with submission_locked',
    async (status) => {
      const course = await makeCourse({ prompt: true })
      const lessonId = course.lessonIds[0]
      await prisma.submission.create({
        data: { studentId: may.id, lessonId, status, bodyMd: 'Sent', submittedAt: new Date() },
      })
      await expectCode(
        saveDraft(may, { lessonId, bodyMd: 'Changed', attachments: [] }),
        'submission_locked',
      )
      expect((await submissionOf(lessonId)).bodyMd).toBe('Sent')
    },
  )

  test('refuses an image path outside <student>/<lesson>/ with invalid_input', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    const elsewhere = { ...photo(course.lessonIds[1]) }
    const someoneElse = { ...photo(lessonId), path: `${admin.id}/${lessonId}/${randomUUID()}.webp` }
    for (const image of [elsewhere, someoneElse]) {
      await expectCode(
        saveDraft(may, { lessonId, bodyMd: 'x', attachments: [image] }),
        'invalid_input',
      )
    }
  })

  test('a lesson without an assignment prompt → not_found', async () => {
    const course = await makeCourse()
    await expectCode(
      saveDraft(may, { lessonId: course.lessonIds[0], bodyMd: 'x', attachments: [] }),
      'not_found',
    )
  })

  test('a locked lesson → lesson_locked', async () => {
    const course = await makeCourse({ prompt: true })
    await expectCode(
      saveDraft(may, { lessonId: course.lessonIds[1], bodyMd: 'x', attachments: [] }),
      'lesson_locked',
    )
  })
})

describe('submitAssignment', () => {
  test('sets submitted_at, clears reviewed_at and notifies the linked Admin only', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await saveDraft(may, { lessonId, bodyMd: 'Draft', attachments: [] })
    const before = Date.now()
    const result = await submitAssignment(may, { lessonId, bodyMd: 'Final', attachments: [] })

    const row = await submissionOf(lessonId)
    expect(row).toMatchObject({ id: result.submissionId, status: 'submitted', bodyMd: 'Final' })
    expect(row.submittedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(row.reviewedAt).toBeNull()

    const notices = await noticesOf(row.id)
    expect(notices).toEqual([
      expect.objectContaining({
        userId: admin.id,
        occurrenceKey: 'submitted',
        url: `/a/students/${may.id}/lessons/${lessonId}`,
        readAt: null,
      }),
    ])
    expect(notices[0].title).toContain('May')
  })

  test('an empty body and no images → submission_empty', async () => {
    const course = await makeCourse({ prompt: true })
    await expectCode(
      submitAssignment(may, { lessonId: course.lessonIds[0], bodyMd: '  \n ', attachments: [] }),
      'submission_empty',
    )
  })

  test('images alone are enough', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await expect(
      submitAssignment(may, { lessonId, bodyMd: '', attachments: [photo(lessonId)] }),
    ).resolves.toBeDefined()
  })

  test('a resubmit replaces the notice and makes it unread again; reviewed_at is cleared', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    const { submissionId } = await submitAssignment(may, {
      lessonId,
      bodyMd: 'v1',
      attachments: [],
    })
    await prisma.notification.updateMany({
      where: { sourceId: submissionId },
      data: { readAt: new Date() },
    })
    await reviewSubmission(admin, await reviewerView(lessonId), { status: 'needs_redo' })
    await submitAssignment(may, { lessonId, bodyMd: 'v2', attachments: [] })

    expect(await submissionOf(lessonId)).toMatchObject({ status: 'submitted', reviewedAt: null })
    const forAdmin = (await noticesOf(submissionId)).filter((n) => n.userId === admin.id)
    expect(forAdmin).toHaveLength(1)
    expect(forAdmin[0].readAt).toBeNull()
  })

  test('a submitted answer can’t be submitted again → submission_locked', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await submitAssignment(may, { lessonId, bodyMd: 'v1', attachments: [] })
    await expectCode(
      submitAssignment(may, { lessonId, bodyMd: 'v2', attachments: [] }),
      'submission_locked',
    )
  })
})

describe('reviewSubmission', () => {
  test('sets reviewed_at, adds the comment to the submission and never touches progress', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await completeLesson(may, lessonId)
    const progressBefore = await progressOf(lessonId)
    await submitAssignment(may, { lessonId, bodyMd: 'Answer', attachments: [] })

    const result = await reviewSubmission(admin, await reviewerView(lessonId), {
      status: 'needs_redo',
      comment: 'Check sentence 3.',
    })
    expect(result.status).toBe('needs_redo')
    const row = await submissionOf(lessonId)
    expect(row.status).toBe('needs_redo')
    expect(row.reviewedAt?.toISOString()).toBe(result.reviewedAt)

    const comments = await prisma.comment.findMany({ where: { targetId: row.id } })
    expect(comments).toEqual([
      expect.objectContaining({
        authorId: admin.id,
        studentId: may.id,
        targetType: 'submission',
        body: 'Check sentence 3.',
      }),
    ])
    expect(await progressOf(lessonId)).toEqual(progressBefore)
  })

  test('the Admin may change the review; the student gets one notice, in Japanese', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    const { submissionId } = await submitAssignment(may, { lessonId, bodyMd: 'A', attachments: [] })
    await reviewSubmission(admin, await reviewerView(lessonId), { status: 'needs_redo' })
    await reviewSubmission(admin, await reviewerView(lessonId), { status: 'reviewed' })

    expect((await submissionOf(lessonId)).status).toBe('reviewed')
    const forMay = (await noticesOf(submissionId)).filter((n) => n.userId === may.id)
    expect(forMay).toEqual([
      expect.objectContaining({
        occurrenceKey: 'reviewed',
        url: `/s/lessons/${lessonId}?tab=assignment`,
        title: ja.notices.reviewedTitle.replace('{lesson}', 'L1'),
      }),
    ])
    expect(await progressOf(lessonId)).toBeNull()
  })

  test('a move the table doesn’t allow → invalid_transition', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    await saveDraft(may, { lessonId, bodyMd: 'Draft', attachments: [] })
    await expectCode(
      reviewSubmission(admin, await reviewerView(lessonId), { status: 'reviewed' }),
      'invalid_transition',
    )
  })
})

describe('Notes (FR-010)', () => {
  test('the student and the Admin post in one thread, oldest first', async () => {
    const course = await makeCourse()
    const lessonId = course.lessonIds[0]
    const fromMay = await postNote(may, { lessonId, studentId: may.id, body: 'Is は right here?' })
    const fromZin = await postNote(admin, { lessonId, studentId: may.id, body: 'Yes, it is.' })
    expect(fromMay.comment).toMatchObject({ authorName: 'May', isMine: true })
    expect(fromZin.comment).toMatchObject({ authorName: 'Zin', body: 'Yes, it is.' })

    const forMay = await getNotes(may, lessonId, may.id)
    expect(forMay.comments.map((c) => [c.body, c.isMine])).toEqual([
      ['Is は right here?', true],
      ['Yes, it is.', false],
    ])
    const forZin = await getNotes(admin, lessonId, may.id)
    expect(forZin.comments.map((c) => c.isMine)).toEqual([false, true])
    const stored = await prisma.comment.findMany({ where: { targetId: lessonId } })
    expect(stored.every((c) => c.targetType === 'lesson' && c.studentId === may.id)).toBe(true)
  })

  test('a thread returns at most 200 comments, the oldest ones', async () => {
    const course = await makeCourse()
    const lessonId = course.lessonIds[0]
    const start = Date.now() - 300_000
    await prisma.comment.createMany({
      data: Array.from({ length: 201 }, (_, i) => ({
        authorId: may.id,
        studentId: may.id,
        targetType: 'lesson',
        targetId: lessonId,
        body: `n${i}`,
        createdAt: new Date(start + i * 1000),
      })),
    })
    const { comments } = await getNotes(may, lessonId, may.id)
    expect(comments).toHaveLength(200)
    expect(comments[0].body).toBe('n0')
    expect(comments[199].body).toBe('n199')
  })
})

describe('getLessonWork (US2)', () => {
  test('returns the submission with image urls, review comments and the Notes count', async () => {
    const course = await makeCourse({ prompt: true })
    const lessonId = course.lessonIds[0]
    const image = photo(lessonId, 1234)
    const { submissionId } = await submitAssignment(may, {
      lessonId,
      bodyMd: 'Answer',
      attachments: [image],
    })
    await reviewSubmission(admin, await reviewerView(lessonId), {
      status: 'reviewed',
      comment: 'Well done.',
    })
    await postNote(may, { lessonId, studentId: may.id, body: 'Thanks!' })

    const work = await getLessonWork(may, lessonId)
    const basename = image.path.split('/').pop()
    expect(work.submission).toMatchObject({
      id: submissionId,
      status: 'reviewed',
      bodyMd: 'Answer',
      attachments: [{ ...image, url: `/api/submissions/${submissionId}/files/${basename}` }],
    })
    expect(work.reviewComments.map((c) => [c.body, c.authorName, c.isMine])).toEqual([
      ['Well done.', 'Zin', false],
    ])
    expect(work.notesCount).toBe(1)
  })
})
