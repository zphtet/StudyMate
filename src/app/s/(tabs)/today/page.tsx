import { TodayScreen } from '@/features/assignments/components/with-today'
import { ContinueCard, StreakAndGoalCards } from '@/features/progress/components/today-progress'
import { WithSummary } from '@/features/progress/components/with-progress'

// Student Today (screen 04-Today, partial): 003's due and overdue lessons with spec 004's streak and
// goal cards above them and Continue below.
export default function TodayPage() {
  return (
    <TodayScreen
      top={
        <WithSummary>
          <StreakAndGoalCards />
        </WithSummary>
      }
      bottom={
        <WithSummary>
          <ContinueCard />
        </WithSummary>
      }
    />
  )
}
