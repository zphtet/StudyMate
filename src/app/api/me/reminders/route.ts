import { getMyReminders } from '@/features/notifications/repo'
import { handle } from '@/lib/http'
import { requireUser } from '@/server/auth/guards'

// GET /api/me/reminders (spec 006 contracts/route-handlers.md › Everyone): quiet hours for both
// roles; a student's own reminders and their Admin's rules, read-only (US5; FR-016).
export function GET() {
  return handle(async () => getMyReminders(await requireUser()))
}
