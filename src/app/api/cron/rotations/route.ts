import { topUpRotations } from '@/features/shifts/rotation-repo'
import { handle } from '@/lib/http'
import { requireCronSecret } from '@/server/cron'

// GET /api/cron/rotations (spec 005 contracts/route-handlers.md › Cron; research R4). Called daily by
// Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`; keeps every active rotation
// 8 weeks ahead. No user guard: plan.md › Complexity Tracking.

export function GET(request: Request) {
  return handle(async () => {
    requireCronSecret(request)
    return topUpRotations(new Date())
  })
}
