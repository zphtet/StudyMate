'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTimeBoth } from '@/components/shared/time-both'
import { cn } from '@/lib/utils'
import type { DeadlineStatus, PlanCard } from '../types'

// One deadline on the Plan (screen 22-AdminPlan; spec 003 US2): handle, title and, on the right,
// "Done" (green), "N days late" / "Overdue" (red) or the time (amber when due soon, else grey) in
// the student's zone with the admin's beside it (TimeBoth compact, FR-008). Long-press, drag or
// Space + ↑/↓ moves it to another day; a tap opens the deadline sheet. Done cards don't move.

const TONE: Record<DeadlineStatus, string> = {
  done: 'border-success/30 bg-success-soft text-success',
  overdue: 'border-destructive/30 bg-destructive-soft text-destructive',
  due_soon: 'border-warning-border bg-warning text-warning-foreground',
  upcoming: 'bg-card',
  locked: 'bg-card',
  none: 'bg-card',
}

export function DeadlineCard({
  card,
  date,
  dayLabel,
  timeZone,
  onOpen,
}: {
  card: PlanCard
  /** The card's day (YYYY-MM-DD), for keyboard moves. */
  date: string
  dayLabel: string
  /** The student's zone. */
  timeZone: string
  onOpen: (card: PlanCard) => void
}) {
  const t = useTranslations('deadlines')
  const timeBoth = useTimeBoth()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${card.kind}:${card.id}`,
    data: { card, date },
    disabled: !card.draggable,
  })

  const { status, daysLate } = card.due
  const label =
    status === 'done'
      ? t('done')
      : status === 'overdue'
        ? daysLate > 0
          ? t('daysLate', { count: daysLate })
          : t('overdue')
        : timeBoth(card.due.dueAt, timeZone, { compact: true })

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-testid="deadline-card"
      className={cn(
        'flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-xl border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        TONE[status],
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <GripVertical
        className={cn('size-4 shrink-0 opacity-50', !card.draggable && 'invisible')}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-semibold">{card.title}</span>
      <span className="sr-only">, {dayLabel}, </span>
      <span className="shrink-0 text-sm font-medium">{label}</span>
    </button>
  )
}
