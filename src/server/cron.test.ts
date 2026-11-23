import { afterEach, describe, expect, test, vi } from 'vitest'
import { HttpError } from '@/lib/http'
import { requireCronSecret } from './cron'

const SECRET = 'test-cron-secret'

const request = (authorization?: string) =>
  new Request('http://localhost/api/cron/dispatch', {
    headers: authorization ? { authorization } : {},
  })

const rejection = (fn: () => void) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  return null
}

describe('requireCronSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('accepts the bearer secret', () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    expect(() => requireCronSecret(request(`Bearer ${SECRET}`))).not.toThrow()
  })

  test('refuses a request without the header', () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    const error = rejection(() => requireCronSecret(request()))
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated' })
  })

  test('refuses a wrong secret, also one of another length', () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    for (const header of [`Bearer ${SECRET}x`, 'Bearer nope', SECRET]) {
      expect(rejection(() => requireCronSecret(request(header)))).toMatchObject({ status: 401 })
    }
  })

  test('refuses everything when CRON_SECRET is unset', () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(rejection(() => requireCronSecret(request('Bearer ')))).toMatchObject({ status: 401 })
    expect(rejection(() => requireCronSecret(request('Bearer undefined')))).toMatchObject({
      status: 401,
    })
  })
})
