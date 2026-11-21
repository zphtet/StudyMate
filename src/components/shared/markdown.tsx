'use client'

import { useTranslations } from 'next-intl'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { parseYouTube } from './youtube'
import { YouTubeEmbed } from './youtube-embed'

// One renderer for the admin preview and the student lesson (spec 002 FR-007, SC-002, research.md R4).
// Raw HTML is dropped (skipHtml) and the tree is sanitized; our own components then add the audio
// player, the YouTube embed and safe external links.

type Element = NonNullable<ExtraProps['node']>
type ElementContent = Element['children'][number]

const AUDIO_FILE = /\.(mp3|m4a|aac|ogg|oga|wav|webm)(\?.*)?$/i

const isExternal = (href: string) => /^https?:\/\//i.test(href)

/** The only meaningful child of a paragraph when it is a single link; otherwise null. */
function soleLink(node: Element | undefined): Element | null {
  const children = (node?.children ?? []).filter(
    (c: ElementContent) => !(c.type === 'text' && c.value.trim() === ''),
  )
  const [only] = children
  return children.length === 1 && only.type === 'element' && only.tagName === 'a' ? only : null
}

const linkText = (link: Element) =>
  link.children.map((c) => (c.type === 'text' ? c.value : '')).join('')

export function Markdown({ source, className }: { source: string; className?: string }) {
  const t = useTranslations('markdown')

  const components: Components = {
    p({ node, children }) {
      const link = soleLink(node)
      const href = typeof link?.properties.href === 'string' ? link.properties.href : null
      const video = href ? parseYouTube(href) : null
      if (link && href && video) {
        return (
          <YouTubeEmbed
            video={video}
            href={href}
            title={t('videoTitle')}
            linkText={linkText(link) || href}
          />
        )
      }
      return <p>{children}</p>
    },
    a({ href, children }) {
      if (href && isExternal(href)) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        )
      }
      return <a href={href}>{children}</a>
    },
    img({ src, alt }) {
      if (typeof src !== 'string') return null
      if (AUDIO_FILE.test(src)) {
        return (
          <audio
            controls
            preload="none"
            src={src}
            aria-label={alt || t('audioLabel')}
            className="my-2 w-full"
          >
            {alt}
          </audio>
        )
      }
      // Lesson images come from signed Storage URLs of any size; next/image would need every
      // remote host configured and can't size unknown images.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" />
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto">
          <table>{children}</table>
        </div>
      )
    },
  }

  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        skipHtml
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
