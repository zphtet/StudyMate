import { randomUUID } from 'node:crypto'
import { sql } from './db'
import { supabaseAdmin } from './supabase-admin'

// Spec 002 T022: seed what 002's stories need but other features create in the app — active links
// (001 US2), course assignments (003), completions and submissions (004) — plus courses and files.

type UnlockRule = { type: 'none' } | { type: 'after_previous' } | { type: 'on_date'; date: string }

export type SeedLesson = {
  title: string
  /** index into `sections`, or null / undefined for "no section" */
  section?: number | null
  status?: 'draft' | 'published'
  unlockRule?: UnlockRule
  contentMd?: string
  estMinutes?: number
  assignmentPrompt?: string
  deleted?: boolean
}

export async function linkStudent(studentId: string, adminId: string) {
  await sql(
    `insert into student_links (student_id, admin_id, status, responded_at) values ($1, $2, 'active', now())`,
    [studentId, adminId],
  )
}

export async function seedCourse({
  ownerId,
  title = `Course ${randomUUID().slice(0, 4)}`,
  status = 'active',
  icon = '文',
  color = 'indigo',
  levelTag = null,
  targetDate = null,
  unlockInOrder = true,
  deleted = false,
  sections = [],
  lessons = [],
}: {
  ownerId: string
  title?: string
  status?: 'draft' | 'active' | 'archived'
  icon?: string
  color?: string
  levelTag?: string | null
  targetDate?: string | null
  unlockInOrder?: boolean
  deleted?: boolean
  sections?: string[]
  lessons?: SeedLesson[]
}) {
  const courseId = randomUUID()
  await sql(
    `insert into courses (id, owner_id, title, status, icon, color, level_tag, target_date, unlock_in_order, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $10 then now() end)`,
    [courseId, ownerId, title, status, icon, color, levelTag, targetDate, unlockInOrder, deleted],
  )

  const sectionIds: string[] = []
  for (const [position, sectionTitle] of sections.entries()) {
    const id = randomUUID()
    sectionIds.push(id)
    await sql(
      `insert into course_sections (id, course_id, title, position) values ($1, $2, $3, $4)`,
      [id, courseId, sectionTitle, position],
    )
  }

  const lessonIds: string[] = []
  const positions = new Map<string, number>()
  for (const lesson of lessons) {
    const id = randomUUID()
    lessonIds.push(id)
    const sectionId = lesson.section == null ? null : sectionIds[lesson.section]
    const key = sectionId ?? 'none'
    const position = positions.get(key) ?? 0
    positions.set(key, position + 1)
    await sql(
      `insert into lessons (id, course_id, section_id, title, status, unlock_rule, content_md, est_minutes,
                            assignment_prompt, position, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $11 then now() end)`,
      [
        id,
        courseId,
        sectionId,
        lesson.title,
        lesson.status ?? 'published',
        JSON.stringify(lesson.unlockRule ?? { type: unlockInOrder ? 'after_previous' : 'none' }),
        lesson.contentMd ?? `## ${lesson.title}`,
        lesson.estMinutes ?? 15,
        lesson.assignmentPrompt ?? null,
        position,
        lesson.deleted ?? false,
      ],
    )
  }
  return { courseId, sectionIds, lessonIds }
}

/** Spec 003: optional course deadline (ISO instant) and status (`removed` = unassigned). */
export async function assignCourse(
  courseId: string,
  studentId: string,
  assignedBy: string,
  {
    dueAt = null,
    status = 'active',
  }: { dueAt?: string | null; status?: 'active' | 'removed' } = {},
) {
  await sql(
    `insert into course_assignments (course_id, student_id, assigned_by, due_at, status)
     values ($1, $2, $3, $4, $5)`,
    [courseId, studentId, assignedBy, dueAt, status],
  )
}

/** Spec 003: one student's own deadline for one lesson (upsert). */
export async function setLessonDeadline(
  lessonId: string,
  studentId: string,
  dueAt: string,
  setBy: string,
) {
  await sql(
    `insert into lesson_deadlines (lesson_id, student_id, due_at, set_by) values ($1, $2, $3, $4)
     on conflict (lesson_id, student_id) do update set due_at = excluded.due_at, set_by = excluded.set_by`,
    [lessonId, studentId, dueAt, setBy],
  )
}

/** Spec 003 (shifts come with 005): one working shift, optionally followed by a sleep block. */
export async function seedShift(
  studentId: string,
  {
    startAt,
    endAt,
    type = 'night',
    sleepMinutes = 0,
  }: {
    startAt: string
    endAt: string
    type?: 'day' | 'evening' | 'night' | 'off' | 'custom'
    sleepMinutes?: number
  },
) {
  await sql(
    `insert into shifts (student_id, type, start_at, end_at, sleep_minutes) values ($1, $2, $3, $4, $5)`,
    [studentId, type, startAt, endAt, sleepMinutes],
  )
}

/** Spec 003: the profile's IANA time zone (deadlines are judged by it). */
export async function setTimezone(userId: string, timezone: string) {
  await sql(`update profiles set timezone = $2 where id = $1`, [userId, timezone])
}

/** Spec 003: soft-deletes a lesson as 002's Delete does (its deadlines are kept, hidden). */
export async function softDeleteLesson(lessonId: string) {
  await sql(`update lessons set deleted_at = now() where id = $1`, [lessonId])
}

export async function markDone(studentId: string, lessonId: string) {
  await sql(
    `insert into lesson_progress (student_id, lesson_id, status, completed_at) values ($1, $2, 'done', now())
     on conflict (student_id, lesson_id) do update set status = 'done', completed_at = now()`,
    [studentId, lessonId],
  )
}

export async function seedSubmission(
  studentId: string,
  lessonId: string,
  status: 'draft' | 'submitted' | 'reviewed' | 'needs_redo',
) {
  await sql(
    `insert into submissions (student_id, lesson_id, status, body_md) values ($1, $2, $3, 'My answer')`,
    [studentId, lessonId, status],
  )
}

/** Uploads a file into lesson-files/<course>/<lesson>/ and records the resource row. */
export async function uploadLessonFile(
  courseId: string,
  lessonId: string,
  name: string,
  bytes: Buffer,
  contentType: string,
  kind: 'file' | 'image' | 'audio' = 'file',
) {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'bin'
  const storagePath = `${courseId}/${lessonId}/${randomUUID()}.${ext}`
  const { error } = await supabaseAdmin()
    .storage.from('lesson-files')
    .upload(storagePath, bytes, { contentType })
  if (error) throw error
  const [row] = await sql<{ id: string }>(
    `insert into lesson_resources (lesson_id, kind, name, storage_path, size_bytes) values ($1, $2, $3, $4, $5) returning id`,
    [lessonId, kind, name, storagePath, bytes.length],
  )
  return {
    resourceId: row.id,
    storagePath,
    url: `/api/lesson-files/${row.id}/${encodeURIComponent(name)}`,
  }
}

/** Removes every lesson-files object under the given courses (teardown; rows cascade with users). */
export async function removeCourseFiles(courseIds: string[]) {
  const bucket = supabaseAdmin().storage.from('lesson-files')
  for (const courseId of courseIds) {
    const { data: lessons } = await bucket.list(courseId, { limit: 1000 })
    for (const folder of lessons ?? []) {
      const prefix = `${courseId}/${folder.name}`
      const { data: files } = await bucket.list(prefix, { limit: 1000 })
      const paths = (files ?? []).map((f) => `${prefix}/${f.name}`)
      if (paths.length) await bucket.remove(paths)
    }
  }
}
