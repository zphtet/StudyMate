import 'server-only'
import { z } from 'zod'
import { Prisma, type SubmissionStatus } from '@/generated/prisma/client'
import { placeStudentLesson } from '@/features/courses/student-repo'
import { fail } from '@/lib/action'
import { HttpError, NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { completionBlock } from './completion'
import { reviewedNotice, submittedNotice } from './notices'
import {
  attachmentSchema,
  isOwnSubmissionPath,
  type Attachment,
  type SaveDraftInput,
} from './schemas'
import { adminCanReview, studentNext } from './submission-status'
import type { CommentView, LessonWork, SubmissionView } from './types'

// The student's work on lessons (spec 004; research.md R1, R2, R7, R8). Callers MUST have run a
// guard: students `requireLessonReader`, Admins `requireAdminLessonTarget` or
// `requireSubmissionReviewer`. Field rules: data-model.md LessonProgress.student_id,
// LessonProgress.lesson_id, LessonProgress.status, LessonProgress.completed_at,
// LessonProgress.completed_by, LessonProgress.minutes_spent and LessonProgress.updated_at (set on
// every write); Submission.* and Comment.* for US2.

type Student = { id: string; timezone: string }
type Admin = { id: string }
type Reviewer = { id: string; displayName: string }

/**
 * Counted seconds of a focus session: real time from its start, never past its planned length, so an
 * open session that ran out while the app was closed counts exactly its plan (FR-007, research R3).
 */
const COUNTED_SECONDS = Prisma.sql`extract(epoch from least(coalesce(ended_at, now()),
  started_at + planned_minutes * interval '1 minute') - started_at)`

/** 002's place and lock check, as an action error code (lesson_locked, lesson_not_found). */
function placeForAction(student: Student, lessonId: string) {
  return placeStudentLesson(student, lessonId).catch((error: unknown) => {
    if (error instanceof HttpError || error instanceof NotFound) fail(error.code)
    throw error
  })
}

/** Everything the completion rules read about one lesson for one student, in one query. */
async function lessonFacts(studentId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      estMinutes: true,
      requireSubmission: true,
      course: { select: { status: true } },
      submissions: { where: { studentId }, select: { status: true } },
      sessions: { where: { studentId }, select: { id: true }, take: 1 },
      progress: { where: { studentId }, select: { status: true, completedAt: true } },
    },
  })
  if (!lesson) fail('lesson_not_found')
  return {
    estMinutes: lesson.estMinutes,
    requireSubmission: lesson.requireSubmission,
    courseActive: lesson.course.status === 'active',
    submissionStatus: lesson.submissions[0]?.status ?? null,
    hasSession: lesson.sessions.length > 0,
    progress: lesson.progress[0] ?? null,
  }
}

type Facts = Awaited<ReturnType<typeof lessonFacts>>

const doneData = (facts: Facts, completedBy: string, now: Date) => ({
  status: 'done' as const,
  completedAt: now,
  completedBy,
  // The lesson's estimate counts as study time only when no timer was used on it (FR-007, R2).
  minutesSpent: facts.hasSession ? 0 : facts.estMinutes,
  updatedAt: now,
})

const notDoneData = (facts: Facts, now: Date) => ({
  status: facts.hasSession ? ('in_progress' as const) : ('not_started' as const),
  completedAt: null,
  completedBy: null,
  minutesSpent: 0,
  updatedAt: now,
})

const key = (studentId: string, lessonId: string) => ({
  studentId_lessonId: { studentId, lessonId },
})

/** US1 scenario 1: the student marks a lesson complete. Completing a done lesson changes nothing. */
export async function completeLesson(student: Student, lessonId: string, now = new Date()) {
  const place = await placeForAction(student, lessonId)
  const facts = await lessonFacts(student.id, lessonId)
  const block = completionBlock({
    role: 'student',
    locked: false, // placeForAction already refused a locked lesson
    courseActive: place.courseStatus === 'active',
    requireSubmission: facts.requireSubmission,
    submissionStatus: facts.submissionStatus,
  })
  if (block) fail(block)

  if (facts.progress?.status === 'done' && facts.progress.completedAt) {
    return {
      completedAt: facts.progress.completedAt.toISOString(),
      nextLessonId: place.nextLessonId,
    }
  }
  const data = doneData(facts, student.id, now)
  await prisma.lessonProgress.upsert({
    where: key(student.id, lessonId),
    create: { studentId: student.id, lessonId, ...data },
    update: data,
  })
  return { completedAt: now.toISOString(), nextLessonId: place.nextLessonId }
}

/** US1 scenario 3: back to not done; later lessons are untouched (spec Edge Cases). */
export async function undoCompletion(student: Student, lessonId: string, now = new Date()) {
  const place = await placeForAction(student, lessonId)
  if (place.courseStatus !== 'active') fail('course_not_active')
  const facts = await lessonFacts(student.id, lessonId)
  const data = notDoneData(facts, now)
  if (facts.progress?.status === 'done') {
    await prisma.lessonProgress.update({ where: key(student.id, lessonId), data })
  }
  return { status: data.status }
}

/**
 * US1 scenario 4, FR-002: the Admin marks done or reopens for a student, with one audit row in the
 * same transaction. Nothing is written when the lesson is already in the asked state.
 */
export async function setLessonDone(
  admin: Admin,
  studentId: string,
  lessonId: string,
  done: boolean,
  now = new Date(),
) {
  const facts = await lessonFacts(studentId, lessonId)
  const block = completionBlock({
    role: 'admin',
    locked: false,
    courseActive: facts.courseActive,
    requireSubmission: facts.requireSubmission,
    submissionStatus: facts.submissionStatus,
  })
  if (block) fail(block)
  if ((facts.progress?.status === 'done') === done) return { done }

  const audit = prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: done ? 'lesson.complete' : 'lesson.reopen',
      target: { studentId, lessonId },
    },
  })
  if (done) {
    const data = doneData(facts, admin.id, now)
    await prisma.$transaction([
      prisma.lessonProgress.upsert({
        where: key(studentId, lessonId),
        create: { studentId, lessonId, ...data },
        update: data,
      }),
      audit,
    ])
  } else {
    await prisma.$transaction([
      prisma.lessonProgress.update({
        where: key(studentId, lessonId),
        data: notDoneData(facts, now),
      }),
      audit,
    ])
  }
  return { done }
}

/** Counted focus seconds of one student on one lesson. */
async function lessonSessionSeconds(studentId: string, lessonId: string) {
  const [row] = await prisma.$queryRaw<{ seconds: number }[]>`
    select coalesce(sum(${COUNTED_SECONDS}), 0)::int as seconds
    from study_sessions
    where student_id = ${studentId}::uuid and lesson_id = ${lessonId}::uuid`
  return row?.seconds ?? 0
}

/**
 * GET /api/lessons/[lessonId]/work (contracts/route-handlers.md). Throws 002's 404/403 when the
 * student can't open the lesson.
 */
export async function getLessonWork(student: Student, lessonId: string): Promise<LessonWork> {
  // One round of queries: Realtime refetches this after every review (research.md R10, SC-002).
  const [place, progress, seconds, submission, reviewComments, notesCount, link] =
    await Promise.all([
      placeStudentLesson(student, lessonId),
      prisma.lessonProgress.findUnique({
        where: key(student.id, lessonId),
        select: {
          status: true,
          completedAt: true,
          completedBy: true,
          minutesSpent: true,
          completer: { select: { displayName: true } },
        },
      }),
      lessonSessionSeconds(student.id, lessonId),
      prisma.submission.findUnique({ where: key(student.id, lessonId), select: submissionSelect }),
      getReviewComments(student, student.id, lessonId),
      countNotes(student.id, lessonId),
      prisma.studentLink.findFirst({
        where: { studentId: student.id, status: 'active' },
        select: { admin: { select: { displayName: true } } },
      }),
    ])
  const done = progress?.status === 'done'
  return {
    studentId: student.id,
    progress: {
      done,
      completedAt: done ? (progress.completedAt?.toISOString() ?? null) : null,
      completedByName:
        done && progress.completedBy && progress.completedBy !== student.id
          ? (progress.completer?.displayName ?? null)
          : null,
      minutes: Math.floor(((progress?.minutesSpent ?? 0) * 60 + seconds) / 60),
    },
    submission: submission && toSubmissionView(submission),
    reviewComments,
    notesCount,
    adminName: link?.admin.displayName ?? null,
    nextLessonId: place.nextLessonId,
  }
}

// ── Submissions (research.md R7) ─────────────────────────────────────────────────────────────

export const submissionSelect = {
  id: true,
  status: true,
  bodyMd: true,
  attachments: true,
  submittedAt: true,
  reviewedAt: true,
  updatedAt: true,
} satisfies Prisma.SubmissionSelect

type SubmissionRow = Prisma.SubmissionGetPayload<{ select: typeof submissionSelect }>

const storedAttachments = z.array(attachmentSchema)

/** Image urls go through the access-checked file route (contracts/route-handlers.md). */
export function toSubmissionView(row: SubmissionRow): SubmissionView {
  return {
    id: row.id,
    status: row.status,
    bodyMd: row.bodyMd,
    attachments: storedAttachments.parse(row.attachments).map((a) => ({
      ...a,
      url: `/api/submissions/${row.id}/files/${a.path.slice(a.path.lastIndexOf('/') + 1)}`,
    })),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * The storage path of one attachment, matched by its basename (GET /api/submissions/.../files/...).
 * `ownerId` limits the search to that student's submissions; null when a guard already checked the
 * caller may read it (requireSubmissionReviewer).
 */
export async function findSubmissionFile(
  submissionId: string,
  basename: string,
  ownerId: string | null,
) {
  const row = await prisma.submission.findFirst({
    where: { id: submissionId, ...(ownerId && { studentId: ownerId }) },
    select: { attachments: true },
  })
  if (!row) return null
  const match = storedAttachments
    .parse(row.attachments)
    .find((a) => a.path.slice(a.path.lastIndexOf('/') + 1) === basename)
  return match?.path ?? null
}

/**
 * The lesson a student writes an answer for: open (002's lock), in an Active course, with an
 * assignment prompt. Returns what the notices name.
 */
async function assignmentLesson(student: Student, lessonId: string) {
  const place = await placeForAction(student, lessonId)
  if (place.courseStatus !== 'active') fail('course_not_active')
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, assignmentPrompt: true, course: { select: { title: true } } },
  })
  if (!lesson?.assignmentPrompt) fail('not_found')
  return { id: lesson.id, title: lesson.title, courseTitle: lesson.course.title }
}

/** data-model.md Submission.attachments: every image lives under `<student>/<lesson>/`. */
function checkAttachments(student: Student, lessonId: string, attachments: Attachment[]) {
  if (attachments.some((a) => !isOwnSubmissionPath(a.path, student.id, lessonId))) {
    fail('invalid_input')
  }
}

/**
 * Writes the student's answer when the status allows it (research.md R7): a new row, or an update
 * that only applies while the stored status is still Draft or Needs redo, so a review that lands in
 * between can't be overwritten.
 */
async function writeAnswer(
  student: Student,
  { lessonId, bodyMd, attachments }: SaveDraftInput,
  move: 'save' | 'submit',
  now: Date,
) {
  checkAttachments(student, lessonId, attachments)
  const existing = await prisma.submission.findUnique({
    where: key(student.id, lessonId),
    select: { status: true },
  })
  const status = studentNext(existing?.status ?? null, move)
  if (!status) fail('submission_locked')
  const data = {
    bodyMd,
    attachments,
    status,
    updatedAt: now,
    ...(move === 'submit' && { submittedAt: now, reviewedAt: null }),
  }
  if (!existing) {
    return prisma.submission.create({
      data: { studentId: student.id, lessonId, ...data },
      select: { id: true, status: true },
    })
  }
  const editable: SubmissionStatus[] = ['draft', 'needs_redo']
  const { count } = await prisma.submission.updateMany({
    where: { studentId: student.id, lessonId, status: { in: editable } },
    data,
  })
  if (count === 0) fail('submission_locked')
  return prisma.submission.findUniqueOrThrow({
    where: key(student.id, lessonId),
    select: { id: true, status: true },
  })
}

/** Autosave (US2 scenario 1). A new answer is a Draft; Needs redo stays Needs redo. */
export async function saveDraft(student: Student, input: SaveDraftInput, now = new Date()) {
  await assignmentLesson(student, input.lessonId)
  const row = await writeAnswer(student, input, 'save', now)
  // writeAnswer only saves from an editable status, so this narrows without failing.
  if (row.status !== 'draft' && row.status !== 'needs_redo') fail('submission_locked')
  return { submissionId: row.id, status: row.status, updatedAt: now.toISOString() }
}

/** US2 scenarios 2 and 4: Submitted, with a notice for each actively linked Admin (FR-009). */
export async function submitAssignment(student: Student, input: SaveDraftInput, now = new Date()) {
  const lesson = await assignmentLesson(student, input.lessonId)
  if (input.bodyMd.trim() === '' && input.attachments.length === 0) fail('submission_empty')
  const row = await writeAnswer(student, input, 'submit', now)

  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: student.id },
    select: {
      displayName: true,
      linksAsStudent: {
        where: { status: 'active' },
        select: { admin: { select: { id: true, locale: true, timezone: true } } },
      },
    },
  })
  await Promise.all(
    profile.linksAsStudent.map(({ admin }) =>
      submittedNotice({
        admin,
        student: { id: student.id, displayName: profile.displayName },
        lesson,
        submissionId: row.id,
      }),
    ),
  )
  return { submissionId: row.id, submittedAt: now.toISOString() }
}

/**
 * US2 scenario 3: the Admin's Reviewed / Needs redo with an optional comment and the student's
 * notice, in one transaction. `submission` comes from requireSubmissionReviewer. Never touches
 * lesson_progress (FR-004).
 */
export async function reviewSubmission(
  admin: Reviewer,
  submission: { id: string; studentId: string; lessonId: string; status: SubmissionStatus },
  { status, comment }: { status: 'reviewed' | 'needs_redo'; comment?: string },
  now = new Date(),
) {
  if (!adminCanReview(submission.status, status)) fail('invalid_transition')
  const [student, lesson] = await Promise.all([
    prisma.profile.findUniqueOrThrow({
      where: { id: submission.studentId },
      select: { id: true, locale: true, timezone: true },
    }),
    prisma.lesson.findUniqueOrThrow({
      where: { id: submission.lessonId },
      select: { id: true, title: true, course: { select: { title: true } } },
    }),
  ])
  const reviewable: SubmissionStatus[] = ['submitted', 'reviewed', 'needs_redo']

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id: submission.id, status: { in: reviewable } },
      data: { status, reviewedAt: now, updatedAt: now },
    })
    if (count === 0) fail('invalid_transition')
    if (comment) {
      await tx.comment.create({
        data: {
          authorId: admin.id,
          studentId: submission.studentId,
          targetType: 'submission',
          targetId: submission.id,
          body: comment,
        },
      })
    }
    await reviewedNotice(
      {
        student,
        admin,
        lesson: { id: lesson.id, title: lesson.title, courseTitle: lesson.course.title },
        status,
        submissionId: submission.id,
      },
      tx,
    )
  })
  return { status, reviewedAt: now.toISOString() }
}

// ── Comments (research.md R8) ────────────────────────────────────────────────────────────────

/** A thread is short; older comments beyond this aren't returned (contracts/route-handlers.md). */
const THREAD_LIMIT = 200

const commentSelect = {
  id: true,
  authorId: true,
  body: true,
  createdAt: true,
  author: { select: { displayName: true } },
} satisfies Prisma.CommentSelect

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>

const toCommentView = (row: CommentRow, viewerId: string): CommentView => ({
  id: row.id,
  authorId: row.authorId,
  authorName: row.author.displayName,
  isMine: row.authorId === viewerId,
  body: row.body,
  createdAt: row.createdAt.toISOString(),
})

/** GET /api/lessons/[lessonId]/notes: the Notes thread of one student and lesson (FR-010). */
export async function getNotes(viewer: { id: string }, lessonId: string, studentId: string) {
  const rows = await prisma.comment.findMany({
    where: { studentId, targetType: 'lesson', targetId: lessonId },
    orderBy: { createdAt: 'asc' },
    take: THREAD_LIMIT,
    select: commentSelect,
  })
  return { comments: rows.map((row) => toCommentView(row, viewer.id)) }
}

/**
 * Review comments on the student's submission for one lesson (Assignment tab), oldest first. Found
 * through the lesson, so it runs alongside the submission query instead of after it.
 */
export async function getReviewComments(
  viewer: { id: string },
  studentId: string,
  lessonId: string,
): Promise<CommentView[]> {
  const rows = await prisma.$queryRaw<
    { id: string; author_id: string; author_name: string; body: string; created_at: Date }[]
  >`select c.id, c.author_id, p.display_name as author_name, c.body, c.created_at
    from comments c
    join submissions s on s.id = c.target_id
    join profiles p on p.id = c.author_id
    where c.target_type = 'submission' and c.student_id = ${studentId}::uuid
      and s.student_id = ${studentId}::uuid and s.lesson_id = ${lessonId}::uuid
    order by c.created_at
    limit ${THREAD_LIMIT}`
  return rows.map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name,
    isMine: row.author_id === viewer.id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  }))
}

export const countNotes = (studentId: string, lessonId: string) =>
  prisma.comment.count({ where: { studentId, targetType: 'lesson', targetId: lessonId } })

/** US2 scenario 5: the student or their linked Admin posts in the lesson's Notes. No notice. */
export async function postNote(
  author: { id: string },
  { lessonId, studentId, body }: { lessonId: string; studentId: string; body: string },
) {
  const row = await prisma.comment.create({
    data: { authorId: author.id, studentId, targetType: 'lesson', targetId: lessonId, body },
    select: commentSelect,
  })
  return { comment: toCommentView(row, author.id) }
}
