'use client'

import { BarChart3, BookOpen, CalendarDays, House, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BottomNav } from './bottom-nav'

// Student tabs (contracts/ui-routes.md): Today, Courses, Progress, Shifts, Me.
export function StudentNav() {
  const t = useTranslations('nav')
  return (
    <BottomNav
      label={t('main')}
      items={[
        { href: '/s/today', label: t('today'), icon: House },
        { href: '/s/courses', label: t('courses'), icon: BookOpen },
        { href: '/s/progress', label: t('progress'), icon: BarChart3 },
        { href: '/s/shifts', label: t('shifts'), icon: CalendarDays },
        { href: '/s/me', label: t('me'), icon: UserRound },
      ]}
    />
  )
}
