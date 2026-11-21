'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { inputClass } from '@/components/shared/field'
import { useMediaQuery } from '@/components/shared/use-media-query'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cityOf } from '@/lib/time'
import { cn } from '@/lib/utils'
import { adminStudentCoursesQuery } from '../queries'
import type { AdminStudentCourse, PlanCard, StudentRef } from '../types'
import { DueField } from './due-field'
import { useSetDeadline } from './use-set-deadline'

// "+ Deadline" and tap-to-edit (spec 003 US2 scenarios 3 and 5): course → "Whole course" or one
// Published lesson → date and time in the student's zone → Save, or Remove the deadline. Removing a
// lesson deadline makes the lesson fall back to the course deadline.

const WHOLE_COURSE = 'course'

export function DeadlineSheet({
  student,
  editing,
  open,
  onOpenChange,
}: {
  student: StudentRef
  /** The tapped card, or null for "+ Deadline". */
  editing: PlanCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('plan')
  const isWide = useMediaQuery('(min-width: 1024px)')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isWide ? 'right' : 'bottom'}
        className={
          isWide
            ? 'w-full overflow-y-auto sm:max-w-lg'
            : 'mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl'
        }
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-2xl leading-tight font-bold">
            {editing ? t('sheetEdit') : t('sheetNew')}
          </SheetTitle>
          <SheetDescription className="text-base">
            {t('sheetSubtitle', { name: student.displayName, city: cityOf(student.timezone) })}
          </SheetDescription>
        </SheetHeader>
        <DeadlineBody student={student} editing={editing} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

/** Mounted per opening (the sheet content unmounts when closed), so pickers start from fresh data. */
function DeadlineBody({
  student,
  editing,
  onDone,
}: {
  student: StudentRef
  editing: PlanCard | null
  onDone: () => void
}) {
  const courses = useQuery(adminStudentCoursesQuery(student.id))
  if (!courses.isFetchedAfterMount || !courses.data) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  return (
    <DeadlineForm
      key={`${editing?.kind}:${editing?.id}`}
      student={student}
      courses={courses.data}
      editing={editing}
      onDone={onDone}
    />
  )
}

/** The target's own deadline: the course deadline, or the student's own lesson deadline. */
function ownDue(course: AdminStudentCourse | undefined, target: string) {
  if (!course) return null
  if (target === WHOLE_COURSE) return course.dueAt
  return course.lessons.find((l) => l.id === target)?.dueAt ?? null
}

function DeadlineForm({
  student,
  courses,
  editing,
  onDone,
}: {
  student: StudentRef
  courses: AdminStudentCourse[]
  editing: PlanCard | null
  onDone: () => void
}) {
  const t = useTranslations('plan')
  const id = useId()
  const save = useSetDeadline(student.id)
  const [courseId, setCourseId] = useState(editing?.courseId ?? courses[0]?.id ?? '')
  const [target, setTarget] = useState(editing?.kind === 'lesson' ? editing.id : WHOLE_COURSE)
  const course = courses.find((c) => c.id === courseId)
  const [value, setValue] = useState(editing?.due.dueAt ?? ownDue(course, target))

  if (courses.length === 0) {
    return (
      <p className="px-4 pb-6 text-muted-foreground">
        {t('noCourses', { name: student.displayName })}
      </p>
    )
  }

  const lesson = course?.lessons.find((l) => l.id === target)
  const current = ownDue(course, target)
  const submit = (dueAt: string | null, message: string) =>
    save.mutate(
      { kind: lesson ? 'lesson' : 'course', id: lesson?.id ?? courseId, courseId, dueAt },
      {
        onSuccess: () => {
          toast.success(message)
          onDone()
        },
      },
    )

  return (
    <form
      className="flex flex-col gap-4 px-4 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (value) submit(value, t('saved'))
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}course`} className="text-sm text-muted-foreground">
          {t('course')}
        </Label>
        <select
          id={`${id}course`}
          value={courseId}
          onChange={(e) => {
            const next = courses.find((c) => c.id === e.target.value)
            setCourseId(e.target.value)
            setTarget(WHOLE_COURSE)
            setValue(ownDue(next, WHOLE_COURSE))
          }}
          className={cn(inputClass, 'border')}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}target`} className="text-sm text-muted-foreground">
          {t('target')}
        </Label>
        <select
          id={`${id}target`}
          value={target}
          onChange={(e) => {
            setTarget(e.target.value)
            setValue(ownDue(course, e.target.value))
          }}
          className={cn(inputClass, 'border')}
        >
          <option value={WHOLE_COURSE}>{t('wholeCourse')}</option>
          {course?.lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {t('lessonOption', { number: l.number, title: l.title })}
            </option>
          ))}
        </select>
      </div>

      <DueField
        label={t('due')}
        value={value}
        onChange={setValue}
        student={student}
        minutes={lesson?.estMinutes ?? 60}
        courseDueAt={lesson ? course?.dueAt : undefined}
      />

      <Button type="submit" size="xl" disabled={!value || save.isPending}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('save')}
      </Button>
      {current && (
        <Button
          type="button"
          variant="ghost"
          size="touch"
          className="text-destructive"
          disabled={save.isPending}
          onClick={() => submit(null, t('removed'))}
        >
          {t('remove')}
        </Button>
      )}
    </form>
  )
}
