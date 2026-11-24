import 'server-only'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AuthShell } from '@/components/layout/auth-shell'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { Button } from '@/components/ui/button'
import { meQuery } from '@/features/profile/queries'
import { getMe } from '@/features/profile/repo'
import { Prefetched } from '@/lib/query/prefetch'
import { AuthError, requireUser } from '@/server/auth/guards'
import { JoinView } from './join-view'

// /join and /join/[code] (contracts/ui-routes.md): signed out, a prompt to sign up that keeps the
// invite; a student, the join screen; an admin, their Students list (the proxy already sends them).

/** What the URL holds, cleaned so it fits the six boxes; the server decides whether it exists. */
const toCodeBoxes = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)

export function JoinScreen({ code }: { code: Promise<string> }) {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <PageSkeleton header={false} />
        </AuthShell>
      }
    >
      <Screen code={code} />
    </Suspense>
  )
}

async function Screen({ code }: { code: Promise<string> }) {
  const initialCode = toCodeBoxes(await code)
  // Signed out: the prompt. Signed in but not usable yet (email unconfirmed): sign in again, as the
  // app's other pages do (requirePageUser).
  const user = await requireUser().catch((error: unknown) => {
    if (!(error instanceof AuthError)) throw error
    if (error.status === 401) return null
    redirect('/sign-in')
  })
  if (!user) return <SignedOut code={initialCode} />
  if (user.role === 'admin') redirect('/a/students')

  const me = await getMe(user)
  // Opening /join while linked has nothing to do; an invite link says "leave first".
  if (me.link?.status === 'active' && !initialCode) redirect('/s/today')

  const tc = await getTranslations('common')
  return (
    <AuthShell backHref="/s/me" backLabel={tc('back')}>
      <Prefetched entries={[[meQuery.queryKey, me]]}>
        <JoinView initialCode={initialCode} />
      </Prefetched>
    </AuthShell>
  )
}

async function SignedOut({ code }: { code: string }) {
  const t = await getTranslations('join')
  const next = encodeURIComponent(code ? `/join/${code}` : '/join')
  return (
    <AuthShell>
      <div className="flex flex-1 flex-col">
        <h1 className="mt-6 text-[1.75rem] leading-tight font-bold tracking-tight">
          {t('signedOutTitle')}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('signedOutBody')}</p>
        <div className="mt-auto flex flex-col gap-3 pt-10">
          <Button asChild size="xl">
            <Link href={`/sign-up?role=student&next=${next}`}>{t('signUp')}</Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <Link href={`/sign-in?role=student&next=${next}`}>{t('signIn')}</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
