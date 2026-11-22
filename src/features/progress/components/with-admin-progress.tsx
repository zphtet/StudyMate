import 'server-only'
import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { AuthError, requireAdminLessonTarget, requireAdminOf } from '@/server/auth/guards'
import { requirePageUser } from '@/server/auth/page-guard'
import { getAdminLesson, getStudentCards, getStudentDetail } from '../admin-repo'
import { adminLessonReviewQuery, adminStudentQuery, studentCardsQuery } from '../queries'

// Server-side seeds for the Admin's student screens (spec 004): same data and guards as the Route
// Handlers, handed to the client cache. A student who isn't linked, or a lesson the guard refuses, is a
// plain 404 page.

const notFoundOnRefusal = (error: unknown): never => {
  if (error instanceof AuthError || error instanceof NotFound) notFound()
  throw error
}

export function WithStudentCards({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <SeedCards>{children}</SeedCards>
    </Suspense>
  )
}

async function SeedCards({ children }: { children: ReactNode }) {
  const me = await requirePageUser()
  const cards = await getStudentCards(me)
  return <Prefetched entries={[[studentCardsQuery.queryKey, cards]]}>{children}</Prefetched>
}

export function WithAdminStudent({
  studentId,
  children,
}: {
  studentId: Promise<string>
  children: ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedStudent studentId={studentId}>{children}</SeedStudent>
    </Suspense>
  )
}

async function SeedStudent({
  studentId,
  children,
}: {
  studentId: Promise<string>
  children: ReactNode
}) {
  const id = await studentId
  if (!z.uuid().safeParse(id).success) notFound()
  const me = await requireAdminOf(id).catch(notFoundOnRefusal)
  const detail = await getStudentDetail(me, id)
  return <Prefetched entries={[[adminStudentQuery(id).queryKey, detail]]}>{children}</Prefetched>
}

export function WithAdminLessonReview({
  ids,
  children,
}: {
  ids: Promise<{ studentId: string; lessonId: string }>
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
  ids: Promise<{ studentId: string; lessonId: string }>
  children: ReactNode
}) {
  const { studentId, lessonId } = await ids
  if (!z.uuid().safeParse(studentId).success || !z.uuid().safeParse(lessonId).success) notFound()
  const { me } = await requireAdminLessonTarget(lessonId, studentId).catch(notFoundOnRefusal)
  const review = await getAdminLesson(me, studentId, lessonId).catch(notFoundOnRefusal)
  return (
    <Prefetched entries={[[adminLessonReviewQuery(studentId, lessonId).queryKey, review]]}>
      {children}
    </Prefetched>
  )
}
