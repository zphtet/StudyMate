// Spec 006 FR-005, FR-012 and Edge Cases (a variable with no value); research R12.
import { describe, expect, test } from 'vitest'
import { renderMessage } from './render'

const values = { name: 'May', lesson: 'Particle で', course: 'N4 Grammar', due: 'Fri 18:00' }

describe('renderMessage', () => {
  test('fills every variable', () => {
    expect(renderMessage('{name}, "{lesson}" in {course} is due {due}.', values)).toBe(
      'May, "Particle で" in N4 Grammar is due Fri 18:00.',
    )
  })

  test('fills a variable used twice', () => {
    expect(renderMessage('{name}! {name}!', values)).toBe('May! May!')
  })

  test.each([
    ['Study "{lesson}" today', 'Study today'],
    ['Study “{lesson}” today', 'Study today'],
    ['今日は「{lesson}」を勉強しよう', '今日はを勉強しよう'],
    ["Study '{lesson}' today", 'Study today'],
  ])('a missing variable goes with its quotes: %s', (text, expected) => {
    expect(renderMessage(text, { name: 'May' })).toBe(expected)
  })

  test('a missing variable without quotes leaves no double space or space before punctuation', () => {
    expect(renderMessage('Time for {lesson}, {name}.', { name: 'May' })).toBe('Time for, May.')
    expect(renderMessage('Due {due}!', {})).toBe('Due!')
    expect(renderMessage('{lesson} time', { lesson: null })).toBe('time')
  })

  test('unknown braces stay as written', () => {
    expect(renderMessage('Use {score} and {}', values)).toBe('Use {score} and {}')
  })

  test('values are inserted as given, not read as variables', () => {
    expect(renderMessage('{lesson}', { lesson: '{name}' })).toBe('{name}')
  })
})
