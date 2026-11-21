// Course order, numbering and renumbering (spec 002 data-model.md › Ordering, research.md R7).
// Pure functions: used by the admin and student repos and by the reorder action.

type Positioned = { position: number }
type OrderLesson = { id: string; sectionId: string | null; position: number }

export type Group<S, L> = { section: S | null; lessons: L[] }

const byPosition = (a: Positioned, b: Positioned) => a.position - b.position

/**
 * Groups lessons in course order: the "no section" group first, then sections by position;
 * lessons by position inside each group. The no-section group appears when it has lessons or the
 * course has no sections (so "+ Add lesson" always has a place). Empty sections are kept.
 */
export function groupCourse<S extends { id: string } & Positioned, L extends OrderLesson>(
  sections: readonly S[],
  lessons: readonly L[],
): Group<S, L>[] {
  const bySection = new Map<string | null, L[]>()
  for (const lesson of [...lessons].sort(byPosition)) {
    const key =
      lesson.sectionId && sections.some((s) => s.id === lesson.sectionId) ? lesson.sectionId : null
    bySection.set(key, [...(bySection.get(key) ?? []), lesson])
  }
  const groups: Group<S, L>[] = []
  const ungrouped = bySection.get(null) ?? []
  if (ungrouped.length > 0 || sections.length === 0)
    groups.push({ section: null, lessons: ungrouped })
  for (const section of [...sections].sort(byPosition)) {
    groups.push({ section, lessons: bySection.get(section.id) ?? [] })
  }
  return groups
}

/** Lessons in course order. */
export const flatten = <L>(groups: readonly Group<unknown, L>[]): L[] =>
  groups.flatMap((g) => g.lessons)

/** 1-based lesson numbers in course order, for the lessons given (admins: all; students: visible). */
export function numberLessons(
  groups: readonly Group<unknown, { id: string }>[],
): Map<string, number> {
  return new Map(flatten(groups).map((lesson, i) => [lesson.id, i + 1]))
}

/**
 * Positions 0..n−1 for one group, keeping the current order. Ties (e.g. a restored lesson returning
 * to a position someone else now holds) go to the lesson that was updated earlier.
 */
export function renumber(
  lessons: readonly { id: string; position: number; updatedAt: Date }[],
): { id: string; position: number }[] {
  return [...lessons]
    .sort((a, b) => a.position - b.position || a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((lesson, position) => ({ id: lesson.id, position }))
}

/**
 * Final order of one group after a reorder (contracts/server-actions.md › reorderLessons): the
 * listed ids first, in the given order, then any lesson of the group the client didn't list
 * (added or moved there by another device), in its current order.
 */
export function mergeOrder(
  listed: readonly string[],
  current: readonly { id: string; position: number }[],
) {
  const listedSet = new Set(listed)
  const rest = [...current]
    .sort(byPosition)
    .filter((l) => !listedSet.has(l.id))
    .map((l) => l.id)
  return [...listed, ...rest]
}
