import { createHash, timingSafeEqual } from 'node:crypto'
import { topUpRotations } from '@/features/shifts/rotation-repo'
import { handle, HttpError } from '@/lib/http'

// GET /api/cron/rotations (spec 005 contracts/route-handlers.md › Cron; research R4). Called daily by
// Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`; keeps every active rotation
// 8 weeks ahead. No user guard: plan.md › Complexity Tracking. Same check as 002's purge route.

/** Hashing first gives equal-length buffers, so timingSafeEqual never throws or leaks the length. */
const digest = (value: string) => createHash('sha256').update(value).digest()

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header) return false
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}

export function GET(request: Request) {
  return handle(async () => {
    if (!authorized(request)) throw new HttpError(401, 'unauthenticated')
    return topUpRotations(new Date())
  })
}
