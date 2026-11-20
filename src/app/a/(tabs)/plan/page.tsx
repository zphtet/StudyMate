import { CalendarDays } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'

export default async function PlanPage() {
  const [nav, empty] = await Promise.all([getTranslations('nav'), getTranslations('empty')])
  return <TabPlaceholder title={nav('plan')} body={empty('plan')} icon={CalendarDays} />
}
