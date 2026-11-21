// Response shapes of the 003 Route Handlers (specs/003-assign-deadlines/contracts/route-handlers.md).
// Instants are ISO 8601 UTC strings; calendar dates are YYYY-MM-DD in the student's zone.

export type DeadlineStatus = 'done' | 'overdue' | 'due_soon' | 'locked' | 'upcoming' | 'none'

/** `daysLate` only means something when overdue: 0 = "Overdue" (earlier today), N = "N days late". */
export type Due = { dueAt: string; status: DeadlineStatus; daysLate: number }

/** `suggestion` = the new dueAt for "Move to …", or null when nothing fits within 7 days. */
export type Clash = { kind: 'shift' | 'sleep'; suggestion: string | null }

/** Busy time for display; free time is the gaps. */
export type Segment = { kind: 'shift' | 'sleep'; start: string; end: string }

export type StudentRef = { id: string; displayName: string; timezone: string }

export type PlanCard = {
  kind: 'lesson' | 'course'
  /** lessonId or courseId */
  id: string
  courseId: string
  /** lesson title, or course title for course cards */
  title: string
  courseTitle: string
  /** lesson cards only */
  estMinutes: number | null
  due: Due
  /** only when not done and in the future */
  clash: Clash | null
  /** false when done */
  draggable: boolean
}

export type TodayItem = {
  lessonId: string
  title: string
  estMinutes: number
  courseId: string
  courseTitle: string
  due: Due
}

/** GET /api/today: overdue oldest first, due today earliest first, all items. */
export type Today = { overdue: TodayItem[]; dueToday: TodayItem[] }
