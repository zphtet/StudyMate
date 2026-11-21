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

/** GET /api/admin/courses/[courseId]/assign: every actively linked student, by name. */
export type AssignSheet = {
  course: {
    id: string
    title: string
    status: 'draft' | 'active' | 'archived'
    /** YYYY-MM-DD; only pre-fills Due for unassigned students (23:59 in their zone). */
    targetDate: string | null
    unlockInOrder: boolean
  }
  /** `dueAt` = the current course deadline of an active assignment, else null. */
  students: (StudentRef & { assigned: boolean; dueAt: string | null })[]
}

/** GET /api/admin/students/[studentId]/courses: the "+ Deadline" sheet's pickers. */
export type AdminStudentCourse = {
  id: string
  title: string
  /** This student's course deadline. */
  dueAt: string | null
  /** Published, non-deleted, in course order; `dueAt` = this student's own lesson deadline. */
  lessons: { id: string; number: number; title: string; estMinutes: number; dueAt: string | null }[]
}

export type PlanDay = {
  /** Student-local YYYY-MM-DD, Monday to Sunday. */
  date: string
  /** The local day's real bounds (23 or 25 h on DST changes). */
  start: string
  end: string
  /** Clipped to the day; filled by US4. */
  segments: Segment[]
  /** Ordered by dueAt. */
  cards: PlanCard[]
}

/** GET /api/admin/plan */
export type PlanWeek = {
  student: StudentRef
  /** The caller's zone, for TimeBoth when it differs (spec FR-008). */
  adminTimezone: string
  now: string
  days: PlanDay[]
}
