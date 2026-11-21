// @vitest-environment node
// Spec 002 FR-007, research.md R5.
import { describe, expect, test } from 'vitest'
import { parseYouTube } from './youtube'

describe('parseYouTube', () => {
  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', null],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=90', 'dQw4w9WgXcQ', 90],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', null],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ', null],
    ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 'dQw4w9WgXcQ', 90],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', null],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=42', 'dQw4w9WgXcQ', 42],
  ])('%s → %s (start %s)', (url, id, start) => {
    expect(parseYouTube(url)).toEqual({ id, start })
  })

  test.each([
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ<script>',
    'https://vimeo.com/123456',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'not a url',
  ])('%s → null', (url) => {
    expect(parseYouTube(url)).toBeNull()
  })
})
