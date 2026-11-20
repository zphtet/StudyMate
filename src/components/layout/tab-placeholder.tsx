import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from './page-header'

// Tabs owned by later features show an empty state (research R14). No feature numbers for users.
export async function TabPlaceholder({
  title,
  body,
  icon,
}: {
  title: string
  body: string
  icon: LucideIcon
}) {
  const t = await getTranslations('empty')
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title={t('soon')}>
        {body}
      </EmptyState>
    </>
  )
}
