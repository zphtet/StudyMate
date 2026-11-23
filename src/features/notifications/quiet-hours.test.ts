// Spec 006 research R14: what the Quiet hours row on Me says. For a student, shift and sleep always
// count as quiet (FR-013), so the row names them with or without a window; for an Admin it is the
// window or "Off". Keys and values only: the row turns them into text in the viewer's language.
import { describe, expect, test } from 'vitest'
import { quietHoursText } from './quiet-hours'

describe('students', () => {
  test('no window: "While on shift + sleep"', () => {
    expect(quietHoursText({ role: 'student', start: null, end: null })).toEqual({
      key: 'shiftSleep',
    })
  })

  test('a window: "12:00–13:00 + shift and sleep"', () => {
    expect(quietHoursText({ role: 'student', start: '12:00', end: '13:00' })).toEqual({
      key: 'windowShiftSleep',
      window: '12:00–13:00',
    })
  })

  test('a window across midnight reads in the order it was set', () => {
    expect(quietHoursText({ role: 'student', start: '22:00', end: '07:00' })).toEqual({
      key: 'windowShiftSleep',
      window: '22:00–07:00',
    })
  })
})

describe('Admins', () => {
  test('no window: "Off"', () => {
    expect(quietHoursText({ role: 'admin', start: null, end: null })).toEqual({ key: 'off' })
  })

  test('a window across midnight', () => {
    expect(quietHoursText({ role: 'admin', start: '22:00', end: '07:00' })).toEqual({
      key: 'window',
      window: '22:00–07:00',
    })
  })
})
