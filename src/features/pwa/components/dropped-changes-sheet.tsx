'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { OutboxEntry } from '@/lib/offline/db'
import { dismissDropped } from '@/lib/offline/outbox'

// "Not saved" (spec 008 FR-003b, Edge Cases; research R14; contracts/ui-routes.md ›
// DroppedChangesSheet): changes the server refused when they synced, each with what it was and why.
// A draft's text stays here to copy, since the server's version won. OK forgets them.

/** The draft text a dropped submission op carried, if any. */
function draftText(entry: OutboxEntry) {
  const body = entry.payload.bodyMd
  return entry.type.startsWith('submission.') && typeof body === 'string' && body.trim() !== ''
    ? body
    : null
}

export function DroppedChangesSheet({
  entries,
  open,
  onOpenChange,
}: {
  entries: OutboxEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('pwa.dropped')
  const errors = useTranslations('errors')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // shift_overlap's own message needs the clashing time, which a dropped op doesn't carry.
  const reason = (code: string | null) =>
    code === 'shift_overlap'
      ? t('overlap')
      : code && errors.has(code)
        ? errors(code)
        : errors('unexpected')

  const copy = async (entry: OutboxEntry, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(entry.id)
  }

  const done = async () => {
    await dismissDropped(entries.map((entry) => entry.id))
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('title', { count: entries.length })}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-3 px-4">
          {entries.map((entry) => {
            const text = draftText(entry)
            return (
              <li key={entry.id} className="rounded-xl border p-3">
                <p className="font-medium">{entry.label}</p>
                <p className="text-sm text-muted-foreground">{reason(entry.error)}</p>
                {text && (
                  <>
                    <p className="mt-2 line-clamp-4 rounded-lg bg-muted p-2 text-sm whitespace-pre-wrap">
                      {text}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2 min-h-11"
                      onClick={() => void copy(entry, text)}
                    >
                      {copiedId === entry.id ? t('copied') : t('copy')}
                    </Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        <div className="p-4">
          <Button size="xl" className="w-full" onClick={() => void done()}>
            {t('ok')}
          </Button>
        </div>
      </BottomSheetContent>
    </Sheet>
  )
}
