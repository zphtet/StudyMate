// Markdown samples shared by markdown.test.tsx and the lesson editor preview test (SC-002).
export const MARKDOWN_SAMPLES = {
  scripts: [
    '## は marks the topic',
    '',
    'Use は for what you are talking about, often something **already known**.',
    '',
    '> 私**は**看護師です。',
    '> As for me, I am a nurse.',
    '',
    'မင်္ဂလာပါ — Burmese greeting with stacked letters ကျွန်ုပ်',
  ].join('\n'),
  table: ['| Particle | Use |', '| --- | --- |', '| は | topic |', '| が | subject |'].join('\n'),
  code: ['```', 'const word = "ことば"', '```', '', 'Inline `は` too.'].join('\n'),
  media: [
    '![Particle chart](/api/lesson-files/11111111-1111-4111-8111-111111111111/chart.png)',
    '',
    '![Listening](/api/lesson-files/22222222-2222-4222-8222-222222222222/listening.mp3)',
  ].join('\n'),
  youtubeAlone: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90',
  youtubeInline: 'Watch [this video](https://youtu.be/dQw4w9WgXcQ) before class.',
  unsafe: [
    '<script>alert(1)</script>',
    '',
    '<img src=x onerror="alert(1)">',
    '',
    '<iframe src="https://evil.example"></iframe>',
    '',
    '[click me](javascript:alert(1))',
  ].join('\n'),
  links: '[NHK Easy](https://www3.nhk.or.jp/news/easy/) and [your courses](/s/courses).',
} as const
