'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronRight, Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Field, inputClass } from '@/components/shared/field'
import { useNeedsConnection } from '@/components/shared/use-needs-connection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { unwrap } from '@/lib/result'
import { useErrorMessage, useValidationMessage } from '@/lib/use-error-message'
import { cn } from '@/lib/utils'
import { deleteSection, moveSection, renameSection } from '../actions'
import { courseKeys } from '../queries'
import { sectionTitleSchema } from '../schemas'

// Section heading on the admin course page (screen 18-AdminCourse): "{title} · {n} lessons", tap to
// collapse, and ⋯ with Rename, Move up, Move down and Delete section (only when it has no lessons).

export function SectionHeader({
  section,
  count,
  isFirst,
  isLast,
  collapsed,
  onToggle,
  titleId,
  controls,
}: {
  section: { id: string; title: string }
  count: number
  isFirst: boolean
  isLast: boolean
  collapsed: boolean
  onToggle: () => void
  /** id of the title, which names the section region */
  titleId: string
  /** id of the lesson list this header shows and hides */
  controls: string
}) {
  const t = useTranslations('courseDetail')
  const errorMessage = useErrorMessage()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const keepFocus = useRef(false)
  // Renaming, moving and deleting sections need the server (spec 008 R14).
  const connection = useNeedsConnection()

  const onSuccess = () => queryClient.invalidateQueries({ queryKey: courseKeys.admin })
  const onError = (error: unknown) => toast.error(errorMessage(error))
  const rename = useMutation({
    mutationFn: async (title: string) =>
      unwrap(await renameSection({ sectionId: section.id, title })),
    onSuccess: async () => {
      await onSuccess()
      setRenaming(false)
    },
    onError,
  })
  const move = useMutation({
    mutationFn: async (direction: 'up' | 'down') =>
      unwrap(await moveSection({ sectionId: section.id, direction })),
    onSuccess,
    onError,
  })
  const remove = useMutation({
    mutationFn: async () => unwrap(await deleteSection({ sectionId: section.id })),
    onSuccess,
    onError,
  })

  if (renaming) {
    return (
      <SectionTitleForm
        defaultValue={section.title}
        submitLabel={t('save')}
        pending={rename.isPending}
        onSubmit={(title) => rename.mutate(title)}
        onCancel={() => setRenaming(false)}
      />
    )
  }

  const toggle = (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onToggle}
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {collapsed && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />}
      <span id={titleId} className="min-w-0 truncate font-semibold">
        {section.title}
      </span>
      <span className={cn('shrink-0 text-muted-foreground', collapsed && 'ml-auto')}>
        {!collapsed && '· '}
        {t('lessonCount', { count })}
      </span>
    </button>
  )

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={t('sectionMenu', { title: section.title })}
          disabled={move.isPending || remove.isPending}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-56"
        onCloseAutoFocus={(event) => {
          // Rename moves focus into its own field.
          if (keepFocus.current) event.preventDefault()
          keepFocus.current = false
        }}
      >
        <DropdownMenuItem
          className="min-h-11 text-base"
          disabled={connection.disabled}
          aria-describedby={connection.describedBy}
          onSelect={() => {
            keepFocus.current = true
            setRenaming(true)
          }}
        >
          <Pencil aria-hidden /> {t('rename')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 text-base"
          disabled={connection.disabled || isFirst}
          aria-describedby={connection.describedBy}
          onSelect={() => move.mutate('up')}
        >
          <ArrowUp aria-hidden /> {t('moveUp')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 text-base"
          disabled={connection.disabled || isLast}
          aria-describedby={connection.describedBy}
          onSelect={() => move.mutate('down')}
        >
          <ArrowDown aria-hidden /> {t('moveDown')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          className="min-h-11 text-base"
          disabled={connection.disabled || count > 0}
          aria-describedby={connection.describedBy}
          onSelect={() => remove.mutate()}
        >
          <Trash2 aria-hidden />
          <span className="flex flex-col">
            <span>{t('deleteSection')}</span>
            {count > 0 && (
              <span className="text-xs text-muted-foreground">{t('deleteSectionEmptyOnly')}</span>
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        collapsed && 'rounded-3xl border bg-card py-1 pr-1 pl-4',
      )}
    >
      {toggle}
      {menu}
    </div>
  )
}

/** Inline title field for "+ Add section" and Rename (data-model.md CourseSection.title). */
export function SectionTitleForm({
  defaultValue = '',
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  children,
}: {
  defaultValue?: string
  submitLabel: string
  pending: boolean
  onSubmit: (title: string) => void
  onCancel: () => void
  children?: ReactNode
}) {
  const t = useTranslations('courseDetail')
  const validation = useValidationMessage()
  const id = useId()
  const [title, setTitle] = useState(defaultValue)
  const [error, setError] = useState<string>()
  const connection = useNeedsConnection()

  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-3xl border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (connection.disabled) return
        const parsed = sectionTitleSchema.safeParse(title)
        if (!parsed.success) {
          setError(validation(parsed.error.issues[0]?.message))
          return
        }
        setError(undefined)
        onSubmit(parsed.data)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <Field id={id} label={t('sectionTitle')} error={error}>
        <Input
          id={id}
          autoFocus
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          aria-invalid={!!error}
        />
      </Field>
      {children}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="touch" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="submit"
          size="touch"
          disabled={connection.disabled || pending}
          aria-describedby={connection.describedBy}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
