import { z } from 'zod'
import { getRule } from '@/features/alerts/repo'
import { handle, NotFound } from '@/lib/http'
import { requireRole } from '@/server/auth/guards'

// GET /api/alerts/rules/[ruleId] (spec 006 contracts/route-handlers.md › Admin): one of the caller's
// rules for the editor; 404 rule_not_found otherwise.
export function GET(_request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  return handle(async () => {
    const me = await requireRole('admin')
    const ruleId = z.uuid().safeParse((await params).ruleId)
    if (!ruleId.success) throw new NotFound('rule_not_found')
    return getRule(me.id, ruleId.data)
  })
}
