// @vitest-environment node
// Spec 005 US4 (T027) against the dev database: the live status on the Admin's student cards
// (research R8; FR-006). A fixed instant, Thu 10 Dec 2026 12:00 in Tokyo, keeps status_at
// deterministic. Zin (admin) is linked to Ann (on a day shift), Bea (asleep after a night shift),
// Cy (free) and Dee (no shifts); Eve has a shift but is linked to someone else.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { getStudentCards } from './admin-repo'

vi.setConfig({ testTimeout: 60_000 })

const TOKYO = 'Asia/Tokyo'
const NOON = zonedToUtc('2026-12-10', '12:00', TOKYO)
const at = (date: string, time: string) => zonedToUtc(date, time, TOKYO)
const run = Date.now()
const zin = { id: randomUUID() }
const other = { id: randomUUID() }
const [ann, bea, cy, dee, eve] = Array.from({ length: 5 }, () => ({ id: randomUUID() }))
const users = [zin, other, ann, bea, cy, dee, eve].map((u) => u.id)

async function makeUser(id: string, role: string, name: string) {
  const meta = JSON.stringify({ role, display_name: name })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${id}::uuid, ${`admin-repo-${run}-${id}@example.test`}, ${meta}::jsonb)`
  await prisma.profile.update({ where: { id }, data: { timezone: TOKYO } })
}

beforeAll(async () => {
  await makeUser(zin.id, 'admin', 'Zin')
  await makeUser(other.id, 'admin', 'Other')
  for (const [user, name] of [
    [ann, 'Ann'],
    [bea, 'Bea'],
    [cy, 'Cy'],
    [dee, 'Dee'],
    [eve, 'Eve'],
  ] as const) {
    await makeUser(user.id, 'student', name)
  }
  await prisma.studentLink.createMany({
    data: [
      ...[ann, bea, cy, dee].map((s) => ({
        studentId: s.id,
        adminId: zin.id,
        status: 'active' as const,
      })),
      { studentId: eve.id, adminId: other.id, status: 'active' as const },
    ],
  })
  await prisma.shift.createMany({
    data: [
      // Ann: day shift 09:00–18:00 → on shift until 18:00.
      {
        studentId: ann.id,
        type: 'day',
        startAt: at('2026-12-10', '09:00'),
        endAt: at('2026-12-10', '18:00'),
      },
      // Bea: night shift until 03:00, then 30 min + 10 h of sleep → asleep until 13:30.
      {
        studentId: bea.id,
        type: 'night',
        startAt: at('2026-12-09', '19:00'),
        endAt: at('2026-12-10', '03:00'),
        sleepMinutes: 600,
      },
      // Cy: a shift tomorrow → free now, asleep from 23:00 (outside waking hours).
      {
        studentId: cy.id,
        type: 'day',
        startAt: at('2026-12-11', '09:00'),
        endAt: at('2026-12-11', '18:00'),
      },
      {
        studentId: eve.id,
        type: 'day',
        startAt: at('2026-12-10', '09:00'),
        endAt: at('2026-12-10', '18:00'),
      },
    ],
  })
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

describe('getStudentCards status (spec 005 US4)', () => {
  test('each linked student has their live status and when it next changes', async () => {
    const { students } = await getStudentCards(zin, NOON)
    const status = Object.fromEntries(students.map((s) => [s.displayName, s.status]))
    expect(status).toEqual({
      Ann: { state: 'on_shift', until: at('2026-12-10', '18:00').toISOString(), shiftType: 'day' },
      Bea: { state: 'sleeping', until: at('2026-12-10', '13:30').toISOString(), shiftType: null },
      Cy: { state: 'free', until: at('2026-12-10', '23:00').toISOString(), shiftType: null },
      Dee: { state: 'unknown', until: null, shiftType: null },
    })
  })

  test('a student linked to another admin never appears', async () => {
    const { students } = await getStudentCards(zin, NOON)
    expect(students.map((s) => s.id)).not.toContain(eve.id)
  })

  test('the statuses add one statement, however many students there are', async () => {
    const statements = vi.spyOn(prisma, '$queryRaw')
    await getStudentCards(other, NOON)
    const forOne = statements.mock.calls.length
    statements.mockClear()
    await getStudentCards(zin, NOON)
    expect(statements.mock.calls.length).toBe(forOne)
    statements.mockRestore()
  })
})
