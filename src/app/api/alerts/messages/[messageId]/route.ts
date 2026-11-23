import { z } from 'zod'
import { getMessage } from '@/features/alerts/messages-repo'
import { handle, NotFound } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/alerts/messages/[messageId] (spec 006 contracts/route-handlers.md › Admin): one of the
// caller's messages for the composer; 404 message_not_found otherwise.
export function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  return handle(async () => {
    const me = await requireRole('admin')
    const messageId = z.uuid().safeParse((await params).messageId)
    if (!messageId.success) throw new NotFound('message_not_found')
    return getMessage(me.id, messageId.data)
  })
}
