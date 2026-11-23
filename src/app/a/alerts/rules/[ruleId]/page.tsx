import { Screen } from '@/components/layout/screen'
import { ExistingRuleEditor } from '@/features/alerts/components/rule-editor'
import { WithRuleEditor } from '@/features/alerts/components/with-alerts'

// Edit rule (screen 26-AdminRule; spec 006 US2): the same editor with Delete rule. Another Admin's
// rule, or one that no longer exists, is a 404.
type Params = Promise<{ ruleId: string }>

export default function EditRulePage({ params }: { params: Params }) {
  return (
    <Screen>
      <WithRuleEditor ruleId={params.then((p) => p.ruleId)}>
        {({ ruleId }) => (ruleId ? <ExistingRuleEditor ruleId={ruleId} /> : null)}
      </WithRuleEditor>
    </Screen>
  )
}
