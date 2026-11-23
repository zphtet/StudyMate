import { Screen } from '@/components/layout/screen'
import { NewComposer } from '@/features/alerts/components/composer'
import { WithAlertsEditor } from '@/features/alerts/components/with-alerts'

// New message (screen 25-AdminMessage; spec 006 US3): `?student=` preselects the student (from the
// Alerts chip or "Send a nudge"). Full screen, no tab bar; the /a layout checks the Admin role.
type SearchParams = Promise<{ student?: string | string[] }>

export default function NewMessagePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen>
      <WithAlertsEditor kind="message" searchParams={searchParams}>
        {({ scope }) => <NewComposer scope={scope} />}
      </WithAlertsEditor>
    </Screen>
  )
}
