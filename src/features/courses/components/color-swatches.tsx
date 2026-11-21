'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { COURSE_COLORS, type CourseColor } from '../schemas'
import { COURSE_COLOR_CLASSES } from './course-icon'

// Colour picker (data-model.md Course.color): six radio inputs drawn as swatches, each named.
export function ColorSwatches({
  value,
  onChange,
}: {
  value: CourseColor
  onChange: (color: CourseColor) => void
}) {
  const t = useTranslations('courseForm')
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm font-medium text-muted-foreground">{t('colour')}</legend>
      <div className="flex flex-wrap gap-3">
        {COURSE_COLORS.map((color) => (
          <input
            key={color}
            type="radio"
            name="course-color"
            value={color}
            aria-label={t(`colours.${color}`)}
            title={t(`colours.${color}`)}
            checked={value === color}
            onChange={() => onChange(color)}
            className={cn(
              'size-12 cursor-pointer appearance-none rounded-full border-4 border-background outline-none',
              'ring-2 ring-transparent checked:ring-primary focus-visible:ring-ring/60',
              COURSE_COLOR_CLASSES[color].solid,
            )}
          />
        ))}
      </div>
    </fieldset>
  )
}
