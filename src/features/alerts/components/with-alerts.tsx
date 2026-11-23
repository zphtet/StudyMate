import 'server-only'
import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { z } from 'zod'
import { PageSkeleton } from '@/components/layout/page-skeleton'
import { NotFound } from '@/lib/http'
import { Prefetched } from '@/lib/query/prefetch'
import { AuthError, requireAdminOf, requireRole } from '@/server/auth/guards'
import { getMessage } from '../messages-repo'
import { getAlerts, getAlertsData, getRule } from '../repo'
import { alertsQuery, messageQuery, ruleQuery, type AlertsScope } from '../queries'
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
  const data = await getAlertsData(me, scope === 'all' ? null : scope, new Date())
  return <Prefetched entries={[[alertsQuery(scope).queryKey, data]]}>{children(scope)}</Prefetched>
}

/** What an editor page starts from. */
export type EditorSeed = {
  /** `?student=`: a student's id or `all` */
  scope: AlertsScope
  /** The rule or message being edited */
  id: string | null
  /** `?message=`: a rule made from a message (US3 scenario 8) */
  message: string | null
}

/**
 * The rule editor and the composer: the students (Applies to, To) and, when editing, the rule or the
 * message. Someone else's is a 404.
 */
export function WithAlertsEditor({
  kind,
  id,
  searchParams,
  children,
}: {
  kind: 'rule' | 'message'
  id?: Promise<string>
  searchParams?: EditorParams
  children: (seed: EditorSeed) => ReactNode
}) {
  return (
    <Suspense fallback={<PageSkeleton header={false} />}>
      <SeedEditor kind={kind} id={id} searchParams={searchParams}>
        {children}
      </SeedEditor>
    </Suspense>
  )
}

type EditorParams = Promise<{ student?: string | string[]; message?: string | string[] }>

async function SeedEditor({
  kind,
  id,
  searchParams,
  children,
}: {
  kind: 'rule' | 'message'
  id?: Promise<string>
  searchParams?: EditorParams
  children: (seed: EditorSeed) => ReactNode
}) {
  const me = await requireRole('admin').catch(notFoundOnRefusal)
  const entries: [readonly unknown[], unknown][] = [
    [alertsQuery('all').queryKey, await getAlertsData(me, null, new Date())],
  ]

  let editing: string | null = null
  if (id) {
    const parsed = z.uuid().safeParse(await id)
    if (!parsed.success) notFound()
    editing = parsed.data
    entries.push(
      kind === 'rule'
        ? [ruleQuery(editing).queryKey, await getRule(me.id, editing).catch(notFoundOnRefusal)]
        : [
            messageQuery(editing).queryKey,
            await getMessage(me.id, editing).catch(notFoundOnRefusal),
          ],
    )
  }
  const params = searchParams ? await searchParams : {}
  const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null)
  return (
    <Prefetched entries={entries}>
      {children({
        scope: one(params.student) ?? 'all',
        id: editing,
        message: one(params.message),
      })}
    </Prefetched>
  )
}
