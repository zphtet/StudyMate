// @vitest-environment node
// Spec 003 FR-012, research.md R8: notices are recorded now (006 delivers them). One row per student
// and item: a newer notice replaces the earlier one, read or not, and shows as unread again.
// Runs against the dev database; the fixture user is deleted afterwards (rows cascade).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { prisma } from '@/lib/prisma'
import { recordNotice, type NoticeInput } from './record'

const userId = randomUUID()
const sourceId = randomUUID()
const base: NoticeInput = {
  userId,
  sourceId,
  occurrenceKey: 'deadline',
  title: 'Particles is now due',
  body: 'Tue 24 Nov, 21:00',
  url: `/s/lessons/${sourceId}`,
}

const rows = () =>
  prisma.notification.findMany({ where: { userId, sourceId }, orderBy: { sentAt: 'asc' } })

beforeAll(async () => {
  const meta = JSON.stringify({ role: 'student', display_name: 'Notice Student' })
  await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
    values (${userId}::uuid, ${`notice-${Date.now()}@example.test`}, ${meta}::jsonb)`
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = ${userId}::uuid`
  await prisma.$disconnect()
})

describe('recordNotice', () => {
  test('inserts a system notice for the student', async () => {
    await recordNotice(base)
    const [row] = await rows()
    expect(row).toMatchObject({
      sourceType: 'system',
      occurrenceKey: 'deadline',
      title: base.title,
      body: base.body,
      url: base.url,
      readAt: null,
    })
  })

  test('a second notice about the same item replaces the first and is unread again', async () => {
    const [first] = await rows()
    await prisma.notification.update({ where: { id: first.id }, data: { readAt: new Date() } })

    await recordNotice({ ...base, title: 'Particles is now due', body: 'Wed 25 Nov, 09:00' })
    const after = await rows()
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: first.id, body: 'Wed 25 Nov, 09:00', readAt: null })
    expect(after[0].sentAt.getTime()).toBeGreaterThan(first.sentAt.getTime())
  })

  test('another occurrence key for the same item is a separate notice', async () => {
    await recordNotice({ ...base, occurrenceKey: 'assigned', title: 'New course', url: null })
    expect(await rows()).toHaveLength(2)
  })

  test('the source id is required: a null would defeat the unique key', () => {
    // @ts-expect-error sourceId is a string, never null
    const input: NoticeInput = { ...base, sourceId: null }
    expect(input.sourceId).toBeNull()
  })
})
