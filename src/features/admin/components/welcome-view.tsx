'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { AppMark } from '@/components/shared/app-mark'
import { Button } from '@/components/ui/button'
import { InviteCard } from '@/features/invites/components/invite-card'
import { meQuery } from '@/features/profile/queries'
import { overviewQuery } from '../queries'
import { WelcomeChecklist } from './welcome-checklist'

// Screen 15-AdminWelcome: shown after an admin confirms their email.
export function WelcomeView() {
  const t = useTranslations('welcome')
  const { data: me } = useSuspenseQuery(meQuery)
  const { data: overview } = useSuspenseQuery(overviewQuery)

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4">
        <AppMark />
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
          {t('title', { name: me.displayName })}
        </h1>
        <p className="text-lg text-muted-foreground">{t('body')}</p>
      </div>
      <InviteCard code={overview.invite.code} url={overview.invite.url} />
      <WelcomeChecklist checklist={overview.checklist} done={overview.done} />
      <Button asChild size="xl" className="mt-auto">
        <Link href="/a/students">{t('dashboard')}</Link>
      </Button>
    </div>
  )
}
