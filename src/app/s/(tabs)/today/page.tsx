import { TodayScreen } from '@/features/assignments/components/with-today'
import { Bell } from '@/features/notifications/components/bell'
import { TurnOnRemindersCard } from '@/features/notifications/components/turn-on-reminders-card'
import { ContinueCard, StreakAndGoalCards } from '@/features/progress/components/today-progress'
import { ShiftBanner } from '@/features/shifts/components/shift-banner'
import { WeekCheckCard } from '@/features/shifts/components/week-check-card'
import { WithShiftsToday } from '@/features/shifts/components/with-shifts'
import { WithSummary } from '@/features/progress/components/with-progress'

// Student Today (screen 04-Today, partial): 003's due and overdue lessons with spec 004's streak and
// goal cards above them and Continue below; spec 005's shift banner and, when due, the Sunday check
// card on top; spec 006's bell beside the greeting and "Turn on reminders" until it's on.
export default function TodayPage() {
  return (
    <TodayScreen
      actions={<Bell href="/s/inbox" />}
      top={
        <>
          <TurnOnRemindersCard />
          <WithShiftsToday>
            <ShiftBanner />
            <WeekCheckCard />
          </WithShiftsToday>
          <WithSummary>
            <StreakAndGoalCards />
          </WithSummary>
        </>
      }
      bottom={
        <WithSummary>
          <ContinueCard />
        </WithSummary>
      }
    />
  )
}
