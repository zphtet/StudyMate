// @vitest-environment node
// Spec 003 contracts/server-actions.md › Field schemas: instants with an offset or null, 1..200
// unique students per save, uuids everywhere.
import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  dueAtSchema,
  saveAssignmentsSchema,
  setCourseDeadlineSchema,
  setLessonDeadlineSchema,
} from './schemas'

describe('dueAtSchema', () => {
  test.each(['2026-12-31T14:59:00Z', '2026-12-31T23:59:00+09:00', '2026-12-31T14:59:00.000Z'])(
    'accepts the instant %s',
    (value) => {
      expect(dueAtSchema.parse(value)).toBe(value)
    },
  )
  test('accepts null (no deadline)', () => {
    expect(dueAtSchema.parse(null)).toBeNull()
  })
  test.each(['2026-12-31', '2026-12-31T23:59', 'tomorrow', ''])('rejects %j', (value) => {
    expect(dueAtSchema.safeParse(value).success).toBe(false)
  })
})

describe('saveAssignmentsSchema', () => {
  const row = (studentId: string = randomUUID()) => ({
    studentId,
    assigned: true,
    dueAt: '2026-12-31T14:59:00Z',
  })
  const input = (rows: ReturnType<typeof row>[]) => ({
    courseId: randomUUID(),
    rows,
    unlockInOrder: true,
    addDefaultReminders: true,
    notifyNow: false,
  })

  test('accepts a sheet with one row per student', () => {
    expect(saveAssignmentsSchema.safeParse(input([row(), row()])).success).toBe(true)
  })
  test('needs at least one row', () => {
    expect(saveAssignmentsSchema.safeParse(input([])).success).toBe(false)
  })
  test('allows at most 200 rows', () => {
    const rows = Array.from({ length: 201 }, () => row())
    expect(saveAssignmentsSchema.safeParse(input(rows)).success).toBe(false)
    expect(saveAssignmentsSchema.safeParse(input(rows.slice(0, 200))).success).toBe(true)
  })
  test('rejects the same student twice', () => {
    const id = randomUUID()
    expect(saveAssignmentsSchema.safeParse(input([row(id), row(id)])).success).toBe(false)
  })
  test('rejects a student id that is not a uuid', () => {
    expect(saveAssignmentsSchema.safeParse(input([row('not-a-uuid')])).success).toBe(false)
  })
})

describe('setCourseDeadlineSchema / setLessonDeadlineSchema', () => {
  test('take uuids and a dueAt or null', () => {
    const ids = { courseId: randomUUID(), studentId: randomUUID() }
    expect(setCourseDeadlineSchema.safeParse({ ...ids, dueAt: null }).success).toBe(true)
    expect(
      setLessonDeadlineSchema.safeParse({
        lessonId: randomUUID(),
        studentId: randomUUID(),
        dueAt: '2026-11-25T12:00:00Z',
      }).success,
    ).toBe(true)
  })
  test('reject a missing dueAt and bad ids', () => {
    expect(
      setCourseDeadlineSchema.safeParse({ courseId: randomUUID(), studentId: randomUUID() })
        .success,
    ).toBe(false)
    expect(
      setLessonDeadlineSchema.safeParse({ lessonId: 'x', studentId: randomUUID(), dueAt: null })
        .success,
    ).toBe(false)
  })
})
