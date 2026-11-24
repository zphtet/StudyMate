'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Ellipsis, ListOrdered, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { duplicateCourse } from '../actions'
import { courseKeys } from '../queries'
import type { AdminCourseListItem } from '../types'
import { CourseIcon } from './course-icon'

// One course on the admin Courses list (screen 17-AdminCourses). The title link covers the card;
// the ⋯ menu sits above it. `extraItems` lets US3 add Archive / Delete.
export function CourseCard({
  course,
  extraItems,
}: {
  course: AdminCourseListItem
  extraItems?: ReactNode
}) {
  const t = useTranslations('courses')
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  // Duplicating needs the server (spec 008 R14); Open and Edit stay available.
  const connection = useNeedsConnection()

  const duplicate = useMutation({
    mutationFn: async () => unwrap(await duplicateCourse({ sourceId: course.id })),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      toast.success(t('duplicated'))
      router.push(`/a/courses/${id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <article className="relative flex items-start gap-4 rounded-3xl border bg-card p-5 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <CourseIcon icon={course.icon} color={course.color} />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-snug font-semibold">
          <Link
            href={`/a/courses/${course.id}`}
            className="outline-none after:absolute after:inset-0"
          >
            {course.title}
          </Link>
        </h2>
        <p className="text-muted-foreground">
          {t('counts', { lessons: course.lessonCount, sections: course.sectionCount })}
        </p>
        {course.students.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-2">
              {course.students.slice(0, 3).map((s) => (
                <InitialAvatar
                  key={s.id}
                  name={s.displayName}
                  seed={s.id}
                  size="sm"
                  className="ring-2 ring-card"
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {course.avgPercent === null
                ? t('students', { count: course.students.length })
                : t('studentsAvg', { count: course.students.length, percent: course.avgPercent })}
            </span>
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-touch"
            className="relative z-10 -mt-1 -mr-2"
            aria-label={t('menu', { title: course.title })}
            disabled={duplicate.isPending}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem asChild className="min-h-11 text-base">
            <Link href={`/a/courses/${course.id}`}>
              <ListOrdered aria-hidden /> {t('open')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11 text-base">
            <Link href={`/a/courses/${course.id}/edit`}>
              <Pencil aria-hidden /> {t('edit')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 text-base"
            disabled={connection.disabled}
            aria-describedby={connection.describedBy}
            onSelect={() => duplicate.mutate()}
          >
            <Copy aria-hidden /> {t('duplicate')}
          </DropdownMenuItem>
          {extraItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </article>
  )
}
