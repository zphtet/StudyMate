'use client'

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { RuleBadge } from '@/components/shared/rule-badge'
import { useRuleText } from '@/components/shared/use-rule-text'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { RuleView } from '@/lib/notifications/rule-config'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { savePersonalReminder } from '../actions'
import { myRemindersQuery, notificationKeys } from '../queries'
import type { MyReminders as MyRemindersData } from '../types'
import { PersonalReminderSheet } from './personal-reminder-sheet'

// My reminders (/s/me/reminders; spec 006 US5 scenarios 2–4; contracts/ui-routes.md › Me): the
// student's own reminders, each with a switch, and "+ Reminder"; then the Admin's rules that reach
// them, read-only with "Set by Zin" (FR-016). No screenshot: it follows Alerts' rule rows.

export function MyReminders({ studentName }: { studentName: string }) {
  const t = useTranslations('myReminders')
  const { data } = useSuspenseQuery(myRemindersQuery)
  const [sheet, setSheet] = useState<{ open: boolean; reminder: RuleView | null }>({
    open: false,
    reminder: null,
  })
  const admin = data.fromAdmin[0]?.owner.displayName

  return (
    <div className="flex flex-col gap-7 pb-8">
      <section aria-labelledby="your-reminders" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="your-reminders" className="text-sm font-semibold text-muted-foreground uppercase">
            {t('yours')}
          </h2>
          <Button
            variant="outline"
            size="touch"
            className="rounded-full"
            onClick={() => setSheet({ open: true, reminder: null })}
          >
            <Plus aria-hidden />
            {t('add')}
          </Button>
        </div>
        {data.personal.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {data.personal.map((rule) => (
              <PersonalRow
                key={rule.id}
                rule={rule}
                studentName={studentName}
                onOpen={() => setSheet({ open: true, reminder: rule })}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border bg-card p-4 text-muted-foreground">{t('empty')}</p>
        )}
      </section>

      {admin && (
        <section aria-labelledby="from-admin" className="flex flex-col gap-3">
          <h2 id="from-admin" className="text-sm font-semibold text-muted-foreground uppercase">
            {t('fromAdmin', { admin })}
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {data.fromAdmin.map((rule) => (
              <AdminRow key={rule.id} rule={rule} studentName={studentName} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted-foreground">{t('note')}</p>

      <PersonalReminderSheet
        reminder={sheet.reminder}
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />
    </div>
  )
}

/** The student's own reminder: its message and timing (opening the sheet), and an on/off switch. */
function PersonalRow({
  rule,
  studentName,
  onOpen,
}: {
  rule: RuleView
  studentName: string
  onOpen: () => void
}) {
  const ruleText = useRuleText()
  const { badge, badgeLabel, summary } = ruleText(rule, studentName)
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const key = notificationKeys.myReminders

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (rule.config.trigger !== 'daily') throw new Error('A personal reminder is always daily')
      const { time, days } = rule.config
      return unwrap(
        await savePersonalReminder({ id: rule.id, message: rule.message, time, days, enabled }),
      )
    },
    // Updates at once and rolls back if the server refuses (as Alerts' switches do).
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<MyRemindersData>(key)
      queryClient.setQueryData<MyRemindersData>(
        key,
        (old) =>
          old && {
            ...old,
            personal: old.personal.map((r) => (r.id === rule.id ? { ...r, enabled } : r)),
          },
      )
      return { before }
    },
    onError: (error, _enabled, context) => {
      queryClient.setQueryData(key, context?.before)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RuleBadge badge={badge} label={badgeLabel} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{rule.message}</span>
          <span className="block text-sm text-muted-foreground">{summary}</span>
        </span>
      </button>
      {/* The switch is drawn 1.5× its default size, as on Alerts; its hit area grows too. */}
      <span className="flex h-11 w-14 shrink-0 items-center justify-center">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(enabled) => toggle.mutate(enabled)}
          aria-label={rule.message}
          className="scale-150"
        />
      </span>
    </li>
  )
}

/** An Admin's rule: read-only, no switch and no link (FR-016). */
function AdminRow({ rule, studentName }: { rule: RuleView; studentName: string }) {
  const t = useTranslations('myReminders')
  const ruleText = useRuleText()
  const { badge, badgeLabel, title, summary } = ruleText(
    rule,
    rule.studentId === null ? null : studentName,
  )
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <RuleBadge badge={badge} label={badgeLabel} />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{summary}</span>
        <span className="block text-xs text-muted-foreground">
          {t('setBy', { admin: rule.owner.displayName })}
        </span>
      </span>
    </li>
  )
}
