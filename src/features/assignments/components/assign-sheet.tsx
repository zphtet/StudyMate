'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/empty-state'
import { checkboxClass, checkboxLabelClass } from '@/components/shared/field'
import { useMediaQuery } from '@/components/shared/use-media-query'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { courseKeys } from '@/features/courses/queries'
import { unwrap } from '@/lib/result'
import { zonedToUtc } from '@/lib/time'
import { useErrorMessage } from '@/lib/use-error-message'
import { saveAssignments } from '../actions'
import { assignKeys, assignSheetQuery, planKeys } from '../queries'
import type { AssignSheet as AssignSheetData } from '../types'
import { AssignStudentRow } from './assign-student-row'

// Assign sheet (screen 23-AdminAssign; spec 003 US1): pick any linked students, each with a Due in
// their own time, plus "Unlock lessons in order" (the course's setting), "Add default reminders"
// (on) and "Notify students now" (off). Bottom sheet on phones, side sheet from 1024 px.

type Row = { assigned: boolean; dueAt: string | null }

export function AssignSheet({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('assign')
  const isWide = useMediaQuery('(min-width: 1024px)')
  const sheet = useQuery({ ...assignSheetQuery(courseId), enabled: open })

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
          <SheetTitle className="text-2xl leading-tight font-bold">{t('title')}</SheetTitle>
          <SheetDescription className="text-base">
            {sheet.data ? t('subtitle', { course: sheet.data.course.title }) : t('loading')}
          </SheetDescription>
        </SheetHeader>
        {sheet.data ? (
          // Remounted per opening so the rows start from the saved state.
          <AssignForm
            key={sheet.dataUpdatedAt}
            sheet={sheet.data}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <div className="flex justify-center p-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Unassigned students start from the course target date at 23:59 in their zone (clarification). */
function initialRows(sheet: AssignSheetData): Record<string, Row> {
  const { targetDate } = sheet.course
  return Object.fromEntries(
    sheet.students.map((s) => [
      s.id,
      {
        assigned: s.assigned,
        dueAt: s.assigned
          ? s.dueAt
          : targetDate && zonedToUtc(targetDate, null, s.timezone).toISOString(),
      },
    ]),
  )
}

function AssignForm({ sheet, onDone }: { sheet: AssignSheetData; onDone: () => void }) {
  const t = useTranslations('assign')
  const tc = useTranslations('common')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const uid = useId()
  const { course, students } = sheet
  const [rows, setRows] = useState(() => initialRows(sheet))
  const [options, setOptions] = useState({
    unlockInOrder: course.unlockInOrder,
    addDefaultReminders: true,
    notifyNow: false,
  })
  const [isConfirming, setConfirming] = useState(false)

  const selected = students.filter((s) => rows[s.id].assigned).length
  const leaving = students.filter((s) => s.assigned && !rows[s.id].assigned)

  const save = useMutation({
    mutationFn: async () =>
      unwrap(
        await saveAssignments({
          courseId: course.id,
          rows: students.map((s) => ({
            studentId: s.id,
            assigned: rows[s.id].assigned,
            dueAt: rows[s.id].assigned ? rows[s.id].dueAt : null,
          })),
          ...options,
        }),
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          courseKeys.adminCourse(course.id),
          courseKeys.adminList,
          assignKeys.sheet(course.id),
          planKeys.all,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      toast.success(t('saved'))
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (students.length === 0) {
    return (
      <div className="px-4 pb-6">
        <EmptyState icon={Users} title={t('empty')}>
          <Link href="/a/students" className="font-medium text-primary underline">
            {t('emptyLink')}
          </Link>
        </EmptyState>
      </div>
    )
  }

  const switches = [
    ['unlockInOrder', t('unlockInOrder'), t('unlockHint')],
    ['addDefaultReminders', t('defaultReminders'), null],
    ['notifyNow', t('notifyNow'), null],
  ] as const

  return (
    <form
      className="flex flex-col gap-5 px-4 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (leaving.length > 0) setConfirming(true)
        else save.mutate()
      }}
    >
      <section aria-labelledby={`${uid}students`} className="flex flex-col gap-3">
        <h3 id={`${uid}students`} className="font-semibold text-muted-foreground">
          {t('count', { selected, total: students.length })}
        </h3>
        <ul className="flex flex-col gap-3">
          {students.map((student) => (
            <AssignStudentRow
              key={student.id}
              student={student}
              {...rows[student.id]}
              onChange={(next) => setRows((all) => ({ ...all, [student.id]: next }))}
            />
          ))}
        </ul>
      </section>

      <div className="flex flex-col">
        {switches.map(([name, label, hint]) => (
          <div key={name} className="flex flex-col border-b py-2 last:border-b-0">
            <div className="flex min-h-11 items-center justify-between gap-4">
              <Label htmlFor={`${uid}${name}`} className={checkboxLabelClass}>
                {label}
              </Label>
              <Checkbox
                id={`${uid}${name}`}
                checked={options[name]}
                onCheckedChange={(checked) =>
                  setOptions((o) => ({ ...o, [name]: checked === true }))
                }
                className={checkboxClass}
              />
            </div>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </div>
        ))}
      </div>

      <Button
        type="submit"
        size="xl"
        disabled={save.isPending || (selected === 0 && leaving.length === 0)}
      >
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        {t('submit', { count: selected })}
      </Button>

      <AlertDialog open={isConfirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('confirmTitle', { names: leaving.map((s) => s.displayName).join(', ') })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => save.mutate()}>
              {t('confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
