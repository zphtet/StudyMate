import { removeCourseFiles, removeSubmissionFiles } from './fixtures/courses'
import { closeDb, sql } from './fixtures/db'
import { supabaseAdmin } from './fixtures/supabase-admin'
import { runPrefix } from './fixtures/users'

// Deletes every auth user created by this run (address starts with the run prefix). Deleting an auth
// user cascades to the profile and every row that references it (spec 001 research R6).
export default async function globalTeardown() {
  const admin = supabaseAdmin()
  const prefix = runPrefix()
  const ids: string[] = []

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    ids.push(...data.users.filter((u) => u.email?.startsWith(prefix)).map((u) => u.id))
    if (data.users.length < 200) break
  }

  await beforeUserDelete(ids)
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.warn(`[teardown] could not delete ${id}: ${error.message}`)
  }
}

/** Cleanup that needs the users' rows to still exist. */
async function beforeUserDelete(userIds: string[]) {
  if (userIds.length === 0) return
  // Spec 002 T022: lesson files live in Storage, which doesn't cascade with the course rows.
  const courses = await sql<{ id: string }>(
    `select id from courses where owner_id = any($1::uuid[])`,
    [userIds],
  )
  await removeCourseFiles(courses.map((c) => c.id))
  await removeSubmissionFiles(userIds)
  // course_assignments.assigned_by has no cascade, so remove this run's assignments first.
  await sql(
    `delete from course_assignments where student_id = any($1::uuid[]) or assigned_by = any($1::uuid[])`,
    [userIds],
  )
  // Spec 004: lesson_progress.completed_by and audit_log.actor_id don't cascade either, so an Admin
  // who marked a lesson done (or anyone with audit rows) could not be deleted before the student.
  await sql(
    `delete from lesson_progress where student_id = any($1::uuid[]) or completed_by = any($1::uuid[])`,
    [userIds],
  )
  await sql(`delete from audit_log where actor_id = any($1::uuid[])`, [userIds])
  await closeDb()
}
