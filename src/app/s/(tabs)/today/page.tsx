import { House } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'

export default async function TodayPage() {
  const [nav, empty] = await Promise.all([getTranslations('nav'), getTranslations('empty')])
  return <TabPlaceholder title={nav('today')} body={empty('today')} icon={House} />
}
