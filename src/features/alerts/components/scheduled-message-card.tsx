'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { StatusChip } from '@/components/shared/status-chip'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cancelMessage } from '../actions'
import { alertKeys } from '../queries'
import type { MessageView, RecipientState } from '../types'
import { useWhenLabel } from './use-when-label'

// A one-off message on Alerts (24-AdminNotify.png; US3 scenario 6): when it goes on the student's
// clock and the Admin's ("Today 18:00 May's time", "15:30 yours · to May"), two lines of text, and
// Edit and Cancel send until it is sent; afterwards each student's Scheduled / Delivered / Read, or
// Cancelled (Edge Cases).

const STATE_TONES: Record<RecipientState, 'muted' | 'accent' | 'success'> = {
  scheduled: 'muted',
  delivered: 'accent',
  read: 'success',
}

export function ScheduledMessageCard({
  message,
  sentThisWeek,
}: {
  message: MessageView
  /** "Sent: 4 this week", on the last scheduled card's row */
  sentThisWeek?: number
}) {
  const t = useTranslations('scheduledMessages')
  const format = useFormatter()
  const { dayWord, time, viewerZone } = useWhenLabel()
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const { recipients } = message
  const names = format.list(recipients.map((r) => r.student.displayName))
  // Cancelling a send needs the server (spec 008 R14).
  const connection = useNeedsConnection()

  const cancel = useMutation({
    mutationFn: async () => unwrap(await cancelMessage({ id: message.id })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: alertKeys.all })
      toast.success(t('cancelledToast'))
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const when = (() => {
    const [first] = recipients
    const sameMoment = recipients.every((r) => r.deliverAt === first?.deliverAt)
    if (!first || !sameMoment) return { primary: t('nextFree'), secondary: t('to', { names }) }
    const zones = new Set(recipients.map((r) => r.student.timezone))
    const zone = zones.size === 1 ? first.student.timezone : viewerZone
    const primaryValues = { day: dayWord(first.deliverAt, zone), time: time(first.deliverAt, zone) }
    if (zone === viewerZone) {
      return { primary: t('whenOne', primaryValues), secondary: t('to', { names }) }
    }
    return {
      primary: t('whenTheirs', { ...primaryValues, name: first.student.displayName }),
      secondary: t('yoursTo', { time: time(first.deliverAt, viewerZone), names }),
    }
  })()

  const isPending = message.status === 'scheduled'

  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="rounded-lg bg-accent px-2.5 py-1 font-semibold text-accent-foreground">
          {when.primary}
        </span>
        <span className="text-sm text-muted-foreground">{when.secondary}</span>
        {message.urgent && <StatusChip tone="warning">{t('urgent')}</StatusChip>}
      </p>
      <p className="line-clamp-2">{message.body}</p>
      {message.lesson && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{message.lesson.title}</span>
        </p>
      )}

      {isPending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="touch">
            <Link href={`/a/alerts/messages/${message.id}`}>{t('edit')}</Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="touch"
                className="border-destructive/40 text-destructive"
                disabled={connection.disabled || cancel.isPending}
                aria-describedby={connection.describedBy}
              >
                {t('cancelSend')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('cancelTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('cancelBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={connection.disabled}
                  aria-describedby={connection.describedBy}
                  onClick={() => cancel.mutate()}
                >
                  {t('cancelSend')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {sentThisWeek !== undefined && (
            <span className="ml-auto text-sm text-muted-foreground">
              {t('sentThisWeek', { count: sentThisWeek })}
            </span>
          )}
        </div>
      ) : message.status === 'cancelled' ? (
        <StatusChip tone="muted" className="self-start">
          {t('cancelled')}
        </StatusChip>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {recipients.map((r) => (
            <li key={r.student.id}>
              <StatusChip tone={STATE_TONES[r.state]}>
                {t('recipientState', {
                  name: r.student.displayName,
                  state: t(`state.${r.state}`),
                })}
              </StatusChip>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
