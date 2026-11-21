// YouTube URL parsing for the Markdown renderer (spec 002 FR-007, research.md R5).

export type YouTubeVideo = { id: string; start: number | null }

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'])
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Seconds from `90`, `90s` or `1h2m3s`; null when absent or invalid. */
function parseStart(value: string | null): number | null {
  if (!value) return null
  if (/^\d+s?$/.test(value)) return Number.parseInt(value, 10)
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!match || !match[0]) return null
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/** The video id and start time of a YouTube watch, short, shorts or embed URL; otherwise null. */
export function parseYouTube(raw: string): YouTubeVideo | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.has(url.hostname)) return null

  let id: string | null = null
  if (url.hostname === 'youtu.be') {
    id = url.pathname.slice(1)
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v')
  } else {
    const match = /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)
    id = match?.[1] ?? null
  }
  if (!id || !VIDEO_ID.test(id)) return null

  return { id, start: parseStart(url.searchParams.get('t') ?? url.searchParams.get('start')) }
}

/** Privacy-enhanced embed URL (no cookies until the viewer plays the video). */
export const youTubeEmbedUrl = ({ id, start }: YouTubeVideo) =>
  `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`
