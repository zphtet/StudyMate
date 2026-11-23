import 'server-only'
import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { AuthError, requireAdminOf, requireRole } from '@/server/auth/guards'
import { getAlerts, getRule } from '../repo'
import { alertsQuery, ruleQuery, type AlertsScope } from '../queries'
import { alertsStudentSchema } from '../schemas'

// Server-side seeds for Alerts and the rule editor (spec 006 US2): the same data and guards as the
// Route Handlers, handed to the client cache. A student who isn't linked, or someone else's rule, is
// a plain 404 page. The /a layout has already checked the Admin role.

const notFoundOnRefusal = (error: unknown): never => {
  if (error instanceof AuthError || error instanceof NotFound) notFound()
  throw error
}

type SearchParams = Promise<{ student?: string | string[] }>

/**
 * `?student=<id|all>`; without one, the first linked student (24-AdminNotify.png opens on a
 * student), or All students when there is none.
 */
async function scopeOf(adminId: string, searchParams: SearchParams): Promise<AlertsScope> {
  const parsed = alertsStudentSchema.safeParse((await searchParams).student)
  if (!parsed.success) return (await getAlerts(adminId, null)).students[0]?.id ?? 'all'
  if (parsed.data !== 'all') await requireAdminOf(parsed.data).catch(notFoundOnRefusal)
  return parsed.data
}

export function WithAlerts({
  searchParams,
  children,
}: {
  searchParams: SearchParams
  children: (scope: AlertsScope) => ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SeedAlerts searchParams={searchParams}>{children}</SeedAlerts>
    </Suspense>
  )
}

async function SeedAlerts({
  searchParams,
  children,
}: {
  searchParams: SearchParams
  children: (scope: AlertsScope) => ReactNode
}) {
  const me = await requireRole('admin').catch(notFoundOnRefusal)
  const scope = await scopeOf(me.id, searchParams)
  const data = await getAlerts(me.id, scope === 'all' ? null : scope)
  return <Prefetched entries={[[alertsQuery(scope).queryKey, data]]}>{children(scope)}</Prefetched>
}

/** The editor: the students for Applies to, and the rule when editing one. */
export function WithRuleEditor({
  ruleId,
  searchParams,
  children,
}: {
  ruleId?: Promise<string>
  searchParams?: SearchParams
  children: (seed: { scope: AlertsScope; ruleId: string | null }) => ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <SeedRuleEditor ruleId={ruleId} searchParams={searchParams}>
        {children}
      </SeedRuleEditor>
    </Suspense>
  )
}

async function SeedRuleEditor({
  ruleId,
  searchParams,
  children,
}: {
  ruleId?: Promise<string>
  searchParams?: SearchParams
  children: (seed: { scope: AlertsScope; ruleId: string | null }) => ReactNode
}) {
  const me = await requireRole('admin').catch(notFoundOnRefusal)
  const all = await getAlerts(me.id, null)
  const entries: [readonly unknown[], unknown][] = [[alertsQuery('all').queryKey, all]]

  let id: string | null = null
  if (ruleId) {
    const parsed = z.uuid().safeParse(await ruleId)
    if (!parsed.success) notFound()
    id = parsed.data
    entries.push([ruleQuery(id).queryKey, await getRule(me.id, id).catch(notFoundOnRefusal)])
  }
  const student = searchParams ? (await searchParams).student : undefined
  const scope = typeof student === 'string' ? student : 'all'
  return <Prefetched entries={entries}>{children({ scope, ruleId: id })}</Prefetched>
}
