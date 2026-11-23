import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { RuleTrigger } from '@/generated/prisma/enums'
import { ruleConfigFrom, type RuleConfig } from '@/lib/notifications/rule-config'
import { prisma } from '@/lib/prisma'
import { dailyActivityForStudents } from '@/server/activity'
import type { AssignedLesson, EndedShift, StudentData, Window } from './occurrences'

// What the dispatcher's rule step and its re-check read, in batches (spec 006 research R3 › data in
// batches, R4): a fixed number of statements per run, whatever the number of rules and students.
// No guard: only the cron dispatcher calls these (plan.md › Complexity Tracking).

/** Narrows a statement to the users in scope (tests on the shared dev database); empty otherwise. */
export type Only = (column: Prisma.Sql) => Prisma.Sql

export type Person = { id: string; displayName: string; timezone: string; locale: string }

export type RuleTarget = {
  rule: {
    id: string
    config: RuleConfig
    message: string
    channels: string[]
    createdAt: Date
  }
  /** null = All students (FR-020) */
  ruleStudentId: string | null
  student: Person
  owner: Person
}

type TargetRow = {
  rule_id: string
  rule_student_id: string | null
  trigger: RuleTrigger
  config: unknown
  message: string
  channels: string[]
  created_at: Date
  student_id: string
  student_name: string
  student_zone: string
  student_locale: string
  owner_id: string
  owner_name: string
  owner_zone: string
  owner_locale: string
}

/**
 * Enabled rules with the students they apply to (data-model.md NotificationRule.student_id,
 * NotificationRule.enabled). A rule for All students expands to the owner's active links at this
 * run (FR-020); an Admin's rule for a student who is no longer linked applies to nobody. A personal
 * reminder (owner = student) needs no link.
 */
export async function loadRuleTargets(only: Only): Promise<RuleTarget[]> {
  const rows = await prisma.$queryRaw<TargetRow[]>`
    with targets as (
      select r.id as rule_id, r.student_id
      from notification_rules r
      where r.enabled and r.student_id is not null
      union all
      select r.id, l.student_id
      from notification_rules r
      join student_links l on l.admin_id = r.owner_id and l.status = 'active'
      where r.enabled and r.student_id is null
    )
    select r.id::text as rule_id, r.student_id::text as rule_student_id, r.trigger, r.config,
           r.message, r.channels, r.created_at,
           s.id::text as student_id, s.display_name as student_name, s.timezone as student_zone,
           s.locale as student_locale,
           o.id::text as owner_id, o.display_name as owner_name, o.timezone as owner_zone,
           o.locale as owner_locale
    from targets t
    join notification_rules r on r.id = t.rule_id
    join profiles s on s.id = t.student_id
    join profiles o on o.id = r.owner_id
    where (r.owner_id = s.id or exists (
      select 1 from student_links l
      where l.admin_id = r.owner_id and l.student_id = s.id and l.status = 'active'))
      ${only(Prisma.sql`s.id`)}`

  return rows.flatMap((row) => {
    const config = parseConfig(row)
    if (!config) return []
    return [
      {
        rule: {
          id: row.rule_id,
          config,
          message: row.message,
          channels: row.channels,
          createdAt: row.created_at,
        },
        ruleStudentId: row.rule_student_id,
        student: {
          id: row.student_id,
          displayName: row.student_name,
          timezone: row.student_zone,
          locale: row.student_locale,
        },
        owner: {
          id: row.owner_id,
          displayName: row.owner_name,
          timezone: row.owner_zone,
          locale: row.owner_locale,
        },
      },
    ]
  })
}

/**
 * Every stored config was validated when it was saved, and the 006 migration fixed 003's rows. A row
 * that still doesn't fit is reported and skipped, so one bad rule can't stop everyone's delivery.
 */
function parseConfig(row: TargetRow): RuleConfig | null {
  try {
    return ruleConfigFrom(row.trigger, row.config)
  } catch (error) {
    console.error(
      '[dispatch] rule config does not fit its trigger; rule skipped',
      row.rule_id,
      error,
    )
    return null
  }
}

/** The longest "After a shift ends" delay (data-model.md › Config by trigger). */
const MAX_AFTER_SHIFT_HOURS = 12

/**
 * The students' lessons with a deadline, activity and (when asked) the working shifts that ended
 * recently, keyed by student. Three statements for any number of students.
 */
export async function loadStudentData(
  studentIds: string[],
  { shiftsIn }: { shiftsIn?: Window } = {},
): Promise<Map<string, StudentData>> {
  const ids = [...new Set(studentIds)]
  const byStudent = new Map<string, StudentData>(
    ids.map((id) => [id, { lessons: [], activity: [], shifts: [] }]),
  )
  if (ids.length === 0) return byStudent

  const [lessons, activity, shifts] = await Promise.all([
    assignedLessons(ids),
    dailyActivityForStudents(ids),
    shiftsIn ? endedShifts(ids, shiftsIn) : Promise.resolve([]),
  ])
  for (const { studentId, ...lesson } of lessons) byStudent.get(studentId)?.lessons.push(lesson)
  for (const [id, days] of activity) {
    const data = byStudent.get(id)
    if (data) data.activity = days
  }
  for (const { studentId, ...shift } of shifts) byStudent.get(studentId)?.shifts.push(shift)
  return byStudent
}

/**
 * Lessons of active assignments that have an effective deadline (SQL `effective_due`, 003 FR-004),
 * with completion (004). Only Published lessons of Active, non-deleted courses.
 */
async function assignedLessons(ids: string[]) {
  const rows = await prisma.$queryRaw<
    {
      student_id: string
      lesson_id: string
      lesson: string
      course: string
      due_at: Date
      completed: boolean
    }[]
  >`
    select * from (
      select a.student_id::text, l.id::text as lesson_id, l.title as lesson, c.title as course,
             effective_due(a.student_id, l.id) as due_at,
             exists (select 1 from lesson_progress p
                     where p.student_id = a.student_id and p.lesson_id = l.id
                       and p.status = 'done') as completed
      from course_assignments a
      join courses c on c.id = a.course_id and c.status = 'active' and c.deleted_at is null
      join lessons l on l.course_id = c.id and l.status = 'published' and l.deleted_at is null
      where a.status = 'active' and a.student_id = any(${ids}::uuid[])
    ) lessons
    where due_at is not null`
  return rows.map((row): AssignedLesson & { studentId: string } => ({
    studentId: row.student_id,
    lessonId: row.lesson_id,
    lesson: row.lesson,
    course: row.course,
    dueAt: row.due_at,
    completed: row.completed,
  }))
}

/** Working shifts (not Off days) that ended in time for an After-shift occurrence in the window. */
async function endedShifts(ids: string[], { from, to }: Window) {
  const earliest = new Date(from.getTime() - MAX_AFTER_SHIFT_HOURS * 3_600_000)
  const rows = await prisma.$queryRaw<
    { student_id: string; id: string; end_at: Date; next_start_at: Date | null }[]
  >`
    select s.student_id::text, s.id::text, s.end_at,
           (select min(n.start_at) from shifts n
            where n.student_id = s.student_id and n.type <> 'off'
              and n.start_at >= s.end_at) as next_start_at
    from shifts s
    where s.student_id = any(${ids}::uuid[]) and s.type <> 'off'
      and s.end_at > ${earliest} and s.end_at <= ${to}`
  return rows.map((row): EndedShift & { studentId: string } => ({
    studentId: row.student_id,
    id: row.id,
    endAt: row.end_at,
    nextStartAt: row.next_start_at,
  }))
}
