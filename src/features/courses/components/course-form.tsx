'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { BottomBar } from '@/components/layout/screen'
import { checkboxClass, checkboxLabelClass, Field, inputClass } from '@/components/shared/field'
import { Segmented } from '@/components/shared/segmented'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { createCourse, updateCourse } from '../actions'
import { adminCourseQuery, adminCoursesQuery, courseKeys } from '../queries'
import { courseFieldsSchema, type CourseFields, type CourseFieldsInput } from '../schemas'
import type { AdminCourse } from '../types'
import { ColorSwatches } from './color-swatches'
import { IconPicker } from './icon-picker'

// New course / Edit course (screen 19-AdminCourseForm; spec 002 US1, contracts/ui-routes.md).

type Props = { mode: 'new' } | { mode: 'edit'; course: AdminCourse }

const BLANK: CourseFieldsInput = {
  title: '',
  description: '',
  icon: '文',
  color: 'indigo',
  targetDate: null,
  levelTag: '',
  unlockInOrder: true,
  allowStudentNotes: true,
  status: 'draft',
}

const fromCourse = (course: AdminCourse, title = course.title): CourseFieldsInput => ({
  title,
  description: course.description ?? '',
  icon: course.icon,
  color: course.color,
  targetDate: course.targetDate,
  levelTag: course.levelTag ?? '',
  unlockInOrder: course.unlockInOrder,
  allowStudentNotes: course.allowStudentNotes,
  status: course.status === 'active' ? 'active' : 'draft',
})

export function CourseForm(props: Props) {
  const t = useTranslations('courseForm')
  const errorMessage = useErrorMessage()
  const validation = useValidationMessage()
  const router = useRouter()
  const queryClient = useQueryClient()
  const editing = props.mode === 'edit' ? props.course : null
  const archived = editing?.status === 'archived'

  const [start, setStart] = useState<'blank' | 'copy'>('blank')
  // Hidden copies of recent screens stay in the page (Next), so ids are per instance.
  const uid = useId()
  const [sourceId, setSourceId] = useState('')
  const sources = useQuery({ ...adminCoursesQuery, enabled: !editing })

  const form = useForm<CourseFieldsInput, unknown, CourseFields>({
    resolver: zodResolver(courseFieldsSchema),
    defaultValues: editing ? fromCourse(editing) : BLANK,
  })
  const { errors } = form.formState
  const [icon, color, status] = useWatch({
    control: form.control,
    name: ['icon', 'color', 'status'],
  })

  const chooseSource = async (id: string) => {
    setSourceId(id)
    if (!id) return
    const source = await queryClient.fetchQuery(adminCourseQuery(id))
    form.reset(
      fromCourse(source.course, t('copySuffix', { title: source.course.title }).slice(0, 120)),
    )
    form.setValue('status', 'draft')
  }

  const save = useMutation({
    mutationFn: async (values: CourseFields) =>
      editing
        ? unwrap(await updateCourse({ courseId: editing.id, fields: values })).id
        : unwrap(
            await createCourse({ ...values, copyFromId: start === 'copy' ? sourceId : undefined }),
          ).id,
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: courseKeys.admin })
      if (editing) toast.success(t('saved'))
      router.push(`/a/courses/${id}`)
    },
  })

  const copyNotChosen = !editing && start === 'copy' && !sourceId

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="flex flex-col gap-6"
    >
      <header className="grid grid-cols-[1fr_auto_1fr] items-center pt-5 pb-1">
        <Link
          href={editing ? `/a/courses/${editing.id}` : '/a/courses'}
          className="-ml-2 justify-self-start rounded-lg px-2 py-2.5 text-lg text-primary"
        >
          {t('cancel')}
        </Link>
        <h1 className="text-xl font-semibold">{editing ? t('editTitle') : t('newTitle')}</h1>
      </header>

      {!editing && (
        <Segmented
          name="start"
          legend={t('start')}
          value={start}
          onChange={(value) => {
            setStart(value)
            if (value === 'blank') {
              setSourceId('')
              form.reset(BLANK)
            }
          }}
          options={[
            { value: 'blank', label: t('blank') },
            { value: 'copy', label: t('copy') },
          ]}
        />
      )}

      {start === 'copy' && !editing && (
        <Field id={`${uid}copy-from`} label={t('copyFrom')}>
          <select
            id={`${uid}copy-from`}
            value={sourceId}
            onChange={(e) => void chooseSource(e.target.value)}
            className={`${inputClass} w-full border border-input`}
          >
            <option value="">{t('copyPlaceholder')}</option>
            {(sources.data ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">{t('copyHint')}</p>
        </Field>
      )}

      <div className="flex items-start gap-4">
        <IconPicker
          value={icon}
          color={color}
          onChange={(value) => form.setValue('icon', value, { shouldDirty: true })}
        />
        <Field
          id={`${uid}course-title`}
          label={t('titleLabel')}
          error={validation(errors.title?.message)}
          className="flex-1"
        >
          <Input
            id={`${uid}course-title`}
            className={inputClass}
            aria-invalid={!!errors.title}
            {...form.register('title')}
          />
        </Field>
      </div>

      <ColorSwatches
        value={color}
        onChange={(value) => form.setValue('color', value, { shouldDirty: true })}
      />

      <Field
        id={`${uid}course-description`}
        label={t('description')}
        error={validation(errors.description?.message)}
      >
        <Textarea
          id={`${uid}course-description`}
          rows={3}
          className="min-h-24 rounded-2xl bg-card px-4 py-3 text-base md:text-base"
          aria-invalid={!!errors.description}
          {...form.register('description')}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id={`${uid}course-target`}
          label={t('targetDate')}
          error={validation(errors.targetDate?.message)}
        >
          <Input
            id={`${uid}course-target`}
            type="date"
            className={inputClass}
            aria-invalid={!!errors.targetDate}
            {...form.register('targetDate', { setValueAs: (v: string | null) => v || null })}
          />
        </Field>
        <Field
          id={`${uid}course-level`}
          label={t('levelTag')}
          error={validation(errors.levelTag?.message)}
        >
          <Input
            id={`${uid}course-level`}
            className={inputClass}
            aria-invalid={!!errors.levelTag}
            {...form.register('levelTag')}
          />
        </Field>
      </div>

      <div className="flex flex-col">
        {(['unlockInOrder', 'allowStudentNotes'] as const).map((name) => (
          <div key={name} className="flex flex-col border-b py-3 last:border-b-0">
            <div className="flex min-h-11 items-center justify-between gap-4">
              <Label htmlFor={`${uid}course-${name}`} className={checkboxLabelClass}>
                {t(name === 'unlockInOrder' ? 'unlockInOrder' : 'allowNotes')}
              </Label>
              <Controller
                control={form.control}
                name={name}
                render={({ field }) => (
                  <Checkbox
                    id={`${uid}course-${name}`}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    className={checkboxClass}
                  />
                )}
              />
            </div>
            {editing && name === 'unlockInOrder' && (
              <p className="text-sm text-muted-foreground">{t('unlockNote')}</p>
            )}
          </div>
        ))}
      </div>

      {!archived && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-muted-foreground" aria-hidden>
            {t('status')}
          </span>
          <Segmented
            name="status"
            legend={t('status')}
            value={status}
            onChange={(value) => form.setValue('status', value, { shouldDirty: true })}
            options={[
              { value: 'draft', label: t('draft') },
              { value: 'active', label: t('active') },
            ]}
          />
        </div>
      )}

      {save.isError && (
        <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {errorMessage(save.error)}
        </p>
      )}

      <BottomBar>
        <Button
          type="submit"
          size="xl"
          className="w-full"
          disabled={save.isPending || copyNotChosen}
        >
          {editing ? t('save') : t('create')}
        </Button>
      </BottomBar>
    </form>
  )
}
