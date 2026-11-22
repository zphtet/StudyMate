import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { placeStudentLesson } from '@/features/courses/student-repo'
import { fail } from '@/lib/action'
import { HttpError, NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { completionBlock } from './completion'
import type { LessonWork } from './types'

// The student's work on lessons (spec 004; research.md R1, R2). Callers MUST have run a guard:
// students `requireLessonReader`, Admins `requireAdminLessonTarget`. Field rules: data-model.md
// LessonProgress.student_id, LessonProgress.lesson_id, LessonProgress.status,
// LessonProgress.completed_at, LessonProgress.completed_by, LessonProgress.minutes_spent and
// LessonProgress.updated_at (set on every write).

type Student = { id: string; timezone: string }
type Admin = { id: string }

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
 * student can't open the lesson. Submission, review comments and the Notes count come with US2.
 */
export async function getLessonWork(student: Student, lessonId: string): Promise<LessonWork> {
  const place = await placeStudentLesson(student, lessonId)
  const [progress, seconds] = await Promise.all([
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
  ])
  const done = progress?.status === 'done'
  return {
    progress: {
      done,
      completedAt: done ? (progress.completedAt?.toISOString() ?? null) : null,
      completedByName:
        done && progress.completedBy && progress.completedBy !== student.id
          ? (progress.completer?.displayName ?? null)
          : null,
      minutes: Math.floor(((progress?.minutesSpent ?? 0) * 60 + seconds) / 60),
    },
    submission: null,
    reviewComments: [],
    notesCount: 0,
    nextLessonId: place.nextLessonId,
  }
}
