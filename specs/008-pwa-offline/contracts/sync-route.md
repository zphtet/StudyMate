# Contract: `POST /api/sync`

The one endpoint the outbox replays through (research R6, R7). Online writes keep their Server Actions (004, 005); this route is used only to replay queued ops.

## Request

```
POST /api/sync
Content-Type: application/json
Cookie: Supabase session (as every Route Handler)
```

```ts
{ ops: Op[] }   // 1..50, in the order they were made
```

Every op has the common fields:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | uuid | Op id = idempotency key |
| `type` | see below | Discriminator |
| `at` | ISO datetime | When the student acted (R8 decides whether it is used) |

| `type` | Further fields | Zod source |
| --- | --- | --- |
| `progress.complete` | `lessonId`, `base: { wasDone: boolean }` | `completeLessonSchema` + op fields |
| `progress.undo` | `lessonId`, `base: { wasDone: boolean }` | `undoCompletionSchema` + op fields |
| `submission.save` | `lessonId`, `bodyMd`, `attachments`, `base: { updatedAt: string \| null }` | `saveDraftSchema` + op fields |
| `submission.submit` | as `submission.save` | `submitAssignmentSchema` + op fields |
| `focus.record` | `lessonId`, `minutes` (15 \| 25), `startedAt`, `endedAt` | `startFocusSchema` + times |
| `focus.stop` | `sessionId` (`at` = when stopped) | `stopFocusSchema` + op fields |
| `shift.save` | `shift`: 005's `saveShiftSchema` fields, nested because the form has its own `type` (day, night, …); `base: { updatedAt: string } \| null` (null = new shift) | `saveShiftSchema` under `shift` + op fields |
| `shift.delete` | `shiftId`, `base: { updatedAt: string }` | `deleteShiftSchema` + op fields |

Each feature exports its op schemas and `apply` functions from a server-only `sync-ops.ts`:
- `features/progress/sync-ops.ts`: the `progress.*`, `submission.*` and `focus.*` ops;
- `features/shifts/sync-ops.ts`: the `shift.*` ops.

The route builds the `z.discriminatedUnion('type', …)` from them, so field rules have one source: the same Zod field schemas as the forms and Server Actions.

## Processing

1. `requireRole('student')`. Signed out → 401 `unauthenticated`. Admin → 403 `forbidden`.
2. Parse the body. A malformed body → 400 `invalid_input`, nothing applied.
3. For each op in order, call its feature's `apply(me, op, serverNow)`. `serverNow` is the app server's clock, read once per request:
   1. run the per-record guard its Server Action runs (`requireLessonReader(lessonId)`, or ownership through `where: { studentId: me.id }`);
   2. run the duplicate check, then the base check (research R7);
   3. call the same repo function as the Server Action, with the accepted time (R8);
   4. write `client_op_id = id`.

   Each op runs in its own transaction. An op that is dropped does not stop the ones after it.
4. Respond 200 with one result per op, in order.

An unexpected error in one op (not an `ActionFailure` or `AuthError`) stops the batch: the response contains results up to that op, plus `{ status: 'retry' }` for it. The client keeps it and the rest `pending`, and retries with backoff.

## Response

```ts
{
  results: Array<
    | { id: string; status: 'applied'; version?: string /* new updated_at, for rebase */ ; data?: unknown }
    | { id: string; status: 'duplicate'; version?: string }
    | { id: string; status: 'dropped'; code: ErrorCode }
    | { id: string; status: 'retry' }
  >
}
```

- `data` is what the op's Server Action returns: `{ completedAt, nextLessonId }`, `{ submissionId, status, updatedAt }`, `{ countedSeconds }` or `{ shift }`, so the client can update its cache the same way.
- `ErrorCode` is one of:
  - `lesson_unavailable`, `changed_on_server`, `file_missing`, `focus_overlap` (new in 008);
  - existing codes: `lesson_locked`, `submission_required`, `course_not_active`, `session_not_found`, `shift_not_found`, `shift_overlap`, `shift_too_long`, `content_too_long`, `too_many_images`, `invalid_input`.

  Every code has an `errors.*` key in `en`, `my` and `ja`.

## Errors (whole request)

Through `handle()` (`src/lib/http.ts`):

| Status | Code | When |
| --- | --- | --- |
| 400 | `invalid_input` | Body fails the schema, or more than 50 ops |
| 401 | `unauthenticated` | No session. The client pauses sync and shows "Sign in to sync" (R10) |
| 403 | `forbidden` | Not a student |

## Permissions

| Caller | Allowed |
| --- | --- |
| Student | Own ops only. Every record is found by `studentId: me.id`. A lesson must pass `requireLessonReader`; another student's ids → `dropped` (`lesson_unavailable` / `shift_not_found`), never applied |
| Admin | – (403). Admins have no queued writes (R14) |
| Signed out | – (401) |

## Tests

- `src/app/api/sync/route.test.ts`, against the dev DB, written first:
  - 401, 403, 400;
  - a batch with applied + dropped + applied keeps going;
  - order is kept;
  - an unexpected error stops with `retry`.
- `features/progress/sync-ops.test.ts` and `features/shifts/sync-ops.test.ts` cover every row of the research R7 table:
  - applied, duplicate (same `id` twice) and each dropped code;
  - another student's lesson or shift is never touched.
- A pure `acceptedTime(at, serverNow, base)` in `src/lib/offline/accepted-time.ts` with its unit test (R8).
