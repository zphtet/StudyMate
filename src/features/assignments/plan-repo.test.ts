// @vitest-environment node
// Spec 003 US4 (T053): the Plan's availability, clashes and month counts against the dev database.
// May is in Tokyo (waking 08:00–23:00, quiet hours 12:00–14:00) with a day shift on Mon 23 Nov and a
// night shift Fri 27 22:00 – Sat 28 07:00 followed by 8 h sleep. One fixed `now`: Wed 25 Nov 12:00
// Tokyo. Tokyo is UTC+9, so local midnight is 15:00Z the day before.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getPlanMonth, getPlanWeek } from './plan-repo'
import type { PlanCard, PlanWeek } from './types'

vi.setConfig({ testTimeout: 30_000 })

const run = Date.now()
const now = new Date('2026-11-25T03:00:00Z')
const admin = { id: randomUUID(), timezone: 'Asia/Yangon' }
const may = randomUUID()
const nyc = randomUUID() // America/New_York, for the DST days
const users = [admin.id, may, nyc]
const courseId = randomUUID()
const week = '2026-11-23'

const L = {
  past: randomUUID(), // Mon 23 12:00, inside the day shift, already past
  free: randomUUID(), // Thu 26 12:00, during quiet hours only
  shift15: randomUUID(), // Fri 27 23:00, 15 min
  shift120: randomUUID(), // Fri 27 23:30, 120 min
  done: randomUUID(), // Fri 27 23:15, done
  asleep: randomUUID(), // Sat 28 10:00, in the sleep after the shift
}

async function makeUser(id: string, role: string, timezone: string) {
  const meta = JSON.stringify({ role, display_name: role === 'admin' ? 'Zin' : 'May' })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`plan-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone } })
}

beforeAll(async () => {
  await makeUser(admin.id, 'admin', admin.timezone)
  await makeUser(may, 'student', 'Asia/Tokyo')
  await makeUser(nyc, 'student', 'America/New_York')
  await prisma.profile.update({
    where: { id: may },
    data: {
      quietStart: new Date('1970-01-01T12:00:00Z'),
      quietEnd: new Date('1970-01-01T14:00:00Z'),
    },
  })
  await prisma.studentLink.createMany({
    data: [may, nyc].map((studentId) => ({ studentId, adminId: admin.id, status: 'active' })),
  })
  await prisma.shift.createMany({
    data: [
      {
        studentId: may,
        type: 'day',
        startAt: new Date('2026-11-23T00:00:00Z'),
        endAt: new Date('2026-11-23T09:00:00Z'),
      },
      {
        studentId: may,
        type: 'night',
        startAt: new Date('2026-11-27T13:00:00Z'),
        endAt: new Date('2026-11-27T22:00:00Z'),
        sleepMinutes: 480,
      },
    ],
  })
  await prisma.course.create({
    data: { id: courseId, ownerId: admin.id, title: 'JLPT N4 Grammar', status: 'active' },
  })
  // The course deadline: Sat 28 03:00 Tokyo (Fri 27 in UTC), inside the night shift.
  await prisma.courseAssignment.create({
    data: {
      courseId,
      studentId: may,
      assignedBy: admin.id,
      dueAt: new Date('2026-11-27T18:00:00Z'),
    },
  })
  const lessons: [string, string, number, string][] = [
    [L.past, 'Past', 15, '2026-11-23T03:00:00Z'],
    [L.free, 'Free', 15, '2026-11-26T03:00:00Z'],
    [L.shift15, 'Shift 15', 15, '2026-11-27T14:00:00Z'],
    [L.shift120, 'Shift 120', 120, '2026-11-27T14:30:00Z'],
    [L.done, 'Done', 15, '2026-11-27T14:15:00Z'],
    [L.asleep, 'Asleep', 15, '2026-11-28T01:00:00Z'],
  ]
  await prisma.lesson.createMany({
    data: lessons.map(([id, title, estMinutes], position) => ({
      id,
      courseId,
      title,
      position,
      estMinutes,
      status: 'published' as const,
      unlockRule: { type: 'none' },
    })),
  })
  await prisma.lessonDeadline.createMany({
    data: lessons.map(([lessonId, , , dueAt]) => ({
      lessonId,
      studentId: may,
      dueAt: new Date(dueAt),
      setBy: admin.id,
    })),
  })
  await prisma.lessonProgress.create({
    data: { studentId: may, lessonId: L.done, status: 'done', completedAt: now },
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.lesson_deadlines where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.shifts where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const plan = (studentId = may, w = week) => getPlanWeek({ admin, studentId, week: w, now })
const dayOf = (p: PlanWeek, date: string) => {
  const day = p.days.find((d) => d.date === date)
  if (!day) throw new Error(`no ${date}`)
  return day
}
const cardOf = (p: PlanWeek, id: string): PlanCard => {
  const card = p.days.flatMap((d) => d.cards).find((c) => c.id === id)
  if (!card) throw new Error(`no card ${id}`)
  return card
}
const iso = (s: string) => new Date(s).toISOString()
const seg = (kind: 'shift' | 'sleep', start: string, end: string) => ({
  kind,
  start: iso(start),
  end: iso(end),
})

describe('getPlanWeek segments', () => {
  test('Shift and Sleep are clipped to each student-local day; quiet hours are not shown', async () => {
    const p = await plan()
    expect(dayOf(p, '2026-11-25').segments).toEqual([
      seg('sleep', '2026-11-24T15:00Z', '2026-11-24T23:00Z'), // 00:00–08:00
      seg('sleep', '2026-11-25T14:00Z', '2026-11-25T15:00Z'), // 23:00–24:00
    ])
    expect(dayOf(p, '2026-11-27').segments).toEqual([
      seg('sleep', '2026-11-26T15:00Z', '2026-11-26T23:00Z'),
      seg('shift', '2026-11-27T13:00Z', '2026-11-27T15:00Z'), // 22:00–24:00
    ])
    // The night shift goes on past midnight; the sleep after it joins the night before waking time.
    expect(dayOf(p, '2026-11-28').segments).toEqual([
      seg('shift', '2026-11-27T15:00Z', '2026-11-27T22:00Z'), // 00:00–07:00
      seg('sleep', '2026-11-27T22:00Z', '2026-11-28T06:30Z'), // 07:00–15:30
      seg('sleep', '2026-11-28T14:00Z', '2026-11-28T15:00Z'),
    ])
  })

  test('a daylight-saving change day is 25 or 23 hours long', async () => {
    const hours = (d: { start: string; end: string }) =>
      (Date.parse(d.end) - Date.parse(d.start)) / 3_600_000
    const autumn = await plan(nyc, '2026-10-26')
    expect(hours(dayOf(autumn, '2026-10-26'))).toBe(24)
    expect(hours(dayOf(autumn, '2026-11-01'))).toBe(25)
    const spring = await plan(nyc, '2027-03-08')
    expect(hours(dayOf(spring, '2027-03-14'))).toBe(23)
    for (const day of [...autumn.days, ...spring.days]) {
      for (const s of day.segments) {
        expect(s.start >= day.start && s.end <= day.end && s.start < s.end).toBe(true)
      }
    }
  })
})

describe('getPlanWeek clashes', () => {
  test('a future, not-done card in a shift or sleep is flagged with a move that fits the lesson', async () => {
    const p = await plan()
    // First free time after the clash: Sat 15:30. 15 min → at least 60 → 16:30 → 17:00.
    expect(cardOf(p, L.shift15).clash).toEqual({
      kind: 'shift',
      suggestion: iso('2026-11-28T08:00Z'),
    })
    // 120 min → 17:30 → 18:00.
    expect(cardOf(p, L.shift120).clash).toEqual({
      kind: 'shift',
      suggestion: iso('2026-11-28T09:00Z'),
    })
    expect(cardOf(p, L.asleep).clash).toEqual({
      kind: 'sleep',
      suggestion: iso('2026-11-28T08:00Z'),
    })
  })

  test('a course card leaves an hour', async () => {
    const p = await plan()
    const course = dayOf(p, '2026-11-28').cards.find((c) => c.kind === 'course')
    expect(course?.clash).toEqual({ kind: 'shift', suggestion: iso('2026-11-28T08:00Z') })
  })

  test('no clash for past, done or free-time cards (quiet hours are free)', async () => {
    const p = await plan()
    expect(cardOf(p, L.past)).toMatchObject({ clash: null, due: { status: 'overdue' } })
    expect(cardOf(p, L.done)).toMatchObject({ clash: null, due: { status: 'done' } })
    expect(cardOf(p, L.free).clash).toBeNull()
  })
})

describe('getPlanMonth', () => {
  test('cards and late cards per student-local day, only days with cards', async () => {
    const month = await getPlanMonth({ admin, studentId: may, month: '2026-11', now })
    expect(month.month).toBe('2026-11')
    expect(month.student.id).toBe(may)
    expect(month.days).toEqual([
      { date: '2026-11-23', count: 1, late: 1 },
      { date: '2026-11-26', count: 1, late: 0 },
      { date: '2026-11-27', count: 3, late: 0 },
      // The course deadline is Fri 27 in UTC but Sat 28 in Tokyo, and counts once.
      { date: '2026-11-28', count: 2, late: 0 },
    ])
  })

  test('defaults to this month in the student’s zone', async () => {
    const month = await getPlanMonth({ admin, studentId: may, month: null, now })
    expect(month.month).toBe('2026-11')
  })
})
