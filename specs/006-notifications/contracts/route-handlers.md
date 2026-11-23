# Contract: Route Handlers — 006

GET endpoints feed TanStack Query (`queryOptions` in each feature's `queries.ts`); they use `handle()` and call their guard first. The cron route is the only POST.

## Shared types

```ts
type InboxItem = {
  id: string
  title: string
  body: string
  url: string | null
  deliveredAt: string            // ISO
  read: boolean
}

type RuleView = {
  id: string
  studentId: string | null      // null = all students
  trigger: RuleTrigger
  config: RuleConfig             // schemas.ts
  message: string
  push: boolean
  copyMe: boolean
  enabled: boolean
  isDefault: boolean             // 003's default set
  owner: { id: string; displayName: string }   // for a student's read-only list
}

type MessageView = {
  id: string
  body: string
  lesson: { id: string; title: string } | null
  mode: 'now' | 'fixed' | 'next_free'
  urgent: boolean
  status: 'scheduled' | 'sent' | 'cancelled'
  recipients: {
    student: { id: string; displayName: string; timezone: string }
    deliverAt: string            // planned (ISO)
    state: 'scheduled' | 'delivered' | 'read'   // from the notifications row; a held row is still 'scheduled' (data-model.md › Derived values)
  }[]
}
```

## Everyone

### GET `/api/notifications?cursor=`
Guard `requireUser()`. `{ items: InboxItem[]; nextCursor: string | null }`: delivered rows of the caller, newest first, 30 per page.

### GET `/api/notifications/unread`
Guard `requireUser()`. `{ unread: number }`. Refetched on focus and on a service-worker message (R9).

### GET `/api/me/reminders`
Guard `requireUser()`.
```ts
{
  quietHours: { start: string; end: string } | null
  personal: RuleView[]            // students only; [] for Admins
  fromAdmin: RuleView[]           // students: the Admin's rules that apply to them (read-only, FR-016); [] for Admins
}
```

## Admin

### GET `/api/alerts?student=<id|all>`
Guard `requireRole('admin')`; `requireAdminOf(student)` unless `all`.
```ts
{
  students: { id: string; displayName: string; timezone: string }[]   // the chips
  scheduled: MessageView[]          // status 'scheduled', soonest first, for that student (or all)
  recent: MessageView[]             // sent or cancelled this week (local Mon–Sun of the Admin), newest first: read status after sending (spec US3 s6), cancelled ones shown as such (Edge Cases)
  sentThisWeek: number              // "Sent: 4 this week"
  rules: RuleView[]                 // owned by the caller; for a student: theirs + "all students" ones
}
```

### GET `/api/alerts/rules/[ruleId]` · GET `/api/alerts/messages/[messageId]`
Guard `requireRole('admin')`; scoped to `ownerId` / `adminId: me.id`. 404 `rule_not_found` / `message_not_found`.

### GET `/api/alerts/availability?students=<id,id>&at=<ISO>`
Guard `requireRole('admin')` + `requireAdminOf` each. One statement (R11).
```ts
{ students: { id: string; state: 'free' | 'shift' | 'sleep' | 'quiet'; nextFree: string }[] }
```
`sleep` covers sleep blocks and outside waking hours.

## Cron

### POST `/api/cron/dispatch`
`requireCronSecret` (R15); called every 5 minutes by `pg_cron` + `pg_net` (quickstart §6). Runs `dispatch(new Date())`:
```ts
{
  occurrences: number             // rule rows created
  handedOver: number              // message recipients moved
  postponed: number
  lapsed: number
  delivered: number
  pushes: number
  removedDevices: number
}
```
Idempotent: a second call in the same minute delivers nothing new (FR-004).
