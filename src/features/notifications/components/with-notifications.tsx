import 'server-only'
import { Prefetched } from '@/lib/query/prefetch'
import { requirePageUser } from '@/server/auth/page-guard'
import { inboxQuery, myRemindersQuery, unreadQuery } from '../queries'
import { getMyReminders, listInbox, unreadCount } from '../repo'
import { Inbox } from './inbox'
import { MyReminders } from './my-reminders'

// Server-side seed for the inbox (spec 006 US1; research R9): the first page and the unread count,
// read with the caller's id, the same as the Route Handlers (the role layout already checked the user).
export async function SeedInbox() {
  const me = await requirePageUser()
  const [page, unread] = await Promise.all([listInbox(me.id, null), unreadCount(me.id)])
  return (
    <Prefetched
      entries={[
        [inboxQuery.queryKey, { pages: [page], pageParams: [null] }],
        [unreadQuery.queryKey, { unread }],
      ]}
    >
      <Inbox />
    </Prefetched>
  )
}

/** Server-side seed for My reminders (US5): the same data as GET /api/me/reminders. */
export async function SeedMyReminders() {
  const me = await requirePageUser()
  const reminders = await getMyReminders(me)
  return (
    <Prefetched entries={[[myRemindersQuery.queryKey, reminders]]}>
      <MyReminders studentName={me.displayName} />
    </Prefetched>
  )
}
