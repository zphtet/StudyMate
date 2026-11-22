// CalendarMonth (spec 003 Plan month; spec 004 Progress heat calendar): a Monday-first month, with a
// per-day style slot applied after the built-in today style.
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, test } from 'vitest'
import messages from '@/i18n/messages/en.json'
import { CalendarMonth } from './calendar-month'

function renderMonth(props: Partial<Parameters<typeof CalendarMonth>[0]> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CalendarMonth month="2026-11" today="2026-11-22" {...props} />
    </NextIntlClientProvider>,
  )
}

const day = (date: string) =>
  screen.getAllByRole('button').find((b) => b.dataset.date === date) as HTMLElement

describe('CalendarMonth', () => {
  test('every date of the month is a button; today is marked as the current date', () => {
    renderMonth()
    expect(screen.getAllByRole('button')).toHaveLength(30)
    expect(day('2026-11-22')).toHaveAttribute('aria-current', 'date')
  })

  test('dayClassName styles each day and wins over the today style', () => {
    renderMonth({ dayClassName: (date) => (date === '2026-11-22' ? 'bg-heat-4' : 'bg-heat-1') })
    expect(day('2026-11-22')).toHaveClass('bg-heat-4')
    expect(day('2026-11-22')).not.toHaveClass('bg-accent')
    expect(day('2026-11-03')).toHaveClass('bg-heat-1')
  })

  test('the badge adds text to the day’s name', () => {
    renderMonth({ badge: (date) => <span className="sr-only">{date} badge</span> })
    expect(screen.getByRole('button', { name: /2026-11-05 badge/ })).toBeInTheDocument()
  })
})
