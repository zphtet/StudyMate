'use server'

import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { action } from '@/lib/action'
import { requireCourseOwner, requireLessonOwner, requireRole } from '@/server/auth/guards'
import * as repo from './lesson-repo'
import { lessonFieldsSchema, lessonStatusSchema, resourceSchema } from './schemas'

// Lesson actions (specs/002-courses-lessons/contracts/server-actions.md › Lessons). Each starts with
// a guard; the repo scopes every query to the caller's own, non-deleted courses.

const courseId = z.uuid()
const lessonId = z.uuid()
const sectionId = z.uuid().nullable()

export const createLesson = action(
  z.object({ courseId, sectionId }),
  async ({ courseId, sectionId }) => {
    const me = await requireCourseOwner(courseId)
    const t = await getTranslations('lessonEditor')
    return repo.createLesson(me.id, courseId, sectionId, t('newLesson'))
  },
)

/** Autosave (research.md R6); called with mutation scope `lesson:<id>`. */
export const saveLesson = action(
  z.object({ lessonId, fields: lessonFieldsSchema }),
  async ({ lessonId, fields }) => {
    const { me } = await requireLessonOwner(lessonId)
    return repo.saveLesson(me.id, lessonId, fields)
  },
)

export const setLessonStatus = action(
  z.object({ lessonId, status: lessonStatusSchema }),
  async ({ lessonId, status }) => {
    const { me } = await requireLessonOwner(lessonId)
    return repo.setLessonStatus(me.id, lessonId, status)
  },
)

export const reorderLessons = action(
  z.object({
    courseId,
    groups: z
      .array(z.object({ sectionId, lessonIds: z.array(z.uuid()).max(1000) }))
      .min(1)
      .max(100),
  }),
  async ({ courseId, groups }) => {
    const me = await requireCourseOwner(courseId)
    return repo.reorderLessons(me.id, courseId, groups)
  },
)

/** Soft delete (US3 scenario 1); `requireLessonOwner` also matches deleted lessons. */
export const deleteLesson = action(z.object({ lessonId }), async ({ lessonId }) => {
  const { me } = await requireLessonOwner(lessonId)
  return repo.deleteLesson(me.id, lessonId)
})

export const restoreLesson = action(z.object({ lessonId }), async ({ lessonId }) => {
  const { me } = await requireLessonOwner(lessonId)
  return repo.restoreLesson(me.id, lessonId)
})

export const addLessonResource = action(
  z.object({ lessonId, resource: resourceSchema }),
  async ({ lessonId, resource }) => {
    const { me } = await requireLessonOwner(lessonId)
    return repo.addLessonResource(me.id, lessonId, resource)
  },
)

export const removeLessonResource = action(
  z.object({ resourceId: z.uuid() }),
  async ({ resourceId }) => {
    const me = await requireRole('admin')
    return repo.removeLessonResource(me.id, resourceId)
  },
)
