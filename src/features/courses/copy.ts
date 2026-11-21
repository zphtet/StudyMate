import 'server-only'
import { randomUUID } from 'node:crypto'
import { getTranslations } from 'next-intl/server'
import { fail } from '@/lib/action'
import { prisma } from '@/lib/prisma'
import { createServerClient } from '@/lib/supabase/server'
import { planCopy, type CopySource } from './copy-plan'
import { readUnlockRule, type CourseColor, type CourseFields } from './schemas'

// duplicateCourse (spec 002 US1 scenario 2, research.md R9): rows first in one transaction, so the
// Storage insert policy (owns_course on the new folder) passes with the caller's own token; then the
// files. If any file fails, the new course and the files already copied are removed.

const BUCKET = 'lesson-files'
const PARALLEL_COPIES = 5

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run))
  }
}

/** Copies a course the caller owns. `fields` come from the New course form; without them the copy is
 *  a Draft named "{title} (copy)" ("Duplicate as template"). */
export async function duplicateCourse(adminId: string, sourceId: string, fields?: CourseFields) {
  const source = await prisma.course.findFirst({
    where: { id: sourceId, ownerId: adminId, deletedAt: null },
    include: {
      sections: { select: { id: true, title: true, position: true } },
      lessons: { include: { resources: true } },
    },
  })
  if (!source) fail('course_not_found')

  const t = await getTranslations('courseForm')
  const courseFields: CourseFields = fields ?? {
    title: t('copySuffix', { title: source.title }).slice(0, 120),
    description: source.description,
    icon: source.icon,
    color: source.color as CourseColor,
    targetDate: source.targetDate ? source.targetDate.toISOString().slice(0, 10) : null,
    levelTag: source.levelTag,
    unlockInOrder: source.unlockInOrder,
    allowStudentNotes: source.allowStudentNotes,
    status: 'draft',
  }

  const copySource: CopySource = {
    id: source.id,
    sections: source.sections,
    lessons: source.lessons.map((l) => ({
      ...l,
      unlockRule: readUnlockRule(l.unlockRule),
      resources: l.resources.map((r) => ({
        id: r.id,
        kind: r.kind as 'file' | 'link' | 'audio' | 'image',
        name: r.name,
        url: r.url,
        storagePath: r.storagePath,
        sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
      })),
    })),
  }
  const plan = planCopy(copySource, courseFields, randomUUID)

  await prisma.$transaction([
    prisma.course.create({
      data: {
        id: plan.course.id,
        ownerId: adminId,
        isPersonal: false,
        title: plan.course.title,
        description: plan.course.description,
        icon: plan.course.icon,
        color: plan.course.color,
        targetDate: plan.course.targetDate ? new Date(`${plan.course.targetDate}T00:00:00Z`) : null,
        levelTag: plan.course.levelTag,
        unlockInOrder: plan.course.unlockInOrder,
        allowStudentNotes: plan.course.allowStudentNotes,
        status: plan.course.status,
      },
    }),
    prisma.courseSection.createMany({ data: plan.sections }),
    prisma.lesson.createMany({ data: plan.lessons }),
    prisma.lessonResource.createMany({
      data: plan.resources.map((r) => ({
        ...r,
        sizeBytes: r.sizeBytes === null ? null : BigInt(r.sizeBytes),
      })),
    }),
  ])

  const storage = (await createServerClient()).storage.from(BUCKET)
  const copied: string[] = []
  try {
    await inBatches(plan.files, PARALLEL_COPIES, async ({ from, to }) => {
      const { error } = await storage.copy(from, to)
      if (error) throw error
      copied.push(to)
    })
  } catch (error) {
    console.error('[duplicateCourse] file copy failed', error)
    if (copied.length) await storage.remove(copied)
    await prisma.course.delete({ where: { id: plan.course.id } })
    fail('copy_failed')
  }

  return { id: plan.course.id }
}
