'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Field, inputClass } from '@/components/shared/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useValidationMessage } from '@/lib/use-error-message'
import { isCourseIcon, type CourseColor } from '../schemas'
import { CourseIcon } from './course-icon'

// Course icon (data-model.md Course.icon, research.md R11): any single character or emoji, with
// suggestions for language courses.
const SUGGESTIONS = ['文', '漢', '字', '聞', '話', '読', '書', '音', '📚', '✏️']

export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string
  color: CourseColor
  onChange: (icon: string) => void
}) {
  const t = useTranslations('courseForm')
  const validation = useValidationMessage()
  const [open, setOpen] = useState(false)
  const uid = useId()
  const [draft, setDraft] = useState(value)
  const invalid = draft !== '' && !isCourseIcon(draft.trim())

  const done = () => {
    const icon = draft.trim()
    if (!isCourseIcon(icon)) return
    onChange(icon)
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value)
        setOpen(next)
      }}
    >
      <div className="flex flex-col items-center gap-2">
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={t('iconChange')}
            className="rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <CourseIcon icon={value} color={color} size="lg" className="size-[5.5rem] text-5xl" />
          </button>
        </SheetTrigger>
        <span className="text-sm text-muted-foreground">{t('icon')}</span>
      </div>
      <BottomSheetContent>
        <SheetHeader>
          <SheetTitle>{t('iconSheet')}</SheetTitle>
          <SheetDescription className="sr-only">{t('iconInput')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">
          <Field
            id={`${uid}course-icon`}
            label={t('iconInput')}
            error={invalid ? validation('iconInvalid') : undefined}
          >
            <Input
              id={`${uid}course-icon`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), done())}
              aria-invalid={invalid}
              autoComplete="off"
              className={`${inputClass} text-center text-2xl`}
            />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t('iconSuggestions')}</p>
            <div className="grid grid-cols-5 gap-2">
              {SUGGESTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setDraft(icon)}
                  aria-pressed={draft === icon}
                  className="flex min-h-12 items-center justify-center rounded-xl border bg-card text-2xl aria-pressed:border-primary aria-pressed:bg-accent"
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <Button type="button" size="xl" onClick={done} disabled={!isCourseIcon(draft.trim())}>
            {t('iconDone')}
          </Button>
        </div>
      </BottomSheetContent>
    </Sheet>
  )
}
