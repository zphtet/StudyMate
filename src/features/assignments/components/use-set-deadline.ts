'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { unwrap } from '@/lib/result'
import { utcToZoned } from '@/lib/time'
import { useErrorMessage } from '@/lib/use-error-message'
import { setCourseDeadline, setLessonDeadline } from '../actions'
import { adminStudentKeys, assignKeys, planKeys } from '../queries'
import type { PlanWeek } from '../types'

// Every Plan entry point (drag, keyboard, "+ Deadline", tap to edit) goes through the two deadline
// actions (research R6). Cached weeks move the card at once and roll back on error.

export type DeadlineTarget = {
  kind: 'lesson' | 'course'
  /** lessonId or courseId */
  id: string
  courseId: string
  /** null removes the deadline */
  dueAt: string | null
}

/** The week with the card moved to its new day (or removed); unknown cards wait for the refetch. */
function moveCard(week: PlanWeek, target: DeadlineTarget): PlanWeek {
  const isTarget = (c: { kind: string; id: string }) => c.kind === target.kind && c.id === target.id
  const card = week.days.flatMap((d) => d.cards).find(isTarget)
  if (!card) return week
  const date = target.dueAt && utcToZoned(target.dueAt, week.student.timezone).date
  return {
    ...week,
    days: week.days.map((day) => {
      const cards = day.cards.filter((c) => !isTarget(c))
      if (!target.dueAt || day.date !== date) return { ...day, cards }
      const moved = { ...card, due: { ...card.due, dueAt: target.dueAt } }
      return {
        ...day,
        cards: [...cards, moved].sort((a, b) => a.due.dueAt.localeCompare(b.due.dueAt)),
      }
    }),
  }
}

export function useSetDeadline(studentId: string) {
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  return useMutation({
    mutationFn: async ({ kind, id, dueAt }: DeadlineTarget) =>
      kind === 'lesson'
        ? unwrap(await setLessonDeadline({ lessonId: id, studentId, dueAt }))
        : unwrap(await setCourseDeadline({ courseId: id, studentId, dueAt })),
    onMutate: async (target) => {
      const queryKey = planKeys.weeks(studentId)
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueriesData<PlanWeek>({ queryKey })
      queryClient.setQueriesData<PlanWeek>({ queryKey }, (week) => week && moveCard(week, target))
      return { snapshot }
    },
    onError: (error, _target, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data)
      toast.error(errorMessage(error))
    },
    onSettled: (_data, _error, target) =>
      Promise.all(
        [planKeys.all, adminStudentKeys.courses(studentId), assignKeys.sheet(target.courseId)].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}
