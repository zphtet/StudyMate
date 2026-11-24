import { describe, expect, test } from 'vitest'
import {
  changePasswordSchema,
  deleteAccountSchema,
  saveAppearanceSchema,
  updateProfileSchema,
} from './schemas'

// data-model.md › Profile.displayName, Profile.timezone, Profile.locale; spec 001 User Story 3.
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

// Spec 007 contracts/server-actions.md › saveAppearance; data-model.md Profile.color_mode,
// Profile.theme_id, Profile.font_id, Profile.font_scale.
describe('saveAppearanceSchema', () => {
  test('colour mode is light, dark or system', () => {
    for (const mode of ['light', 'dark', 'system']) {
      expect(saveAppearanceSchema.safeParse({ colorMode: mode }).success).toBe(true)
    }
    expect(saveAppearanceSchema.safeParse({ colorMode: 'sepia' }).success).toBe(false)
  })

  test('one field is enough, and all four together are fine', () => {
    expect(saveAppearanceSchema.parse({ themeId: 'sakura' })).toEqual({ themeId: 'sakura' })
    expect(
      saveAppearanceSchema.safeParse({
        colorMode: 'dark',
        themeId: 'mocha',
        fontId: 'zen-maru',
        textSize: 'large',
      }).success,
    ).toBe(true)
  })

  test('nothing to change is invalid_input', () => {
    const result = saveAppearanceSchema.safeParse({})
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('invalid_input')
  })

  test.each([
    ['unknown theme', { themeId: 'pink' }],
    ['unknown font', { fontId: 'comic-sans' }],
    ['unknown text size', { textSize: 'huge' }],
    ['a font scale instead of a size', { textSize: 1.13 }],
  ])('rejects %s', (_, input) => {
    expect(saveAppearanceSchema.safeParse(input).success).toBe(false)
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
