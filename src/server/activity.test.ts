// @vitest-environment node
// Spec 004 activity against the dev database, moved from features/progress with the code (006 T005):
// study seconds and completions per local day (004 research.md R2; data-model.md
// StudySession.started_at, StudySession.ended_at, StudySession.planned_minutes,
// LessonProgress.completed_at, LessonProgress.minutes_spent). Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { dailyActivity, dailyActivityForStudents } from './activity'

vi.setConfig({ testTimeout: 60_000 })

const run = Date.now()
const admin = { id: randomUUID() }
const aya = { id: randomUUID(), timezone: 'Asia/Tokyo' }
const ken = { id: randomUUID(), timezone: 'America/New_York' }
const users = [admin.id, aya.id, ken.id]

async function makeUser(id: string, role: string, name: string, timezone = 'Asia/Tokyo') {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`activity-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', 'Zin')
  await makeUser(aya.id, 'student', 'Aya', aya.timezone)
  await makeUser(ken.id, 'student', 'Ken', ken.timezone)
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.lesson_progress where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.study_sessions where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

/** A Published lesson in a fresh course of the Admin's (courses cascade with their owner). */
async function makeLesson() {
  const courseId = randomUUID()
  await prisma.course.create({ data: { id: courseId, ownerId: admin.id, title: 'Grammar' } })
  const lesson = await prisma.lesson.create({
    data: { courseId, title: 'L1', status: 'published', position: 0, estMinutes: 12 },
  })
  return lesson.id
}

/** A done row for a lesson of a fresh course, completed at `at` with a credit of `minutes`. */
async function completion(studentId: string, at: string, minutes: number) {
  const lessonId = await makeLesson()
  await prisma.lessonProgress.create({
    data: {
      studentId,
      lessonId,
      status: 'done',
      completedAt: new Date(at),
      completedBy: studentId,
      minutesSpent: minutes,
    },
  })
}

async function session(studentId: string, start: string, minutes: number, planned = 25) {
  const startedAt = new Date(start)
  await prisma.studySession.create({
    data: {
      studentId,
      startedAt,
      endedAt: minutes === 0 ? null : new Date(startedAt.getTime() + minutes * 60_000),
      plannedMinutes: planned,
    },
  })
}

describe('dailyActivity', () => {
  test('groups by the student’s local date; credits land on the completion date', async () => {
    await completion(aya.id, '2026-10-10T14:30:00Z', 12) // 23:30 Tokyo, 10 Oct
    await completion(aya.id, '2026-10-10T15:30:00Z', 0) // 00:30 Tokyo, 11 Oct
    // 23:55–00:15 Tokyo: counts on the start date, 20 min.
    await session(aya.id, '2026-10-10T14:55:00Z', 20)
    const days = await dailyActivity(aya.id, aya.timezone, { from: '2026-10-01', to: '2026-10-31' })
    expect(days).toEqual([
      { date: '2026-10-10', seconds: 12 * 60 + 20 * 60, completions: 1 },
      { date: '2026-10-11', seconds: 0, completions: 1 },
    ])
  })

  test('an open session past its plan counts the planned minutes', async () => {
    await session(aya.id, '2026-10-20T01:00:00Z', 0, 15)
    const days = await dailyActivity(aya.id, aya.timezone, { from: '2026-10-20', to: '2026-10-20' })
    expect(days).toEqual([{ date: '2026-10-20', seconds: 15 * 60, completions: 0 }])
  })

  test('New York across the daylight-saving change (1 Nov 2026)', async () => {
    await session(ken.id, '2026-11-01T04:30:00Z', 15) // 00:30 EDT, 1 Nov
    await session(ken.id, '2026-11-02T04:30:00Z', 15) // 23:30 EST, 1 Nov
    await session(ken.id, '2026-11-02T05:30:00Z', 15) // 00:30 EST, 2 Nov
    const days = await dailyActivity(ken.id, ken.timezone, { from: '2026-10-31', to: '2026-11-02' })
    expect(days).toEqual([
      { date: '2026-11-01', seconds: 30 * 60, completions: 0 },
      { date: '2026-11-02', seconds: 15 * 60, completions: 0 },
    ])
  })

  test('the Admin version reads every student, each in their own zone, in one query', async () => {
    const queries = vi.spyOn(prisma, '$queryRaw')
    const byStudent = await dailyActivityForStudents([aya.id, ken.id])
    expect(queries).toHaveBeenCalledTimes(1)
    queries.mockRestore()
    expect(byStudent.get(aya.id)).toEqual(await dailyActivity(aya.id, aya.timezone))
    expect(byStudent.get(ken.id)).toEqual(await dailyActivity(ken.id, ken.timezone))
  })
})
