import { listInbox } from '@/features/notifications/repo'
import { inboxCursorSchema } from '@/features/notifications/schemas'
import { handle } from '@/lib/http'
import { requireUser } from '@/server/auth/guards'

// GET /api/notifications?cursor= (spec 006 contracts/route-handlers.md › Everyone): the caller's
// delivered items, newest first, 30 per page (research R9).
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const cursor = inboxCursorSchema.parse(new URL(request.url).searchParams.get('cursor'))
    return listInbox(me.id, cursor)
  })
}
