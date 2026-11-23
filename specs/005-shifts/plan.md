# Implementation Plan: Shift Calendar and Availability

**Branch**: `005-shifts` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-shifts/spec.md`. It was clarified on 2026-11-22 with five answers:
- changing or deleting a rotation replaces its untouched future shifts and keeps past and hand-edited ones;
- one set of preset times per student;
- the Sunday check is an in-app card until 006 adds push;
- no shift longer than 24 h;
- one active rotation per student.

Planning added four Edge Cases to the spec: an Off day is free time; a rotation skips days the student already filled; deleting a generated shift leaves the day Off; changing presets or sleep length regenerates the rotation's future days. Two screenshot details are left out on purpose (contracts/ui-routes.md): "Every Friday" on the editor and "Night shift tonight · active 2 h ago" on the admin card.

## Summary

Students enter their work shifts (Day, Evening, Night, Off, Custom; overnight shifts are one record), optionally block sleep after a shift, set up a repeating rotation that fills 8 weeks ahead, and see a month calendar and a 24 h timeline of shift, sleep and free time per day. Today shows a shift banner and a Sunday "Next week's shifts — correct?" check. Admins see each linked student's live status ("On night shift until 07:00", "Sleeping until 15:30", "Free now", "No shift info"); 003's Plan already draws the shift / sleep / free bars from the same data.

Most of the availability logic already exists: `0_init` has the `shifts` and `shift_patterns` tables with the overlap and 24 h rules and their RLS, `busy_segments()` and `next_free_at()`; a later migration has `status_at()` / `status_now()`; 003 built `lib/availability.ts`, `DayBar` and `CalendarMonth`. The feature adds:
- a migration: per-student preset times and the Sunday-check week on `profiles`; `generated_until` on rotations and `presets` dropped; an Off-has-no-sleep CHECK; one active rotation per student (research R2–R4, R9);
- 6 Server Actions, 4 student Route Handlers, a status field on 004's admin cards endpoint, and a daily cron route for the rotation top-up;
- pure, unit-tested modules: `shiftInstants` (in `lib/time.ts`), `rotation`, `calendar`, `timeline`, `week-check`, `status-text`, plus `fast-check` property tests of the availability segments (SC-002);
- the Shifts screen, the shift and rotation editors, the settings sheet, the Today banner and check card, the Me row, the Admin status line.

Notifications (and SC-003) are 006's; offline edits are 008's.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node ≥ 20.9

**Primary Dependencies**: no additions (research R13). Uses what's installed: Next.js 16.4, React 19.3, Prisma 7.10, TanStack Query 5.108, Zod 4, next-intl 4, Tailwind CSS 4.3, shadcn/ui (`sheet`, `toggle-group` for the type picker, `alert-dialog`), `date-fns` 4.4 and `@date-fns/tz` 1.5; `fast-check` 4 (dev) for property tests.

**Storage**:
- Supabase Postgres via Prisma: writes `shifts`, `shift_patterns`, `profiles` (shift settings, `shifts_confirmed_week`); reads `busy_segments()` and `status_now()` with `$queryRaw` (one statement each per screen).
- No Storage, no Realtime.

**Testing**:
- pgTAP (`pnpm test:db`): the new CHECK and index, `busy_segments` with Off days, shift and rotation RLS (student own rows; linked Admin read-only; others nothing).
- Vitest: unit tests written first for the pure modules (Tokyo, Yangon +06:30, New York daylight saving); `fast-check` properties for SC-002; repo tests against the dev DB (overlap, generation, change/delete, settings regeneration, cron idempotence).
- Playwright: US1–US4 at 390×844 and 1280×800 with axe, production build on :3100.

**Target Platform**: mobile browsers first (iOS Safari 16.4+, Android Chrome), then desktop; hosted on Vercel (one more daily Cron entry).

**Project Type**: web application (single Next.js app)

**Performance Goals**:
- Adding a night shift takes ≤ 3 taps from Shifts (SC-001): Add shift, Night, Save shift.
- `/s/shifts` is one request per month (shifts + merged segments); changing the selected day needs no request.
- Saving a rotation (≤ 56 days of rows) is one transaction with one bulk insert.
- `/a/students` keeps a fixed number of queries: one more statement for all statuses.
- Lighthouse performance ≥ 90 on `/s/shifts` (mobile).

**Constraints**:
- no local Supabase or Docker;
- Prisma bypasses RLS, so guards come first;
- all local-time conversion uses the student's profile zone on the server;
- one record per shift (constitution IV);
- the overlap rule stays a database constraint;
- no push or inbox until 006; no offline queue until 008.

**Scale/Scope**: a student has up to ~40 shifts a month and one rotation of ≤ 28 days; an admin has a few dozen students. Screens: 4 student routes (1 replaced, 3 new), 3 changed screens (Today, Me, Admin Students), 1 sheet. Everything in 3 languages.

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | How 005 complies | Pre | Post |
| --- | --- | --- | --- |
| I. Two roles, explicit permissions | Permission table below. Student writes take the id from the guard and match rows with `studentId: me.id`. The Admin only reads (status on the cards; 003's Plan). The existing RLS (`shifts_student`, `shifts_admin_read`, `patterns_*`) already applies the same rules; pgTAP now covers them. | ✅ | ✅ |
| II. Spec first | 5 recorded clarifications; the four planning edge cases are in the spec; screenshot differences are listed in contracts/ui-routes.md. | ✅ | ✅ |
| III. Test-first | Unit tests before each pure module; property tests for SC-002; pgTAP for the new CHECK, index and the shift RLS; repo tests; one Playwright spec per user story. | ✅ | ✅ |
| IV. Time | Shifts stored as UTC instants, one record each (overnight included); local date + clock time converted on the server in the student's zone; durations from instants (daylight saving); Admin sees the student's time first with "· yours" beside it. | ✅ | ✅ |
| V. Mobile-first, accessible, themeable | 390 px first; 44 px targets; the type picker is a radio group; calendar days have full accessible names; new `--shift-*` tokens in the contrast test. | ✅ | ✅ |
| VI. Three languages | All strings in `en`/`my`/`ja`; times and dates via next-intl. | ✅ | ✅ |
| VII. Stack | Constitution libraries only; Prisma for every table and function call; reads via Route Handlers + `queryOptions`; writes via Server Actions + Zod; cron via a Route Handler like 002's purge. | ✅ | ✅ |
| Quality gates | typecheck, lint, test, test:e2e, test:db and build pass; screenshots matched; spec status updated. | ✅ | ✅ |

### Permissions

| Action | Student | Admin | Guard |
| --- | --- | --- | --- |
| Add, edit, delete own shifts | ✓ | – | `requireRole('student')` + `studentId: me.id` |
| Save or delete own rotation | ✓ | – | `requireRole('student')` |
| Edit shift settings, answer the Sunday check | ✓ own | – | `requireRole('student')` |
| Read shifts, segments, Today banner | ✓ own | – | `requireRole('student')` |
| Live status of a student | – | ✓ linked students | `requireRole('admin')` + links scope (004 cards) |
| Plan bars and clashes (003) | – | ✓ linked students | `requireAdminOf` (unchanged) |
| Rotation top-up | cron only | cron only | `CRON_SECRET` |

## Project Structure

### Documentation (this feature)

```text
specs/005-shifts/
├── spec.md              # clarified spec
├── plan.md              # this file
├── research.md          # Phase 0 decisions R1–R13
├── data-model.md        # entities, derived values, lifecycles, migration, guards
├── quickstart.md        # prerequisites, commands, manual scenarios
├── contracts/
│   ├── route-handlers.md
│   ├── server-actions.md
│   └── ui-routes.md
└── tasks.md             # next step (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── s/(tabs)/shifts/page.tsx                 # replaces the placeholder
│   ├── s/shifts/new/page.tsx · [shiftId]/page.tsx · rotation/page.tsx   # new
│   ├── s/(tabs)/today/page.tsx                  # + shift banner, Sunday check card
│   ├── s/(tabs)/me/page.tsx                     # + Shift calendar row
│   └── api/
│       ├── shifts/route.ts · [shiftId]/route.ts · settings/route.ts · today/route.ts
│       └── cron/rotations/route.ts
├── features/shifts/
│   ├── actions.ts            # saveShift, deleteShift, saveRotation, deleteRotation,
│   │                         # saveShiftSettings, confirmShiftWeek
│   ├── repo.ts (+ .test)     # shifts, overlap lookup, settings, today banner
│   ├── rotation-repo.ts (+ .test)  # generate, replace, top-up
│   ├── queries.ts · schemas.ts (+ .test) · types.ts
│   ├── rotation.ts · calendar.ts · timeline.ts · week-check.ts · status-text.ts (each + .test)
│   └── components/           # see contracts/ui-routes.md
├── features/progress/
│   ├── admin-repo.ts         # + status per card (one statement)
│   └── components/student-progress-card.tsx   # + status line
├── features/assignments/components/today-view.tsx   # + ShiftBanner, WeekCheckCard (from features/shifts)
├── features/profile/components/me-view.tsx         # + Shift calendar row
├── server/availability.ts    # getBusySegments moved from features/assignments/plan-repo.ts
├── lib/
│   ├── time.ts (+ .test)     # + shiftInstants
│   └── availability.test.ts  # + fast-check properties (SC-002)
├── app/globals.css           # + --shift-day/evening/night/custom (+ -foreground)
└── i18n/messages/{en,my,ja}.json  # shifts, shiftEditor, rotation, shiftSettings, shiftBanner,
                                   # weekCheck, availabilityStatus, errors.*, validation.*

prisma/
├── schema.prisma                  # + Profile.shiftPresets, shiftsConfirmedWeek; ShiftPattern.generatedUntil, − presets
└── migrations/<UTC timestamp>_shifts/migration.sql

supabase/tests/005_shift_policies.test.sql
tests/e2e/us1-shifts · us2-rotation · us3-day · us4-availability .spec.ts
tests/e2e/fixtures/courses.ts      # seedShift gains type 'off' and patternId/overridden; + seedRotation
vercel.json                        # + /api/cron/rotations daily
```

**Structure Decision**: One Next.js app, as in 001–004. Shifts get their own feature folder, `src/features/shifts`.
- The availability rules stay in SQL (`busy_segments`, `status_now`); TypeScript only shapes them for display (`lib/availability.ts`, 003).
- `getBusySegments` moves from 003's `plan-repo.ts` to `src/server/availability.ts` before 005 uses it (second user), as its own commit with no behaviour change.
- The Admin status joins 004's card query instead of a new endpoint, so the Students screen keeps one request.
- Today and Me compose the shifts queries next to their own, as 004 did.

**Documentation updates in this feature**:
- `docs/data-model.md`: the new profile and rotation columns, the Off CHECK, the one-active index, presets on the profile; the rotation lifecycle.
- `docs/technical-spec.md`:
  - §3: `features/shifts`, `server/availability.ts`;
  - the overnight helper line now points at the real `shiftInstants` in `lib/time.ts`;
  - the cron list: `/api/cron/rotations`;
  - §11: the `--shift-*` tokens.
- `specs/005-shifts/spec.md`: Status → Implemented when done.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Dropping `shift_patterns.presets` | Presets are per student (clarification 2); keeping the column would leave a second, unused source | Ignoring it would mislead the next reader. The table is empty on dev (checked 2026-11-22), and the column is a Prisma field, not a SQL-only object. |
| A cron Route Handler without a user guard | The daily rotation top-up runs with no user | Same pattern and secret check as 002's purge; topping up on read would put writes inside GET requests. |
