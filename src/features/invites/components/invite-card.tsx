'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { QrDialog } from './qr-dialog'

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error(text)
  }
}

/** Web Share sheet when the device has one, otherwise copy the link (research R11). */
export async function shareInvite(url: string, text: string, copied: string) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'StudyMate', text, url })
      return
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return
    }
  }
  await copy(url, copied)
}

// Dark invite card (screens 15-AdminWelcome full, 16-AdminStudents compact).
export function InviteCard({
  code,
  url,
  variant = 'full',
  menu,
}: {
  code: string
  url: string
  variant?: 'full' | 'compact'
  /** Extra control for the compact card, e.g. the ⋯ menu with "Regenerate code". */
  menu?: ReactNode
}) {
  const t = useTranslations('invite')
  const share = () => shareInvite(url, t('shareText', { code }), t('linkCopied'))
  const displayUrl = url.replace(/^https?:\/\//, '')

  if (variant === 'compact') {
    return (
      <section className="flex items-center justify-between gap-3 rounded-3xl bg-inverse p-5 text-inverse-foreground">
        <div className="min-w-0">
          <h2 className="text-sm text-inverse-muted">{t('code')}</h2>
          <p className="text-3xl font-bold tracking-[0.18em]">{code}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="touch"
            className="bg-inverse-foreground text-inverse hover:bg-inverse-foreground/90"
            onClick={share}
          >
            {t('share')}
          </Button>
          {menu}
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-inverse p-6 text-inverse-foreground">
      <h2 className="text-inverse-muted">{t('yourCode')}</h2>
      <p className="text-5xl font-bold tracking-[0.15em]">{code}</p>
      <p className="truncate text-inverse-muted">{displayUrl}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button
          size="touch"
          className="bg-inverse-foreground text-inverse hover:bg-inverse-foreground/90"
          onClick={share}
        >
          {t('share')}
        </Button>
        <Button
          size="touch"
          variant="outline"
          className="border-inverse-muted/40 bg-transparent text-inverse-foreground hover:bg-inverse-foreground/10 hover:text-inverse-foreground dark:bg-transparent"
          onClick={() => copy(code, t('codeCopied'))}
        >
          {t('copyCode')}
        </Button>
        <QrDialog url={url} code={code}>
          <Button
            size="touch"
            variant="outline"
            className="border-inverse-muted/40 bg-transparent text-inverse-foreground hover:bg-inverse-foreground/10 hover:text-inverse-foreground dark:bg-transparent"
          >
            {t('showQr')}
          </Button>
        </QrDialog>
      </div>
    </section>
  )
}
