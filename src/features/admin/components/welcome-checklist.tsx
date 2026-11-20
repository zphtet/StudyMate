import { Check, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { AdminOverview } from '../types'

// "Get started · n of 4 done" (screen 15-AdminWelcome).
export function WelcomeChecklist({ checklist, done }: Pick<AdminOverview, 'checklist' | 'done'>) {
  const t = useTranslations('welcome')
  const steps = [
    { key: 'course', ok: checklist.courseCreated, href: '/a/courses' },
    { key: 'invite', ok: checklist.studentInvited, href: '/a/students' },
    { key: 'assign', ok: checklist.courseAssigned, href: '/a/courses' },
    { key: 'reminders', ok: checklist.remindersOn, href: '/a/alerts' },
  ] as const
  const firstOpen = steps.findIndex((s) => !s.ok)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-muted-foreground">{t('getStarted', { done })}</h2>
      <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
        {steps.map((step, i) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-muted/50"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                  step.ok && 'border-success bg-success text-card',
                  !step.ok && i === firstOpen && 'border-primary text-primary',
                  !step.ok && i !== firstOpen && 'border-muted-foreground/50 text-muted-foreground',
                )}
              >
                {step.ok ? <Check className="size-4" aria-label={t('steps.done')} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{t(`steps.${step.key}`)}</span>
                <span className="block text-muted-foreground">{t(`steps.${step.key}Hint`)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
