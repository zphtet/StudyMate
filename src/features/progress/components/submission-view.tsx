'use client'

import { useTranslations } from 'next-intl'
import { Markdown } from '@/components/shared/markdown'
import type { AttachmentView } from '../types'

// A submitted answer, read-only (spec 004 US2; contracts/ui-routes.md › Lesson, Lesson review): the
// rendered Markdown and its photos. Each photo opens full size in a new tab through the access-checked
// file route.

export function SubmissionView({
  bodyMd,
  attachments,
}: {
  bodyMd: string
  attachments: AttachmentView[]
}) {
  const t = useTranslations('submission')
  return (
    <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
      {bodyMd.trim() && <Markdown source={bodyMd} />}
      {attachments.length > 0 && (
        <ul aria-label={t('photos')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {attachments.map((image) => (
            <li key={image.path}>
              <a
                href={image.url}
                target="_blank"
                rel="noopener"
                aria-label={t('openPhoto', { name: image.name })}
                className="block aspect-square overflow-hidden rounded-xl border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage redirect */}
                <img src={image.url} alt="" className="size-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
