import 'server-only'
import { z } from 'zod'
import { fail } from '@/lib/action'
import { acceptedTime } from '@/lib/offline/accepted-time'
import { opFields, runOp, type OpResult } from '@/lib/offline/server-op'
import { createServerClient } from '@/lib/supabase/server'
import { AuthError, requireLessonReader } from '@/server/auth/guards'
import {
  completeLesson,
  isFocusRecorded,
  progressOpId,
  recordFocus,
  saveDraft,
  stopFocus,
  submissionVersion,
  submitAssignment,
  undoCompletion,
} from './repo'
import {
  completeLessonSchema,
  isOwnSubmissionPath,
  saveDraftSchema,
  startFocusSchema,
  stopFocusSchema,
  submitAssignmentSchema,
  undoCompletionSchema,
  type Attachment,
} from './schemas'

// The progress ops a device queues offline and /api/sync replays (spec 008 contracts/sync-route.md;
// research R7, R8). Each runs the same guard and repo function as its Server Action, with the op id
// for duplicates and the accepted device time. The caller has already run requireRole('student').

type Student = { id: string; timezone: string }

const wasDoneBase = z.object({ wasDone: z.boolean() })
const versionBase = z.object({ updatedAt: z.iso.datetime({ offset: true }).nullable() })
const instant = z.iso.datetime({ offset: true })

export const progressOpSchemas = [
  completeLessonSchema.extend({
    ...opFields,
    type: z.literal('progress.complete'),
    base: wasDoneBase,
  }),
  undoCompletionSchema.extend({
    ...opFields,
    type: z.literal('progress.undo'),
    base: wasDoneBase,
  }),
  saveDraftSchema.extend({ ...opFields, type: z.literal('submission.save'), base: versionBase }),
  submitAssignmentSchema.extend({
    ...opFields,
    type: z.literal('submission.submit'),
    base: versionBase,
  }),
  startFocusSchema.extend({
    ...opFields,
    type: z.literal('focus.record'),
    startedAt: instant,
    endedAt: instant,
  }),
  stopFocusSchema.extend({ ...opFields, type: z.literal('focus.stop') }),
] as const

export type ProgressOp = z.infer<(typeof progressOpSchemas)[number]>

/** The lesson must still be one the student can open; otherwise the op is dropped (R7). */
async function readLesson(lessonId: string) {
  await requireLessonReader(lessonId).catch((error: unknown) => {
    if (error instanceof AuthError && error.status !== 401) fail('lesson_unavailable')
    throw error
  })
}

/** Photos upload before their draft (R9); one that never arrived drops the draft (file_missing). */
async function requireStoredFiles(student: Student, lessonId: string, files: Attachment[]) {
  if (files.some((file) => !isOwnSubmissionPath(file.path, student.id, lessonId))) {
    fail('invalid_input')
  }
  if (files.length === 0) return
  // The student's own client, so Storage RLS applies as well (constitution VII).
  const bucket = (await createServerClient()).storage.from('submissions')
  const found = await Promise.all(files.map((file) => bucket.exists(file.path)))
  if (found.some(({ data }) => data !== true)) fail('file_missing')
}

export function applyProgressOp(me: Student, op: ProgressOp, serverNow: Date): Promise<OpResult> {
  return runOp(op.id, async () => {
    switch (op.type) {
      // Done-state is what the student acted on (R7): completing a lesson already done elsewhere, or
      // undoing one already reopened, changes nothing and isn't reported.
      case 'progress.complete':
      case 'progress.undo': {
        if ((await progressOpId(me.id, op.lessonId)) === op.id) return { status: 'duplicate' }
        await readLesson(op.lessonId)
        const replayed = { opId: op.id, at: acceptedTime({ at: op.at, serverNow, base: null }) }
        const data =
          op.type === 'progress.complete'
            ? await completeLesson(me, op.lessonId, serverNow, replayed)
            : await undoCompletion(me, op.lessonId, serverNow, replayed)
        return { status: 'applied', data }
      }

      case 'submission.save':
      case 'submission.submit': {
        const stored = await submissionVersion(me.id, op.lessonId)
        if (stored?.clientOpId === op.id) {
          return { status: 'duplicate', version: stored.updatedAt.toISOString() }
        }
        await readLesson(op.lessonId)
        await requireStoredFiles(me, op.lessonId, op.attachments)
        const base = op.base.updatedAt === null ? null : new Date(op.base.updatedAt)
        const replayed = {
          opId: op.id,
          at: acceptedTime({ at: op.at, serverNow, base }),
          baseUpdatedAt: base,
        }
        const answer = { lessonId: op.lessonId, bodyMd: op.bodyMd, attachments: op.attachments }
        const data =
          op.type === 'submission.save'
            ? await saveDraft(me, answer, serverNow, replayed)
            : await submitAssignment(me, answer, serverNow, replayed)
        return { status: 'applied', version: data.updatedAt, data }
      }

      case 'focus.record': {
        if (await isFocusRecorded(me.id, op.id)) return { status: 'duplicate' }
        await readLesson(op.lessonId)
        // R8: the session keeps its own times when both are acceptable; otherwise it keeps its
        // length and ends now, so a wrong clock never moves study time into the past.
        const startedAt = new Date(op.startedAt)
        const endedAt = new Date(op.endedAt)
        const isKept = [startedAt, endedAt].every(
          (time) =>
            acceptedTime({ at: time.toISOString(), serverNow, base: null }).getTime() ===
            time.getTime(),
        )
        const shift = isKept ? 0 : serverNow.getTime() - endedAt.getTime()
        const data = await recordFocus(me, {
          opId: op.id,
          lessonId: op.lessonId,
          minutes: op.minutes,
          startedAt: new Date(startedAt.getTime() + shift),
          endedAt: new Date(endedAt.getTime() + shift),
        })
        return { status: 'applied', data }
      }

      case 'focus.stop': {
        const stoppedAt = acceptedTime({ at: op.at, serverNow, base: null })
        return { status: 'applied', data: await stopFocus(me, op.sessionId, stoppedAt) }
      }
    }
  })
}
