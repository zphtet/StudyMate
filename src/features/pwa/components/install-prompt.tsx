'use client'

import { Share, SquarePlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  countVisit,
  detectPlatform,
  dismissInstall,
  isStandaloneDisplay,
  readInstallState,
  shouldOffer,
  type InstallPlatform,
} from '../install'

// "Install StudyMate" (spec 008 US1 scenarios 1–2; research R12; contracts/ui-routes.md ›
// InstallPrompt): from the second visit, the browser's own install dialog where it offers one
// (Chromium), or Safari's Add to Home Screen steps on iPhone and iPad. Any way of closing it without
// installing hides it for 14 days.

/** Chromium's install event; not in TypeScript's DOM types. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isInstallPromptEvent = (event: Event): event is InstallPromptEvent => 'prompt' in event

function offerFor(platform: InstallPlatform) {
  return shouldOffer({
    ...readInstallState(),
    now: Date.now(),
    isStandalone: isStandaloneDisplay(),
    platform,
  })
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install')
  const [platform, setPlatform] = useState<InstallPlatform>('none')
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    countVisit()
    const show = (next: InstallPlatform) => {
      setPlatform(next)
      if (offerFor(next)) setIsOpen(true)
    }
    show(
      detectPlatform({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        hasPromptEvent: false,
      }),
    )
    const onPrompt = (event: Event) => {
      if (!isInstallPromptEvent(event)) return
      event.preventDefault() // no mini-infobar; our sheet asks instead
      setPromptEvent(event)
      show('prompt')
    }
    const onInstalled = () => setIsOpen(false)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const close = () => {
    dismissInstall(Date.now())
    setIsOpen(false)
  }

  const install = async () => {
    if (!promptEvent) return
    setIsOpen(false)
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    // The browser fires beforeinstallprompt again later only if it wasn't accepted.
    setPromptEvent(null)
    if (outcome === 'dismissed') dismissInstall(Date.now())
  }

  const isIos = platform === 'ios'
  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : close())}>
      <BottomSheetContent>
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t(isIos ? 'iosBody' : 'body')}</SheetDescription>
        </SheetHeader>
        {isIos && (
          <ol className="flex flex-col gap-3 px-4">
            <IosStep index={1}>
              {t.rich('iosStep1', {
                share: () => <Share className="inline size-5 align-text-bottom" aria-hidden />,
              })}
            </IosStep>
            <IosStep index={2}>
              {t.rich('iosStep2', {
                add: () => <SquarePlus className="inline size-5 align-text-bottom" aria-hidden />,
              })}
            </IosStep>
            <IosStep index={3}>{t('iosStep3')}</IosStep>
          </ol>
        )}
        <div className="flex flex-col gap-2 p-4">
          {isIos ? (
            <Button size="xl" className="w-full" onClick={close}>
              {t('gotIt')}
            </Button>
          ) : (
            <>
              <Button size="xl" className="w-full" onClick={install}>
                {t('install')}
              </Button>
              <Button size="xl" variant="ghost" className="w-full" onClick={close}>
                {t('notNow')}
              </Button>
            </>
          )}
        </div>
      </BottomSheetContent>
    </Sheet>
  )
}

function IosStep({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {index}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}
