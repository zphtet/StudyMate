import { BookOpen } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'

export default async function CoursesPage() {
  const [nav, empty] = await Promise.all([getTranslations('nav'), getTranslations('empty')])
  return <TabPlaceholder title={nav('courses')} body={empty('courses')} icon={BookOpen} />
}
