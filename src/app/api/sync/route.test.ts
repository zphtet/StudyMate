// @vitest-environment node
// Spec 008 contracts/sync-route.md › Errors, Permissions, Tests: the guard, the body limits, order,
// a dropped op not stopping the batch, and an unexpected error stopping it with `retry`.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

vi.setConfig({ testTimeout: 60_000 })

let currentUserId: string | null = null
/** A lesson id whose op throws an unexpected error (a database outage, say). */
let explodingLessonId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: currentUserId && { id: currentUserId, email_confirmed_at: '2026-01-01' } },
        error: null,
      }),
    },
    storage: { from: () => ({ exists: async () => ({ data: true, error: null }) }) },
  }),
}))

vi.mock('@/features/progress/sync-ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/progress/sync-ops')>()
  return {
    ...actual,
    applyProgressOp: (...args: Parameters<typeof actual.applyProgressOp>) => {
      const [, op] = args
      if ('lessonId' in op && op.lessonId === explodingLessonId) throw new Error('database down')
      return actual.applyProgressOp(...args)
    },
  }
})

const run = Date.now()
const admin = randomUUID()
const may = randomUUID()
const users = [admin, may]
let lessonIds: string[] = []

beforeAll(async () => {
  for (const [id, role] of [
    [admin, 'admin'],
    [may, 'student'],
  ]) {
    const meta = JSON.stringify({ role, display_name: role })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
      values (${id}::uuid, ${`sync-route-${run}-${id}@example.test`}, ${meta}::jsonb, now())`
  }
  await prisma.studentLink.create({ data: { studentId: may, adminId: admin, status: 'active' } })
  const courseId = randomUUID()
  await prisma.course.create({
    data: {
      id: courseId,
      ownerId: admin,
      title: 'Sync route',
      status: 'active',
      unlockInOrder: false,
    },
  })
  lessonIds = [randomUUID(), randomUUID(), randomUUID()]
  await prisma.lesson.createMany({
    data: lessonIds.map((id, position) => ({
      id,
      courseId,
      title: `L${position + 1}`,
      status: 'published' as const,
      position,
      unlockRule: { type: 'none' },
    })),
  })
  await prisma.courseAssignment.create({ data: { courseId, studentId: may, assignedBy: admin } })
})

beforeEach(() => {
  currentUserId = may
  explodingLessonId = null
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.lesson_progress where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from public.course_assignments where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const complete = (lessonId: string) => ({
  id: randomUUID(),
  type: 'progress.complete',
  at: new Date().toISOString(),
  lessonId,
  base: { wasDone: false },
})

async function post(body: unknown) {
  const response = await POST(
    new Request('http://localhost/api/sync', { method: 'POST', body: JSON.stringify(body) }),
  )
  return { status: response.status, body: await response.json() }
}

const doneCount = () =>
  prisma.lessonProgress.count({
    where: { studentId: may, lessonId: { in: lessonIds }, status: 'done' },
  })

describe('POST /api/sync', () => {
  test('401 signed out, 403 for an Admin', async () => {
    currentUserId = null
    expect((await post({ ops: [complete(lessonIds[0])] })).status).toBe(401)
    currentUserId = admin
    expect((await post({ ops: [complete(lessonIds[0])] })).status).toBe(403)
  })

  test('400 for a malformed body or more than 50 ops, with nothing applied', async () => {
    expect((await post({ ops: [{ type: 'progress.complete' }] })).status).toBe(400)
    expect((await post({ ops: [] })).status).toBe(400)
    const tooMany = Array.from({ length: 51 }, () => complete(lessonIds[0]))
    expect((await post({ ops: tooMany })).status).toBe(400)
    expect(await doneCount()).toBe(0)
  })

  test('a dropped op does not stop the ones after it; results keep the order', async () => {
    const ops = [complete(lessonIds[0]), complete(randomUUID()), complete(lessonIds[1])]
    const { status, body } = await post({ ops })
    expect(status).toBe(200)
    expect(body.results).toEqual([
      expect.objectContaining({ id: ops[0].id, status: 'applied' }),
      { id: ops[1].id, status: 'dropped', code: 'lesson_unavailable' },
      expect.objectContaining({ id: ops[2].id, status: 'applied' }),
    ])
    expect(await doneCount()).toBe(2)
  })

  test('an unexpected error stops the batch there and asks for a retry', async () => {
    explodingLessonId = lessonIds[2]
    const later = complete(lessonIds[0])
    const ops = [complete(lessonIds[2]), later]
    const { status, body } = await post({ ops })
    expect(status).toBe(200)
    expect(body.results).toEqual([{ id: ops[0].id, status: 'retry' }])
    expect(
      await prisma.lessonProgress.findFirst({ where: { studentId: may, clientOpId: later.id } }),
    ).toBeNull()
  })
})
