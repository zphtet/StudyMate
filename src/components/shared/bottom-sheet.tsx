'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { SheetClose, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useMediaQuery } from './use-media-query'

/** The 44 px close button (constitution V); the generated shadcn one is 28 px. */
function CloseButton() {
  const t = useTranslations('common')
  return (
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
  )
}

/**
 * A bottom sheet whose close button is 44 px (constitution V); the generated shadcn one is 28 px.
 * Composes `SheetContent` instead of editing src/components/ui.
 */
export function BottomSheetContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof SheetContent>, 'side' | 'showCloseButton'>) {
  return (
    <SheetContent
      side="bottom"
      showCloseButton={false}
      className={cn('rounded-t-3xl', className)}
      {...props}
    >
      {children}
      <CloseButton />
    </SheetContent>
  )
}

/** A bottom sheet on phones and a side sheet from 1024 px (spec 003 Assign and Deadline sheets). */
export function AdaptiveSheetContent({
  children,
  ...props
}: Omit<ComponentProps<typeof SheetContent>, 'side' | 'showCloseButton' | 'className'>) {
  const isWide = useMediaQuery('(min-width: 1024px)')
  return (
    <SheetContent
      side={isWide ? 'right' : 'bottom'}
      showCloseButton={false}
      className={
        isWide
          ? 'w-full overflow-y-auto sm:max-w-lg'
          : 'mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl'
      }
      {...props}
    >
      {children}
      <CloseButton />
    </SheetContent>
  )
}
