// Spec 004 contracts/ui-routes.md › Shared components: one progress bar for Courses, the course
// screen, Progress, Today and the Admin cards. "—" when a course has no published lessons (spec
// Edge Cases); colours come from theme tokens only (constitution V).
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProgressBar } from './progress-bar'

const fill = (bar: HTMLElement) => bar.firstElementChild as HTMLElement

describe('ProgressBar', () => {
  test('is a labelled progressbar with its value', () => {
    render(<ProgressBar percent={60} label="JLPT N4 Grammar" />)
    const bar = screen.getByRole('progressbar', { name: 'JLPT N4 Grammar' })
    expect(bar).toHaveAttribute('aria-valuenow', '60')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(fill(bar).style.width).toBe('60%')
  })

  test('null percent: no value, "—" for screen readers and no fill', () => {
    render(<ProgressBar percent={null} label="Empty course" />)
    const bar = screen.getByRole('progressbar', { name: 'Empty course' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).toHaveAttribute('aria-valuetext', '—')
    expect(fill(bar).style.width).toBe('0%')
  })

  test('clamps out-of-range values', () => {
    render(<ProgressBar percent={130} label="Over" />)
    expect(fill(screen.getByRole('progressbar')).style.width).toBe('100%')
  })

  test('the fill uses a token class: primary by default, or the course colour passed in', () => {
    const { rerender } = render(<ProgressBar percent={10} label="Default" />)
    expect(fill(screen.getByRole('progressbar')).className).toContain('bg-primary')
    rerender(<ProgressBar percent={10} label="Teal" fillClassName="bg-course-teal" />)
    const className = fill(screen.getByRole('progressbar')).className
    expect(className).toContain('bg-course-teal')
    expect(className).not.toContain('bg-primary')
    expect(fill(screen.getByRole('progressbar')).getAttribute('style')).not.toMatch(/#|rgb/)
  })
})
