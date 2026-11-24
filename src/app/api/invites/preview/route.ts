import { inviteCodeSchema } from '@/features/links/schemas'
import { getInvitePreview } from '@/features/links/repo'
import { handle, NotFound } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/invites/preview?code= (contracts/route-handlers.md): the admin's name and Active course
// count behind an active code. 404 code_not_found for an unknown or replaced code.
export function GET(request: Request) {
  return handle(async () => {
    await requireRole('student')
    const code = inviteCodeSchema.parse(new URL(request.url).searchParams.get('code') ?? '')
    const preview = await getInvitePreview(code)
    if (!preview) throw new NotFound('code_not_found')
    return preview
  })
}
