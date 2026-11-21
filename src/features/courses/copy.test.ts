// @vitest-environment node
// Spec 002 US1 scenario 2, data-model.md › Copy rules, research.md R9.
import { describe, expect, test } from 'vitest'
import { planCopy, type CopySource } from './copy-plan'

const OLD = {
  course: 'c0000000-0000-4000-8000-000000000001',
  week1: 'c0000000-0000-4000-8000-000000000011',
  l1: 'c0000000-0000-4000-8000-000000000021',
  l2: 'c0000000-0000-4000-8000-000000000022',
  l3: 'c0000000-0000-4000-8000-000000000023',
  r1: 'c0000000-0000-4000-8000-000000000031',
  r2: 'c0000000-0000-4000-8000-000000000032',
}

const source: CopySource = {
  id: OLD.course,
  sections: [{ id: OLD.week1, title: 'Week 1', position: 0 }],
  lessons: [
    {
      id: OLD.l1,
      sectionId: OLD.week1,
      title: 'Particles',
      contentMd: `See ![chart](/api/lesson-files/${OLD.r1}/chart.png) and again /api/lesson-files/${OLD.r1}/chart.png`,
      estMinutes: 15,
      assignmentPrompt: 'Write 5 sentences',
      requireSubmission: true,
      unlockRule: { type: 'on_date', date: '2027-01-15' },
      status: 'published',
      position: 0,
      updatedAt: new Date(1),
      deletedAt: null,
      resources: [
        {
          id: OLD.r1,
          kind: 'image',
          name: 'chart.png',
          url: null,
          storagePath: `${OLD.course}/${OLD.l1}/aaaaaaaa-0000-4000-8000-000000000000.png`,
          sizeBytes: 100,
        },
        {
          id: OLD.r2,
          kind: 'link',
          name: 'NHK',
          url: 'https://www3.nhk.or.jp',
          storagePath: null,
          sizeBytes: null,
        },
      ],
    },
    {
      id: OLD.l2,
      sectionId: OLD.week1,
      title: 'Deleted one',
      contentMd: '',
      estMinutes: 10,
      assignmentPrompt: null,
      requireSubmission: false,
      unlockRule: { type: 'after_previous' },
      status: 'published',
      position: 1,
      updatedAt: new Date(1),
      deletedAt: new Date(2),
      resources: [],
    },
    {
      id: OLD.l3,
      sectionId: OLD.week1,
      title: 'Verbs',
      contentMd: 'No files here',
      estMinutes: 20,
      assignmentPrompt: null,
      requireSubmission: false,
      unlockRule: { type: 'after_previous' },
      status: 'draft',
      position: 1,
      updatedAt: new Date(3),
      deletedAt: null,
      resources: [],
    },
  ],
}

const fields = {
  title: 'Particles (copy)',
  description: null,
  icon: '文',
  color: 'teal' as const,
  targetDate: null,
  levelTag: 'N4',
  unlockInOrder: true,
  allowStudentNotes: true,
  status: 'draft' as const,
}

/** Deterministic ids: new-1, new-2, … padded into uuids. */
function idSource() {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

describe('planCopy', () => {
  const plan = planCopy(source, fields, idSource())

  test('the new course takes the form fields', () => {
    expect(plan.course).toMatchObject({
      title: 'Particles (copy)',
      color: 'teal',
      levelTag: 'N4',
      status: 'draft',
    })
    expect(plan.course.id).not.toBe(OLD.course)
  })

  test('sections are copied with new ids and the same positions', () => {
    expect(plan.sections).toEqual([
      { id: expect.any(String), courseId: plan.course.id, title: 'Week 1', position: 0 },
    ])
    expect(plan.sections[0].id).not.toBe(OLD.week1)
  })

  test('deleted lessons are skipped; the rest become Draft with rules, prompts and order kept', () => {
    expect(plan.lessons.map((l) => l.title)).toEqual(['Particles', 'Verbs'])
    expect(plan.lessons.every((l) => l.status === 'draft')).toBe(true)
    expect(plan.lessons.map((l) => l.position)).toEqual([0, 1])
    expect(plan.lessons[0]).toMatchObject({
      sectionId: plan.sections[0].id,
      courseId: plan.course.id,
      unlockRule: { type: 'on_date', date: '2027-01-15' },
      assignmentPrompt: 'Write 5 sentences',
      requireSubmission: true,
      estMinutes: 15,
    })
  })

  test('resources get new ids; stored files move under the new course and lesson', () => {
    const [image, link] = plan.resources
    const lesson = plan.lessons[0]
    expect(image.id).not.toBe(OLD.r1)
    expect(image.lessonId).toBe(lesson.id)
    expect(image.storagePath).toMatch(
      new RegExp(`^${plan.course.id}/${lesson.id}/[0-9a-f-]{36}\\.png$`),
    )
    expect(link).toMatchObject({ kind: 'link', url: 'https://www3.nhk.or.jp', storagePath: null })
    expect(plan.files).toEqual([
      { from: source.lessons[0].resources[0].storagePath, to: image.storagePath },
    ])
  })

  test('Markdown links to copied files point at the new resource ids', () => {
    const md = plan.lessons[0].contentMd
    expect(md).not.toContain(OLD.r1)
    expect(md.match(new RegExp(`/api/lesson-files/${plan.resources[0].id}/`, 'g'))).toHaveLength(2)
    expect(plan.lessons[1].contentMd).toBe('No files here')
  })

  test('nothing about students is copied', () => {
    expect(Object.keys(plan)).toEqual(['course', 'sections', 'lessons', 'resources', 'files'])
  })
})
