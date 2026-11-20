import { getMe } from '@/features/profile/repo'
import { handle } from '@/lib/http'
import { requireUser } from '@/server/auth/guards'

// GET /api/me (contracts/route-handlers.md). Guard first, then the caller's own data only.
export function GET() {
  return handle(async () => getMe(await requireUser()))
}
