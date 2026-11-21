'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useFormatter, useTranslations, type DateTimeFormatOptions } from 'next-intl'
import { useMemo, useRef, type ReactNode } from 'react'
import { addCalendarDays, cityOf, moveToDay, todayIn } from '@/lib/time'
import { cn } from '@/lib/utils'
import { planWeekQuery } from '../queries'
import type { PlanCard, PlanDay } from '../types'
import { DeadlineCard } from './deadline-card'
import { useSetDeadline } from './use-set-deadline'

// The Plan week (screen 22-AdminPlan; spec 003 US2, research R10): "‹ 16 – 22 Nov ›", then one row
// per student-local day with its deadline cards. Rows are drop targets: long-press (250 ms) on
// touch, a 6 px drag with a pointer, or Space, ↑/↓, Space on the keyboard (FR-011). A drop keeps
// the local clock time on the new day (moveToDay) and saves at once (optimistic, rolled back on
// error). Availability bars come with US4.

/** Pointer inside a row first; keyboard drags have no pointer, so fall back to overlap. */
const collision: CollisionDetection = (args) => {
  const inside = pointerWithin(args)
  return inside.length > 0 ? inside : rectIntersection(args)
}

/** ↑ / ↓ move the lifted card to the centre of the previous / next day row. */
const dayByDay =
  (dates: string[]): KeyboardCoordinateGetter =>
  (event, { context, currentCoordinates }) => {
    const step = event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0
    if (step === 0) return undefined
    event.preventDefault()
    const from = String(context.over?.id ?? context.active?.data.current?.date ?? '')
    const next = dates[dates.indexOf(from) + step]
    const rect = next && context.droppableRects.get(next)
    const at = context.collisionRect
    if (!rect || !at) return currentCoordinates
    return {
      x: currentCoordinates.x,
      y: currentCoordinates.y + rect.top + rect.height / 2 - (at.top + at.height / 2),
    }
  }

export function PlanWeek({
  studentId,
  week,
  onWeekChange,
  onOpen,
}: {
  studentId: string
  /** Monday (YYYY-MM-DD), or null for this week. */
  week: string | null
  onWeekChange: (monday: string) => void
  onOpen: (card: PlanCard) => void
}) {
  const t = useTranslations('plan')
  const format = useFormatter()
  const move = useSetDeadline(studentId)
  const lastDragEnd = useRef(0)
  const { data } = useQuery({
    ...planWeekQuery(studentId, week),
    placeholderData: (previous) => (previous?.student.id === studentId ? previous : undefined),
  })
  const dates = useMemo(() => data?.days.map((d) => d.date) ?? [], [data])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: dayByDay(dates),
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )
  if (!data) return null

  const timeZone = data.student.timezone
  const today = todayIn(timeZone)
  const calendar = (date: string, options: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { ...options, timeZone: 'UTC' })
  const monday = data.days[0].date

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now()
    const card = active.data.current?.card as PlanCard | undefined
    const date = over ? String(over.id) : null
    if (!card || !date || date === active.data.current?.date) return
    move.mutate({
      kind: card.kind,
      id: card.id,
      courseId: card.courseId,
      dueAt: moveToDay(new Date(card.due.dueAt), date, timeZone).toISOString(),
    })
  }
  // A drag ends with a click on the card; don't open the sheet for it.
  const open = (card: PlanCard) => {
    if (Date.now() - lastDragEnd.current > 300) onOpen(card)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button label={t('previousWeek')} onClick={() => onWeekChange(addCalendarDays(monday, -7))}>
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <h2 className="text-lg font-semibold" aria-live="polite">
          {format.dateTimeRange(
            new Date(`${monday}T00:00:00Z`),
            new Date(`${data.days[6].date}T00:00:00Z`),
            { day: 'numeric', month: 'short', timeZone: 'UTC' },
          )}
        </h2>
        <Button label={t('nextWeek')} onClick={() => onWeekChange(addCalendarDays(monday, 7))}>
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </div>
      {data.adminTimezone !== timeZone && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t('timesIn', { city: cityOf(timeZone) })}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragEnd={onDragEnd}
        onDragCancel={() => (lastDragEnd.current = Date.now())}
        accessibility={{
          screenReaderInstructions: { draggable: t('dragInstructions') },
        }}
      >
        <ol className="overflow-hidden rounded-3xl border bg-card">
          {data.days.map((day) => {
            const dayLabel = calendar(day.date, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })
            return (
              <DayRow key={day.date} day={day} isToday={day.date === today} calendar={calendar}>
                {day.cards.map((card) => (
                  <DeadlineCard
                    key={`${card.kind}:${card.id}`}
                    card={card}
                    date={day.date}
                    dayLabel={dayLabel}
                    timeZone={timeZone}
                    onOpen={open}
                  />
                ))}
              </DayRow>
            )
          })}
        </ol>
      </DndContext>
      <p className="px-2 text-center text-sm text-muted-foreground">
        {t('hint', { name: data.student.displayName })}
      </p>
    </div>
  )
}

function DayRow({
  day,
  isToday,
  calendar,
  children,
}: {
  day: PlanDay
  isToday: boolean
  calendar: (date: string, options: DateTimeFormatOptions) => string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.date })
  return (
    <li
      ref={setNodeRef}
      data-testid="plan-day"
      data-date={day.date}
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        'flex min-h-18 gap-3 border-b px-4 py-3 last:border-b-0',
        isToday && 'bg-accent',
        isOver && 'bg-muted',
      )}
    >
      <p className={cn('w-12 shrink-0 leading-tight', isToday && 'text-primary')}>
        <span className="block text-sm font-medium">
          {calendar(day.date, { weekday: 'short' })}
        </span>
        <span className="block text-2xl font-semibold">
          {calendar(day.date, { day: 'numeric' })}
        </span>
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </li>
  )
}

function Button({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
    >
      {children}
    </button>
  )
}
