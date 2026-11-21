import { PlanScreen } from '@/features/assignments/components/with-plan'

// Admin Plan (screen 22-AdminPlan; spec 003 US2, US4).
// ?student=<id>&view=week|month&week=<monday>&month=<YYYY-MM> (research R10).
export default function PlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <PlanScreen searchParams={searchParams} />
}
