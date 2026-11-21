import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { HttpError, NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { studentCourseQuery, studentCoursesQuery, studentLessonQuery } from '../queries'
import { getStudentCourse, getStudentLesson, listStudentCourses } from '../student-repo'
import type { LockInfo } from '../types'
import { LockedLesson } from './student-lesson-view'

// Server-side seeds for the student course screens (spec 002 US4): same data as the Route Handlers,
// read with the caller's id and time zone (the /s layout already checked the role and the link).

const notFoundOn404 = (error: unknown): never => {
  if (error instanceof NotFound) notFound()
  throw error
}

export function WithStudentCourses({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <SeedList>{children}</SeedList>
    </Suspense>
  )
}

async function SeedList({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  const courses = await listStudentCourses(me.id)
  return <Prefetched entries={[[studentCoursesQuery.queryKey, courses]]}>{children}</Prefetched>
}

export function WithStudentCourse({
  courseId,
  children,
}: {
  courseId: Promise<string>
  children: ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedCourse courseId={courseId}>{children}</SeedCourse>
    </Suspense>
  )
}

async function SeedCourse({
  courseId,
  children,
}: {
  courseId: Promise<string>
  children: ReactNode
}) {
  const me = await requirePageUser()
  const id = await courseId
  if (!z.uuid().safeParse(id).success) notFound()
  const course = await getStudentCourse(me, id).catch(notFoundOn404)
  return <Prefetched entries={[[studentCourseQuery(id).queryKey, course]]}>{children}</Prefetched>
}

/** A locked lesson renders its reason instead of the content (research.md R1). */
export function WithStudentLesson({
  lessonId,
  children,
}: {
  lessonId: Promise<string>
  children: ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedLesson lessonId={lessonId}>{children}</SeedLesson>
    </Suspense>
  )
}

async function SeedLesson({
  lessonId,
  children,
}: {
  lessonId: Promise<string>
  children: ReactNode
}) {
  const me = await requirePageUser()
  const id = await lessonId
  if (!z.uuid().safeParse(id).success) notFound()
  const result = await getStudentLesson(me, id).then(
    (lesson) => ({ lesson }) as const,
    (error: unknown) => {
      if (error instanceof HttpError && error.code === 'lesson_locked') {
        return { locked: error.details as { courseId: string; lock: LockInfo | null } } as const
      }
      return notFoundOn404(error)
    },
  )
  if ('locked' in result) {
    return <LockedLesson courseId={result.locked.courseId} lock={result.locked.lock} />
  }
  return (
    <Prefetched entries={[[studentLessonQuery(id).queryKey, result.lesson]]}>{children}</Prefetched>
  )
}
