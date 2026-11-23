import { Screen } from '@/components/layout/screen'
import { NewRuleEditor } from '@/features/alerts/components/rule-editor'
import { WithRuleEditor } from '@/features/alerts/components/with-alerts'

// New rule (screen 26-AdminRule; spec 006 US2 scenarios 1, 2): `?student=<id|all>` from the Alerts
// chip. Full screen, no tab bar; the /a layout checks the Admin role.
type SearchParams = Promise<{ student?: string | string[] }>

export default function NewRulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Screen>
      <WithRuleEditor searchParams={searchParams}>
        {({ scope }) => <NewRuleEditor scope={scope} />}
      </WithRuleEditor>
    </Screen>
  )
}
