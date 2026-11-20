import { describe, expect, test } from 'vitest'
import en from './messages/en.json'
import ja from './messages/ja.json'
import my from './messages/my.json'

// Constitution VI: every string exists in all three languages.
type Tree = { [key: string]: string | Tree }

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  )
}

const english = keys(en).sort()

describe.each([
  ['my', my],
  ['ja', ja],
])('%s messages', (_, messages) => {
  test('have exactly the same keys as en', () => {
    expect(keys(messages as Tree).sort()).toEqual(english)
  })

  test('have no empty strings', () => {
    const empty = keys(messages as Tree).filter((k) => {
      const value = k.split('.').reduce<unknown>((node, part) => (node as Tree)[part], messages)
      return typeof value === 'string' && value.trim() === ''
    })
    expect(empty).toEqual([])
  })
})
