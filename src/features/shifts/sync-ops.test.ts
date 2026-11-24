// @vitest-environment node
// Spec 008 research R7 (shift rows); contracts/sync-route.md. Replaying a queued shift op against the
// dev database. data-model.md shifts.updated_at, shifts.client_op_id. May and Bob are students in
// Tokyo. Fixtures are deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { zonedToUtc } from '@/lib/time'
import { saveShift } from './repo'
import type { SaveShiftInput } from './schemas'
import { applyShiftOp, type ShiftOp } from './sync-ops'

vi.setConfig({ testTimeout: 60_000 })

const TOKYO = 'Asia/Tokyo'
const run = Date.now()
const may = { id: randomUUID(), timezone: TOKYO, sleepMinutes: 480 }
const bob = { id: randomUUID(), timezone: TOKYO, sleepMinutes: 480 }
const users = [may.id, bob.id]

beforeAll(async () => {
  for (const { id } of [may, bob]) {
    const meta = JSON.stringify({ role: 'student', display_name: 'Student' })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${id}::uuid, ${`shift-sync-${run}-${id}@example.test`}, ${meta}::jsonb)`
    await prisma.profile.update({ where: { id }, data: { timezone: TOKYO } })
  }
})

afterAll(async () => {
  await prisma.$executeRaw`delete from public.shift_patterns where student_id = any(${users}::uuid[])`
  await prisma.$executeRaw`delete from auth.users where id = any(${users}::uuid[])`
  await prisma.$disconnect()
})

const tokyo = (date: string, time: string) => zonedToUtc(date, time, TOKYO).toISOString()
const now = () => new Date().toISOString()

/** Each test uses its own week, so shifts never clash across tests. */
let week = 0
function nextDate() {
  week += 1
  return new Date(Date.UTC(2027, 0, 4 + week * 7)).toISOString().slice(0, 10)
}

const dayShift = (date: string, start = '09:00', end = '18:00'): SaveShiftInput => ({
  date,
  type: 'day',
  start,
  end,
  blockSleep: false,
})

const save = (shift: SaveShiftInput, base: { updatedAt: string } | null = null): ShiftOp => ({
  id: randomUUID(),
  type: 'shift.save',
  at: now(),
  shift,
  base,
})

const remove = (shiftId: string, updatedAt: string): ShiftOp => ({
  id: randomUUID(),
  type: 'shift.delete',
  at: now(),
  shiftId,
  base: { updatedAt },
})

describe('shift.save', () => {
  test('a new shift is created with the op id; a replay is a duplicate, not a second shift', async () => {
    const date = nextDate()
    const op = save(dayShift(date))
    expect(await applyShiftOp(may, op)).toMatchObject({ status: 'applied' })
    const row = await prisma.shift.findUnique({ where: { clientOpId: op.id } })
    expect(row).toMatchObject({ studentId: may.id, type: 'day' })
    expect(row?.startAt.toISOString()).toBe(tokyo(date, '09:00'))
    expect(await applyShiftOp(may, op)).toMatchObject({
      status: 'duplicate',
      version: row?.updatedAt.toISOString(),
    })
    expect(await prisma.shift.count({ where: { studentId: may.id, startAt: row?.startAt } })).toBe(
      1,
    )
  })

  test('a night shift stays one record across midnight (constitution IV)', async () => {
    const date = nextDate()
    const op = save({ ...dayShift(date, '22:00', '07:00'), type: 'night' })
    await applyShiftOp(may, op)
    const row = await prisma.shift.findUnique({ where: { clientOpId: op.id } })
    expect(row?.endAt.toISOString()).toBe(
      tokyo(new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10), '07:00'),
    )
  })

  test('an edit on the version the student saw applies and moves the version on', async () => {
    const { shift } = await saveShift(may, dayShift(nextDate()))
    const op = save(
      { ...dayShift(datePart(shift), '10:00'), shiftId: shift.id },
      {
        updatedAt: shift.updatedAt,
      },
    )
    const result = await applyShiftOp(may, op)
    expect(result).toMatchObject({ status: 'applied' })
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })
    expect(row.startAt.toISOString()).toBe(tokyo(datePart(shift), '10:00'))
    expect(row.updatedAt.toISOString()).not.toBe(shift.updatedAt)
    expect(result.status === 'applied' && result.version).toBe(row.updatedAt.toISOString())
  })

  test('dropped: edited on another device since', async () => {
    const { shift } = await saveShift(may, dayShift(nextDate()))
    await saveShift(may, { ...dayShift(datePart(shift), '08:00'), shiftId: shift.id })
    const stale = save(
      { ...dayShift(datePart(shift), '11:00'), shiftId: shift.id },
      {
        updatedAt: shift.updatedAt,
      },
    )
    expect(await applyShiftOp(may, stale)).toMatchObject({
      status: 'dropped',
      code: 'changed_on_server',
    })
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })
    expect(row.startAt.toISOString()).toBe(tokyo(datePart(shift), '08:00'))
  })

  test('dropped: it clashes with a shift added on another device', async () => {
    const date = nextDate()
    await saveShift(may, dayShift(date, '08:00', '12:00'))
    expect(await applyShiftOp(may, save(dayShift(date, '10:00', '15:00')))).toMatchObject({
      status: 'dropped',
      code: 'shift_overlap',
    })
  })

  test("dropped: another student's shift is not found and stays as it was", async () => {
    const { shift } = await saveShift(bob, dayShift(nextDate()))
    const op = save(
      { ...dayShift(datePart(shift), '12:00'), shiftId: shift.id },
      {
        updatedAt: shift.updatedAt,
      },
    )
    expect(await applyShiftOp(may, op)).toMatchObject({
      status: 'dropped',
      code: 'shift_not_found',
    })
    const row = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })
    expect(row.startAt.toISOString()).toBe(shift.startAt)
  })
})

describe('shift.delete', () => {
  test('applies on the version the student saw; a shift already gone is a duplicate', async () => {
    const { shift } = await saveShift(may, dayShift(nextDate()))
    const op = remove(shift.id, shift.updatedAt)
    expect(await applyShiftOp(may, op)).toMatchObject({ status: 'applied' })
    expect(await prisma.shift.findUnique({ where: { id: shift.id } })).toBeNull()
    expect(await applyShiftOp(may, op)).toMatchObject({ status: 'duplicate' })
  })

  test('dropped: edited on another device since', async () => {
    const { shift } = await saveShift(may, dayShift(nextDate()))
    await saveShift(may, { ...dayShift(datePart(shift), '07:00'), shiftId: shift.id })
    expect(await applyShiftOp(may, remove(shift.id, shift.updatedAt))).toMatchObject({
      status: 'dropped',
      code: 'changed_on_server',
    })
    expect(await prisma.shift.findUnique({ where: { id: shift.id } })).not.toBeNull()
  })

  test('a rotation shift turns Off with the op id; a replay is a duplicate', async () => {
    const date = nextDate()
    const pattern = await prisma.shiftPattern.create({
      data: { studentId: may.id, sequence: 'D', startDate: new Date(date), active: false },
    })
    const generated = await prisma.shift.create({
      data: {
        studentId: may.id,
        type: 'day',
        startAt: new Date(tokyo(date, '09:00')),
        endAt: new Date(tokyo(date, '18:00')),
        patternId: pattern.id,
      },
    })
    const op = remove(generated.id, generated.updatedAt.toISOString())
    expect(await applyShiftOp(may, op)).toMatchObject({ status: 'applied' })
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: generated.id } })).toMatchObject({
      type: 'off',
      overridden: true,
      clientOpId: op.id,
    })
    expect(await applyShiftOp(may, op)).toMatchObject({ status: 'duplicate' })
  })
})

/** The local date of a shift's start, as the form sends it. */
function datePart(shift: { startAt: string }) {
  return new Date(Date.parse(shift.startAt) + 9 * 3_600_000).toISOString().slice(0, 10)
}
