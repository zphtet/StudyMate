'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { RuleBadge } from '@/components/shared/rule-badge'
import { useRuleText } from '@/components/shared/use-rule-text'
import { Switch } from '@/components/ui/switch'
import type { RuleView } from '@/lib/notifications/rule-config'
import { unwrap } from '@/lib/result'
import { useErrorMessage } from '@/lib/use-error-message'
import { setRuleEnabled } from '../actions'
import { alertKeys, type AlertsScope } from '../queries'
import type { AlertsData } from '../types'

// One automatic rule on Alerts (24-AdminNotify.png): type badge, title and summary (opening the
// editor), and an on/off switch that updates at once and rolls back if the server refuses.

export function RuleRow({
  rule,
  scope,
  studentName,
  scopeLabel,
}: {
  rule: RuleView
  scope: AlertsScope
  /** The student the rule applies to; null for All students. */
  studentName: string | null
  /** "For May" when the list shows every student's rules. */
  scopeLabel?: string
}) {
  const ruleText = useRuleText()
  const { badge, badgeLabel, title, summary } = ruleText(rule, studentName)
  const queryClient = useQueryClient()
  const errorMessage = useErrorMessage()
  const listKey = alertKeys.list(scope)

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => unwrap(await setRuleEnabled({ id: rule.id, enabled })),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const before = queryClient.getQueryData<AlertsData>(listKey)
      queryClient.setQueryData<AlertsData>(
        listKey,
        (data) =>
          data && {
            ...data,
            rules: data.rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)),
          },
      )
      return { before }
    },
    onError: (error, _enabled, context) => {
      queryClient.setQueryData(listKey, context?.before)
      toast.error(errorMessage(error))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  })

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link
        href={`/a/alerts/rules/${rule.id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RuleBadge badge={badge} label={badgeLabel} />
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{summary}</span>
          {scopeLabel && <span className="block text-xs text-muted-foreground">{scopeLabel}</span>}
        </span>
      </Link>
      {/* The switch is drawn 1.5× its default size (24-AdminNotify.png); its hit area grows too. */}
      <span className="flex h-11 w-14 shrink-0 items-center justify-center">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(enabled) => toggle.mutate(enabled)}
          aria-label={title}
          className="scale-150"
        />
      </span>
    </li>
  )
}
