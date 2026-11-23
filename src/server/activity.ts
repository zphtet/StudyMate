import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  activeDates,
  bestStreak,
  currentStreak,
  weekActiveDays,
  type DayActivity,
} from '@/lib/streak'
import { addCalendarDays, mondayOf } from '@/lib/time'

// Study activity per local day (spec 004 FR-006, FR-008; research.md R2, R4): Progress, Today and the
// Admin's student cards read it, and 006's dispatcher reads it for streak, inactivity and the weekly
// summary (006 research R3, R13). Shared, so it lives here rather than in features/progress.
// Callers MUST have run a guard, or be the cron dispatcher.

/**
 * Counted seconds of a focus session: real time from its start, never past its planned length, so an
 * open session that ran out while the app was closed counts exactly its plan (spec 004 FR-007, research R3).
 */
export const COUNTED_SECONDS = Prisma.sql`extract(epoch from least(coalesce(ended_at, now()),
  started_at + planned_minutes * interval '1 minute') - started_at)`

type ActivityRow = { student_id: string; date: string; seconds: number; completions: number }

/**
 * Study seconds and completions per local day: counted focus seconds on the day a session started,
 * plus the completion credit and one completion on the day a lesson was completed (spec 004 research.md R2).
 * `zone` is a time zone parameter or the students' own `p.timezone`; `from` / `to` are local dates.
 */
function activityRows(
  studentIds: string[],
  zone: Prisma.Sql,
  { from, to }: { from?: string; to?: string },
) {
  return prisma.$queryRaw<ActivityRow[]>`
    select student_id::text, day::text as date, sum(seconds)::int as seconds,
           sum(completions)::int as completions
    from (
      select s.student_id, (s.started_at at time zone ${zone})::date as day,
             ${COUNTED_SECONDS} as seconds, 0 as completions
      from study_sessions s join profiles p on p.id = s.student_id
      where s.student_id = any(${studentIds}::uuid[])
      union all
      select lp.student_id, (lp.completed_at at time zone ${zone})::date,
             lp.minutes_spent * 60, 1
      from lesson_progress lp join profiles p on p.id = lp.student_id
      where lp.student_id = any(${studentIds}::uuid[]) and lp.status = 'done'
        and lp.completed_at is not null
    ) a
    where (${from ?? null}::date is null or day >= ${from ?? null}::date)
      and (${to ?? null}::date is null or day <= ${to ?? null}::date)
    group by student_id, day
    order by student_id, day`
}

const toDay = ({ date, seconds, completions }: ActivityRow): DayActivity => ({
  date,
  seconds,
  completions,
})

/** One student's days with any activity, oldest first (all of them without `from` / `to`). */
export async function dailyActivity(
  studentId: string,
  timeZone: string,
  range: { from?: string; to?: string } = {},
) {
  return (await activityRows([studentId], Prisma.sql`${timeZone}`, range)).map(toDay)
}

/** The Admin cards: every student's days in their own zone, in one query (no N+1). */
export async function dailyActivityForStudents(
  studentIds: string[],
  range: { from?: string; to?: string } = {},
) {
  const byStudent = new Map<string, DayActivity[]>(studentIds.map((id) => [id, []]))
  if (studentIds.length === 0) return byStudent
  for (const row of await activityRows(studentIds, Prisma.sql`p.timezone`, range)) {
    byStudent.get(row.student_id)?.push(toDay(row))
  }
  return byStudent
}

/** Streak and this local week's totals from a student's days (Admin cards, Today, Progress). */
export function weekFacts(days: DayActivity[], today: string) {
  const active = activeDates(days)
  const monday = mondayOf(today)
  const week = days.filter((d) => d.date >= monday && d.date <= addCalendarDays(monday, 6))
  return {
    streak: { current: currentStreak(active, today), best: bestStreak(active) },
    monday,
    active,
    weekSeconds: week.reduce((sum, d) => sum + d.seconds, 0),
    weekLessonsDone: week.reduce((sum, d) => sum + d.completions, 0),
    weekActiveDays: weekActiveDays(active, monday),
  }
}
