'use client'

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { StatusChip } from '@/components/shared/status-chip'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { addSection } from '../actions'
import { createLesson, reorderLessons } from '../lesson-actions'
import { courseKeys } from '../queries'
import type { AdminCourseDetail, AdminLessonRow } from '../types'
import { SectionHeader, SectionTitleForm } from './section-header'

// Sections and lessons of the admin course page (screen 18-AdminCourse; spec 002 US2 scenarios 1
// and 3, research.md R7). Lessons move by dragging ⋮⋮ (pointer, touch or keyboard), also between
// sections; the new order shows at once and rolls back if the server refuses it. Swiping a row
// left reveals Edit (and Delete, added by US3).

/** Container key of a group: the section id, or NONE for lessons without a section. */
const NONE = 'none'
type Items = Record<string, string[]>

const keyOf = (sectionId: string | null | undefined) => sectionId ?? NONE
const sectionIdOf = (key: string) => (key === NONE ? null : key)
const sameList = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((id, i) => id === b[i])

const itemsOf = (detail: AdminCourseDetail): Items =>
  Object.fromEntries(detail.groups.map((g) => [keyOf(g.section?.id), g.lessons.map((l) => l.id)]))

/** The detail with lessons in the given order and numbers recounted (optimistic update). */
function applyOrder(detail: AdminCourseDetail, items: Items): AdminCourseDetail {
  const rows = new Map(detail.groups.flatMap((g) => g.lessons).map((l) => [l.id, l]))
  let number = 0
  return {
    ...detail,
    groups: detail.groups.map((g) => ({
      ...g,
      lessons: (items[keyOf(g.section?.id)] ?? []).map((id) => ({
        ...rows.get(id)!,
        number: ++number,
      })),
    })),
  }
}

export type LessonRowAction = (lesson: AdminLessonRow) => ReactNode

export function SortableLessonList({
  detail,
  deleteAction,
}: {
  detail: AdminCourseDetail
  /** Swipe "Delete" (US3). */
  deleteAction?: LessonRowAction
}) {
  const t = useTranslations('courseDetail')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const courseId = detail.course.id
  const queryKey = courseKeys.adminCourse(courseId)

  const serverItems = useMemo(() => itemsOf(detail), [detail])
  const [dragItems, setDragItems] = useState<Items | null>(null)
  const items = dragItems ?? serverItems
  /** The order while a drag runs (event handlers read it between renders). */
  const itemsRef = useRef<Items>(serverItems)
  const before = useRef<Items>(serverItems)
  /** The lesson just picked up and not moved yet (its first "over" is itself). */
  const picked = useRef<string | null>(null)

  const rows = useMemo(
    () => new Map(detail.groups.flatMap((g) => g.lessons).map((l) => [l.id, l])),
    [detail],
  )
  const groupName = (key: string) =>
    detail.groups.find((g) => keyOf(g.section?.id) === key)?.section?.title ?? t('noSection')

  const containerOf = (id: UniqueIdentifier, current: Items = itemsRef.current) => {
    const key = String(id)
    if (key in current) return key
    return Object.keys(current).find((k) => current[k].includes(key))
  }

  const reorder = useMutation({
    mutationFn: async ({
      groups,
    }: {
      groups: { sectionId: string | null; lessonIds: string[] }[]
    }) => unwrap(await reorderLessons({ courseId, groups })),
    scope: { id: `reorder:${courseId}` },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragStart({ active }: DragStartEvent) {
    before.current = serverItems
    itemsRef.current = serverItems
    picked.current = String(active.id)
    setDragItems(serverItems)
  }

  // Moving into another group happens while dragging, so the row shows where it will land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const current = itemsRef.current
    const from = containerOf(active.id, current)
    const to = containerOf(over.id, current)
    if (!from || !to || from === to) return
    const target = current[to]
    let index = target.length
    if (!(String(over.id) in current)) {
      const overIndex = target.indexOf(String(over.id))
      const translated = active.rect.current.translated
      const below = translated && translated.top > over.rect.top + over.rect.height / 2
      index = overIndex + (below ? 1 : 0)
    }
    const id = String(active.id)
    const next = {
      ...current,
      [from]: current[from].filter((l) => l !== id),
      [to]: [...target.slice(0, index), id, ...target.slice(index)],
    }
    itemsRef.current = next
    setDragItems(next)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    let next = itemsRef.current
    const container = containerOf(active.id, next)
    if (over && container && containerOf(over.id, next) === container) {
      const list = next[container]
      const from = list.indexOf(String(active.id))
      const to = list.indexOf(String(over.id))
      if (from >= 0 && to >= 0 && from !== to) {
        next = { ...next, [container]: arrayMove(list, from, to) }
      }
    }
    const changed = Object.keys(next).filter((k) => !sameList(next[k], before.current[k]))
    if (changed.length > 0) {
      const previous = queryClient.getQueryData<AdminCourseDetail>(queryKey)
      if (previous) queryClient.setQueryData(queryKey, applyOrder(previous, next))
      reorder.mutate(
        { groups: changed.map((k) => ({ sectionId: sectionIdOf(k), lessonIds: next[k] })) },
        { onError: () => previous && queryClient.setQueryData(queryKey, previous) },
      )
    }
    setDragItems(null)
  }

  function onDragCancel() {
    setDragItems(null)
  }

  const titleOf = (id: UniqueIdentifier) => rows.get(String(id))?.title ?? ''
  /** Where the lesson would land: the place of the row it is over, or the end of an empty group. */
  const describe = (active: UniqueIdentifier, over: UniqueIdentifier) => {
    const key = containerOf(over)
    const list = key ? itemsRef.current[key] : []
    const index = list.indexOf(String(over))
    return {
      title: titleOf(active),
      position: index >= 0 ? index + 1 : list.length + 1,
      total: list.includes(String(active)) ? list.length : list.length + 1,
      group: key ? groupName(key) : '',
    }
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('dnd.pickedUp', { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => {
      if (!over) return undefined
      // Keep "Picked up …" until the lesson actually moves.
      if (picked.current === String(over.id)) return undefined
      picked.current = null
      return t('dnd.movedTo', describe(active.id, over.id))
    },
    onDragEnd: ({ active, over }) =>
      over ? t('dnd.droppedAt', describe(active.id, over.id)) : undefined,
    onDragCancel: ({ active }) => t('dnd.cancelled', { title: titleOf(active.id) }),
  }
  // Stable ids for dnd-kit's screen-reader texts, so server and client HTML match.
  const dndId = useId()

  const sections = detail.groups.filter((g) => g.section)

  return (
    <div className="flex flex-col gap-6">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('dnd.instructions') },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {detail.groups.map((group) => {
          const key = keyOf(group.section?.id)
          const index = group.section ? sections.indexOf(group) : -1
          return (
            <LessonGroup
              key={key}
              courseId={courseId}
              groupKey={key}
              section={group.section}
              ids={items[key] ?? []}
              rows={rows}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
              deleteAction={deleteAction}
            />
          )
        })}
      </DndContext>
      <AddSection courseId={courseId} />
    </div>
  )
}

function LessonGroup({
  courseId,
  groupKey,
  section,
  ids,
  rows,
  isFirst,
  isLast,
  deleteAction,
}: {
  courseId: string
  groupKey: string
  section: { id: string; title: string } | null
  ids: string[]
  rows: Map<string, AdminLessonRow>
  isFirst: boolean
  isLast: boolean
  deleteAction?: LessonRowAction
}) {
  const t = useTranslations('courseDetail')
  const titleId = useId()
  const listId = useId()
  const [collapsed, setCollapsed] = useState(false)
  // A group's own drop zone matters only when no row can take the drop: empty or collapsed.
  const { setNodeRef } = useDroppable({ id: groupKey, disabled: ids.length > 0 && !collapsed })

  return (
    <section
      aria-labelledby={section ? titleId : undefined}
      data-testid="lesson-group"
      data-section-title={section?.title ?? ''}
      className="flex flex-col gap-3"
    >
      {section && (
        <div ref={collapsed ? setNodeRef : undefined}>
          <SectionHeader
            section={section}
            count={ids.length}
            isFirst={isFirst}
            isLast={isLast}
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            titleId={titleId}
            controls={listId}
          />
        </div>
      )}
      {!collapsed && (
        <div ref={setNodeRef} id={listId} className="overflow-hidden rounded-3xl border bg-card">
          <SortableContext id={groupKey} items={ids} strategy={verticalListSortingStrategy}>
            <ul>
              {ids.map((id) => {
                const lesson = rows.get(id)
                return lesson ? (
                  <LessonRow
                    key={id}
                    courseId={courseId}
                    lesson={lesson}
                    deleteAction={deleteAction}
                  />
                ) : null
              })}
            </ul>
          </SortableContext>
          {ids.length === 0 && <p className="px-5 pt-4 text-muted-foreground">{t('emptyGroup')}</p>}
          <AddLesson courseId={courseId} sectionId={section?.id ?? null} />
        </div>
      )}
    </section>
  )
}

const ACTION_WIDTH = 88

function LessonRow({
  courseId,
  lesson,
  deleteAction,
}: {
  courseId: string
  lesson: AdminLessonRow
  deleteAction?: LessonRowAction
}) {
  const t = useTranslations('courseDetail')
  const editUrl = `/a/courses/${courseId}/lessons/${lesson.id}/edit`
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id })
  const swipe = useSwipeReveal(ACTION_WIDTH * (deleteAction ? 2 : 1))

  const meta = [
    t('minutes', { count: lesson.estMinutes }),
    lesson.hasAssignment && t('metaAssignment'),
    lesson.hasAudio && t('metaAudio'),
    lesson.status === 'draft' && t('metaHidden'),
  ].filter(Boolean)

  return (
    <li
      ref={setNodeRef}
      data-testid="lesson-row"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'relative overflow-hidden border-b bg-card last:border-b-0',
        isDragging && 'z-10 rounded-2xl shadow-lg ring-1 ring-border',
      )}
    >
      {swipe.revealed && (
        <div className="absolute inset-y-0 right-0 flex">
          <Link
            href={editUrl}
            className="flex flex-col items-center justify-center gap-1 bg-foreground/80 font-medium text-background"
            style={{ width: ACTION_WIDTH }}
          >
            <Pencil aria-hidden className="size-5" />
            {t('edit')}
          </Link>
          {deleteAction?.(lesson)}
        </div>
      )}
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={cn(
          'relative flex touch-pan-y items-center gap-2 bg-card py-3 pr-4 pl-1 select-none',
          !swipe.dragging && 'transition-transform',
        )}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          data-drag-handle
          aria-label={t('reorder', { title: lesson.title })}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-5" />
        </button>
        <Link
          href={editUrl}
          draggable={false}
          className="min-w-0 flex-1 rounded-lg py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <p className="leading-snug font-semibold">
            {lesson.number} · <span data-testid="lesson-title">{lesson.title}</span>
          </p>
          <p className="mt-0.5 text-[0.95rem] text-muted-foreground">{meta.join(' · ')}</p>
        </Link>
        <StatusChip tone={lesson.status === 'published' ? 'success' : 'muted'}>
          {t(`lessonStatus.${lesson.status}`)}
        </StatusChip>
      </div>
    </li>
  )
}

/** Delete slot for the swipe actions (US3 passes the button). */
export function SwipeDeleteButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('courseDetail')
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 bg-destructive font-medium text-white"
      style={{ width: ACTION_WIDTH }}
    >
      <Trash2 aria-hidden className="size-5" />
      {t('delete')}
    </button>
  )
}

/**
 * Swipe left to reveal row actions (research.md R7: pointer events, no library). The drag handle is
 * ignored, vertical moves scroll the page, and the click that ends a swipe doesn't open the lesson.
 */
function useSwipeReveal(width: number) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ x: number; y: number; base: number; id: number; active: boolean }>(null)
  const swallowClick = useRef(false)

  function end(cancelled: boolean) {
    const current = gesture.current
    gesture.current = null
    if (!current?.active) return
    swallowClick.current = true
    setDragging(false)
    setOffset((value) => (!cancelled && value < -width / 3 ? -width : 0))
  }

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      swallowClick.current = false
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if ((event.target as Element).closest('[data-drag-handle]')) return
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        base: offset,
        id: event.pointerId,
        active: false,
      }
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = gesture.current
      if (!current || current.id !== event.pointerId) return
      const dx = event.clientX - current.x
      const dy = event.clientY - current.y
      if (!current.active) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          gesture.current = null
          return
        }
        if (Math.abs(dx) < 10) return
        current.active = true
        setDragging(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      setOffset(Math.max(-width, Math.min(0, current.base + dx)))
    },
    onPointerUp: () => end(false),
    onPointerCancel: () => end(true),
    onClickCapture(event: MouseEvent<HTMLDivElement>) {
      if (swallowClick.current) {
        // The click that ends a swipe doesn't open the lesson.
        swallowClick.current = false
        event.preventDefault()
        event.stopPropagation()
      } else if (offset !== 0) {
        // While the actions are open, a tap on the row closes them.
        event.preventDefault()
        event.stopPropagation()
        setOffset(0)
      }
    },
    onDragStart(event: MouseEvent<HTMLDivElement>) {
      event.preventDefault()
    },
  }

  return { offset, dragging, revealed: dragging || offset < 0, handlers }
}

function AddLesson({ courseId, sectionId }: { courseId: string; sectionId: string | null }) {
  const t = useTranslations('courseDetail')
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: async () => unwrap(await createLesson({ courseId, sectionId })),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      router.push(`/a/courses/${courseId}/lessons/${id}/edit`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-14 w-full rounded-none text-base font-semibold text-primary hover:text-primary"
      disabled={create.isPending}
      onClick={() => create.mutate()}
    >
      {create.isPending ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
      {t('addLesson')}
    </Button>
  )
}

function AddSection({ courseId }: { courseId: string }) {
  const t = useTranslations('courseDetail')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const add = useMutation({
    mutationFn: async (title: string) => unwrap(await addSection({ courseId, title })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      setAdding(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (adding) {
    return (
      <SectionTitleForm
        submitLabel={t('add')}
        pending={add.isPending}
        onSubmit={(title) => add.mutate(title)}
        onCancel={() => setAdding(false)}
      />
    )
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="h-14 rounded-3xl border-2 border-dashed bg-transparent text-base font-semibold"
      onClick={() => setAdding(true)}
    >
      <Plus aria-hidden /> {t('addSection')}
    </Button>
  )
}
