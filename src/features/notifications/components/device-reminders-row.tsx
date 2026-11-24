'use client'

import { BellRing } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { SettingsRow } from '@/components/shared/settings'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useErrorMessage } from '@/lib/use-error-message'
import { useDeviceReminders } from '../use-device-reminders'
import { InstallGuideSheet } from './install-guide-sheet'

// "Reminders on this device" on Me, both roles (FR-014; contracts/ui-routes.md › Turn on reminders):
// On / Off for this browser; tapping turns it on, explains why it can't, or offers Turn off.

export function DeviceRemindersRow() {
  const t = useTranslations('deviceReminders')
  const errorMessage = useErrorMessage()
  const { state, turnOn, turnOff } = useDeviceReminders()
  const [isGuideOpen, setGuideOpen] = useState(false)
  const [isConfirmOpen, setConfirmOpen] = useState(false)
  // Turning reminders on or off needs the server (spec 008 R14); the install guide and the
  // "blocked" explanation don't.
  const connection = useNeedsConnection()
  const isWrite = state === 'on' || state === 'off'

  const value =
    state === 'on'
      ? t('on')
      : state === 'denied'
        ? t('blockedShort')
        : state === 'unsupported'
          ? t('unavailable')
          : state === null
            ? ''
            : t('off')

  const onClick = () => {
    if (state === 'on') setConfirmOpen(true)
    else if (state === 'needs-install') setGuideOpen(true)
    else if (state === 'denied') toast(t('blocked'))
    else if (state === 'unsupported') toast(t('unsupported'))
    else if (state === 'off') {
      turnOn.mutate(undefined, {
        onSuccess: () => toast.success(t('turnedOn')),
        onError: (error) => toast.error(errorMessage(error)),
      })
    }
  }

  return (
    <>
      <SettingsRow
        onClick={onClick}
        disabled={isWrite && connection.disabled}
        describedBy={isWrite ? connection.describedBy : undefined}
        icon={<BellRing className="size-5 text-primary" aria-hidden />}
        label={t('row')}
        value={value}
      />
      <InstallGuideSheet open={isGuideOpen} onOpenChange={setGuideOpen} />
      <AlertDialog open={isConfirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('turnOffTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('turnOffBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">{t('cancel')}</AlertDialogCancel>
            <Button
              size="touch"
              disabled={connection.disabled || turnOff.isPending}
              aria-describedby={connection.describedBy}
              onClick={() =>
                turnOff.mutate(undefined, {
                  onSuccess: () => setConfirmOpen(false),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              {t('turnOff')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
