import 'server-only'
import { z } from 'zod'
import { Prisma, type SubmissionStatus } from '@/generated/prisma/client'
import type { CourseColor } from '@/features/courses/schemas'
import { getStudentCourse, placeStudentLesson } from '@/features/courses/student-repo'
import { fail } from '@/lib/action'
import { HttpError, NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { isActiveDay } from '@/lib/streak'
import { addCalendarDays, addMonths, datesOfMonth, mondayOf, todayIn } from '@/lib/time'
import { COUNTED_SECONDS, dailyActivity, weekFacts } from '@/server/activity'
import { completionBlock } from './completion'
import { MIN_COUNTED_SECONDS, remainingSeconds, shouldDiscard } from './focus'
import { forecast } from './forecast'
import { heatLevel } from './heat'
import { reviewedNotice, submittedNotice } from './notices'
import {
  attachmentSchema,
  focusMinutesSchema,
  isOwnSubmissionPath,
  type Attachment,
  type SaveDraftInput,
  type StartFocusInput,
} from './schemas'
import { adminCanReview, studentNext } from './submission-status'
import type {
  CommentView,
  FocusState,
  LessonWork,
  ProgressResponse,
  ProgressSummary,
  ProgressView,
  SubmissionView,
} from './types'

// The student's work on lessons (spec 004; research.md R1, R2, R7, R8). Callers MUST have run a
// guard: students `requireLessonReader`, Admins `requireAdminLessonTarget` or
// `requireSubmissionReviewer`. Field rules: data-model.md LessonProgress.student_id,
// LessonProgress.lesson_id, LessonProgress.status, LessonProgress.completed_at,
// LessonProgress.completed_by, LessonProgress.minutes_spent and LessonProgress.updated_at (set on
// every write); Submission.* and Comment.* for US2.

type Student = { id: string; timezone: string }
type Admin = { id: string }
type Reviewer = { id: string; displayName: string }

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

// ── Progress (US3; research.md R2, R4–R6, R13) ───────────────────────────────────────────────

/** The local month or week containing `today`, and the one before it. */
function periodsOf(view: ProgressView, today: string) {
  if (view === 'week') {
    const monday = mondayOf(today)
    const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i))
    return {
      dates,
      previous: { from: addCalendarDays(monday, -7), to: addCalendarDays(monday, -1) },
    }
  }
  const month = today.slice(0, 7)
  const before = datesOfMonth(addMonths(month, -1))
  return {
    dates: datesOfMonth(month),
    previous: { from: before[0], to: before.at(-1) ?? before[0] },
  }
}

/** Active courses assigned to the student with progress, deadline and forecast, by title. */
async function coursesWithForecast(student: Student, today: string) {
  const since = addCalendarDays(today, -13) // the last 14 local days, today included
  const rows = await prisma.$queryRaw<
    {
      course_id: string
      title: string
      color: string
      total: number | null
      done: number | null
      percent: number | null
      due_at: Date | null
      recent: number
    }[]
  >`select c.id as course_id, c.title, c.color, cp.published_lessons::int as total,
           cp.done_lessons::int as done, cp.percent::int as percent, ca.due_at,
           (select count(*) from lesson_progress lp join lessons l on l.id = lp.lesson_id
            where l.course_id = c.id and l.status = 'published' and l.deleted_at is null
              and lp.student_id = ca.student_id and lp.status = 'done'
              and (lp.completed_at at time zone ${student.timezone})::date >= ${since}::date
           )::int as recent
    from course_assignments ca
    join courses c on c.id = ca.course_id and c.status = 'active' and c.deleted_at is null
    left join course_progress cp on cp.course_id = ca.course_id and cp.student_id = ca.student_id
    where ca.student_id = ${student.id}::uuid and ca.status = 'active'
    order by c.title`
  return rows.map((r) => {
    const total = r.total ?? 0
    const done = r.done ?? 0
    return {
      courseId: r.course_id,
      title: r.title,
      // Course.color is checked by the course form schema (002), as in courses/repo.ts.
      color: r.color as CourseColor,
      percent: r.percent,
      done,
      total,
      dueAt: r.due_at?.toISOString() ?? null,
      forecast: forecast({
        published: total,
        done,
        doneLast14: r.recent,
        today,
        dueOn: r.due_at ? todayIn(student.timezone, r.due_at) : null,
      }),
    }
  })
}

const goalOf = (studentId: string) =>
  prisma.profile
    .findUniqueOrThrow({ where: { id: studentId }, select: { weeklyGoalDays: true } })
    .then((p) => p.weeklyGoalDays)

/** GET /api/progress?view=month|week (US3 scenario 1–2; research.md R5). */
export async function getProgress(
  student: Student,
  view: ProgressView,
  now = new Date(),
): Promise<ProgressResponse> {
  const today = todayIn(student.timezone, now)
  const [goal, days, courses] = await Promise.all([
    goalOf(student.id),
    dailyActivity(student.id, student.timezone),
    coursesWithForecast(student, today),
  ])
  const facts = weekFacts(days, today)
  const { dates, previous } = periodsOf(view, today)
  const from = dates[0]
  const to = dates[dates.length - 1]
  const byDate = new Map(days.map((d) => [d.date, d]))
  const inPeriod = days.filter((d) => d.date >= from && d.date <= to)
  const completionsIn = (a: string, b: string) =>
    days.filter((d) => d.date >= a && d.date <= b).reduce((sum, d) => sum + d.completions, 0)

  return {
    today,
    streak: facts.streak,
    goal: { days: goal, activeThisWeek: facts.weekActiveDays },
    period: { from, to },
    studied: {
      seconds: inPeriod.reduce((sum, d) => sum + d.seconds, 0),
      activeDays: inPeriod.filter(isActiveDay).length,
    },
    lessonsDone: {
      count: completionsIn(from, to),
      previous: completionsIn(previous.from, previous.to),
    },
    days: dates.map((date) => {
      const day = byDate.get(date)
      const seconds = day?.seconds ?? 0
      return { date, seconds, completions: day?.completions ?? 0, level: heatLevel(seconds) }
    }),
    courses,
  }
}

/**
 * Where to pick up (Today's Continue card; research.md R13): the active course with the latest
 * activity (a completion or a focus session), else the first assigned, and its first open lesson that
 * isn't done. Null when there is none.
 */
async function continueCard(student: Student, now: Date): Promise<ProgressSummary['continue']> {
  const courses = await prisma.$queryRaw<{ course_id: string }[]>`
    select ca.course_id
    from course_assignments ca
    join courses c on c.id = ca.course_id and c.status = 'active' and c.deleted_at is null
    left join lateral (
      select max(t) as last from (
        select lp.completed_at as t from lesson_progress lp join lessons l on l.id = lp.lesson_id
        where l.course_id = c.id and lp.student_id = ca.student_id
        union all
        select ss.started_at from study_sessions ss join lessons l on l.id = ss.lesson_id
        where l.course_id = c.id and ss.student_id = ca.student_id
      ) t
    ) activity on true
    where ca.student_id = ${student.id}::uuid and ca.status = 'active'
    order by activity.last desc nulls last, ca.created_at, c.title`
  for (const { course_id } of courses) {
    const view = await getStudentCourse(student, course_id, now)
    const lesson = view.groups.flatMap((g) => g.lessons).find((l) => l.state === 'open' && !l.done)
    if (lesson) {
      return {
        courseId: view.course.id,
        courseTitle: view.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        number: lesson.number,
        done: view.course.progress.done,
        total: view.course.progress.total,
      }
    }
  }
  return null
}

/** GET /api/progress/summary: streak, this week's active days and Continue (Today). */
export async function getSummary(student: Student, now = new Date()): Promise<ProgressSummary> {
  const today = todayIn(student.timezone, now)
  const [goal, days, next] = await Promise.all([
    goalOf(student.id),
    dailyActivity(student.id, student.timezone),
    continueCard(student, now),
  ])
  const facts = weekFacts(days, today)
  return {
    streak: facts.streak,
    week: { activeDays: facts.weekActiveDays, goal },
    continue: next,
  }
}

// ── Focus timer (research.md R3; data-model.md › Study session) ──────────────────────────────
// Every time is the database's now(), so a wrong phone clock can't add minutes. The cap is the
// study_sessions_capped check; one running session per student is study_sessions_one_running.

/** End of a running session: now, or its planned end if that came first. */
const CAPPED_END = Prisma.sql`least(now(), started_at + planned_minutes * interval '1 minute')`

/**
 * US4 scenario 1: start a 15 or 25 min timer on a lesson the student can open, also after it is done
 * (re-studying). In one transaction, an earlier running session ends (or is dropped if under a minute,
 * FR-007), the new one starts, and a lesson not started yet becomes in progress.
 */
export async function startFocus(student: Student, { lessonId, minutes }: StartFocusInput) {
  const place = await placeForAction(student, lessonId)
  if (place.courseStatus !== 'active') fail('course_not_active')

  const session = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`delete from study_sessions
      where student_id = ${student.id}::uuid and ended_at is null
        and ${COUNTED_SECONDS} < ${MIN_COUNTED_SECONDS}`
    await tx.$executeRaw`update study_sessions set ended_at = ${CAPPED_END}
      where student_id = ${student.id}::uuid and ended_at is null`
    const [row] = await tx.$queryRaw<{ id: string; started_at: Date }[]>`
      insert into study_sessions (student_id, lesson_id, started_at, planned_minutes)
      values (${student.id}::uuid, ${lessonId}::uuid, now(), ${minutes})
      returning id::text, started_at`
    await tx.$executeRaw`
      insert into lesson_progress (student_id, lesson_id, status, updated_at)
      values (${student.id}::uuid, ${lessonId}::uuid, 'in_progress', now())
      on conflict (student_id, lesson_id) do update set status = 'in_progress', updated_at = now()
      where lesson_progress.status = 'not_started'`
    return row
  })
  return {
    sessionId: session.id,
    startedAt: session.started_at.toISOString(),
    plannedMinutes: minutes,
  }
}

/**
 * US4: Stop, or the countdown reaching 0. Ends the session at most at its plan; under a minute it is
 * deleted and counts 0 (FR-007). Stopping a session that already ended returns what it counted.
 */
export async function stopFocus(student: Student, sessionId: string) {
  const [row] = await prisma.$queryRaw<{ isRunning: boolean; seconds: number }[]>`
    select ended_at is null as "isRunning", floor(${COUNTED_SECONDS})::int as seconds
    from study_sessions where id = ${sessionId}::uuid and student_id = ${student.id}::uuid`
  if (!row) fail('session_not_found')
  if (!row.isRunning) return { countedSeconds: row.seconds }
  if (shouldDiscard(row.seconds)) {
    await prisma.$executeRaw`delete from study_sessions where id = ${sessionId}::uuid and ended_at is null`
    return { countedSeconds: 0 }
  }
  const [stopped] = await prisma.$queryRaw<{ seconds: number }[]>`
    update study_sessions set ended_at = ${CAPPED_END}
    where id = ${sessionId}::uuid and ended_at is null
    returning floor(${COUNTED_SECONDS})::int as seconds`
  // Already ended by a start on another tab in the meantime: what was read is what it counted.
  return { countedSeconds: stopped?.seconds ?? row.seconds }
}

/**
 * GET /api/focus: the running session with the server's clock. A session past its plan is null: it
 * already counts in full (US4 scenario 2) and the next start or stop closes it.
 */
export async function getActiveSession(student: { id: string }): Promise<FocusState> {
  const [[{ now }], open] = await Promise.all([
    prisma.$queryRaw<{ now: Date }[]>`select now()`,
    prisma.studySession.findFirst({
      where: { studentId: student.id, endedAt: null },
      select: {
        id: true,
        lessonId: true,
        startedAt: true,
        plannedMinutes: true,
        lesson: { select: { title: true } },
      },
    }),
  ])
  const isRunning = open && remainingSeconds(open, now, 0) > 0
  return {
    now: now.toISOString(),
    session: isRunning
      ? {
          id: open.id,
          lessonId: open.lessonId,
          lessonTitle: open.lesson?.title ?? null,
          startedAt: open.startedAt.toISOString(),
          plannedMinutes: focusMinutesSchema.parse(open.plannedMinutes),
        }
      : null,
  }
}
