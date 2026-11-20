import { CalendarDays } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'

export default async function ShiftsPage() {
  const [nav, empty] = await Promise.all([getTranslations('nav'), getTranslations('empty')])
  return <TabPlaceholder title={nav('shifts')} body={empty('shifts')} icon={CalendarDays} />
}
