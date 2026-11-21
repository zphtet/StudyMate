import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { getAdminLesson } from '../lesson-repo'
import { adminCourseQuery, adminCoursesQuery, adminLessonQuery } from '../queries'
import { getAdminCourse, listAdminCourses } from '../repo'

// Server-side seeds for the admin course screens: same data as the Route Handlers, read with the
// caller's id (the /a layout already checked the role), handed to the client cache.

export function WithAdminCourses({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <SeedList>{children}</SeedList>
    </Suspense>
  )
}

async function SeedList({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  const courses = await listAdminCourses(me.id)
  return <Prefetched entries={[[adminCoursesQuery.queryKey, courses]]}>{children}</Prefetched>
}

export function WithAdminCourse({
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
  const detail = await getAdminCourse(me.id, id).catch((error: unknown) => {
    if (error instanceof NotFound) notFound()
    throw error
  })
  return <Prefetched entries={[[adminCourseQuery(id).queryKey, detail]]}>{children}</Prefetched>
}

export function WithAdminLesson({
  ids,
  children,
}: {
  ids: Promise<{ courseId: string; lessonId: string }>
  children: ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedLesson ids={ids}>{children}</SeedLesson>
    </Suspense>
  )
}

async function SeedLesson({
  ids,
  children,
}: {
  ids: Promise<{ courseId: string; lessonId: string }>
  children: ReactNode
}) {
  const me = await requirePageUser()
  const { courseId, lessonId } = await ids
  if (!z.uuid().safeParse(lessonId).success) notFound()
  const lesson = await getAdminLesson(me.id, lessonId).catch((error: unknown) => {
    if (error instanceof NotFound) notFound()
    throw error
  })
  if (lesson.courseId !== courseId) notFound()
  return (
    <Prefetched entries={[[adminLessonQuery(lessonId).queryKey, lesson]]}>{children}</Prefetched>
  )
}
