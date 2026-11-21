// Spec 002 FR-007, US4 scenario 3, SC-002 baseline (research.md R4/R5). The same component renders
// the admin preview and the student lesson, so these samples define what both show.
import { render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IntlWrapper } from '../../../tests/utils/intl'
import { Markdown } from './markdown'
import { MARKDOWN_SAMPLES } from './markdown.samples'

const html = (source: string) =>
  render(<Markdown source={source} />, { wrapper: IntlWrapper }).container.innerHTML

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Markdown', () => {
  test('Japanese and Burmese text render as written', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.scripts} />, {
      wrapper: IntlWrapper,
    })
    expect(container.textContent).toContain('私は看護師です。')
    expect(container.textContent).toContain('မင်္ဂလာပါ')
    expect(container.querySelector('blockquote strong')?.textContent).toBe('は')
    expect(container.querySelector('h2')).not.toBeNull()
  })

  test('tables render inside a horizontal scroll wrapper', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.table} />, {
      wrapper: IntlWrapper,
    })
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.parentElement?.className).toContain('overflow-x-auto')
  })

  test('code blocks keep their text', () => {
    expect(html(MARKDOWN_SAMPLES.code)).toContain('<code')
  })

  test('images render lazily; audio file targets render an audio player', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.media} />, {
      wrapper: IntlWrapper,
    })
    const img = container.querySelector('img')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('src')).toBe(
      '/api/lesson-files/11111111-1111-4111-8111-111111111111/chart.png',
    )
    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio?.hasAttribute('controls')).toBe(true)
    expect(audio?.getAttribute('src')).toContain('listening.mp3')
  })

  test('a YouTube link alone in a paragraph becomes a privacy-enhanced embed', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.youtubeAlone} />, {
      wrapper: IntlWrapper,
    })
    const iframe = container.querySelector('iframe')
    expect(iframe?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
    )
    expect(iframe?.getAttribute('loading')).toBe('lazy')
    expect(iframe?.getAttribute('title')).toBeTruthy()
  })

  test('an inline YouTube link stays a plain link', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.youtubeInline} />, {
      wrapper: IntlWrapper,
    })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('a[href^="https://youtu.be/"]')).not.toBeNull()
  })

  test('offline, the embed falls back to a plain link', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.youtubeAlone} />, {
      wrapper: IntlWrapper,
    })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('a[href*="youtube.com/watch"]')).not.toBeNull()
  })

  test('raw HTML and javascript: links are stripped', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.unsafe} />, {
      wrapper: IntlWrapper,
    })
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.querySelector('iframe')).toBeNull()
  })

  test('external links open safely in a new tab', () => {
    const { container } = render(<Markdown source={MARKDOWN_SAMPLES.links} />, {
      wrapper: IntlWrapper,
    })
    const external = container.querySelector('a[href="https://www3.nhk.or.jp/news/easy/"]')
    expect(external?.getAttribute('target')).toBe('_blank')
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    const internal = container.querySelector('a[href="/s/courses"]')
    expect(internal?.getAttribute('target')).toBeNull()
  })

  test('a long lesson (> 50 KB) still renders', () => {
    const long = Array.from(
      { length: 700 },
      (_, i) => `## 第${i}課\n\n私は看護師です。မင်္ဂလာပါ ${'x'.repeat(40)}`,
    ).join('\n\n')
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(50_000)
    const { container } = render(<Markdown source={long} />, { wrapper: IntlWrapper })
    expect(container.querySelectorAll('h2')).toHaveLength(700)
  })

  test('HTML snapshot of every sample (SC-002 baseline)', () => {
    for (const [name, source] of Object.entries(MARKDOWN_SAMPLES)) {
      expect(html(source)).toMatchSnapshot(name)
    }
  })
})
