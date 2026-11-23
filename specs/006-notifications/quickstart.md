# Quickstart: Notifications — Rules and Scheduled Messages

How to check 006 end to end. Details live in [data-model.md](data-model.md) and [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the dev Supabase project and sets `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `RESEND_API_KEY` and `NEXT_PUBLIC_SITE_URL` (all present). Add `RESEND_FROM` (development: Resend's test sender).
- `pnpm install` after the plan's two new packages (`web-push`, `resend`).
- Phone notifications need HTTPS on a real phone (a deployed preview, or a tunnel to the production build). `localhost` works on desktop Chrome.

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy      # the 006 migration (rename, delivery columns, policies, backfill)
pnpm prisma generate
pnpm test:db                    # + supabase/tests/006_notification_policies.test.sql
```
Check: `select count(*) from notifications where delivered_at is null` is 0 right after the migration (old notices are backfilled as delivered).

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint
pnpm test        # occurrences, renderMessage, quickTimes, bundle, rule configs;
                 # dispatch (postpone, urgent, bundle, lapse, de-dupe), actions
pnpm test:e2e    # us1-inbox, us2-rules, us3-messages, us5-my-reminders (390×844 + 1280×800, axe)
```
Run Playwright against a production build on :3100 (`pnpm build && PORT=3100 pnpm start`, then `PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e`); leave the dev server on :3000 alone. While developing, run one smoke test per story.

Run the dispatcher by hand:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3100/api/cron/dispatch
```

## 4. Manual scenarios (phone width, 390×844)

Seed: Admin Zin (Asia/Yangon), student May (Asia/Tokyo), linked; May has a course with deadlines, a night shift tonight 22:00–07:00 with 8 h sleep, and the default reminders.

1. **Turn on (US1)**: as May on Android Chrome, Today → Turn on reminders → allow. Me shows "Reminders on this device: On". On an iPhone in Safari (not added to the Home Screen) the Add to Home Screen guide shows instead; after adding and opening from the Home Screen, Turn on works.
2. **Notices (US1)**: Zin asks for a redo on May's submission. Within 5 minutes (or after the dispatch call) May's phone shows "… needs redo"; the bell shows 1; tapping opens the lesson and clears the count.
3. **Rules (US2)**: Zin → Alerts → May: the default rules are listed. Turn off Streak at risk; edit Daily to 20:00 Mon–Fri; "Send test to my phone" arrives on Zin's phone only.
4. **Held during a shift (US4)**: schedule a message to May for 23:00 May's time: the composer warns "May is on shift then" and offers "Send at 15:30 instead". Keep 23:00 → it arrives at 15:30 the next day. The same message marked Urgent arrives at 23:00.
5. **Lapse (US4)**: with May on shift from 21:00, Streak at risk at 21:30 never arrives (it lapses at midnight) and isn't in the inbox.
6. **Bundle (US4)**: two lessons due in 2 h at the same time → one phone notification "2 reminders", two inbox rows.
7. **Compose (US3)**: Message → May → template "Today's lesson" → Opens: a lesson → 15:00 shows "tomorrow" after 15:00 Tokyo; switch to "My time · Yangon" and back; Schedule. Alerts lists it with Edit and Cancel send; after delivery the card shows "Read" once May opens it.
8. **Quiet hours (US5)**: May sets quiet hours 12:00–13:00 and a personal reminder "Kanji 10 min" at 12:30 daily: it arrives at 13:00. My reminders lists Zin's rules read-only ("Set by Zin").
9. **Admin's own hours**: Zin sets quiet hours 22:00–07:00; May submits at 23:00 Yangon → Zin is notified at 08:00, when both Zin's quiet hours and night (default waking hours 08:00–23:00) are over.
10. **Sign out**: May signs out on the phone; a new notice for May doesn't reach that phone; the inbox still has it after signing back in.
11. **Weekly summary**: a Weekly summary rule for Sunday 18:00 to both → May and Zin get the inbox item and an email with the week's numbers.
12. **Languages**: switch May to ja and Zin to my: notification texts, the inbox and the editors are in each person's language; times in each person's zone.

## 5. Done means

- The acceptance scenarios of US1–US5 pass (Playwright for the screens, repo tests for delivery timing; SC-002 and SC-003 in `dispatch.test.ts`).
- pgTAP and guard tests pass; typecheck and lint are clean.
- Alerts, the rule editor, the composer, Today's bell, Me and the inbox match their screenshots at 390×844, apart from the differences in contracts/ui-routes.md.
- `docs/data-model.md` and `docs/technical-spec.md` are updated (plan.md › Documentation updates).
- Spec status is updated.

## 6. Deploy: schedule the dispatcher

Once per environment, in the Supabase SQL editor (the URL is the deployment's; the secret is stored in Vault, never in a migration):
```sql
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
select cron.schedule('dispatch-notifications', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<your-domain>/api/cron/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')))
$$);
```
