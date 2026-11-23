import { TodayScreen } from '@/features/assignments/components/with-today'
import { ContinueCard, StreakAndGoalCards } from '@/features/progress/components/today-progress'
import { ShiftBanner } from '@/features/shifts/components/shift-banner'
import { WeekCheckCard } from '@/features/shifts/components/week-check-card'
import { WithShiftsToday } from '@/features/shifts/components/with-shifts'
import { WithSummary } from '@/features/progress/components/with-progress'

// Student Today (screen 04-Today, partial): 003's due and overdue lessons with spec 004's streak and
// goal cards above them and Continue below; spec 005's shift banner and, when due, the Sunday check
// card on top.
export default function TodayPage() {
  return (
    <TodayScreen
      top={
        <>
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
