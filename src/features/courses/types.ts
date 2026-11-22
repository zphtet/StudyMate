import type { Due } from '@/features/assignments/types'
import type { CourseColor, CourseStatus, LessonStatus, UnlockRule } from './schemas'

// Response shapes of the 002 Route Handlers (specs/002-courses-lessons/contracts/route-handlers.md).
// Instants are ISO 8601 UTC strings; calendar dates are YYYY-MM-DD.

export type { CourseColor, CourseStatus, LessonStatus, UnlockRule }

export type ResourceKind = 'file' | 'link' | 'audio' | 'image'
/** url = /api/lesson-files/<id>/<name> for stored files, the external https URL for links. */
export type Resource = {
  id: string
  kind: ResourceKind
  name: string
  url: string
  sizeBytes: number | null
}

// ── Admin ───────────────────────────────────────────────────────────────────────────────────

export type AdminCourseListItem = {
  id: string
  title: string
  icon: string
  color: CourseColor
  levelTag: string | null
  targetDate: string | null
  status: CourseStatus
  lessonCount: number
  sectionCount: number
  students: { id: string; displayName: string }[]
  avgPercent: number | null
  updatedAt: string
}
export type AdminCourseList = AdminCourseListItem[]

export type AdminLessonRow = {
  id: string
  number: number
  title: string
  estMinutes: number
  status: 'draft' | 'published'
  hasAssignment: boolean
  hasAudio: boolean
}

export type AdminCourse = {
  id: string
  title: string
  description: string | null
  icon: string
  color: CourseColor
  levelTag: string | null
  targetDate: string | null
  unlockInOrder: boolean
  allowStudentNotes: boolean
  status: CourseStatus
  lessonCount: number
}

export type AdminCourseDetail = {
  course: AdminCourse
  students: { id: string; displayName: string; percent: number | null }[]
  groups: { section: { id: string; title: string } | null; lessons: AdminLessonRow[] }[]
}

export type AdminLesson = {
  id: string
  courseId: string
  courseTitle: string
  number: number
  title: string
  estMinutes: number
  sectionId: string | null
  unlockRule: UnlockRule
  contentMd: string
  assignmentPrompt: string | null
  requireSubmission: boolean
  status: 'draft' | 'published'
  updatedAt: string
  sections: { id: string; title: string }[]
  previousLesson: { number: number; title: string } | null
  resources: Resource[]
}

export type StudentWork =
  'not_started' | 'in_progress' | 'done' | 'draft_assignment' | 'submitted' | 'reviewed'

export type LessonImpact = { students: { id: string; displayName: string; work: StudentWork }[] }

export type RecentlyDeleted = {
  courses: {
    id: string
    title: string
    icon: string
    color: CourseColor
    lessonCount: number
    deletedAt: string
    purgeAt: string
  }[]
  lessons: {
    id: string
    title: string
    course: { id: string; title: string }
    deletedAt: string
    purgeAt: string
  }[]
}

// ── Student ─────────────────────────────────────────────────────────────────────────────────

export type StudentCourseCard = {
  id: string
  title: string
  icon: string
  color: CourseColor
  levelTag: string | null
  targetDate: string | null
  lessonCount: number
  admin: { displayName: string }
  /** Spec 003: the student's own course deadline (null = none, and always for Archived courses). */
  dueAt: string | null
  /** Spec 003: counting lessons past their effective deadline and not done (0 when Archived). */
  overdueCount: number
  /** Spec 004 FR-005 (course_progress): null = no published lessons ("—"). */
  percent: number | null
  doneCount: number
}
export type StudentCourseList = { active: StudentCourseCard[]; archived: StudentCourseCard[] }

export type LockInfo =
  | { reason: 'after_previous'; previous: { number: number; title: string } }
  | { reason: 'on_date'; date: string }

export type StudentLessonRow = {
  id: string
  number: number
  title: string
  estMinutes: number
  state: 'open' | 'locked'
  lock: LockInfo | null
  /** Spec 003 (completion is written by 004). */
  done: boolean
  /** Spec 003: null = no effective deadline (the row falls back to Open/Locked); null when Archived. */
  due: Due | null
}

export type StudentCourse = {
  course: {
    id: string
    title: string
    icon: string
    color: CourseColor
    description: string | null
    targetDate: string | null
    status: 'active' | 'archived'
    admin: { displayName: string }
    /** Spec 003: the student's own course deadline ("finish by"); null when none or Archived. */
    dueAt: string | null
    /** Spec 004 FR-005 (course_progress): `percent` null = no published lessons ("—"). */
    progress: { percent: number | null; done: number; total: number }
  }
  lessonCount: number
  groups: { section: { id: string; title: string } | null; lessons: StudentLessonRow[] }[]
}

export type StudentLesson = {
  id: string
  title: string
  estMinutes: number
  number: number
  total: number
  course: { id: string; title: string }
  contentMd: string
  assignmentPrompt: string | null
  requireSubmission: boolean
  attachments: Resource[]
}

export type PurgeResult = { courses: number; lessons: number; files: number }
