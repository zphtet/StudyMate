import { Screen } from '@/components/layout/screen'
import { RecentlyDeletedView } from '@/features/courses/components/recently-deleted-view'
import { WithRecentlyDeleted } from '@/features/courses/components/with-admin-course'

// Recently deleted (spec 002 US3 scenario 3; contracts/ui-routes.md).
export default function RecentlyDeletedPage() {
  return (
    <Screen>
      <WithRecentlyDeleted>
        <RecentlyDeletedView />
      </WithRecentlyDeleted>
    </Screen>
  )
}
