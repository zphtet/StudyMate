import { purgeExpired } from '@/features/courses/purge'
import { handle } from '@/lib/http'
import { requireCronSecret } from '@/server/cron'

// GET /api/cron/purge (spec 002 contracts/route-handlers.md › Cron). Called daily by Vercel Cron
// (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. No user guard: plan.md ›
// Complexity Tracking.

export function GET(request: Request) {
  return handle(async () => {
    requireCronSecret(request)
    return purgeExpired(new Date())
  })
}
