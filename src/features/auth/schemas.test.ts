import { describe, expect, test } from 'vitest'
import { codeSchema, signInSchema, signUpSchema } from './schemas'

// data-model.md › Profile.role, Profile.displayName, Profile.timezone, Profile.locale; spec FR-013.
const valid = {
  role: 'student',
  displayName: 'May',
  email: ' May@Example.com ',
  password: 'abcd1234',
  timezone: 'Asia/Tokyo',
  locale: 'en',
}

const issues = (input: unknown) => {
  const result = signUpSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}:${i.message}`)
}

describe('signUpSchema', () => {
  test('accepts a valid sign-up and normalises the email', () => {
    const parsed = signUpSchema.parse(valid)
    expect(parsed.email).toBe('may@example.com')
    expect(parsed.displayName).toBe('May')
  })

  test.each([
    ['empty name', { displayName: '   ' }, 'displayName:nameRequired'],
    ['name over 60 characters', { displayName: 'x'.repeat(61) }, 'displayName:nameTooLong'],
    ['bad email', { email: 'may@' }, 'email:emailInvalid'],
    ['7-character password', { password: 'abc1234' }, 'password:passwordWeak'],
    ['letters only', { password: 'abcdefgh' }, 'password:passwordWeak'],
    ['digits only', { password: '12345678' }, 'password:passwordWeak'],
    ['unknown time zone', { timezone: 'Mars/Olympus' }, 'timezone:timezoneInvalid'],
  ])('rejects %s', (_, change, issue) => {
    expect(issues({ ...valid, ...change })).toContain(issue)
  })

  test('rejects roles other than student and admin', () => {
    expect(signUpSchema.safeParse({ ...valid, role: 'teacher' }).success).toBe(false)
  })

  test('rejects locales other than en, my and ja', () => {
    expect(signUpSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false)
  })

  test('accepts a 60-character name and Burmese/Japanese names', () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: 'x'.repeat(60) }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, displayName: 'မေ' }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...valid, displayName: 'さくら' }).success).toBe(true)
  })
})

describe('signInSchema', () => {
  test('needs a role, an email and a password', () => {
    expect(signInSchema.safeParse({ role: 'admin', email: 'a@b.co', password: 'x' }).success).toBe(
      true,
    )
    expect(signInSchema.safeParse({ role: 'admin', email: 'a@b.co', password: '' }).success).toBe(
      false,
    )
  })
})

describe('codeSchema', () => {
  test('is exactly 6 digits', () => {
    expect(codeSchema.safeParse('482913').success).toBe(true)
    expect(codeSchema.safeParse('48291').success).toBe(false)
    expect(codeSchema.safeParse('48291a').success).toBe(false)
  })
})
