// @vitest-environment node
// Spec 002 US2 (T039): section and lesson writes against the dev database. Fixtures are created
// through auth.users (trigger handle_new_user makes profiles) and deleted afterwards.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import * as repo from './lesson-repo'
import type { LessonFields } from './schemas'

// Each statement is a round trip to the hosted dev database.
vi.setConfig({ testTimeout: 30_000 })

const storage = vi.hoisted(() => ({ removed: [] as string[][] }))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          storage.removed.push(paths)
          return { data: [], error: null }
        },
      }),
    },
  }),
}))

const admin = randomUUID()
const otherAdmin = randomUUID()
const run = Date.now()

beforeAll(async () => {
  for (const [userId, name] of [
    [admin, 'Lesson Repo Admin'],
    [otherAdmin, 'Lesson Repo Other Admin'],
  ]) {
    const meta = JSON.stringify({ role: 'admin', display_name: name })
    await prisma.$executeRaw`insert into auth.users (id, email, raw_user_meta_data)
      values (${userId}::uuid, ${`lesson-repo-${run}-${userId}@example.test`}, ${meta}::jsonb)`
  }
})

afterAll(async () => {
  await prisma.$executeRaw`delete from auth.users where id = any(${[admin, otherAdmin]}::uuid[])`
  await prisma.$disconnect()
})

/** A course with `sections` sections and lessons placed by section index (null = no section). */
async function makeCourse({
  owner = admin,
  unlockInOrder = true,
  sections = 0,
  lessons = [],
}: {
  owner?: string
  unlockInOrder?: boolean
  sections?: number
  lessons?: { section: number | null; deleted?: boolean }[]
} = {}) {
  const courseId = randomUUID()
  await prisma.course.create({
    data: { id: courseId, ownerId: owner, title: `Repo ${courseId.slice(0, 6)}`, unlockInOrder },
  })
  const sectionIds = Array.from({ length: sections }, () => randomUUID())
  await prisma.courseSection.createMany({
    data: sectionIds.map((id, i) => ({ id, courseId, title: `Week ${i + 1}`, position: i })),
  })
  const lessonIds = lessons.map(() => randomUUID())
  const next = new Map<string, number>()
  await prisma.lesson.createMany({
    data: lessons.map((l, i) => {
      const sectionId = l.section === null ? null : sectionIds[l.section]
      const key = sectionId ?? 'none'
      const position = next.get(key) ?? 0
      next.set(key, position + 1)
      return {
        id: lessonIds[i],
        courseId,
        sectionId,
        title: `L${i}`,
        position,
        deletedAt: l.deleted ? new Date() : null,
      }
    }),
  })
  return { courseId, sectionIds, lessonIds }
}

/** Lesson titles per group in course order: { none: [...], 0: [...], 1: [...] }. */
async function order(courseId: string, sectionIds: string[]) {
  const lessons = await prisma.lesson.findMany({
    where: { courseId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: { title: true, sectionId: true, position: true },
  })
  const groups: Record<string, string[]> = {}
  for (const key of ['none', ...sectionIds.map((_, i) => String(i))]) {
    const sectionId = key === 'none' ? null : sectionIds[Number(key)]
    const inGroup = lessons.filter((l) => l.sectionId === sectionId)
    // Positions are gapless 0..n−1.
    expect(inGroup.map((l) => l.position)).toEqual(inGroup.map((_, i) => i))
    groups[key] = inGroup.map((l) => l.title)
  }
  return groups
}

const fieldsOf = async (lessonId: string): Promise<LessonFields> => {
  const l = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })
  return {
    title: l.title,
    estMinutes: l.estMinutes,
    sectionId: l.sectionId,
    unlockRule: l.unlockRule as LessonFields['unlockRule'],
    contentMd: l.contentMd,
    assignmentPrompt: l.assignmentPrompt,
    requireSubmission: l.requireSubmission,
  }
}

describe('createLesson', () => {
  test('takes its rule from Course.unlockInOrder and goes last in its group, as a Draft', async () => {
    const inOrder = await makeCourse({ sections: 1, lessons: [{ section: 0 }, { section: 0 }] })
    const { id } = await repo.createLesson(admin, inOrder.courseId, inOrder.sectionIds[0], 'New')
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id } })
    expect(lesson).toMatchObject({
      title: 'New',
      status: 'draft',
      position: 2,
      sectionId: inOrder.sectionIds[0],
      unlockRule: { type: 'after_previous' },
    })

    const free = await makeCourse({ unlockInOrder: false, lessons: [{ section: null }] })
    const second = await repo.createLesson(admin, free.courseId, null, 'New')
    expect(await prisma.lesson.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
      position: 1,
      sectionId: null,
      unlockRule: { type: 'none' },
    })
  })

  test('refuses a section of another course and a course of another admin', async () => {
    const mine = await makeCourse()
    const other = await makeCourse({ sections: 1 })
    await expect(
      repo.createLesson(admin, mine.courseId, other.sectionIds[0], 'New'),
    ).rejects.toMatchObject({ code: 'invalid_section' })
    await expect(repo.createLesson(otherAdmin, mine.courseId, null, 'New')).rejects.toMatchObject({
      code: 'course_not_found',
    })
  })
})

describe('saveLesson', () => {
  test('saves the fields and returns updatedAt', async () => {
    const { lessonIds } = await makeCourse({ lessons: [{ section: null }] })
    const fields = {
      ...(await fieldsOf(lessonIds[0])),
      title: 'Particles は vs が',
      estMinutes: 20,
      contentMd: '## は\n\n私**は**看護師です。',
      assignmentPrompt: 'Write 5 sentences',
      requireSubmission: true,
      unlockRule: { type: 'on_date' as const, date: '2027-01-15' },
    }
    const before = Date.now()
    const { updatedAt } = await repo.saveLesson(admin, lessonIds[0], fields)
    expect(new Date(updatedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(await fieldsOf(lessonIds[0])).toEqual(fields)
  })

  test('refuses a section of another course (invalid_section)', async () => {
    const mine = await makeCourse({ lessons: [{ section: null }] })
    const other = await makeCourse({ sections: 1 })
    const fields = { ...(await fieldsOf(mine.lessonIds[0])), sectionId: other.sectionIds[0] }
    await expect(repo.saveLesson(admin, mine.lessonIds[0], fields)).rejects.toMatchObject({
      code: 'invalid_section',
    })
  })

  test('moving a lesson appends it to the new group and renumbers both groups', async () => {
    const c = await makeCourse({
      sections: 2,
      lessons: [{ section: 0 }, { section: 0 }, { section: 0 }, { section: 1 }],
    })
    const fields = { ...(await fieldsOf(c.lessonIds[1])), sectionId: c.sectionIds[1] }
    await repo.saveLesson(admin, c.lessonIds[1], fields)
    expect(await order(c.courseId, c.sectionIds)).toEqual({
      none: [],
      0: ['L0', 'L2'],
      1: ['L3', 'L1'],
    })
  })

  test('a deleted lesson or another admin gets lesson_not_found', async () => {
    const c = await makeCourse({ lessons: [{ section: null, deleted: true }, { section: null }] })
    await expect(
      repo.saveLesson(admin, c.lessonIds[0], await fieldsOf(c.lessonIds[0])),
    ).rejects.toMatchObject({ code: 'lesson_not_found' })
    await expect(
      repo.saveLesson(otherAdmin, c.lessonIds[1], await fieldsOf(c.lessonIds[1])),
    ).rejects.toMatchObject({ code: 'lesson_not_found' })
  })
})

describe('setLessonStatus', () => {
  test('publishes and unpublishes', async () => {
    const { lessonIds } = await makeCourse({ lessons: [{ section: null }] })
    expect(await repo.setLessonStatus(admin, lessonIds[0], 'published')).toEqual({
      status: 'published',
    })
    expect(await prisma.lesson.findUniqueOrThrow({ where: { id: lessonIds[0] } })).toMatchObject({
      status: 'published',
    })
    await repo.setLessonStatus(admin, lessonIds[0], 'draft')
    expect(await prisma.lesson.findUniqueOrThrow({ where: { id: lessonIds[0] } })).toMatchObject({
      status: 'draft',
    })
    await expect(repo.setLessonStatus(otherAdmin, lessonIds[0], 'published')).rejects.toMatchObject(
      { code: 'lesson_not_found' },
    )
  })
})

describe('reorderLessons', () => {
  test('writes gapless positions, also across sections', async () => {
    const c = await makeCourse({
      sections: 2,
      lessons: [{ section: 0 }, { section: 0 }, { section: 1 }, { section: 1 }],
    })
    const [l0, l1, l2, l3] = c.lessonIds
    await repo.reorderLessons(admin, c.courseId, [
      { sectionId: c.sectionIds[0], lessonIds: [l1, l3, l0] },
      { sectionId: c.sectionIds[1], lessonIds: [l2] },
    ])
    expect(await order(c.courseId, c.sectionIds)).toEqual({
      none: [],
      0: ['L1', 'L3', 'L0'],
      1: ['L2'],
    })
  })

  test('a lesson moved out of an unlisted group leaves that group gapless', async () => {
    const c = await makeCourse({
      sections: 1,
      lessons: [{ section: null }, { section: null }, { section: null }, { section: 0 }],
    })
    await repo.reorderLessons(admin, c.courseId, [
      { sectionId: c.sectionIds[0], lessonIds: [c.lessonIds[1], c.lessonIds[3]] },
    ])
    expect(await order(c.courseId, c.sectionIds)).toEqual({ none: ['L0', 'L2'], 0: ['L1', 'L3'] })
  })

  test('a stale list keeps the lesson another device added, after the listed ones', async () => {
    const c = await makeCourse({ sections: 1, lessons: [{ section: 0 }, { section: 0 }] })
    const added = await repo.createLesson(admin, c.courseId, c.sectionIds[0], 'Added elsewhere')
    await repo.reorderLessons(admin, c.courseId, [
      { sectionId: c.sectionIds[0], lessonIds: [c.lessonIds[1], c.lessonIds[0]] },
    ])
    const groups = await order(c.courseId, c.sectionIds)
    expect(groups[0]).toEqual(['L1', 'L0', 'Added elsewhere'])
    expect(added.id).toBeTruthy()
  })

  test('refuses foreign or duplicate ids, and sections of another course', async () => {
    const c = await makeCourse({ sections: 1, lessons: [{ section: 0 }, { section: 0 }] })
    const other = await makeCourse({ sections: 1, lessons: [{ section: 0 }] })
    const section = c.sectionIds[0]
    await expect(
      repo.reorderLessons(admin, c.courseId, [
        { sectionId: section, lessonIds: [c.lessonIds[0], other.lessonIds[0]] },
      ]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      repo.reorderLessons(admin, c.courseId, [
        { sectionId: section, lessonIds: [c.lessonIds[0], c.lessonIds[0]] },
      ]),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      repo.reorderLessons(admin, c.courseId, [
        { sectionId: other.sectionIds[0], lessonIds: [c.lessonIds[0]] },
      ]),
    ).rejects.toMatchObject({ code: 'invalid_section' })
    await expect(
      repo.reorderLessons(otherAdmin, c.courseId, [{ sectionId: section, lessonIds: [] }]),
    ).rejects.toMatchObject({ code: 'course_not_found' })
    // Nothing changed.
    expect(await order(c.courseId, c.sectionIds)).toEqual({ none: [], 0: ['L0', 'L1'] })
  })
})

describe('sections', () => {
  test('add goes last; rename; move up and down renumber', async () => {
    const c = await makeCourse({ sections: 2 })
    const { id } = await repo.addSection(admin, c.courseId, 'Week 3')
    await repo.renameSection(admin, id, 'Week 3 · Particles')
    await repo.moveSection(admin, id, 'up')
    const titles = async () =>
      (
        await prisma.courseSection.findMany({
          where: { courseId: c.courseId },
          orderBy: { position: 'asc' },
        })
      ).map((s) => `${s.position}:${s.title}`)
    expect(await titles()).toEqual(['0:Week 1', '1:Week 3 · Particles', '2:Week 2'])
    await repo.moveSection(admin, c.sectionIds[0], 'up') // already first: no change
    await repo.moveSection(admin, c.sectionIds[0], 'down')
    expect(await titles()).toEqual(['0:Week 3 · Particles', '1:Week 1', '2:Week 2'])
    await expect(repo.renameSection(otherAdmin, id, 'Mine')).rejects.toMatchObject({
      code: 'section_not_found',
    })
  })

  test('deleteSection refuses a section with lessons (section_not_empty)', async () => {
    const c = await makeCourse({
      sections: 3,
      lessons: [{ section: 0 }, { section: 1, deleted: true }],
    })
    await expect(repo.deleteSection(admin, c.sectionIds[0])).rejects.toMatchObject({
      code: 'section_not_empty',
    })
    // Only a deleted lesson inside: allowed; that lesson moves to "no section"; others renumber.
    await repo.deleteSection(admin, c.sectionIds[1])
    const sections = await prisma.courseSection.findMany({
      where: { courseId: c.courseId },
      orderBy: { position: 'asc' },
    })
    expect(sections.map((s) => [s.id, s.position])).toEqual([
      [c.sectionIds[0], 0],
      [c.sectionIds[2], 1],
    ])
    expect(await prisma.lesson.findUniqueOrThrow({ where: { id: c.lessonIds[1] } })).toMatchObject({
      sectionId: null,
    })
    await expect(repo.deleteSection(otherAdmin, c.sectionIds[2])).rejects.toMatchObject({
      code: 'section_not_found',
    })
  })
})

describe('resources', () => {
  test('addLessonResource checks the path; removeLessonResource is scoped to the owner', async () => {
    const c = await makeCourse({ lessons: [{ section: null }] })
    const lessonId = c.lessonIds[0]
    const storagePath = `${c.courseId}/${lessonId}/${randomUUID()}.pdf`

    await expect(
      repo.addLessonResource(admin, lessonId, {
        kind: 'file',
        name: 'chart.pdf',
        storagePath: `${randomUUID()}/${lessonId}/${randomUUID()}.pdf`,
        sizeBytes: 10,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })

    const resource = await repo.addLessonResource(admin, lessonId, {
      kind: 'file',
      name: 'chart (v2).pdf',
      storagePath,
      sizeBytes: 1234,
    })
    expect(resource).toEqual({
      id: expect.any(String),
      kind: 'file',
      name: 'chart (v2).pdf',
      url: `/api/lesson-files/${resource.id}/chart%20%28v2%29.pdf`,
      sizeBytes: 1234,
    })
    const link = await repo.addLessonResource(admin, lessonId, {
      kind: 'link',
      name: 'NHK Easy',
      url: 'https://www3.nhk.or.jp/news/easy/',
    })
    expect(link).toMatchObject({ kind: 'link', url: 'https://www3.nhk.or.jp/news/easy/' })

    await expect(repo.removeLessonResource(otherAdmin, resource.id)).rejects.toMatchObject({
      code: 'resource_not_found',
    })
    expect(await prisma.lessonResource.count({ where: { id: resource.id } })).toBe(1)

    storage.removed.length = 0
    await repo.removeLessonResource(admin, resource.id)
    expect(await prisma.lessonResource.count({ where: { id: resource.id } })).toBe(0)
    expect(storage.removed).toEqual([[storagePath]])

    await repo.removeLessonResource(admin, link.id)
    expect(storage.removed).toHaveLength(1) // links have no file
  })
})

describe('getAdminLesson', () => {
  test('numbers the lesson in course order and names the previous Published lesson', async () => {
    const c = await makeCourse({
      sections: 1,
      lessons: [{ section: null }, { section: 0 }, { section: 0 }],
    })
    await prisma.lesson.update({ where: { id: c.lessonIds[0] }, data: { status: 'published' } })
    const lesson = await repo.getAdminLesson(admin, c.lessonIds[2])
    expect(lesson).toMatchObject({
      id: c.lessonIds[2],
      courseId: c.courseId,
      number: 3,
      sectionId: c.sectionIds[0],
      sections: [{ id: c.sectionIds[0], title: 'Week 1' }],
      // L1 is a Draft, so students unlock lesson 3 after lesson 1.
      previousLesson: { number: 1, title: 'L0' },
      resources: [],
    })
    await expect(repo.getAdminLesson(otherAdmin, c.lessonIds[2])).rejects.toMatchObject({
      code: 'lesson_not_found',
    })
  })
})
