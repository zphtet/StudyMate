'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { BellRing, Moon, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { cityOf } from '@/lib/time'
import { cn } from '@/lib/utils'
import { alertsQuery, type AlertsScope } from '../queries'
import type { AlertStudent } from '../types'
import { RuleRow } from './rule-row'
import { ScheduledMessageCard } from './scheduled-message-card'

// The Alerts tab, "Reminders" (24-AdminNotify.png; spec 006 US2, US3; contracts/ui-routes.md ›
// Alerts): + Rule and Message, a chip per linked student and All students (`?student=`), the note on
// time zones and quiet blocks naming the student (FR-012), the scheduled messages, this week's sent
// and cancelled ones, and the automatic rules.

export function AlertsView({ scope }: { scope: AlertsScope }) {
  const t = useTranslations('alerts')
  const tm = useTranslations('scheduledMessages')
  const { students, rules, scheduled, recent, sentThisWeek } = useSuspenseQuery(
    alertsQuery(scope),
  ).data
  const picked = students.find((s) => s.id === scope) ?? null
  const nameOf = (id: string | null) => students.find((s) => s.id === id)?.displayName ?? null

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            {/* Narrower than `touch` so both fit beside the title at 390 px (24-AdminNotify.png). */}
            <Button asChild variant="outline" size="touch" className="px-3">
              <Link href={`/a/alerts/rules/new?student=${scope}`}>{t('addRule')}</Link>
            </Button>
            <Button asChild size="touch" className="px-3">
              <Link href={`/a/alerts/messages/new${picked ? `?student=${picked.id}` : ''}`}>
                <Send aria-hidden />
                {t('message')}
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <StudentChips students={students} scope={scope} />
        <Note student={picked} />

        {scheduled.length > 0 && (
          <section aria-labelledby="alerts-scheduled" className="flex flex-col gap-3">
            <h2 id="alerts-scheduled" className="font-semibold text-muted-foreground">
              {tm('heading', { count: scheduled.length })}
            </h2>
            <ul className="flex flex-col gap-3">
              {scheduled.map((message, i) => (
                <li key={message.id}>
                  <ScheduledMessageCard
                    message={message}
                    sentThisWeek={i === scheduled.length - 1 ? sentThisWeek : undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section aria-labelledby="alerts-week" className="flex flex-col gap-3">
            <h2 id="alerts-week" className="font-semibold text-muted-foreground">
              {tm('week')}
            </h2>
            <ul className="flex flex-col gap-3">
              {recent.map((message) => (
                <li key={message.id}>
                  <ScheduledMessageCard message={message} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {rules.length === 0 && scheduled.length === 0 && recent.length === 0 ? (
          <EmptyState icon={BellRing}>{t('empty')}</EmptyState>
        ) : rules.length === 0 ? null : (
          <section aria-labelledby="alerts-rules" className="flex flex-col gap-3">
            <h2 id="alerts-rules" className="font-semibold text-muted-foreground">
              {t('rules')}
            </h2>
            <ul className="divide-y rounded-2xl border bg-card">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  scope={scope}
                  studentName={nameOf(rule.studentId)}
                  scopeLabel={
                    picked
                      ? undefined
                      : rule.studentId
                        ? t('forStudent', { name: nameOf(rule.studentId) ?? '' })
                        : t('forAll')
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

function StudentChips({ students, scope }: { students: AlertStudent[]; scope: AlertsScope }) {
  const t = useTranslations('alerts')
  const chips = [
    ...students.map((s) => ({ id: s.id, label: s.displayName })),
    { id: 'all', label: t('allStudents') },
  ]
  return (
    <nav aria-label={t('chips')} className="-mx-5 overflow-x-auto px-5">
      <ul className="flex w-max gap-2">
        {chips.map((chip) => (
          <li key={chip.id}>
            <Link
              href={`/a/alerts?student=${chip.id}`}
              aria-current={chip.id === scope ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center rounded-full border px-5 font-medium',
                chip.id === scope
                  ? 'border-inverse bg-inverse text-inverse-foreground'
                  : 'bg-card text-foreground',
              )}
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Times are the student's; nothing goes out during their busy blocks (FR-003, constitution IV). */
function Note({ student }: { student: AlertStudent | null }) {
  const t = useTranslations('alerts')
  return (
    <p className="flex gap-3 rounded-2xl bg-accent p-4 text-accent-foreground">
      <Moon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <span>
        {student
          ? t('note', { name: student.displayName, city: cityOf(student.timezone) })
          : t('noteAll')}
      </span>
    </p>
  )
}
