import { Bell, UsersRound } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { TodayLabel } from '@/components/shared/today-label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InviteCard } from '@/features/invites/components/invite-card'
import { getMe } from '@/features/profile/repo'
import { requirePageUser } from '@/server/auth/page-guard'

// Screen 16-AdminStudents (001 scope). Join requests and student cards arrive with User Story 2.
export default async function AdminStudentsPage() {
  const [t, tc, nav] = await Promise.all([
    getTranslations('students'),
    getTranslations('common'),
    getTranslations('nav'),
  ])

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            {tc('admin')} · <TodayLabel />
          </>
        }
        title={t('title')}
        actions={
          <>
            <Button
              variant="outline"
              size="icon-touch"
              className="size-12 rounded-full"
              aria-label={nav('notifications')}
              disabled
            >
              <Bell aria-hidden />
            </Button>
            <Suspense fallback={<Skeleton className="size-12 rounded-full" />}>
              <ProfileButton label={nav('profile')} />
            </Suspense>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Suspense fallback={<PageSkeleton header={false} />}>
          <Invite />
        </Suspense>
        <EmptyState icon={UsersRound} title={t('emptyTitle')}>
          {t('emptyBody')}
        </EmptyState>
      </div>
    </>
  )
}

async function ProfileButton({ label }: { label: string }) {
  const me = await requirePageUser()
  return (
    <Link href="/a/me" aria-label={label} className="rounded-full">
      <InitialAvatar name={me.displayName} seed={me.id} className="size-12" />
    </Link>
  )
}

async function Invite() {
  const me = await getMe(await requirePageUser())
  return me.invite ? (
    <InviteCard variant="compact" code={me.invite.code} url={me.invite.url} />
  ) : null
}
