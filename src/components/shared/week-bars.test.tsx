// Spec 004 research.md R5: WeekBars — 7 bars relative to the week's longest day, a 4 px stub for an
// empty day, today's label bold, and a spoken text per day.
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, test } from 'vitest'
import messages from '@/i18n/messages/en.json'
import { WeekBars } from './week-bars'

const days = [
  { date: '2026-11-16', seconds: 45 * 60 },
  { date: '2026-11-17', seconds: 0 },
  { date: '2026-11-18', seconds: 90 * 60 },
  { date: '2026-11-19', seconds: 0 },
  { date: '2026-11-20', seconds: 0 },
  { date: '2026-11-21', seconds: 0 },
  { date: '2026-11-22', seconds: 30 * 60 },
]

function renderBars() {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <WeekBars days={days} today="2026-11-22" label="Studied this week" />
    </NextIntlClientProvider>,
  )
  return screen.getByRole('list', { name: 'Studied this week' })
}

describe('WeekBars', () => {
  test('seven days, each with its spoken text', () => {
    const list = renderBars()
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items[0]).toHaveTextContent('Monday, November 16, 45 min')
    expect(items[2]).toHaveTextContent('1 h 30 m')
    expect(items[1]).toHaveTextContent('0 min')
  })

  test('heights are relative to the longest day; an empty day is a 4 px stub', () => {
    renderBars()
    const bars = screen.getAllByTestId('week-bar')
    expect(bars[2]).toHaveStyle({ height: '100%' })
    expect(bars[0]).toHaveStyle({ height: '50%' })
    expect(bars[1]).toHaveStyle({ height: '4px' })
  })

  test('today’s label is bold', () => {
    const list = renderBars()
    const labels = within(list).getAllByText(/^[MTWFS]$/)
    expect(labels[6]).toHaveClass('font-bold')
    expect(labels[0]).not.toHaveClass('font-bold')
  })
})
