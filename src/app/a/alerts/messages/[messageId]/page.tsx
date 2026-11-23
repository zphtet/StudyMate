import { Screen } from '@/components/layout/screen'
import { ExistingComposer } from '@/features/alerts/components/composer'
import { WithAlertsEditor } from '@/features/alerts/components/with-alerts'

// Edit message (screen 25-AdminMessage; spec 006 FR-006): until it is sent. Another Admin's
// message, or one that no longer exists, is a 404.
type Params = Promise<{ messageId: string }>

export default function EditMessagePage({ params }: { params: Params }) {
  return (
    <Screen>
      <WithAlertsEditor kind="message" id={params.then((p) => p.messageId)}>
        {({ id }) => (id ? <ExistingComposer messageId={id} /> : null)}
      </WithAlertsEditor>
    </Screen>
  )
}
