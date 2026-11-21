import { z } from 'zod'

// Server Action inputs (specs/003-assign-deadlines/contracts/server-actions.md), shared with the
// forms. The client builds instants from the student's local date and time (zonedToUtc).

/** An instant with `Z` or an offset; null = no deadline. Date-only strings are rejected. */
export const dueAtSchema = z.iso.datetime({ offset: true }).nullable()

export const saveAssignmentsSchema = z.object({
  courseId: z.uuid(),
  rows: z
    .array(z.object({ studentId: z.uuid(), assigned: z.boolean(), dueAt: dueAtSchema }))
    .min(1)
    .max(200)
    .refine((rows) => new Set(rows.map((r) => r.studentId)).size === rows.length, {
      message: 'invalid_input',
    }),
  unlockInOrder: z.boolean(),
  addDefaultReminders: z.boolean(),
  notifyNow: z.boolean(),
})

export const setCourseDeadlineSchema = z.object({
  courseId: z.uuid(),
  studentId: z.uuid(),
  dueAt: dueAtSchema,
})

export const setLessonDeadlineSchema = z.object({
  lessonId: z.uuid(),
  studentId: z.uuid(),
  dueAt: dueAtSchema,
})

export type SaveAssignmentsInput = z.infer<typeof saveAssignmentsSchema>
export type SetCourseDeadlineInput = z.infer<typeof setCourseDeadlineSchema>
export type SetLessonDeadlineInput = z.infer<typeof setLessonDeadlineSchema>
