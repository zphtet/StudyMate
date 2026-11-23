'use client'

import { useTranslations } from 'next-intl'
import { BottomSheetContent } from '@/components/shared/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// "Add StudyMate to your Home Screen" (US1 scenario 2; contracts/ui-routes.md › Turn on reminders):
// iPhone shows notifications only for apps added to the Home Screen (iOS 16.4+).

const STEPS = ['step1', 'step2', 'step3'] as const

export function InstallGuideSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('installGuide')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-3 px-4">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <span className="pt-0.5">{t(step)}</span>
            </li>
          ))}
        </ol>
        <div className="p-4">
          <SheetClose asChild>
            <Button size="xl" className="w-full">
              {t('done')}
            </Button>
          </SheetClose>
        </div>
      </BottomSheetContent>
    </Sheet>
  )
}
