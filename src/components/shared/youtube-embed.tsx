'use client'

import { useOnline } from './use-online'
import { youTubeEmbedUrl, type YouTubeVideo } from './youtube'

// Spec 002 FR-007 / research.md R5: privacy-enhanced player, created by our renderer after
// sanitizing (Markdown itself can't contain iframes). Offline it falls back to a plain link.
export function YouTubeEmbed({
  video,
  href,
  title,
  linkText,
}: {
  video: YouTubeVideo
  href: string
  title: string
  linkText: string
}) {
  const online = useOnline()
  if (!online) {
    return (
      <p>
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {linkText}
        </a>
      </p>
    )
  }
  return (
    <div className="my-4 aspect-video w-full overflow-hidden rounded-xl bg-muted">
      <iframe
        src={youTubeEmbedUrl(video)}
        title={title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="size-full border-0"
      />
    </div>
  )
}
