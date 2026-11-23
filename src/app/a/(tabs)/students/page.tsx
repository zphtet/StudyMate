import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { TodayLabel } from '@/components/shared/today-label'
import { Skeleton } from '@/components/ui/skeleton'
import { InviteCard } from '@/features/invites/components/invite-card'
import { Bell } from '@/features/notifications/components/bell'
import { TurnOnRemindersCard } from '@/features/notifications/components/turn-on-reminders-card'
import { StudentCardList } from '@/features/progress/components/student-progress-card'
import { WithStudentCards } from '@/features/progress/components/with-admin-progress'
import { getMe } from '@/features/profile/repo'
import { requirePageUser } from '@/server/auth/page-guard'

// Screen 16-AdminStudents: the invite card (001) and one progress card per linked student (spec 004).
// Join requests arrive with 001 User Story 2. Spec 006: the bell, and "Turn on reminders" until it's on.
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
            <Bell href="/a/inbox" />
            <Suspense fallback={<Skeleton className="size-12 rounded-full" />}>
              <ProfileButton label={nav('profile')} />
            </Suspense>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <TurnOnRemindersCard />
        <Suspense fallback={<PageSkeleton header={false} />}>
          <Invite />
        </Suspense>
        <WithStudentCards>
          <StudentCardList />
        </WithStudentCards>
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
