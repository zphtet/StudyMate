import 'server-only'
import type { ReactNode } from 'react'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { lessonWorkQuery } from '../queries'
import { getLessonWork } from '../repo'

/**
 * Server seed for the lesson screen's work (same data as GET /api/lessons/[lessonId]/work). Render it
 * inside 002's WithStudentLesson, which has already checked that the student can open the lesson.
 */
export async function WithLessonWork({
  lessonId,
  children,
}: {
  lessonId: Promise<string>
  children: ReactNode
}) {
  const me = await requirePageUser()
  const id = await lessonId
  const work = await getLessonWork(me, id)
  return <Prefetched entries={[[lessonWorkQuery(id).queryKey, work]]}>{children}</Prefetched>
}
