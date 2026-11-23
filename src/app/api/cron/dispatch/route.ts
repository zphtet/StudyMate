import { handle } from '@/lib/http'
import { requireCronSecret } from '@/server/cron'
import { dispatch } from '@/server/notifications/dispatch'
import { resendSender } from '@/server/notifications/email'
import { webPushSender } from '@/server/notifications/push'

// POST /api/cron/dispatch (spec 006 contracts/route-handlers.md › Cron; research R2). Called every
// 5 minutes by pg_cron + pg_net with `Authorization: Bearer $CRON_SECRET` (quickstart.md §6), not by
// Vercel Cron. No user guard: plan.md › Complexity Tracking. Idempotent (FR-004).

export function POST(request: Request) {
  return handle(async () => {
    requireCronSecret(request)
    return dispatch(new Date(), { push: webPushSender, email: resendSender })
  })
}
