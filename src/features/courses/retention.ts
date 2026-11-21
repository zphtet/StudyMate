// How long deleted courses and lessons can be restored before the daily purge removes them
// (spec 002 FR-006, research.md R8). Pure; shared by restore, Recently deleted and the purge.

export const RESTORE_DAYS = 30
export const RESTORE_MS = RESTORE_DAYS * 24 * 60 * 60 * 1000

/** When something deleted at `deletedAt` is removed for good. */
export const purgeAt = (deletedAt: Date) => new Date(deletedAt.getTime() + RESTORE_MS)

/** True once more than 30 days have passed since the delete; at exactly 30 days it is still restorable. */
export const isExpired = (deletedAt: Date, now: Date) =>
  now.getTime() - deletedAt.getTime() > RESTORE_MS
