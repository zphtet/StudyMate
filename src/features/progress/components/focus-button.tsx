'use client'

import { ChevronDown, Timer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCountdown } from '../focus'
import { FOCUS_MINUTES } from '../schemas'
import { PENDING_SESSION, type FocusTimer } from '../use-focus-timer'

// Left side of the lesson bottom bar (contracts/ui-routes.md › Bottom bar; research.md R3):
// "Focus 15" with a ▾ menu for 15 / 25 min; "mm:ss · Stop" while this lesson's timer runs; "Focus
// running · {lesson}" linking to the lesson whose timer runs. Screen readers hear the time left once
// a minute, not every second.

export function FocusButton({ lessonId, timer }: { lessonId: string; timer: FocusTimer }) {
  const t = useTranslations('lessonWork.focus')
  const { session, remaining } = timer

  if (session && remaining !== null && session.lessonId === lessonId) {
    return (
      <>
        <Button
          variant="outline"
          size="xl"
          className="tabular-nums"
          disabled={session.id === PENDING_SESSION}
          onClick={timer.stop}
        >
          <Timer aria-hidden />
          {t('running', { time: formatCountdown(remaining) })}
        </Button>
        <span aria-live="polite" className="sr-only">
          {t('minutesLeft', { count: Math.ceil(remaining / 60) })}
        </span>
      </>
    )
  }

  if (session) {
    if (!session.lessonId || !session.lessonTitle) {
      return (
        <p className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
          <Timer className="size-5 shrink-0" aria-hidden />
          <span className="truncate">{t('runningNow')}</span>
        </p>
      )
    }
    // "Focus running · {lesson}" doesn't fit beside Mark complete at 390 px, so it shows on two lines
    // and the lesson name truncates; screen readers hear one line.
    return (
      <Button asChild variant="outline" size="xl" className="min-w-0 flex-1 justify-start">
        <Link href={`/s/lessons/${session.lessonId}`}>
          <Timer aria-hidden />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-xs font-normal text-muted-foreground">{t('runningNow')}</span>
            <span className="sr-only">{' · '}</span>
            <span className="w-full truncate text-sm">{session.lessonTitle}</span>
          </span>
        </Link>
      </Button>
    )
  }

  const disabled = !timer.isReady || timer.isBusy
  return (
    <div className="flex">
      <Button
        variant="outline"
        size="xl"
        className="rounded-r-none px-4"
        disabled={disabled}
        onClick={() => timer.start(FOCUS_MINUTES[0])}
      >
        <Timer aria-hidden />
        {t('start', { minutes: FOCUS_MINUTES[0] })}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="xl"
            className="w-11 rounded-l-none border-l-0 px-0"
            disabled={disabled}
            aria-label={t('length')}
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          {FOCUS_MINUTES.map((minutes) => (
            <DropdownMenuItem
              key={minutes}
              className="min-h-11"
              onSelect={() => timer.start(minutes)}
            >
              {t('option', { minutes })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
