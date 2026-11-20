'use client'

import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// "Show QR": the invite link as a QR code, so a phone camera opens it (research R11).
export function QrDialog({
  url,
  code,
  children,
}: {
  url: string
  code: string
  children: ReactNode
}) {
  const t = useTranslations('invite')
  const [open, setOpen] = useState(false)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((s) => {
      if (!cancelled) setSvg(s)
    })
    return () => {
      cancelled = true
    }
  }, [open, url])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('qrTitle')}</DialogTitle>
          <DialogDescription>{t('qrBody')}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto w-full max-w-64 rounded-2xl bg-white p-3">
          {svg ? (
            // QR codes stay black on white in both themes so cameras can read them.
            <div
              role="img"
              aria-label={`${t('code')} ${code}`}
              className="[&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
          )}
        </div>
        <p className="text-center text-2xl font-bold tracking-[0.3em]">{code}</p>
      </DialogContent>
    </Dialog>
  )
}
