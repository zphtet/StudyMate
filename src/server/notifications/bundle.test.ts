// Spec 006 research R5: one recipient's phone notification for everything due in one run. One row
// keeps its own text and link; several become "{n} reminders", opening the inbox (US4 scenario 3).
import { describe, expect, test } from 'vitest'
import { bundle, type BundleRow } from './bundle'

const options = { inbox: '/s/inbox', bundleTitle: (n: number) => `${n} reminders` }

const row = (data: Partial<BundleRow> & { id: string }): BundleRow => ({
  title: `Title ${data.id}`,
  body: `Body ${data.id}`,
  url: `/s/lessons/${data.id}`,
  push: true,
  urgent: false,
  ...data,
})

describe('one row', () => {
  test('its own title, text and link, marked read on open; tagged with its id', () => {
    expect(bundle([row({ id: 'a' })], options)).toEqual({
      title: 'Title a',
      body: 'Body a',
      url: '/s/lessons/a?n=a',
      tag: 'a',
    })
  })

  test('a link that already has a query gets &n=', () => {
    expect(bundle([row({ id: 'a', url: '/s/shifts?week=1' })], options)?.url).toBe(
      '/s/shifts?week=1&n=a',
    )
  })

  test('a row without a link opens the inbox', () => {
    expect(bundle([row({ id: 'a', url: null })], options)?.url).toBe('/s/inbox?n=a')
  })
})

describe('several rows', () => {
  test('"{n} reminders" with the first three titles, urgent first, opening the inbox', () => {
    const payload = bundle(
      [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c', urgent: true }), row({ id: 'd' })],
      options,
    )
    expect(payload).toEqual({
      title: '4 reminders',
      body: 'Title c · Title a · Title b',
      url: '/s/inbox',
      tag: 'bundle',
    })
  })
})

describe('rows without a phone notification (data-model.md Notification.push)', () => {
  test('are neither counted nor listed', () => {
    expect(bundle([row({ id: 'a' }), row({ id: 'copy', push: false })], options)).toEqual({
      title: 'Title a',
      body: 'Body a',
      url: '/s/lessons/a?n=a',
      tag: 'a',
    })
  })

  test('no pushable row: no payload', () => {
    expect(bundle([row({ id: 'copy', push: false })], options)).toBeNull()
    expect(bundle([], options)).toBeNull()
  })
})
