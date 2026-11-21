import { BarChart3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'

export default async function ProgressPage() {
  const [nav, empty] = await Promise.all([getTranslations('nav'), getTranslations('empty')])
  return <TabPlaceholder title={nav('progress')} body={empty('progress')} icon={BarChart3} />
}
