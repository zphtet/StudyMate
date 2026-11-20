import { describe, expect, test } from 'vitest'
import {
  changePasswordSchema,
  colorModeSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from './schemas'

// data-model.md › Profile.displayName, Profile.timezone, Profile.locale; spec 001 User Story 3;
// spec 007 FR-001 (color_mode light / dark / system).
describe('updateProfileSchema', () => {
  test('accepts a name and a time zone, trimming the name', () => {
    expect(updateProfileSchema.parse({ displayName: '  May ', timezone: 'Asia/Yangon' })).toEqual({
      displayName: 'May',
      timezone: 'Asia/Yangon',
    })
  })

  test('accepts a single field', () => {
    expect(updateProfileSchema.safeParse({ locale: 'my' }).success).toBe(true)
  })

  test.each([
    ['empty name', { displayName: ' ' }],
    ['name over 60 characters', { displayName: 'x'.repeat(61) }],
    ['unknown time zone', { timezone: 'Nowhere/City' }],
    ['unsupported language', { locale: 'fr' }],
    ['nothing to change', {}],
  ])('rejects %s', (_, input) => {
    expect(updateProfileSchema.safeParse(input).success).toBe(false)
  })
})

describe('colorModeSchema', () => {
  test('is light, dark or system', () => {
    for (const mode of ['light', 'dark', 'system']) {
      expect(colorModeSchema.safeParse({ colorMode: mode }).success).toBe(true)
    }
    expect(colorModeSchema.safeParse({ colorMode: 'sepia' }).success).toBe(false)
  })
})

describe('deleteAccountSchema', () => {
  test('needs exactly DELETE', () => {
    expect(deleteAccountSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true)
    expect(deleteAccountSchema.safeParse({ confirm: 'delete' }).success).toBe(false)
    expect(deleteAccountSchema.safeParse({ confirm: 'DELETE ' }).success).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  test('needs the current password and a strong new one (FR-013)', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'abcd1234' }).success,
    ).toBe(true)
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: 'abcd1234' }).success,
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'abcdefgh' }).success,
    ).toBe(false)
  })
})
