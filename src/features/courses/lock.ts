import type { UnlockRule } from './schemas'
import type { LockInfo } from './types'

// Open or Locked for the lessons a student sees (spec 002 US4 scenario 2, research.md R1,
// data-model.md › Unlock rule). Pure: the student repo passes the lessons in course order, the
// student's completed lessons and today's date in the student's own time zone (todayIn).
//
// - none: always open.
// - after_previous: open when the previous visible (Published, non-deleted) lesson is done; the
//   first visible lesson is open. A locked lesson can't be done, so a locked chain stays locked.
// - on_date: open from 00:00 on that date in the student's zone (YYYY-MM-DD strings compare).
// - Archived courses: everything the student can still see is open.
// - A done lesson is always open (spec 004 research R1): undo doesn't cascade, so a lesson completed
//   after an earlier one stays readable when that earlier one is undone.

export type LockLesson = {
  id: string
  title: string
  status: 'draft' | 'published'
  deletedAt: Date | null
  unlockRule: UnlockRule
}

export type LessonLock = { state: 'open' | 'locked'; lock: LockInfo | null }

const OPEN: LessonLock = { state: 'open', lock: null }

/** Locks for the visible lessons, keyed by id. Hidden lessons (Draft, deleted) are left out. */
export function computeLocks({
  lessons,
  done,
  today,
  archived,
}: {
  /** In course order (order.ts); may include Draft and deleted lessons, which are skipped. */
  lessons: readonly LockLesson[]
  done: ReadonlySet<string>
  /** `YYYY-MM-DD` in the student's time zone. */
  today: string
  archived: boolean
}): Map<string, LessonLock> {
  const visible = lessons.filter((l) => l.status === 'published' && !l.deletedAt)
  const locks = new Map<string, LessonLock>()

  visible.forEach((lesson, index) => {
    const rule = lesson.unlockRule
    if (archived || rule.type === 'none' || done.has(lesson.id)) {
      locks.set(lesson.id, OPEN)
    } else if (rule.type === 'on_date') {
      locks.set(
        lesson.id,
        today < rule.date
          ? { state: 'locked', lock: { reason: 'on_date', date: rule.date } }
          : OPEN,
      )
    } else {
      const previous = visible[index - 1]
      locks.set(
        lesson.id,
        !previous || done.has(previous.id)
          ? OPEN
          : {
              state: 'locked',
              lock: {
                reason: 'after_previous',
                previous: { number: index, title: previous.title },
              },
            },
      )
    }
  })
  return locks
}
