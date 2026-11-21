import { createHash, timingSafeEqual } from 'node:crypto'
import { purgeExpired } from '@/features/courses/purge'
import { handle, HttpError } from '@/lib/http'

// GET /api/cron/purge (spec 002 contracts/route-handlers.md › Cron). Called daily by Vercel Cron
// (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. No user guard: plan.md ›
// Complexity Tracking. The secret is compared in constant time.

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
    return purgeExpired(new Date())
  })
}
