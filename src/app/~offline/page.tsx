import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { AuthShell } from '@/components/layout/auth-shell'
import { AppMark } from '@/components/shared/app-mark'
import { Button } from '@/components/ui/button'

// The page the service worker shows for a document it has no copy of while offline (spec 008
// research R2; contracts/service-worker.md › /~offline). Precached when the worker installs, in the
// language of the `locale` cookie at that moment. No data, so it suits both roles and signed out.

export const metadata: Metadata = { title: 'Offline' }

export default function OfflinePage() {
  const t = useTranslations('pwa.offlinePage')
  return (
    <AuthShell showLanguage={false}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <AppMark />
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="max-w-xs text-muted-foreground">{t('body')}</p>
        {/* A full load, so the worker tries the network again. */}
        <Button asChild size="lg" className="mt-2 min-h-11">
          <a href="/">{t('retry')}</a>
        </Button>
      </div>
    </AuthShell>
  )
}
