'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { respondToRequest } from '../actions'
import { joinRequestsQuery } from '../queries'
import type { JoinRequest } from '../types'

// Join requests on 16-AdminStudents (spec 001 User Story 2 scenarios 2–3): Decline or Approve, newest
// first. New and withdrawn requests arrive live (research R7); ['admin', 'students'] also refreshes
// the student cards, so an approved student appears there.

const STUDENTS_KEY = ['admin', 'students']

export function JoinRequestList({ adminId }: { adminId: string }) {
  const { data } = useSuspenseQuery(joinRequestsQuery)
  useRealtimeInvalidate({
    table: 'student_links',
    filter: `admin_id=eq.${adminId}`,
    queryKeys: [STUDENTS_KEY],
  })
  if (data.requests.length === 0) return null
  return (
    <ul className="flex flex-col gap-3">
      {data.requests.map((request) => (
        <li key={request.linkId}>
          <RequestCard request={request} />
        </li>
      ))}
    </ul>
  )
}

function RequestCard({ request }: { request: JoinRequest }) {
  const t = useTranslations('students')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const connection = useNeedsConnection()
  const name = request.student.displayName

  const respond = useMutation({
    mutationFn: async (approve: boolean) =>
      unwrap(await respondToRequest({ linkId: request.linkId, approve })),
    onError: (error) => toast.error(errorMessage(error)),
    // Either way the list changes; a request that was already gone disappears too.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: STUDENTS_KEY }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      ]),
  })
  const isDisabled = respond.isPending || connection.disabled

  return (
    <article
      aria-label={t('wantsToJoin', { name })}
      className="flex items-center gap-3 rounded-3xl border border-warning-border bg-warning p-4"
    >
      <InitialAvatar name={name} seed={request.student.id} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words">{t('wantsToJoin', { name })}</p>
        <p className="text-sm text-warning-foreground">
          {t('requested', { time: format.relativeTime(new Date(request.requestedAt), now) })}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon-touch"
        className="shrink-0 rounded-xl bg-card"
        aria-label={t('decline', { name })}
        aria-describedby={connection.describedBy}
        disabled={isDisabled}
        onClick={() => respond.mutate(false)}
      >
        <X aria-hidden />
      </Button>
      <Button
        size="touch"
        className="shrink-0"
        aria-describedby={connection.describedBy}
        disabled={isDisabled}
        onClick={() => respond.mutate(true)}
      >
        {t('approve')}
      </Button>
    </article>
  )
}
