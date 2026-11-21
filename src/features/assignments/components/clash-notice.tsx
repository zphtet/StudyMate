'use client'

import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useNow, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useTimeBoth } from '@/components/shared/time-both'
import { useInstantFormat } from '@/components/shared/use-instant-format'
import { Button } from '@/components/ui/button'
import { clashQuery } from '../queries'

// "{name} is on shift then" + "Move to {day time}" while an admin picks a deadline time (spec 003
// FR-009, clarification 2026-11-21: same warning and one-tap move as the Plan). Uses the student's
// name, never a pronoun (FR-014).

const DEBOUNCE_MS = 300

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function ClashNotice({
  studentId,
  studentName,
  timeZone,
  at,
  minutes,
  onMove,
}: {
  studentId: string
  studentName: string
  /** The student's zone. */
  timeZone: string
  /** The picked deadline (ISO), or null. */
  at: string | null
  /** The lesson's estimated minutes (the suggestion leaves at least 60). */
  minutes: number
  onMove: (suggestion: string) => void
}) {
  const t = useTranslations('deadlines')
  const f = useInstantFormat()
  const timeBoth = useTimeBoth()
  const now = useNow({ updateInterval: 60_000 })
  const debounced = useDebounced(at, DEBOUNCE_MS)
  const isFuture = debounced !== null && new Date(debounced) > now
  const { data } = useQuery({
    ...clashQuery(studentId, debounced ?? '', minutes),
    enabled: isFuture,
  })
  const clash = isFuture && debounced === at ? data?.clash : null
  if (!clash) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-warning-border bg-warning p-3 text-warning-foreground"
    >
      <p className="flex flex-1 items-center gap-2 font-medium">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {t(clash.kind === 'shift' ? 'onShift' : 'asleep', { name: studentName })}
      </p>
      {clash.suggestion && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-full bg-card"
          onClick={() => clash.suggestion && onMove(clash.suggestion)}
        >
          {t('moveTo', {
            time: `${f.day(clash.suggestion, timeZone)} ${timeBoth(clash.suggestion, timeZone, { compact: true })}`,
          })}
        </Button>
      )}
    </div>
  )
}
