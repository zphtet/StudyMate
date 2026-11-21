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
import { useFormatter, useNow, useTranslations, type DateTimeFormatOptions } from 'next-intl'
import { useMemo, useRef, type ReactNode } from 'react'
import { DayBar, DayBarLegend, DayBarScale } from '@/components/shared/day-bar'
import { addCalendarDays, cityOf, moveToDay, todayIn } from '@/lib/time'
import { cn } from '@/lib/utils'
import { planWeekQuery } from '../queries'
import type { PlanCard, PlanDay } from '../types'
import { DeadlineCard } from './deadline-card'
import { NavButton } from './nav-button'
import { useSetDeadline } from './use-set-deadline'

// The Plan week (screen 22-AdminPlan; spec 003 US2, research R10): "‹ 16 – 22 Nov ›", then one row
// per student-local day with its deadline cards. Rows are drop targets: long-press (250 ms) on
// touch, a 6 px drag with a pointer, or Space, ↑/↓, Space on the keyboard (FR-011). A drop keeps
// the local clock time on the new day (moveToDay) and saves at once (optimistic, rolled back on
// error). Each row starts with the student's availability bar (US4, FR-009); today's row is
// highlighted and its bar has the now-marker.

/**
 * Node's ICU puts thin spaces around the range dash ("Nov 16 – 22"), browsers plain ones; the
 * difference broke hydration and re-mounted the week. Same text on both sides.
 */
const plainSpaces = (text: string) => text.replace(/[\u2009\u202f]/g, ' ')

/** When a drag ended, to tell its trailing click from a tap (only read in event handlers). */
const eventTime = () => Date.now()

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
  const now = useNow({ updateInterval: 60_000 })
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
  const today = todayIn(timeZone, now)
  const calendar = (date: string, options: DateTimeFormatOptions) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), { ...options, timeZone: 'UTC' })
  const monday = data.days[0].date

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd.current = eventTime()
    const card = active.data.current?.card as PlanCard | undefined
    const date = over ? String(over.id) : null
    if (!card || !date || date === active.data.current?.date) return
    moveTo(card, moveToDay(new Date(card.due.dueAt), date, timeZone).toISOString())
  }
  const moveTo = (card: PlanCard, dueAt: string) =>
    move.mutate({ kind: card.kind, id: card.id, courseId: card.courseId, dueAt })
  // A drag ends with a click on the card; don't open the sheet for it.
  const open = (card: PlanCard) => {
    if (eventTime() - lastDragEnd.current > 300) onOpen(card)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="-ml-3 flex items-center">
          <NavButton
            label={t('previousWeek')}
            onClick={() => onWeekChange(addCalendarDays(monday, -7))}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </NavButton>
          <h2 className="text-lg font-semibold" aria-live="polite">
            {plainSpaces(
              format.dateTimeRange(
                new Date(`${monday}T00:00:00Z`),
                new Date(`${data.days[6].date}T00:00:00Z`),
                { day: 'numeric', month: 'short', timeZone: 'UTC' },
              ),
            )}
          </h2>
          <NavButton label={t('nextWeek')} onClick={() => onWeekChange(addCalendarDays(monday, 7))}>
            <ChevronRight className="size-5" aria-hidden />
          </NavButton>
        </div>
        <DayBarLegend className="gap-2.5 text-xs" />
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
        onDragCancel={() => (lastDragEnd.current = eventTime())}
        accessibility={{
          screenReaderInstructions: { draggable: t('dragInstructions') },
        }}
      >
        <div className="overflow-hidden rounded-3xl border bg-card">
          <DayBarScale className="border-b py-2 pr-4 pl-19" />
          <ol>
            {data.days.map((day) => {
              const dayLabel = calendar(day.date, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })
              return (
                <DayRow key={day.date} day={day} isToday={day.date === today} calendar={calendar}>
                  <DayBar
                    start={day.start}
                    end={day.end}
                    segments={day.segments}
                    timeZone={timeZone}
                    now={day.date === today ? now : undefined}
                    className="my-1.5"
                  />
                  {day.cards.map((card) => (
                    <DeadlineCard
                      key={`${card.kind}:${card.id}`}
                      card={card}
                      date={day.date}
                      dayLabel={dayLabel}
                      timeZone={timeZone}
                      studentName={data.student.displayName}
                      onOpen={open}
                      onMove={moveTo}
                    />
                  ))}
                </DayRow>
              )
            })}
          </ol>
        </div>
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
