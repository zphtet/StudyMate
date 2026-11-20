import type { Metadata } from 'next'
import { overviewQuery } from '@/features/admin/queries'
import { getOverview } from '@/features/admin/repo'
import { WelcomeView } from '@/features/admin/components/welcome-view'
import { meQuery } from '@/features/profile/queries'
import { getMe } from '@/features/profile/repo'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'

export const metadata: Metadata = { title: 'Welcome' }

export default async function AdminWelcomePage() {
  const user = await requirePageUser()
  const [me, overview] = await Promise.all([getMe(user), getOverview(user.id)])
  return (
    <Prefetched
      entries={[
        [meQuery.queryKey, me],
        [overviewQuery.queryKey, overview],
      ]}
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <WelcomeView />
      </main>
    </Prefetched>
  )
}
