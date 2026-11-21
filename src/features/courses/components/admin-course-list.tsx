'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { BookOpen, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDeferredValue, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/shared/empty-state'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { adminCoursesQuery } from '../queries'
import type { AdminCourseListItem, CourseStatus } from '../types'
import { CourseCard } from './course-card'
import { CourseLifecycleItems } from './course-lifecycle-items'
import { DeleteCourseDialog } from './delete-course-dialog'

// Admin Courses (screen 17-AdminCourses, FR-009): search over title and level tag, status chips with
// counts. Filtering happens here on the one cached list (research.md R10). Each card's ⋯ menu adds
// Archive / Unarchive and Delete course (US3).

const FILTERS: { status: CourseStatus; label: 'active' | 'drafts' | 'archived'; empty: string }[] =
  [
    { status: 'active', label: 'active', empty: 'emptyActive' },
    { status: 'draft', label: 'drafts', empty: 'emptyDrafts' },
    { status: 'archived', label: 'archived', empty: 'emptyArchived' },
  ]

/** Case-insensitive, and full-width / half-width forms match (NFKC). */
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase()

export function AdminCourseList({ footer }: { footer?: ReactNode }) {
  const t = useTranslations('courses')
  const { data: courses } = useSuspenseQuery(adminCoursesQuery)
  const [status, setStatus] = useState<CourseStatus>('active')
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<AdminCourseListItem | null>(null)
  const search = normalize(useDeferredValue(query).trim())

  const shown = courses.filter(
    (c) =>
      c.status === status &&
      (!search || normalize(`${c.title} ${c.levelTag ?? ''}`).includes(search)),
  )
  const filter = FILTERS.find((f) => f.status === status)!

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={t('search')}
          placeholder={t('search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-13 rounded-2xl bg-card pl-12 text-base md:text-base"
        />
      </div>

      <div role="group" aria-label={t('filters')} className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.status}
            type="button"
            aria-pressed={status === f.status}
            onClick={() => setStatus(f.status)}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-5 font-medium whitespace-nowrap',
              status === f.status
                ? 'border-inverse bg-inverse text-inverse-foreground'
                : 'bg-card hover:bg-muted',
            )}
          >
            {t(f.label, { count: courses.filter((c) => c.status === f.status).length })}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map((course) => (
            <li key={course.id}>
              <CourseCard
                course={course}
                extraItems={
                  <CourseLifecycleItems course={course} onDelete={() => setDeleting(course)} />
                }
              />
            </li>
          ))}
        </ul>
      ) : search ? (
        <EmptyState icon={Search}>{t('noMatches', { query: query.trim() })}</EmptyState>
      ) : (
        <EmptyState icon={BookOpen} title={t(filter.empty)}>
          {t('emptyBody')}
        </EmptyState>
      )}
      {footer}
      <DeleteCourseDialog course={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}
