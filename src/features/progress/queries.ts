// TanStack Query keys for the 004 Route Handlers (contracts/route-handlers.md). Invalidation after
// writes and Realtime events follows contracts/server-actions.md › Query invalidation; the stories add
// their `queryOptions` next to these keys.

export const lessonWorkKeys = {
  /** The student's own work on one lesson: progress, submission, review comments, notes count. */
  work: (lessonId: string) => ['lesson', lessonId, 'work'] as const,
  /** One Notes thread; `studentId` is the thread owner (the student's own id for students). */
  notes: (lessonId: string, studentId: string) => ['lesson', lessonId, 'notes', studentId] as const,
}

export const focusKeys = {
  active: ['focus'] as const,
}

export const progressKeys = {
  all: ['progress'] as const,
  view: (view: 'month' | 'week') => ['progress', view] as const,
  summary: ['progress', 'summary'] as const,
}

export const adminProgressKeys = {
  all: ['admin', 'students'] as const,
  cards: ['admin', 'students', 'progress'] as const,
  student: (studentId: string) => ['admin', 'students', studentId] as const,
  lesson: (studentId: string, lessonId: string) =>
    ['admin', 'students', studentId, 'lessons', lessonId] as const,
}
