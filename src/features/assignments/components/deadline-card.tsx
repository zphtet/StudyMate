'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTimeBoth } from '@/components/shared/time-both'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { cn } from '@/lib/utils'
import type { DeadlineStatus, PlanCard } from '../types'

// One deadline on the Plan (screen 22-AdminPlan; spec 003 US2, US4): handle, title and, on the
// right, "Done" (green), "N days late" / "Overdue" (red) or the time (amber when due soon, else grey)
// in the student's zone with the admin's beside it (TimeBoth compact, FR-008). Long-press, drag or
// Space + ↑/↓ moves it to another day; a tap opens the deadline sheet. Done cards don't move.
// A clash (FR-009) adds a strong amber border, "{name} is on shift then" and "Move to {day time}"
// beside the card's button, not inside it (no nested buttons).

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
  studentName,
  onOpen,
  onMove,
}: {
  card: PlanCard
  /** The card's day (YYYY-MM-DD), for keyboard moves. */
  date: string
  dayLabel: string
  /** The student's zone. */
  timeZone: string
  studentName: string
  onOpen: (card: PlanCard) => void
  onMove: (card: PlanCard, dueAt: string) => void
}) {
  const t = useTranslations('deadlines')
  const timeBoth = useTimeBoth()
  const f = useInstantFormat()
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

  const { clash } = card
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-testid="deadline-item"
      className={cn(
        'rounded-xl border',
        clash
          ? 'border-2 border-warning-foreground bg-warning text-warning-foreground'
          : TONE[status],
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onOpen(card)}
        data-testid="deadline-card"
        className="flex min-h-11 w-full touch-manipulation flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <GripVertical
          className={cn('size-4 shrink-0 opacity-50', !card.draggable && 'invisible')}
          aria-hidden
        />
        {/* With the admin's time beside it the label is long; it then wraps under the title. */}
        <span className="line-clamp-2 min-w-32 flex-1 font-semibold">{card.title}</span>
        <span className="sr-only">, {dayLabel}, </span>
        <span className="ml-auto shrink-0 text-sm font-medium">{label}</span>
      </button>
      {clash && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
          <p className="text-sm">
            {t(clash.kind === 'shift' ? 'onShift' : 'asleep', { name: studentName })}
          </p>
          {clash.suggestion && (
            <MoveButton
              label={t('moveTo', {
                time: `${f.weekday(clash.suggestion, timeZone)} ${timeBoth(clash.suggestion, timeZone, { compact: true })}`,
              })}
              onClick={() => clash.suggestion && onMove(card, clash.suggestion)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function MoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl bg-warning-foreground px-3 text-sm font-semibold text-warning outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {label}
    </button>
  )
}
