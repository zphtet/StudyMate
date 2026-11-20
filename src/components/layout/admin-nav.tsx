'use client'

import { Bell, BookOpen, CalendarDays, UsersRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { BottomNav } from './bottom-nav'

// Admin tabs (contracts/ui-routes.md): Students, Courses, Plan, Alerts. Me is the header avatar.
export function AdminNav() {
  const t = useTranslations('nav')
  return (
    <BottomNav
      label={t('main')}
      items={[
        { href: '/a/students', label: t('students'), icon: UsersRound },
        { href: '/a/courses', label: t('courses'), icon: BookOpen },
        { href: '/a/plan', label: t('plan'), icon: CalendarDays },
        { href: '/a/alerts', label: t('alerts'), icon: Bell },
      ]}
    />
  )
}
