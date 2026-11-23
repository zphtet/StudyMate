import { AlertsView } from '@/features/alerts/components/alerts-view'
import { WithAlerts } from '@/features/alerts/components/with-alerts'

// The Alerts tab, "Reminders" (screen 24-AdminNotify; spec 006 US2): `?student=<id|all>`.
type SearchParams = Promise<{ student?: string | string[] }>

export default function AlertsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <WithAlerts searchParams={searchParams}>{(scope) => <AlertsView scope={scope} />}</WithAlerts>
  )
}
