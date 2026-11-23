import { unreadCount } from '@/features/notifications/repo'
import { handle } from '@/lib/http'
import { requireUser } from '@/server/auth/guards'

// GET /api/notifications/unread (spec 006 contracts/route-handlers.md › Everyone): the bell's count,
// refetched on focus and when the service worker reports a push (research R9).
export function GET() {
  return handle(async () => ({ unread: await unreadCount((await requireUser()).id) }))
}
