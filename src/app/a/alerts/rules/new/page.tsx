import { Screen } from '@/components/layout/screen'
import { NewRuleEditor } from '@/features/alerts/components/rule-editor'
import { WithAlertsEditor } from '@/features/alerts/components/with-alerts'

// New rule (screen 26-AdminRule; spec 006 US2 scenarios 1, 2): `?student=<id|all>` from the Alerts
// chip, and `?message=` from the composer's "Make it a rule instead" (US3 scenario 8). Full screen,
// no tab bar; the /a layout checks the Admin role.
type SearchParams = Promise<{ student?: string | string[]; message?: string | string[] }>

export default function NewRulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen>
      <WithAlertsEditor kind="rule" searchParams={searchParams}>
        {({ scope, message }) => <NewRuleEditor scope={scope} message={message} />}
      </WithAlertsEditor>
    </Screen>
  )
}
