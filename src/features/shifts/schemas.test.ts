// Spec 005 contracts/server-actions.md › Field schemas; data-model.md Shift.type,
// ShiftPattern.sequence, Profile.shift_presets, Profile.sleep_minutes, Profile.waking_start,
// Profile.waking_end. Forms and actions share these.
import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  clockTimeSchema,
  deleteShiftSchema,
  saveRotationSchema,
  saveShiftSchema,
  sequenceSchema,
  shiftPresetsSchema,
  shiftSettingsSchema,
  shiftTypeSchema,
} from './schemas'

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message

const settings = {
  presets: { D: ['09:00', '18:00'], E: ['14:00', '23:00'], N: ['22:00', '07:00'] },
  sleepMinutes: 480,
  wakingStart: '08:00',
  wakingEnd: '23:00',
}

describe('clockTimeSchema', () => {
  test.each(['00:00', '07:30', '23:59'])('%s is a clock time', (time) => {
    expect(clockTimeSchema.safeParse(time).success).toBe(true)
  })
  test.each(['24:00', '7:30', '12:60', '12:00:00', ''])('%s is refused as timeInvalid', (time) => {
    expect(firstMessage(clockTimeSchema.safeParse(time))).toBe('timeInvalid')
  })
})

describe('shiftTypeSchema', () => {
  test.each(['day', 'evening', 'night', 'off', 'custom'])('%s is a shift type', (type) => {
    expect(shiftTypeSchema.safeParse(type).success).toBe(true)
  })
  test('anything else is refused', () => {
    expect(shiftTypeSchema.safeParse('late').success).toBe(false)
  })
})

describe('saveShiftSchema', () => {
  const night = {
    date: '2026-11-20',
    type: 'night',
    start: '22:00',
    end: '07:00',
    blockSleep: true,
  }

  test('a new shift with times is valid; an edit carries its id', () => {
    expect(saveShiftSchema.safeParse(night).success).toBe(true)
    expect(saveShiftSchema.safeParse({ ...night, shiftId: randomUUID() }).success).toBe(true)
  })
  test('the same start and end is allowed (a 24 h shift)', () => {
    const custom = { ...night, type: 'custom', start: '08:00', end: '08:00' }
    expect(saveShiftSchema.safeParse(custom).success).toBe(true)
  })
  test('an Off day needs no times', () => {
    const off = { date: '2026-11-20', type: 'off', blockSleep: false }
    expect(saveShiftSchema.safeParse(off).success).toBe(true)
  })
  test('a working shift without times is refused', () => {
    const noStart = { ...night, start: undefined }
    expect(firstMessage(saveShiftSchema.safeParse(noStart))).toBe('timeInvalid')
  })
  test('a bad date or shift id is refused', () => {
    expect(firstMessage(saveShiftSchema.safeParse({ ...night, date: '2026-02-30' }))).toBe(
      'dateInvalid',
    )
    expect(saveShiftSchema.safeParse({ ...night, shiftId: 'nope' }).success).toBe(false)
  })
})

describe('deleteShiftSchema', () => {
  test('needs a shift uuid', () => {
    expect(deleteShiftSchema.safeParse({ shiftId: randomUUID() }).success).toBe(true)
    expect(deleteShiftSchema.safeParse({ shiftId: '1' }).success).toBe(false)
  })
})

describe('sequenceSchema (rotation letters, research R4)', () => {
  test.each(['D', 'DDDONNOO', 'EO', 'N'.repeat(28)])('%s is a rotation', (sequence) => {
    expect(sequenceSchema.safeParse(sequence).success).toBe(true)
  })
  test('only Off days, or nothing, is rotationEmpty', () => {
    expect(firstMessage(sequenceSchema.safeParse('OOO'))).toBe('rotationEmpty')
    expect(firstMessage(sequenceSchema.safeParse(''))).toBe('rotationEmpty')
  })
  test('Custom (C), other letters and more than 28 days are refused', () => {
    expect(sequenceSchema.safeParse('DDC').success).toBe(false)
    expect(sequenceSchema.safeParse('ddoo').success).toBe(false)
    expect(sequenceSchema.safeParse('D'.repeat(29)).success).toBe(false)
  })
  test('saveRotationSchema needs a start date', () => {
    expect(
      saveRotationSchema.safeParse({ sequence: 'DDOO', startDate: '2026-11-23' }).success,
    ).toBe(true)
    expect(saveRotationSchema.safeParse({ sequence: 'DDOO' }).success).toBe(false)
  })
})

describe('shiftPresetsSchema', () => {
  test('the defaults are valid; an overnight pair (end before start) is valid', () => {
    expect(shiftPresetsSchema.safeParse(settings.presets).success).toBe(true)
  })
  test('the same start and end is presetSameTimes', () => {
    const presets = { ...settings.presets, N: ['22:00', '22:00'] }
    expect(firstMessage(shiftPresetsSchema.safeParse(presets))).toBe('presetSameTimes')
  })
  test('every preset (D, E, N) is required', () => {
    const noEvening = { ...settings.presets, E: undefined }
    expect(shiftPresetsSchema.safeParse(noEvening).success).toBe(false)
  })
})

describe('shiftSettingsSchema', () => {
  test('the defaults are valid', () => {
    expect(shiftSettingsSchema.safeParse(settings).success).toBe(true)
  })
  test.each([240, 270, 720])('a sleep length of %i min is valid', (sleepMinutes) => {
    expect(shiftSettingsSchema.safeParse({ ...settings, sleepMinutes }).success).toBe(true)
  })
  test.each([210, 750, 485, 480.5])('a sleep length of %d min is refused', (sleepMinutes) => {
    expect(shiftSettingsSchema.safeParse({ ...settings, sleepMinutes }).success).toBe(false)
  })
  test('waking hours must start before they end (wakingOrder)', () => {
    const late = { ...settings, wakingStart: '23:00', wakingEnd: '08:00' }
    expect(firstMessage(shiftSettingsSchema.safeParse(late))).toBe('wakingOrder')
    const same = { ...settings, wakingStart: '08:00', wakingEnd: '08:00' }
    expect(firstMessage(shiftSettingsSchema.safeParse(same))).toBe('wakingOrder')
  })
})
