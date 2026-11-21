'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { SheetClose, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * A bottom sheet whose close button is 44 px (constitution V); the generated shadcn one is 28 px.
 * Composes `SheetContent` instead of editing src/components/ui.
 */
export function BottomSheetContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof SheetContent>, 'side' | 'showCloseButton'>) {
  const t = useTranslations('common')
  return (
    <SheetContent
      side="bottom"
      showCloseButton={false}
      className={cn('rounded-t-3xl', className)}
      {...props}
    >
      {children}
      <SheetClose asChild>
        <Button
          variant="ghost"
          size="icon-touch"
          className="absolute top-2 right-2"
          aria-label={t('close')}
        >
          <X aria-hidden />
        </Button>
      </SheetClose>
    </SheetContent>
  )
}
