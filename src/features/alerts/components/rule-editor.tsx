'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, Loader2, Send, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { checkboxClass, checkboxLabelClass, Field, inputClass } from '@/components/shared/field'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { renderMessage } from '@/lib/notifications/render'
import type { RuleConfig, RuleView } from '@/lib/notifications/rule-config'
import { unwrap } from '@/lib/result'
import { addCalendarDays, todayIn, zonedToUtc } from '@/lib/time'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { deleteRule, saveRule, sendTestPush } from '../actions'
import { alertKeys, alertsQuery, ruleQuery, type AlertsScope } from '../queries'
import { saveRuleSchema, type SaveRuleFormInput, type SaveRuleInput } from '../schemas'
import type { AlertStudent } from '../types'
import { TriggerChips, TriggerFields } from './trigger-fields'

// The rule editor (26-AdminRule.png; spec 006 US2 scenarios 1, 2, 5; contracts/ui-routes.md › Rule
// editor): the trigger chips and their timing, Applies to (a student or All students), the message
// with its variables and a live preview, Push and Copy me (no In-app: the inbox always gets it),
// Send test to my phone, and Delete rule.

/** A new rule's timing per trigger (FR-008's defaults where 003 has one). */
const NEW_CONFIG: Record<RuleConfig['trigger'], RuleConfig> = {
  daily: { trigger: 'daily', time: '20:00', days: [1, 2, 3, 4, 5] },
  after_shift: { trigger: 'after_shift', hours: 2 },
  due_soon: { trigger: 'due_soon', offsets_h: [24, 2] },
  overdue: { trigger: 'overdue', repeat_time: '19:00', max: 3 },
  streak_risk: { trigger: 'streak_risk', time: '21:30' },
  inactive: { trigger: 'inactive', days: 2, to: ['student', 'admin'] },
  weekly_summary: {
    trigger: 'weekly_summary',
    weekday: 7,
    time: '18:00',
    to: ['student', 'admin'],
  },
}

const ALL = 'all'
const backTo = (studentId: string | null) => `/a/alerts?student=${studentId ?? ALL}`

/**
 * `/a/alerts/rules/new?student=`: for that student when they are linked, else All students. With
 * `?message=` (the composer's "Make it a rule instead", US3 scenario 8) a Daily rule with that text.
 */
export function NewRuleEditor({ scope, message }: { scope: AlertsScope; message: string | null }) {
  const { students } = useSuspenseQuery(alertsQuery(ALL)).data
  const studentId = students.some((s) => s.id === scope) ? scope : null
  return (
    <RuleForm
      students={students}
      cancelHref={backTo(studentId)}
      initial={{
        studentId,
        config: NEW_CONFIG.daily,
        message: message ?? '',
        push: true,
        copyMe: false,
      }}
    />
  )
}

export function ExistingRuleEditor({ ruleId }: { ruleId: string }) {
  const { students } = useSuspenseQuery(alertsQuery(ALL)).data
  const { rule } = useSuspenseQuery(ruleQuery(ruleId)).data
  return (
    <RuleForm
      students={students}
      rule={rule}
      cancelHref={backTo(rule.studentId)}
      initial={{
        studentId: rule.studentId,
        config: rule.config,
        message: rule.message,
        push: rule.push,
        copyMe: rule.copyMe,
      }}
    />
  )
}

/** The first validation message under a field, e.g. a config's `daysEmpty`. */
function firstMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  if ('message' in error && typeof error.message === 'string') return error.message
  for (const [key, value] of Object.entries(error)) {
    if (key === 'ref') continue
    const message = firstMessage(value)
    if (message) return message
  }
  return undefined
}

function RuleForm({
  students,
  rule,
  cancelHref,
  initial,
}: {
  students: AlertStudent[]
  rule?: RuleView
  cancelHref: string
  initial: SaveRuleFormInput
}) {
  const t = useTranslations('ruleEditor')
  const tAlerts = useTranslations('alerts')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const uid = useId()
  const formId = `${uid}-form`
  const [error, setError] = useState<string | null>(null)

  const form = useForm<SaveRuleFormInput, unknown, SaveRuleInput>({
    resolver: zodResolver(saveRuleSchema),
    defaultValues: initial,
  })
  const { errors } = form.formState
  const [config, message, studentId] = useWatch({
    control: form.control,
    name: ['config', 'message', 'studentId'],
  })
  const student = students.find((s) => s.id === studentId) ?? null

  // Switching triggers and back keeps what was typed for each one.
  const typed = useRef(new Map<RuleConfig['trigger'], RuleConfig>())
  const chooseTrigger = (trigger: RuleConfig['trigger']) => {
    typed.current.set(config.trigger, config)
    const next =
      typed.current.get(trigger) ??
      (rule?.config.trigger === trigger ? rule.config : NEW_CONFIG[trigger])
    form.setValue('config', next, { shouldDirty: true })
  }

  const done = async (studentIdAfter: string | null, toastText: string) => {
    await queryClient.invalidateQueries({ queryKey: alertKeys.all })
    toast.success(toastText)
    router.push(backTo(studentIdAfter))
  }
  const save = useMutation({
    mutationFn: async (values: SaveRuleInput) =>
      unwrap(await saveRule({ ...values, id: rule?.id })),
    onSuccess: ({ rule: saved }) => done(saved.studentId, t('saved')),
    onError: (e) => setError(errorMessage(e)),
  })
  const test = useMutation({
    mutationFn: async ({ config: c, message: m, studentId: s }: SaveRuleInput) =>
      unwrap(await sendTestPush({ config: c, message: m, studentId: s })),
    onSuccess: ({ sent }) => {
      setError(null)
      toast.success(t('testSent', { count: sent }))
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await deleteRule({ id })),
    onSuccess: () => done(rule?.studentId ?? null, t('deleted')),
    onError: (e) => setError(errorMessage(e)),
  })
  const busy = save.isPending || test.isPending || remove.isPending

  return (
    <>
      <header className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-2 bg-background/95 px-3 py-2 backdrop-blur">
        <Button asChild variant="ghost" size="touch" className="text-primary">
          <Link href={cancelHref}>{t('cancel')}</Link>
        </Button>
        <h1 className="truncate text-lg font-semibold">{rule ? t('editTitle') : t('newTitle')}</h1>
        <Button
          type="submit"
          form={formId}
          variant="ghost"
          size="touch"
          className="font-semibold text-primary"
          disabled={busy}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {t('save')}
        </Button>
      </header>

      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setError(null)
          save.mutate(values)
        })}
        className="flex flex-col gap-6 pt-4"
      >
        <TriggerChips name={`${uid}-trigger`} value={config.trigger} onChange={chooseTrigger} />

        <section className="flex flex-col gap-3" aria-labelledby={`${uid}-timing`}>
          <h2 id={`${uid}-timing`} className="font-semibold text-muted-foreground">
            {t('timing')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={form.control}
              name="config"
              render={({ field }) => (
                <TriggerFields
                  uid={uid}
                  config={field.value}
                  onChange={field.onChange}
                  studentName={student?.displayName ?? null}
                />
              )}
            />
          </div>
          {errors.config && (
            <p role="alert" className="text-sm text-destructive">
              {validation(firstMessage(errors.config))}
            </p>
          )}
        </section>

        <Field id={`${uid}-applies`} label={t('appliesTo')}>
          <Controller
            control={form.control}
            name="studentId"
            render={({ field }) => (
              <select
                id={`${uid}-applies`}
                value={field.value ?? ALL}
                onChange={(e) => field.onChange(e.target.value === ALL ? null : e.target.value)}
                className={`${inputClass} w-full border border-input`}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
                <option value={ALL}>{tAlerts('allStudents')}</option>
              </select>
            )}
          />
        </Field>

        <Field
          id={`${uid}-message`}
          label={t('messageLabel')}
          error={validation(errors.message?.message)}
        >
          <Textarea
            id={`${uid}-message`}
            rows={3}
            aria-invalid={!!errors.message}
            aria-describedby={`${uid}-message-hint`}
            className="min-h-24 rounded-2xl bg-card px-4 py-3 text-base md:text-base"
            {...form.register('message')}
          />
          <p id={`${uid}-message-hint`} className="text-sm text-muted-foreground">
            {t('messageHint')}
          </p>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold text-muted-foreground">{t('sendTo')}</legend>
          <div className="flex flex-wrap gap-x-6">
            {(['push', 'copyMe'] as const).map((name) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`${uid}-${name}`}
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      className={checkboxClass}
                    />
                    <Label htmlFor={`${uid}-${name}`} className={checkboxLabelClass}>
                      {t(name)}
                    </Label>
                  </div>
                )}
              />
            ))}
          </div>
        </fieldset>

        <Preview config={config} message={message} student={student} />

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        {rule && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="xl" disabled={busy}>
                <Trash2 aria-hidden />
                {t('delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('keep')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(rule.id)}>
                  {t('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </form>

      <BottomBar>
        <Button
          type="button"
          variant="outline"
          size="xl"
          className="flex-1"
          disabled={busy}
          onClick={form.handleSubmit((values) => test.mutate(values))}
        >
          {test.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {t('sendTest')}
        </Button>
      </BottomBar>
    </>
  )
}

/** The phone-style preview with sample values (26-AdminRule.png): the student's name or a sample. */
function Preview({
  config,
  message,
  student,
}: {
  config: RuleConfig
  message: string
  student: AlertStudent | null
}) {
  const t = useTranslations('ruleEditor')
  const { dayTime } = useInstantFormat()
  const zone = student?.timezone
  // A sample deadline: tomorrow 23:59 in the student's zone (stable through the day).
  const sampleDue = zone ? zonedToUtc(addCalendarDays(todayIn(zone), 1), '23:59', zone) : null
  const text = renderMessage(message, {
    name: student?.displayName ?? t('sampleName'),
    lesson: t('sampleLesson'),
    course: t('sampleCourse'),
    due: sampleDue && zone ? dayTime(sampleDue, zone) : null,
  })
  const time = 'time' in config ? config.time : 'repeat_time' in config ? config.repeat_time : null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-muted-foreground">{t('preview')}</h2>
      <div className="flex gap-3 rounded-2xl bg-muted p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Check className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{t('previewApp')}</span>
            {time && <span className="text-sm text-muted-foreground">{time}</span>}
          </p>
          <p className="break-words">{text}</p>
        </div>
      </div>
    </section>
  )
}
