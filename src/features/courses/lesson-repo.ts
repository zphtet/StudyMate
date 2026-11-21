import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { fail } from '@/lib/action'
import { NotFound } from '@/lib/http'
import { prisma } from '@/lib/prisma'
import { createServerClient } from '@/lib/supabase/server'
import { lessonFileUrl } from './files'
import { flatten, groupCourse, mergeOrder, numberLessons, renumber } from './order'
import {
  isStoragePathFor,
  readUnlockRule,
  type LessonFields,
  type ResourceFields,
  type UnlockRule,
} from './schemas'
import type { AdminLesson, Resource, ResourceKind } from './types'

// Sections, lessons and resources for the admin builder (spec 002 US2, contracts/server-actions.md
// › Sections and › Lessons). Callers MUST have run a guard; every query is scoped to the caller's own,
// non-deleted courses: `course: { ownerId: adminId, deletedAt: null }`.
//
// Positions are 0..n−1 within a group (a section, or "no section") over non-deleted lessons, and
// are renumbered by the server after every move (data-model.md › Ordering, research.md R7).

type Tx = Prisma.TransactionClient

const BUCKET = 'lesson-files'

const ownCourse = (adminId: string) => ({ ownerId: adminId, deletedAt: null })

/** Rewrites positions 0..n−1 for one group, keeping its order. */
async function renumberGroup(tx: Tx, courseId: string, sectionId: string | null) {
  const lessons = await tx.lesson.findMany({
    where: { courseId, sectionId, deletedAt: null },
    select: { id: true, position: true, updatedAt: true },
  })
  const current = new Map(lessons.map((l) => [l.id, l.position]))
  for (const { id, position } of renumber(lessons)) {
    if (current.get(id) !== position) {
      await tx.lesson.update({ where: { id }, data: { position } })
    }
  }
}

async function renumberSections(tx: Tx, courseId: string) {
  const sections = await tx.courseSection.findMany({
    where: { courseId },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  })
  for (const [position, section] of sections.entries()) {
    if (section.position !== position) {
      await tx.courseSection.update({ where: { id: section.id }, data: { position } })
    }
  }
}

/** Throws `invalid_section` unless the section belongs to the course (null = no section). */
async function checkSection(tx: Tx, courseId: string, sectionId: string | null) {
  if (sectionId === null) return
  const section = await tx.courseSection.findFirst({
    where: { id: sectionId, courseId },
    select: { id: true },
  })
  if (!section) fail('invalid_section')
}

const touchCourse = (tx: Tx, courseId: string) =>
  tx.course.update({ where: { id: courseId }, data: { updatedAt: new Date() } })

// ── Sections ────────────────────────────────────────────────────────────────────────────────

export async function addSection(adminId: string, courseId: string, title: string) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: courseId, ...ownCourse(adminId) },
      select: { _count: { select: { sections: true } } },
    })
    if (!course) fail('course_not_found')
    const section = await tx.courseSection.create({
      data: { courseId, title, position: course._count.sections },
      select: { id: true },
    })
    await touchCourse(tx, courseId)
    return { id: section.id }
  })
}

async function findSection(tx: Tx, adminId: string, sectionId: string) {
  const section = await tx.courseSection.findFirst({
    where: { id: sectionId, course: ownCourse(adminId) },
    select: { id: true, courseId: true, position: true },
  })
  if (!section) fail('section_not_found')
  return section
}

export async function renameSection(adminId: string, sectionId: string, title: string) {
  return prisma.$transaction(async (tx) => {
    const section = await findSection(tx, adminId, sectionId)
    await tx.courseSection.update({ where: { id: section.id }, data: { title } })
    await touchCourse(tx, section.courseId)
    return {}
  })
}

/** Swaps the section with its neighbour; at either end nothing changes. */
export async function moveSection(adminId: string, sectionId: string, direction: 'up' | 'down') {
  return prisma.$transaction(async (tx) => {
    const section = await findSection(tx, adminId, sectionId)
    await renumberSections(tx, section.courseId)
    const sections = await tx.courseSection.findMany({
      where: { courseId: section.courseId },
      orderBy: { position: 'asc' },
      select: { id: true },
    })
    const index = sections.findIndex((s) => s.id === sectionId)
    const other = sections[direction === 'up' ? index - 1 : index + 1]
    if (!other) return {}
    const target = direction === 'up' ? index - 1 : index + 1
    await tx.courseSection.update({ where: { id: other.id }, data: { position: index } })
    await tx.courseSection.update({ where: { id: sectionId }, data: { position: target } })
    await touchCourse(tx, section.courseId)
    return {}
  })
}

/** Only when it holds no non-deleted lessons; deleted ones fall back to "no section" (FK set null). */
export async function deleteSection(adminId: string, sectionId: string) {
  return prisma.$transaction(async (tx) => {
    const section = await findSection(tx, adminId, sectionId)
    const lessons = await tx.lesson.count({ where: { sectionId, deletedAt: null } })
    if (lessons > 0) fail('section_not_empty')
    await tx.courseSection.delete({ where: { id: sectionId } })
    await renumberSections(tx, section.courseId)
    await touchCourse(tx, section.courseId)
    return {}
  })
}

// ── Lessons ─────────────────────────────────────────────────────────────────────────────────

/** A Draft at the end of its group; its rule follows data-model.md Course.unlockInOrder. */
export async function createLesson(
  adminId: string,
  courseId: string,
  sectionId: string | null,
  title: string,
) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: courseId, ...ownCourse(adminId) },
      select: { unlockInOrder: true },
    })
    if (!course) fail('course_not_found')
    await checkSection(tx, courseId, sectionId)
    const position = await tx.lesson.count({ where: { courseId, sectionId, deletedAt: null } })
    const unlockRule: UnlockRule = { type: course.unlockInOrder ? 'after_previous' : 'none' }
    const lesson = await tx.lesson.create({
      data: { courseId, sectionId, title, status: 'draft', position, unlockRule },
      select: { id: true },
    })
    await touchCourse(tx, courseId)
    return { id: lesson.id }
  })
}

async function findLesson(tx: Tx, adminId: string, lessonId: string) {
  const lesson = await tx.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, course: ownCourse(adminId) },
    select: { id: true, courseId: true, sectionId: true },
  })
  if (!lesson) fail('lesson_not_found')
  return lesson
}

/**
 * Autosave (research.md R6): every editable field at once; a Published lesson changes for students
 * at once. Moving to another section appends the lesson there and renumbers both groups.
 */
export async function saveLesson(adminId: string, lessonId: string, fields: LessonFields) {
  return prisma.$transaction(async (tx) => {
    const lesson = await findLesson(tx, adminId, lessonId)
    const moved = lesson.sectionId !== fields.sectionId
    if (moved) await checkSection(tx, lesson.courseId, fields.sectionId)

    const position = moved
      ? await tx.lesson.count({
          where: { courseId: lesson.courseId, sectionId: fields.sectionId, deletedAt: null },
        })
      : undefined
    const saved = await tx.lesson.update({
      where: { id: lessonId },
      data: {
        title: fields.title,
        estMinutes: fields.estMinutes,
        sectionId: fields.sectionId,
        unlockRule: fields.unlockRule,
        contentMd: fields.contentMd,
        assignmentPrompt: fields.assignmentPrompt,
        requireSubmission: fields.requireSubmission,
        position,
        updatedAt: new Date(),
      },
      select: { updatedAt: true },
    })
    if (moved) await renumberGroup(tx, lesson.courseId, lesson.sectionId)
    return { updatedAt: saved.updatedAt.toISOString() }
  })
}

export async function setLessonStatus(
  adminId: string,
  lessonId: string,
  status: 'draft' | 'published',
) {
  return prisma.$transaction(async (tx) => {
    const lesson = await findLesson(tx, adminId, lessonId)
    await tx.lesson.update({ where: { id: lessonId }, data: { status, updatedAt: new Date() } })
    await touchCourse(tx, lesson.courseId)
    return { status }
  })
}

export type ReorderGroup = { sectionId: string | null; lessonIds: string[] }

/**
 * Writes the order of the affected groups in one transaction (contracts/server-actions.md ›
 * reorderLessons). A listed lesson now in another group moves to the listed group; lessons of a
 * listed group that the client didn't list (added elsewhere) follow the listed ones; groups that
 * lost a lesson are renumbered.
 */
export async function reorderLessons(adminId: string, courseId: string, groups: ReorderGroup[]) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({
      where: { id: courseId, ...ownCourse(adminId) },
      select: {
        sections: { select: { id: true } },
        lessons: {
          where: { deletedAt: null },
          select: { id: true, sectionId: true, position: true },
        },
      },
    })
    if (!course) fail('course_not_found')

    const sectionIds = new Set(course.sections.map((s) => s.id))
    const groupKeys = groups.map((g) => g.sectionId)
    if (new Set(groupKeys).size !== groupKeys.length) fail('invalid_input')
    if (groupKeys.some((id) => id !== null && !sectionIds.has(id))) fail('invalid_section')

    const lessons = new Map(course.lessons.map((l) => [l.id, l]))
    const listed = groups.flatMap((g) => g.lessonIds)
    if (new Set(listed).size !== listed.length) fail('invalid_input')
    if (listed.some((id) => !lessons.has(id))) fail('invalid_input')
    const listedSet = new Set(listed)

    const touched = new Set<string | null>(groupKeys)
    for (const group of groups) {
      const current = course.lessons.filter(
        (l) => l.sectionId === group.sectionId && !listedSet.has(l.id),
      )
      for (const [position, id] of mergeOrder(group.lessonIds, current).entries()) {
        const lesson = lessons.get(id)!
        if (lesson.sectionId !== group.sectionId) touched.add(lesson.sectionId)
        if (lesson.sectionId !== group.sectionId || lesson.position !== position) {
          await tx.lesson.update({
            where: { id },
            data: { sectionId: group.sectionId, position },
          })
        }
      }
    }
    for (const sectionId of touched) {
      if (!groupKeys.includes(sectionId)) await renumberGroup(tx, courseId, sectionId)
    }
    await touchCourse(tx, courseId)
    return {}
  })
}

// ── Reads ───────────────────────────────────────────────────────────────────────────────────

type ResourceRow = {
  id: string
  kind: string
  name: string
  url: string | null
  storagePath: string | null
  sizeBytes: bigint | null
}

export const toResource = (r: ResourceRow): Resource => ({
  id: r.id,
  kind: r.kind as ResourceKind,
  name: r.name,
  url: r.kind === 'link' ? r.url! : lessonFileUrl(r.id, r.name),
  sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
})

/** The editor's data (contracts/route-handlers.md › GET /api/admin/lessons/[lessonId]). */
export async function getAdminLesson(adminId: string, lessonId: string): Promise<AdminLesson> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, course: ownCourse(adminId) },
    include: {
      resources: { orderBy: { createdAt: 'asc' } },
      course: {
        select: {
          title: true,
          sections: { select: { id: true, title: true, position: true } },
          lessons: {
            where: { deletedAt: null },
            select: { id: true, sectionId: true, position: true, title: true, status: true },
          },
        },
      },
    },
  })
  if (!lesson) throw new NotFound('lesson_not_found')

  const { course } = lesson
  const groups = groupCourse(course.sections, course.lessons)
  const numbers = numberLessons(groups)
  const ordered = flatten(groups)
  const index = ordered.findIndex((l) => l.id === lesson.id)
  // "After {n}": the previous Published lesson, which is what unlocks this one for students.
  const previous = ordered
    .slice(0, index)
    .reverse()
    .find((l) => l.status === 'published')

  return {
    id: lesson.id,
    courseId: lesson.courseId,
    courseTitle: course.title,
    number: numbers.get(lesson.id)!,
    title: lesson.title,
    estMinutes: lesson.estMinutes,
    sectionId: groups.some((g) => g.section?.id === lesson.sectionId) ? lesson.sectionId : null,
    unlockRule: readUnlockRule(lesson.unlockRule),
    contentMd: lesson.contentMd,
    assignmentPrompt: lesson.assignmentPrompt,
    requireSubmission: lesson.requireSubmission,
    status: lesson.status,
    updatedAt: lesson.updatedAt.toISOString(),
    sections: [...course.sections]
      .sort((a, b) => a.position - b.position)
      .map(({ id, title }) => ({ id, title })),
    previousLesson: previous ? { number: numbers.get(previous.id)!, title: previous.title } : null,
    resources: lesson.resources.map(toResource),
  }
}

// ── Resources ───────────────────────────────────────────────────────────────────────────────

/** Records a file the browser already uploaded (research.md R3), or a link. */
export async function addLessonResource(
  adminId: string,
  lessonId: string,
  input: ResourceFields,
): Promise<Resource> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, deletedAt: null, course: ownCourse(adminId) },
    select: { id: true, courseId: true },
  })
  if (!lesson) fail('lesson_not_found')
  if (input.kind !== 'link' && !isStoragePathFor(input.storagePath, lesson.courseId, lessonId)) {
    fail('invalid_input')
  }
  const row = await prisma.lessonResource.create({
    data:
      input.kind === 'link'
        ? { lessonId, kind: 'link', name: input.name, url: input.url }
        : {
            lessonId,
            kind: input.kind,
            name: input.name,
            storagePath: input.storagePath,
            sizeBytes: BigInt(input.sizeBytes),
          },
  })
  return toResource(row)
}

/** Deletes the row, then its file with the caller's Storage client (Storage RLS applies too). */
export async function removeLessonResource(adminId: string, resourceId: string) {
  const resource = await prisma.lessonResource.findFirst({
    where: { id: resourceId, lesson: { course: { ownerId: adminId } } },
    select: { id: true, storagePath: true },
  })
  if (!resource) fail('resource_not_found')
  await prisma.lessonResource.delete({ where: { id: resource.id } })
  if (resource.storagePath) {
    const supabase = await createServerClient()
    const { error } = await supabase.storage.from(BUCKET).remove([resource.storagePath])
    // The row is gone, so nobody can reach the file any more; the purge job clears leftovers.
    if (error) console.error('[removeLessonResource] file not removed', error)
  }
  return {}
}

/** What the file route needs to check access and sign a URL; null for links and unknown ids. */
export async function findLessonFile(resourceId: string) {
  const resource = await prisma.lessonResource.findUnique({
    where: { id: resourceId },
    select: { lessonId: true, storagePath: true },
  })
  return resource?.storagePath
    ? { lessonId: resource.lessonId, storagePath: resource.storagePath }
    : null
}
