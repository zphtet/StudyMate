'use server'

import { z } from 'zod'
import { action } from '@/lib/action'
import { requireCourseOwner, requireRole } from '@/server/auth/guards'
import { duplicateCourse as copyCourse } from './copy'
import * as lessonRepo from './lesson-repo'
import * as repo from './repo'
import { courseFieldsSchema, courseStatusSchema, sectionTitleSchema } from './schemas'

// Course and section actions (specs/002-courses-lessons/contracts/server-actions.md › Courses,
// › Sections). Each starts with a guard; the repos scope every query to the caller's own courses.

const courseId = z.uuid()

export const createCourse = action(
  courseFieldsSchema.extend({ copyFromId: courseId.optional() }),
  async ({ copyFromId, ...fields }) => {
    const me = await requireRole('admin')
    if (copyFromId) {
      await requireCourseOwner(copyFromId)
      return copyCourse(me.id, copyFromId, fields)
    }
    return repo.createCourse(me.id, fields)
  },
)

export const updateCourse = action(
  z.object({ courseId, fields: courseFieldsSchema }),
  async ({ courseId, fields }) => {
    const me = await requireCourseOwner(courseId)
    return repo.updateCourse(me.id, courseId, fields)
  },
)

export const setCourseStatus = action(
  z.object({ courseId, status: courseStatusSchema }),
  async ({ courseId, status }) => {
    const me = await requireCourseOwner(courseId)
    return repo.setCourseStatus(me.id, courseId, status)
  },
)

/** "Duplicate as template": a Draft copy titled "{title} (copy)". */
export const duplicateCourse = action(z.object({ sourceId: courseId }), async ({ sourceId }) => {
  const me = await requireCourseOwner(sourceId)
  return copyCourse(me.id, sourceId)
})

/** Soft delete after typing the course name (US3 scenario 2). */
export const deleteCourse = action(
  z.object({ courseId, confirmTitle: z.string().max(200) }),
  async ({ courseId, confirmTitle }) => {
    const me = await requireCourseOwner(courseId)
    return repo.deleteCourse(me.id, courseId, confirmTitle)
  },
)

/** From Recently deleted, within 30 days (US3 scenario 3). */
export const restoreCourse = action(z.object({ courseId }), async ({ courseId }) => {
  const me = await requireCourseOwner(courseId)
  return repo.restoreCourse(me.id, courseId)
})

// ── Sections ────────────────────────────────────────────────────────────────────────────────

const sectionId = z.uuid()

export const addSection = action(
  z.object({ courseId, title: sectionTitleSchema }),
  async ({ courseId, title }) => {
    const me = await requireRole('admin')
    return lessonRepo.addSection(me.id, courseId, title)
  },
)

export const renameSection = action(
  z.object({ sectionId, title: sectionTitleSchema }),
  async ({ sectionId, title }) => {
    const me = await requireRole('admin')
    return lessonRepo.renameSection(me.id, sectionId, title)
  },
)

export const moveSection = action(
  z.object({ sectionId, direction: z.enum(['up', 'down']) }),
  async ({ sectionId, direction }) => {
    const me = await requireRole('admin')
    return lessonRepo.moveSection(me.id, sectionId, direction)
  },
)

export const deleteSection = action(z.object({ sectionId }), async ({ sectionId }) => {
  const me = await requireRole('admin')
  return lessonRepo.deleteSection(me.id, sectionId)
})
