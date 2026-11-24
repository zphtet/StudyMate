'use client'

import { BellRing } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import { useErrorMessage } from '@/lib/use-error-message'
import { useDeviceReminders } from '../use-device-reminders'
import { InstallGuideSheet } from './install-guide-sheet'

// "Turn on reminders" on Today (student) and Students (Admin), until this device is on or the card is
// dismissed (US1 scenarios 1–3; research R8; contracts/ui-routes.md › Turn on reminders).

export function TurnOnRemindersCard() {
  const t = useTranslations('deviceReminders')
  const errorMessage = useErrorMessage()
  const { state, turnOn, isDismissed, dismiss } = useDeviceReminders()
  const [isGuideOpen, setGuideOpen] = useState(false)
  // Turning reminders on needs the server (spec 008 R14).
  const connection = useNeedsConnection()
  if (state === null || state === 'on' || isDismissed) return null

  const body =
    state === 'needs-install'
      ? t('needsInstall')
      : state === 'denied'
        ? t('blocked')
        : state === 'unsupported'
          ? t('unsupported')
          : t('cardBody')

  return (
    <section
      aria-labelledby="turn-on-reminders"
      className="flex flex-col gap-3 rounded-3xl border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 id="turn-on-reminders" className="font-semibold">
            {t('cardTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" size="touch" onClick={dismiss}>
          {t('notNow')}
        </Button>
        {state === 'off' && (
          <Button
            size="touch"
            disabled={connection.disabled || turnOn.isPending}
            aria-describedby={connection.describedBy}
            onClick={() =>
              turnOn.mutate(undefined, {
                onSuccess: () => toast.success(t('turnedOn')),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            {t('turnOn')}
          </Button>
        )}
        {state === 'needs-install' && (
          <Button size="touch" onClick={() => setGuideOpen(true)}>
            {t('howTo')}
          </Button>
        )}
      </div>
      <InstallGuideSheet open={isGuideOpen} onOpenChange={setGuideOpen} />
    </section>
  )
}
