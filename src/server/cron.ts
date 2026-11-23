import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { HttpError } from '@/lib/http'

// The guard for cron Route Handlers, which run without a user (plan.md › Complexity Tracking):
// 002's purge, 005's rotations and 006's dispatcher. Callers send `Authorization: Bearer
// $CRON_SECRET` (Vercel Cron, or pg_cron + pg_net). Extracted on its third use (006 research R15).

/** Hashing first gives equal-length buffers, so timingSafeEqual never throws or leaks the length. */
const digest = (value: string) => createHash('sha256').update(value).digest()

/** Throws a 401 `HttpError` unless the request carries the cron secret. Compared in constant time. */
export function requireCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header || !timingSafeEqual(digest(header), digest(`Bearer ${secret}`))) {
    throw new HttpError(401, 'unauthenticated')
  }
}
