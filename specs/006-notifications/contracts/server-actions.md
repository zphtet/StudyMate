# Contract: Server Actions — 006

Actions live in `src/features/notifications/actions.ts` (devices, inbox, quiet hours, personal reminders) and `src/features/alerts/actions.ts` (the Admin's rules and messages). They use 001's `action(schema, fn)` wrapper, return `Result<T>` and call their guard first. Ids of the caller come from the guard. Every student id named in input is checked with `requireAdminOf`. Schemas are in each feature's `schemas.ts`, shared with the forms.

## Field schemas

```ts
clockTime  = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)   // HH:mm, the student's zone
weekday    = z.int().min(1).max(7)                           // ISO, 1 = Monday
ruleConfig = z.discriminatedUnion('trigger', [               // data-model.md › config by trigger
  { trigger: 'daily', time: clockTime, days: weekday[] (1–7, unique) },
  { trigger: 'after_shift', hours: 0.5–12 (step 0.5) },
  { trigger: 'due_soon', offsets_h: int[] 1–3 items, each 1–72, unique },
  { trigger: 'overdue', repeat_time: clockTime, max: int 1–7 },
  { trigger: 'streak_risk', time: clockTime },
  { trigger: 'inactive', days: int 1–14, to: ('student'|'admin')[] (1–2) },
  { trigger: 'weekly_summary', weekday, time: clockTime, to: ('student'|'admin')[] (1–2) },
])
message    = z.string().trim().min(1).max(500)               // rules ('messageEmpty', 'messageTooLong')
body       = z.string().trim().min(1).max(1000)              // one-off messages
```

## Devices and inbox (`features/notifications`)

### `savePushSubscription(input)`
```ts
input = { endpoint: z.url(), keys: { p256dh: string, auth: string }, deviceLabel?: string (≤ 60) }
→ Result<{ on: true }>
```
- Guard `requireUser()`. Upsert by `endpoint`; `user_id = me.id` (moves a row another user had; R8); `last_seen_at = now`.

### `deletePushSubscription(input)`
```ts
input = { endpoint: z.url() } → Result<{ on: false }>
```
- Guard `requireUser()`; deletes only `where: { endpoint, userId: me.id }`.

### `signOut(input)` (001, extended)
```ts
input = { endpoint?: z.url() }
```
- Deletes this device's subscription of the caller before signing out (FR-014).

### `markNotificationRead(input)`
```ts
input = { id: uuid } → Result<{ unread: number }>
```
- Guard `requireUser()`; `where: { id, userId: me.id, deliveredAt: { not: null } }`. Idempotent. Not found → `notification_not_found`.

### `markAllNotificationsRead()`
- Guard `requireUser()`. All delivered unread rows of the caller. → `Result<{ unread: 0 }>`.

### `saveQuietHours(input)`
```ts
input = { start: clockTime, end: clockTime } | { start: null, end: null }  // refine start ≠ end ('quietSameTimes')
→ Result<{ quietStart: string | null, quietEnd: string | null }>
```
- Guard `requireUser()` (both roles; R14).

### `savePersonalReminder(input)` / `deletePersonalReminder({ id })`
```ts
input = { id?: uuid, message, time: clockTime, days: weekday[], enabled: boolean }
→ Result<{ rule: RuleView }>
```
- Guard `requireRole('student')`. Writes `owner_id = student_id = me.id`, `trigger = 'daily'`, `channels = ['push']`; other students' or Admin rules → `rule_not_found`.

## Rules (`features/alerts`)

### `saveRule(input)`
```ts
input = {
  id?: uuid
  studentId: uuid | null        // null = all my students (FR-020)
  config: ruleConfig            // includes trigger
  message
  push: boolean                 // channel 'push'
  copyMe: boolean               // channel 'copy' (FR-018)
}
→ Result<{ rule: RuleView }>
```
- Guard `requireRole('admin')`; `requireAdminOf(studentId)` when set. Editing matches `{ id, ownerId: me.id }`; a default rule edited keeps `preset: 'default'` (so 003 doesn't recreate it).

### `setRuleEnabled({ id, enabled })` · `deleteRule({ id })`
- Guard `requireRole('admin')`; `{ id, ownerId: me.id }` → `rule_not_found`. Turning on never back-fills missed occurrences (US2 scenario 4).

### `sendTestPush({ config, message, studentId })`
- Guard `requireRole('admin')`. Renders the message with sample values (the student's name, a lesson of theirs or a sample) and pushes to the caller's own devices only; no inbox row (US2 scenario 5). No device → `push_no_device`. The Admin busy now (`next_free_at(me, now) > now`: quiet hours or outside waking hours) → `push_quiet_now`, nothing pushed (constitution IV).

## Messages (`features/alerts`)

### `scheduleMessage(input)` · `updateMessage(input & { id })`
```ts
input = {
  studentIds: uuid[] (1–50, unique)
  body
  lessonId?: uuid               // a Published lesson the students can read
  when:
    | { mode: 'now' }
    | { mode: 'fixed', at: z.iso.datetime() }          // the browser converts the chosen clock to an instant
    | { mode: 'next_free' }
  urgent: boolean
}
→ Result<{ message: MessageView }>
```
- Guard `requireRole('admin')` + `requireAdminOf` for each student.
- `fixed` in the past → `message_time_past`.
- Recipient `deliver_at`: `now`, `at`, or that student's `next_free_at(now)` (R11).
- Update: only recipients not handed over yet (`delivered_at` null); a message fully handed over → `message_already_sent`. The dispatcher hands recipients over up to 10 minutes before their `deliver_at` (research R2 step 2), so editing closes then.

### `cancelMessage({ id })`
- Guard `requireRole('admin')`. Deletes recipients not handed over yet; status → `cancelled` (or `sent` if some already went). `message_not_found` / `message_already_sent`.

## Errors (`errors.*`, all three languages)

`notification_not_found`, `rule_not_found`, `message_not_found`, `message_already_sent`, `message_time_past`, `push_no_device`, `push_quiet_now`. Validation keys (`validation.*`): `messageEmpty`, `messageTooLong`, `daysEmpty`, `offsetsInvalid`, `quietSameTimes`, `recipientsEmpty`.
