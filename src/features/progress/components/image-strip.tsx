'use client'

import { ImagePlus, Loader2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_IMAGES } from '../schemas'

// Assignment photos while the answer is editable (spec 004 FR-003; contracts/ui-routes.md › Lesson):
// up to 5 thumbnails, each with a remove button, and "Add photo". Uploading and saving belong to the
// AssignmentEditor.

export type EditorImage = { path: string; name: string; size: number; src: string }

export function ImageStrip({
  images,
  pendingPaths,
  uploading,
  disabled,
  onAdd,
  onRemove,
}: {
  images: EditorImage[]
  /** Photos kept on the device until they sync (spec 008 FR-003a): shown with "Will sync". */
  pendingPaths: ReadonlySet<string>
  /** Number of photos being uploaded. */
  uploading: number
  disabled: boolean
  onAdd: (files: File[]) => void
  onRemove: (image: EditorImage) => void
}) {
  const t = useTranslations('submission')
  const pwa = useTranslations('pwa')
  const inputId = useId()
  const full = images.length + uploading >= MAX_IMAGES

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) onAdd(files)
  }

  return (
    <section aria-label={t('photos')} className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t('photoCount', { count: images.length, max: MAX_IMAGES })}
      </p>
      <ul className="flex flex-wrap gap-3">
        {images.map((image) => (
          <li key={image.path} className="relative size-24">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or a signed redirect */}
            <img
              src={image.src}
              alt={image.name}
              className="size-full rounded-2xl border bg-muted object-cover"
            />
            {pendingPaths.has(image.path) && (
              <span className="absolute inset-x-1 bottom-1 rounded-full bg-background/90 px-1.5 py-0.5 text-center text-[0.6875rem] font-medium text-muted-foreground">
                {pwa('willSync')}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon-touch"
              aria-label={t('removePhoto', { name: image.name })}
              disabled={disabled}
              onClick={() => onRemove(image)}
              className="absolute -top-2 -right-2 border shadow-sm"
            >
              <X aria-hidden />
            </Button>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li
            key={`uploading-${i}`}
            className="flex size-24 items-center justify-center rounded-2xl border bg-muted"
          >
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('uploading')}</span>
          </li>
        ))}
        {!full && (
          <li>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              onChange={onPick}
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-sm font-medium text-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:bg-muted/40"
            >
              <ImagePlus className="size-6" aria-hidden />
              {t('addPhoto')}
            </label>
          </li>
        )}
      </ul>
    </section>
  )
}
