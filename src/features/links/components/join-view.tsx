'use client'

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, Info, X } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { CodeInput } from '@/components/shared/code-input'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { meQuery } from '@/features/profile/queries'
import type { MeResponse } from '@/features/profile/types'
import { useRealtimeInvalidate } from '@/lib/realtime'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { dismissNotice, requestJoin } from '../actions'
import { invitePreviewQuery } from '../queries'

// Screen 03-Join (spec 001 User Story 2; contracts/ui-routes.md › /join): enter the admin's code,
// see who it belongs to, send a request, then wait. Approve and decline arrive live (FR-015,
// research R7): any change to the student's links refetches /api/me.

type CurrentLink = NonNullable<MeResponse['link']>

export function JoinView({ initialCode }: { initialCode: string }) {
  const { data: me } = useSuspenseQuery(meQuery)
  const router = useRouter()
  useRealtimeInvalidate({
    table: 'student_links',
    filter: `student_id=eq.${me.id}`,
    queryKeys: [meQuery.queryKey],
  })

  // Was the student linked when the screen opened? Then an invite link only says "leave first";
  // a link that turns active while this screen is open is an approval, which moves into the app.
  const [wasLinked] = useState(me.link?.status === 'active')
  const isApproved = !wasLinked && me.link?.status === 'active'
  useEffect(() => {
    if (isApproved) router.replace('/s/today')
  }, [isApproved, router])

  // A pending request that disappears was declined: /api/me returns only pending and active links.
  // Unless the admin closed their account (the link went with it; their notice says so). Compared
  // during render (React's "adjusting state when a prop changes"), not in an effect.
  const pendingNow = me.link?.status === 'pending' ? me.link : null
  const [lastPending, setLastPending] = useState(pendingNow)
  const [declinedBy, setDeclinedBy] = useState<string | null>(null)
  if (pendingNow?.id !== lastPending?.id) {
    if (lastPending && !me.link && me.notices.length === 0) {
      setDeclinedBy(lastPending.admin.displayName)
    }
    setLastPending(pendingNow)
  }

  const [isChoosingAnother, setChoosingAnother] = useState(false)

  return (
    <div className="flex flex-1 flex-col">
      <Notices notices={me.notices} />
      {me.link?.status === 'active' ? (
        <AlreadyLinked admin={me.link.admin.displayName} />
      ) : me.link?.status === 'pending' && !isChoosingAnother ? (
        <Waiting link={me.link} onChooseAnother={() => setChoosingAnother(true)} />
      ) : (
        <CodeForm
          initialCode={initialCode}
          declinedBy={declinedBy}
          onSent={() => {
            setDeclinedBy(null)
            setChoosingAnother(false)
          }}
        />
      )}
    </div>
  )
}

function Heading({ title, body }: { title: string; body?: string }) {
  const t = useTranslations('join')
  return (
    <>
      <p className="mt-2 font-medium text-primary">{t('step')}</p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
      {body && <p className="mt-3 text-lg text-muted-foreground">{body}</p>}
    </>
  )
}

function CodeForm({
  initialCode,
  declinedBy,
  onSent,
}: {
  initialCode: string
  declinedBy: string | null
  onSent: () => void
}) {
  const t = useTranslations('join')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const connection = useNeedsConnection()
  const [code, setCode] = useState(initialCode)
  const isComplete = code.length === 6
  const preview = useQuery({ ...invitePreviewQuery(code), enabled: isComplete })

  const send = useMutation({
    mutationFn: async () => unwrap(await requestJoin({ code })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      onSent()
    },
  })

  const admin = isComplete ? preview.data?.admin.displayName : undefined
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        if (admin && !send.isPending && !connection.disabled) send.mutate()
      }}
    >
      {declinedBy && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-semibold">{t('declinedTitle')}</span>{' '}
          {t('declinedBody', { name: declinedBy })}
        </p>
      )}
      <Heading title={t('title')} body={t('body')} />

      <p className="mt-6 mb-2 font-medium" aria-hidden>
        {t('codeLabel')}
      </p>
      <CodeInput
        kind="invite"
        value={code}
        onChange={(value) => {
          setCode(value)
          send.reset()
        }}
        label={t('codeLabel')}
        invalid={isComplete && preview.isError}
        autoFocus={!initialCode}
      />

      <div className="mt-4 flex flex-col gap-4" aria-live="polite">
        {isComplete && preview.isPending && (
          <p className="text-muted-foreground">{t('checking')}</p>
        )}
        {isComplete && preview.isError && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {t('notFound')}
          </p>
        )}
        {admin && preview.data && (
          <>
            <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
              <InitialAvatar name={admin} seed={code} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{admin}</p>
                <p className="text-sm text-muted-foreground">
                  {t('adminMeta', { count: preview.data.activeCourses })}
                </p>
              </div>
              <Check className="size-6 shrink-0 text-success" aria-hidden />
            </div>
            <p className="flex gap-3 rounded-2xl bg-muted p-4 text-muted-foreground">
              <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
              {t('info', { name: admin })}
            </p>
          </>
        )}
        {send.isError && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage(send.error)}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 pt-10">
        <Button
          type="submit"
          size="xl"
          className="w-full"
          disabled={!admin || send.isPending || connection.disabled}
          aria-describedby={connection.describedBy}
        >
          {send.isPending ? tc('loading') : t('send')}
        </Button>
        <ScanHelp />
      </div>
    </form>
  )
}

/** Research R11: the QR holds the invite link, so the phone's camera already opens it here. */
function ScanHelp() {
  const t = useTranslations('join')
  const tc = useTranslations('common')
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="link" size="touch" className="text-base">
          {t('scanQr')}
        </Button>
      </SheetTrigger>
      <BottomSheetContent>
        <SheetHeader>
          <SheetTitle>{t('scanTitle')}</SheetTitle>
          <SheetDescription>{t('scanBody')}</SheetDescription>
        </SheetHeader>
        <div className="p-4">
          <SheetClose asChild>
            <Button size="xl" className="w-full">
              {tc('close')}
            </Button>
          </SheetClose>
        </div>
      </BottomSheetContent>
    </Sheet>
  )
}

function Waiting({ link, onChooseAnother }: { link: CurrentLink; onChooseAnother: () => void }) {
  const t = useTranslations('join')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const name = link.admin.displayName
  return (
    <div className="flex flex-1 flex-col">
      <Heading title={t('waitingTitle', { name })} body={t('waitingBody', { name })} />
      <div role="status" className="mt-6 flex items-center gap-4 rounded-2xl border bg-card p-4">
        <InitialAvatar name={name} seed={link.admin.id} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">
            {t('requested', { time: format.relativeTime(new Date(link.requestedAt), now) })}
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-col pt-10">
        <Button variant="outline" size="xl" onClick={onChooseAnother}>
          {t('useAnother')}
        </Button>
      </div>
    </div>
  )
}

function AlreadyLinked({ admin }: { admin: string }) {
  const t = useTranslations('join')
  return (
    <div className="flex flex-1 flex-col">
      <Heading title={t('linkedTitle', { name: admin })} body={t('linkedBody', { name: admin })} />
      <div className="mt-auto flex flex-col gap-3 pt-10">
        <Button asChild size="xl">
          <Link href="/s/today">{t('openApp')}</Link>
        </Button>
        <Button asChild variant="outline" size="xl">
          <Link href="/s/me/account">{t('toAccount')}</Link>
        </Button>
      </div>
    </div>
  )
}

/** "Your admin closed their account" (FR-015; data-model.md Notification), until dismissed. */
function Notices({ notices }: { notices: MeResponse['notices'] }) {
  const t = useTranslations('join')
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const dismiss = useMutation({
    mutationFn: async (id: string) => unwrap(await dismissNotice({ id })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: meQuery.queryKey }),
  })
  if (notices.length === 0) return null
  return (
    <div className="mb-4 flex flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning p-3 pl-4 text-warning-foreground"
        >
          <p className="flex-1 py-2.5">{t('adminDeleted')}</p>
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label={t('dismiss')}
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate(notice.id)}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      {dismiss.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(dismiss.error)}
        </p>
      )}
    </div>
  )
}
