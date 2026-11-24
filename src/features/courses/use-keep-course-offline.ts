'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { lessonWorkQuery } from '@/features/progress/queries'
import { keepCourse, type MediaItem } from '@/lib/offline/keep-course'
import { outboxUserId } from '@/lib/offline/sync'
import { studentLessonQuery } from './queries'
import type { StudentCourse, StudentLesson } from './types'

/** Files the Markdown names but the attachment list doesn't (inline images, audio). */
const FILE_URL = /\/api\/lesson-files\/[^\s)"'<>]+/g

function mediaOf(lesson: StudentLesson): MediaItem[] {
  const listed = lesson.attachments
    .filter((r) => r.url.startsWith('/api/lesson-files/'))
    .map((r) => ({ url: r.url, sizeBytes: r.sizeBytes }))
  const inline = [...new Set(lesson.contentMd.match(FILE_URL) ?? [])]
    .filter((url) => !listed.some((m) => m.url === url))
    .map((url) => ({ url, sizeBytes: null }))
  return [...inline, ...listed]
}

/**
 * Spec 008 US2 scenario 1: opening a course online keeps its open lessons for offline use: their
 * data (in the persisted query cache), pages and files (research R3). At idle, after the screen.
 */
export function useKeepCourseOffline(course: StudentCourse) {
  const queryClient = useQueryClient()
  const courseId = course.course.id
  const lessonIds = course.groups
    .flatMap((group) => group.lessons)
    .filter((lesson) => lesson.state === 'open')
    .map((lesson) => lesson.id)
  const key = lessonIds.join(',')

  useEffect(() => {
    if (!navigator.onLine || key === '') return
    const handle = requestIdleCallback(() => {
      const userId = outboxUserId()
      if (!userId) return
      void keepCourse({
        userId,
        courseId,
        lessonIds: key.split(','),
        readLesson: async (lessonId) => {
          const lesson = await queryClient.fetchQuery(studentLessonQuery(lessonId))
          await queryClient.prefetchQuery(lessonWorkQuery(lessonId))
          return mediaOf(lesson)
        },
      }).catch(() => undefined) // best effort: the course still works online
    })
    return () => cancelIdleCallback(handle)
  }, [courseId, key, queryClient])
}
