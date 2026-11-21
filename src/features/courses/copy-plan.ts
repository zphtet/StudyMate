import { renumber } from './order'
import type { CourseFields, UnlockRule } from './schemas'

// Pure copy plan for duplicateCourse (spec 002 data-model.md › Copy rules, research.md R9).
// Copies sections, non-deleted lessons (as Draft) and resources with new ids; stored files move
// under the new course and lesson folders; Markdown links to copied files are rewritten.
// Students' assignments, progress, deadlines and submissions are never copied.

type ResourceKind = 'file' | 'link' | 'audio' | 'image'

export type CopySource = {
  id: string
  sections: { id: string; title: string; position: number }[]
  lessons: {
    id: string
    sectionId: string | null
    title: string
    contentMd: string
    estMinutes: number
    assignmentPrompt: string | null
    requireSubmission: boolean
    unlockRule: UnlockRule
    status: 'draft' | 'published'
    position: number
    updatedAt: Date
    deletedAt: Date | null
    resources: {
      id: string
      kind: ResourceKind
      name: string
      url: string | null
      storagePath: string | null
      sizeBytes: number | null
    }[]
  }[]
}

export type CopyPlan = ReturnType<typeof planCopy>

const extensionOf = (path: string) => path.slice(path.lastIndexOf('.'))

export function planCopy(source: CopySource, fields: CourseFields, newId: () => string) {
  const course = { id: newId(), ...fields }

  const sectionIds = new Map(source.sections.map((s) => [s.id, newId()]))
  const sections = source.sections.map((s) => ({
    id: sectionIds.get(s.id)!,
    courseId: course.id,
    title: s.title,
    position: s.position,
  }))

  const kept = source.lessons.filter((l) => !l.deletedAt)
  // Positions per group, gapless after skipping deleted lessons.
  const positions = new Map<string, number>()
  for (const groupKey of new Set(kept.map((l) => l.sectionId ?? ''))) {
    for (const { id, position } of renumber(kept.filter((l) => (l.sectionId ?? '') === groupKey))) {
      positions.set(id, position)
    }
  }

  const lessons: {
    id: string
    courseId: string
    sectionId: string | null
    title: string
    contentMd: string
    estMinutes: number
    assignmentPrompt: string | null
    requireSubmission: boolean
    unlockRule: UnlockRule
    status: 'draft'
    position: number
  }[] = []
  const resources: {
    id: string
    lessonId: string
    kind: ResourceKind
    name: string
    url: string | null
    storagePath: string | null
    sizeBytes: number | null
  }[] = []
  const files: { from: string; to: string }[] = []

  for (const lesson of kept) {
    const lessonId = newId()
    let contentMd = lesson.contentMd
    for (const resource of lesson.resources) {
      const resourceId = newId()
      let storagePath: string | null = null
      if (resource.storagePath) {
        storagePath = `${course.id}/${lessonId}/${newId()}${extensionOf(resource.storagePath)}`
        files.push({ from: resource.storagePath, to: storagePath })
      }
      resources.push({
        id: resourceId,
        lessonId,
        kind: resource.kind,
        name: resource.name,
        url: resource.url,
        storagePath,
        sizeBytes: resource.sizeBytes,
      })
      contentMd = contentMd.replaceAll(
        `/api/lesson-files/${resource.id}/`,
        `/api/lesson-files/${resourceId}/`,
      )
    }
    lessons.push({
      id: lessonId,
      courseId: course.id,
      sectionId: lesson.sectionId ? (sectionIds.get(lesson.sectionId) ?? null) : null,
      title: lesson.title,
      contentMd,
      estMinutes: lesson.estMinutes,
      assignmentPrompt: lesson.assignmentPrompt,
      requireSubmission: lesson.requireSubmission,
      unlockRule: lesson.unlockRule,
      status: 'draft',
      position: positions.get(lesson.id) ?? lesson.position,
    })
  }

  return { course, sections, lessons, resources, files }
}
