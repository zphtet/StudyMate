'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { Check, Link2, Loader2, TriangleAlert, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { BottomBar } from '@/components/layout/screen'
import { Field, inputClass } from '@/components/shared/field'
import { InitialAvatar } from '@/components/shared/initial-avatar'
import { Segmented } from '@/components/shared/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { adminStudentCoursesQuery } from '@/features/assignments/queries'
import { unwrap } from '@/lib/result'
import { cityOf, utcToZoned, zonedToUtc } from '@/lib/time'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { scheduleMessage, updateMessage } from '../actions'
import { quickTimes } from '../quick-times'
import {
  alertKeys,
  alertsQuery,
  availabilityQuery,
  messageQuery,
  type AlertsScope,
} from '../queries'
import { scheduleMessageSchema, type MessageWhen } from '../schemas'
import type { AlertStudent, Availability, MessageView } from '../types'
import { useWhenLabel } from './use-when-label'

// The composer (25-AdminMessage.png; spec 006 US3; contracts/ui-routes.md › Composer): To (each
// student with their city), templates, the text, an optional lesson it opens, When to send on the
// student's clock or the Admin's (six tiles), a summary with both clocks and whether each student is
// free then (with a one-tap fix), Urgent, and "Make it a rule instead". Students are named, never
// "she/he" (FR-012).

const ALL = 'all'
const TEMPLATES = ['todaysLesson', 'greatJob', 'catchUp', 'goodLuck'] as const

type Choice = 'now' | '15:00' | '18:00' | '22:00' | 'next_free' | 'pick'
type Clock = 'student' | 'mine'

/** The When part lives outside the form: it becomes `when` on submit. */
const formSchema = scheduleMessageSchema.omit({ when: true })
type FormInput = z.input<typeof formSchema>
type FormValues = z.infer<typeof formSchema>

type Start = { values: FormInput; choice: Choice; pick: { date: string; time: string } }

export function NewComposer({ scope }: { scope: AlertsScope }) {
  const { students } = useSuspenseQuery(alertsQuery(ALL)).data
  const studentIds = students.some((s) => s.id === scope) ? [scope] : []
  return (
    <ComposerForm
      students={students}
      cancelHref={`/a/alerts?student=${scope}`}
      start={{
        values: { studentIds, body: '', lessonId: null, urgent: false },
        choice: '18:00',
        pick: { date: '', time: '' },
      }}
    />
  )
}

export function ExistingComposer({ messageId }: { messageId: string }) {
  const { students } = useSuspenseQuery(alertsQuery(ALL)).data
  const { message } = useSuspenseQuery(messageQuery(messageId)).data
  const [first] = message.recipients
  const zone = first?.student.timezone ?? 'UTC'
  return (
    <ComposerForm
      students={students}
      message={message}
      cancelHref={`/a/alerts?student=${message.recipients.length === 1 && first ? first.student.id : ALL}`}
      start={{
        values: {
          studentIds: message.recipients.map((r) => r.student.id),
          body: message.body,
          lessonId: message.lesson?.id ?? null,
          urgent: message.urgent,
        },
        choice: message.mode === 'fixed' ? 'pick' : message.mode,
        pick: first ? utcToZoned(first.deliverAt, zone) : { date: '', time: '' },
      }}
    />
  )
}

function ComposerForm({
  students,
  message,
  cancelHref,
  start,
}: {
  students: AlertStudent[]
  message?: MessageView
  cancelHref: string
  start: Start
}) {
  const t = useTranslations('composer')
  const tTemplates = useTranslations('messageTemplates')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const uid = useId()
  const { now, dayWord, time, viewerZone } = useWhenLabel()
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<Choice>(start.choice)
  const [pick, setPick] = useState(start.pick)
  const [clockChoice, setClockChoice] = useState<Clock>('student')

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: start.values,
  })
  const { errors } = form.formState
  const [studentIds, body] = useWatch({ control: form.control, name: ['studentIds', 'body'] })
  const picked = students.filter((s) => studentIds.includes(s.id))

  // The student's clock only when every picked student shares a zone other than the Admin's.
  const zones = [...new Set(picked.map((s) => s.timezone))]
  const theirZone = zones.length === 1 && zones[0] !== viewerZone ? zones[0] : null
  const clock: Clock = theirZone ? clockChoice : 'mine'
  const clockZone = clock === 'student' && theirZone ? theirZone : viewerZone

  const quick = quickTimes(now, clockZone)
  const pickedAt = pick.date && pick.time ? zonedToUtc(pick.date, pick.time, clockZone) : null
  const at: Date | null =
    choice === 'now'
      ? now
      : choice === 'next_free'
        ? null
        : choice === 'pick'
          ? pickedAt
          : (quick.find((q) => q.time === choice)?.at ?? null)
  const when: MessageWhen | null =
    choice === 'now'
      ? { mode: 'now' }
      : choice === 'next_free'
        ? { mode: 'next_free' }
        : at
          ? { mode: 'fixed', at: at.toISOString() }
          : null
  const headline =
    choice === 'now'
      ? t('headNow')
      : choice === 'next_free'
        ? t('headNextFree')
        : at
          ? t('head', { day: dayWord(at, clockZone), time: time(at, clockZone) })
          : null

  /** One tap to the student's next free moment (US3 scenario 4). */
  const moveTo = (instant: string) => {
    setPick(utcToZoned(instant, clockZone))
    setChoice('pick')
  }

  const done = async (toastText: string) => {
    await queryClient.invalidateQueries({ queryKey: alertKeys.all })
    toast.success(toastText)
    router.push(`/a/alerts?student=${studentIds.length === 1 ? studentIds[0] : ALL}`)
  }
  const save = useMutation({
    mutationFn: async (values: FormValues & { when: MessageWhen }) =>
      unwrap(
        message
          ? await updateMessage({ ...values, id: message.id })
          : await scheduleMessage(values),
      ),
    onSuccess: () =>
      done(message ? t('saved') : choice === 'now' ? t('sentToast') : t('scheduledToast')),
    onError: (e) => setError(errorMessage(e)),
  })
  const submit = form.handleSubmit((values) => {
    setError(null)
    if (!when) return setError(t('pickTimeFirst'))
    save.mutate({ ...values, when })
  })

  const actionLabel =
    choice === 'now' && !message
      ? t('sendNow')
      : t(message ? 'save' : 'schedule', { when: headline ?? '…' })
  const ruleHref = `/a/alerts/rules/new?student=${studentIds.length === 1 ? studentIds[0] : ALL}&message=${encodeURIComponent(body.slice(0, 500))}`

  return (
    <>
      <header className="sticky top-0 z-10 -mx-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-background/95 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Button asChild variant="ghost" size="touch" className="justify-self-start text-primary">
          <Link href={cancelHref}>{t('cancel')}</Link>
        </Button>
        <h1 className="truncate text-lg font-semibold">
          {message ? t('editTitle') : t('newTitle')}
        </h1>
      </header>

      <form id={`${uid}-form`} noValidate onSubmit={submit} className="flex flex-col gap-6 pt-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-semibold text-muted-foreground">{t('to')}</legend>
          <Controller
            control={form.control}
            name="studentIds"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {students.map((s) => {
                  const isOn = field.value.includes(s.id)
                  return (
                    <ChipToggle
                      key={s.id}
                      type="checkbox"
                      checked={isOn}
                      onChange={() =>
                        field.onChange(
                          isOn ? field.value.filter((id) => id !== s.id) : [...field.value, s.id],
                        )
                      }
                    >
                      <InitialAvatar name={s.displayName} seed={s.id} className="size-8 text-sm" />
                      {t('toChip', { name: s.displayName, city: cityOf(s.timezone) })}
                    </ChipToggle>
                  )
                })}
              </div>
            )}
          />
          {errors.studentIds && (
            <p role="alert" className="text-sm text-destructive">
              {validation(errors.studentIds.message ?? errors.studentIds.root?.message)}
            </p>
          )}
        </fieldset>

        <div className="flex flex-col gap-3">
          <Label htmlFor={`${uid}-body`} className="font-semibold text-muted-foreground">
            {t('message')}
          </Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('templates')}>
            {TEMPLATES.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="touch"
                className="rounded-full bg-muted font-normal"
                onClick={() =>
                  form.setValue('body', String(tTemplates.raw(`${key}.text`)), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {tTemplates(`${key}.label`)}
              </Button>
            ))}
          </div>
          <Textarea
            id={`${uid}-body`}
            rows={3}
            aria-invalid={!!errors.body}
            className="min-h-28 rounded-2xl bg-card px-4 py-3 text-base md:text-base"
            {...form.register('body')}
          />
          {errors.body && (
            <p role="alert" className="text-sm text-destructive">
              {validation(errors.body.message)}
            </p>
          )}
          <Controller
            control={form.control}
            name="lessonId"
            render={({ field }) => (
              <LessonPicker
                id={`${uid}-lesson`}
                studentIds={studentIds}
                value={field.value ?? null}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <section className="flex flex-col gap-3" aria-labelledby={`${uid}-when`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`${uid}-when`} className="font-semibold text-muted-foreground">
              {t('when')}
            </h2>
            {theirZone && picked[0] && (
              <Segmented
                name={`${uid}-clock`}
                legend={t('clock')}
                value={clock}
                onChange={setClockChoice}
                options={[
                  {
                    value: 'student',
                    label:
                      picked.length === 1
                        ? t('theirClock', { name: picked[0].displayName, city: cityOf(theirZone) })
                        : t('theirClockAll', { city: cityOf(theirZone) }),
                  },
                  { value: 'mine', label: t('myClock', { city: cityOf(viewerZone) }) },
                ]}
              />
            )}
          </div>
          <fieldset>
            <legend className="sr-only">{t('when')}</legend>
            <div className="grid grid-cols-3 gap-2">
              <Tile
                name={`${uid}-tile`}
                checked={choice === 'now'}
                onChange={() => setChoice('now')}
                title={t('now')}
                hint={t('nowHint')}
              />
              {quick.map((q) => (
                <Tile
                  key={q.time}
                  name={`${uid}-tile`}
                  checked={choice === q.time}
                  onChange={() => setChoice(q.time)}
                  title={q.time}
                  hint={q.tomorrow ? t('tomorrow') : t('today')}
                />
              ))}
              <Tile
                name={`${uid}-tile`}
                checked={choice === 'next_free'}
                onChange={() => setChoice('next_free')}
                title={t('nextFree')}
                hint={t('nextFreeHint')}
              />
              <Tile
                name={`${uid}-tile`}
                checked={choice === 'pick'}
                onChange={() => setChoice('pick')}
                title={t('pick')}
                hint={t('pickHint')}
              />
            </div>
          </fieldset>
          {choice === 'pick' && (
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${uid}-pick-date`} label={t('pickDate')}>
                <Input
                  id={`${uid}-pick-date`}
                  type="date"
                  value={pick.date}
                  onChange={(e) => setPick((p) => ({ ...p, date: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field id={`${uid}-pick-time`} label={t('pickTime')}>
                <Input
                  id={`${uid}-pick-time`}
                  type="time"
                  value={pick.time}
                  onChange={(e) => setPick((p) => ({ ...p, time: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {picked.length > 0 && headline && (
            <Summary
              headline={headline}
              students={picked}
              at={choice === 'next_free' ? null : at}
              onMove={moveTo}
              clockZone={clockZone}
            />
          )}

          <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`${uid}-urgent`} className="text-base font-semibold">
                {t('urgent')}
              </Label>
              <p id={`${uid}-urgent-hint`} className="text-sm text-muted-foreground">
                {t('urgentHint')}
              </p>
            </div>
            <Controller
              control={form.control}
              name="urgent"
              render={({ field }) => (
                <span className="flex h-11 w-14 shrink-0 items-center justify-center">
                  <Switch
                    id={`${uid}-urgent`}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-describedby={`${uid}-urgent-hint`}
                    className="scale-150"
                  />
                </span>
              )}
            />
          </div>

          <Link
            href={ruleHref}
            className="flex min-h-11 items-center self-start font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('makeRule')}
          </Link>
        </section>

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>

      <BottomBar>
        <Button
          type="submit"
          form={`${uid}-form`}
          size="xl"
          className="flex-1"
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {actionLabel}
        </Button>
      </BottomBar>
    </>
  )
}

/** A chip that is a real checkbox covering the whole chip (≥ 44 px). */
function ChipToggle({
  type,
  checked,
  onChange,
  children,
}: {
  type: 'checkbox'
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-12 items-center gap-2 rounded-full border bg-card py-1 pr-4 pl-1.5 font-medium',
        'has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-checked:ring-1 has-checked:ring-primary',
        'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <input
        type={type}
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-full outline-none"
      />
      <span className="pointer-events-none relative flex items-center gap-2">{children}</span>
    </label>
  )
}

/** A When tile: a real radio covering the tile, named "18:00 today". */
function Tile({
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string
  checked: boolean
  onChange: () => void
  title: string
  hint: string
}) {
  return (
    <label
      className={cn(
        'relative flex min-h-16 flex-col items-center justify-center rounded-2xl border bg-card px-2 py-2 text-center',
        'has-checked:border-2 has-checked:border-primary has-checked:bg-accent',
        'has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="absolute inset-0 size-full cursor-pointer appearance-none rounded-2xl outline-none"
      />
      <span className="pointer-events-none relative text-lg font-bold">{title}</span>
      <span className="pointer-events-none relative text-sm text-muted-foreground"> {hint}</span>
    </label>
  )
}

/** "Opens:" a lesson every picked student has (optional; FR-005), or none. */
function LessonPicker({
  id,
  studentIds,
  value,
  onChange,
}: {
  id: string
  studentIds: string[]
  value: string | null
  onChange: (lessonId: string | null) => void
}) {
  const t = useTranslations('composer')
  const results = useQueries({
    queries: studentIds.map((studentId) => adminStudentCoursesQuery(studentId)),
  })
  const perStudent = results.map((r) => r.data ?? [])
  const courses = (perStudent[0] ?? [])
    .map((course) => ({
      ...course,
      lessons: course.lessons.filter((lesson) =>
        perStudent.every((other) => other.some((c) => c.lessons.some((l) => l.id === lesson.id))),
      ),
    }))
    .filter((course) => course.lessons.length > 0)
  const chosen = courses.flatMap((c) => c.lessons).find((l) => l.id === value)

  if (value) {
    return (
      <div className="flex min-h-13 items-center gap-3 rounded-2xl border bg-card pl-4">
        <Link2 className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate">
          {t('opens')}: <span className="font-semibold">{chosen?.title ?? '…'}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={t('removeLesson')}
          onClick={() => onChange(null)}
        >
          <X aria-hidden />
        </Button>
      </div>
    )
  }
  return (
    <Field id={id} label={t('opens')}>
      <select
        id={id}
        value=""
        disabled={studentIds.length === 0}
        onChange={(e) => onChange(e.target.value || null)}
        className={`${inputClass} w-full border border-input`}
      >
        <option value="">{t('opensNone')}</option>
        {courses.map((course) => (
          <optgroup key={course.id} label={course.title}>
            {course.lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  )
}

/**
 * Both clocks for each student, and whether that moment is free (US3 scenarios 2, 4): "18:00 May's
 * time (Tokyo) · 15:30 your time (Yangon)", then "May is free then" or a warning with one tap to the
 * next free time.
 */
function Summary({
  headline,
  students,
  at,
  clockZone,
  onMove,
}: {
  headline: string
  students: AlertStudent[]
  at: Date | null
  clockZone: string
  onMove: (instant: string) => void
}) {
  const t = useTranslations('composer')
  const { dayWord, time, viewerZone } = useWhenLabel()
  const iso = at ? new Date(Math.floor(at.getTime() / 60_000) * 60_000).toISOString() : null
  const check = useQuery({
    ...availabilityQuery(
      students.map((s) => s.id),
      iso ?? '',
    ),
    enabled: iso !== null,
  })
  const stateOf = (id: string): Availability['students'][number] | undefined =>
    check.data?.students.find((s) => s.id === id)
  const isAllFree = !!check.data && check.data.students.every((s) => s.state === 'free')
  /** "21:00", or "Thu 07:30" when it is another day on the chosen clock. */
  const moveLabel = (instant: string) =>
    at && dayWord(instant, clockZone) === dayWord(at, clockZone)
      ? time(instant, clockZone)
      : `${dayWord(instant, clockZone)} ${time(instant, clockZone)}`

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-4',
        !at
          ? 'bg-card'
          : isAllFree
            ? 'border-success/40 bg-success-soft'
            : 'border-warning-border bg-warning',
      )}
      aria-live="polite"
    >
      <p className="text-lg font-semibold">{headline}</p>
      {!at && <p className="text-muted-foreground">{t('nextFreeNote')}</p>}
      {at &&
        students.map((student) => {
          const state = stateOf(student.id)
          const theirs = time(at, student.timezone)
          return (
            <div key={student.id} className="flex flex-col gap-1">
              <p className="text-muted-foreground">
                {student.timezone === viewerZone
                  ? t('oneClock', { time: theirs, city: cityOf(student.timezone) })
                  : t('bothClocks', {
                      theirs,
                      name: student.displayName,
                      city: cityOf(student.timezone),
                      mine: time(at, viewerZone),
                      myCity: cityOf(viewerZone),
                    })}
              </p>
              {state?.state === 'free' && (
                <p className="flex items-center gap-1.5 font-medium text-success">
                  <Check className="size-4 shrink-0" aria-hidden />
                  {t('free', { name: student.displayName })}
                </p>
              )}
              {state && state.state !== 'free' && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex items-center gap-1.5 font-medium text-warning-foreground">
                    <TriangleAlert className="size-4 shrink-0" aria-hidden />
                    {t(state.state, { name: student.displayName })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() => onMove(state.nextFree)}
                  >
                    {t('fix', { time: moveLabel(state.nextFree) })}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
