# Quickstart: Installable PWA and Offline Use

How to check 008 end to end. Details live in [data-model.md](data-model.md) and [contracts/](contracts/).

## 1. Prerequisites

- `.env` points at the dev Supabase project, as for 001–007. No new environment variables. The worker revision uses the git SHA, or `VERCEL_GIT_COMMIT_SHA` on Vercel.
- New packages, pinned:
  - `serwist`, `@serwist/turbopack`, `dexie`, `@tanstack/react-query-persist-client`;
  - dev: `esbuild`, `fake-indexeddb`.
- Seeded users May (student, Tokyo, with an active course that has an image and a PDF) and Zin (Admin) from the e2e fixtures.
- **The service worker only runs in a production build.** `pnpm dev` never registers it (R1).

## 2. Apply and check the database

```bash
pnpm prisma migrate deploy      # <ts>_offline_versions: submissions.client_op_id, shifts.updated_at
pnpm prisma generate
pnpm test:db                    # + supabase/tests/008_offline_versions.test.sql
```

## 3. Automated checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test        # outbox, coalescing, rebase, accepted time, eviction, install visits, persister,
                 # sync-ops per op (dev DB), /api/sync guard
rm -rf .next/cache && pnpm build && PORT=3100 pnpm start
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e tests/e2e/us1-install.spec.ts tests/e2e/us2-offline.spec.ts tests/e2e/us3-update.spec.ts
```

Before running Playwright:
- Leave the dev server on :3000 alone.
- Check that no other session is using :3100 or the dev DB.
- While developing, run one smoke test per story; run the full specs at the gate.

## 4. Manual scenarios (390×844 first, production build)

| # | Do | Expect |
| --- | --- | --- |
| 1 | Chrome DevTools → Application → Manifest | Name, icons 192/512 + maskable, standalone, no installability errors. Service worker `/serwist/sw.js` active, scope `/` |
| 2 | Open the app, close the tab, open it again | "Install StudyMate" sheet on the 2nd visit. Not now → gone. Set the clock +15 days → back |
| 3 | Safari on iPhone (or iOS user agent in DevTools) | Steps sheet with Share → Add to Home Screen instead of an Install button |
| 4 | Install, open from the home screen | Standalone, app icon and name. Tab bar clears the home bar. Top bar clears the notch. Status bar follows Light/Dark |
| 5 | As May, open a course online, wait a few seconds, then DevTools → Network → Offline | Banner "Offline — changes will sync". Every lesson of that course opens with its image and PDF. YouTube shows "Video needs a connection". A course never opened → `/~offline` or its last cached list |
| 6 | Offline: mark a lesson complete; write a draft and add a photo; Submit another lesson | "Will sync" pills, "Will submit". Banner shows "3 waiting" |
| 7 | Offline: add a shift; try Rotation | Shift saved with "Will sync". Rotation's Save is disabled with "Needs a connection" |
| 8 | Wait a few minutes, go back online | Banner "Syncing…" then gone. Progress shows the completion at the offline time. The submission's submitted time is the press time. The shift is on the server (refresh) |
| 9 | Offline, edit a draft; meanwhile as Zin (other browser) … or as May on another device, edit the same draft; then reconnect | Toast "1 change wasn't saved". The sheet shows the lesson, "Changed on another device" and the offline text with Copy. The server text is unchanged |
| 10 | Offline, complete a lesson; as Zin delete that lesson; reconnect | Dropped with "This lesson is no longer available" |
| 11 | As Zin, go offline | "Offline — showing saved data". Editors' Save buttons disabled with "Needs a connection". Lists still show |
| 12 | Offline with 2 waiting changes, Me → Sign out | Confirm "2 changes not synced yet — sign out anyway?". Cancel keeps the session. Sign out → Application → IndexedDB `studymate` gone, `pages`/`media` caches gone |
| 13 | Deploy or rebuild with a change while the app is open with a half-written draft | "Update ready — Reload" toast. Nothing reloads by itself. The draft text stays. Reload → new version |
| 14 | Turn reminders on (006), send a test push, go offline, tap it | Opens the cached lesson, or `/~offline` if it was never opened |
| 15 | DevTools → Application → Storage → simulate a low quota, open several courses | Least recently opened course's media are removed first; the current one stays |

## _review: strings for a native speaker (T054)

008 adds 40 keys: 36 `pwa.*` and 4 `errors.*` (`lesson_unavailable`, `changed_on_server`, `file_missing`, `focus_overlap`). All exist in `my` and `ja` with the same placeholders and `<share>`/`<add>` tags as `en` (`messages.test.ts` passes). Burmese and Japanese don't change the noun for a count, so `{count}` is a plain number there and plurals stay only in `en`. No string refers to a student with a pronoun.

Fixed in this review:
- `errors.changed_on_server` said "your teacher" (ဆရာ, 先生); every other string calls the role "your admin", so it now says admin in all three (သင့်အက်ဒမင်, 管理者).
- `pwa.dropped.overlap` in Burmese said အလုပ်ချိန် ("work time"); the app's word for a shift is အလုပ်ဆိုင်း (`nav.shifts`, `dayBar.shift`).
- Sign in: ログイン and ဝင်ရန်, as on the sign-in screen (`auth.signUp.signIn`), not サインイン and အကောင့်ဝင်ရန်.
- The Not-saved sheet title is one fixed phrase in every language, not a plural.

Kept the same as the rest of the app: Cancel (`common.cancel`), Sign out (`common.signOut`), Submit as 提出 / တင်သွင်း (`submission.submit`), device as 端末 / စက် (`errors.push_no_device`), offline page title as `errors.offline` (オフラインです / အင်တာနက် မရှိပါ).

| Idea | Burmese | Japanese |
| --- | --- | --- |
| Will sync / Will submit (pills) | နောက်မှ ပို့မည် / နောက်မှ တင်သွင်းမည် | あとで同期 / あとで提出 |
| Offline — changes will sync | အော့ဖ်လိုင်း — ပြောင်းလဲမှုများကို နောက်မှ ပို့မည် | オフライン — 変更はあとで同期されます |
| Syncing … | ပို့နေသည် | 同期中 |
| Editing needs a connection | ပြင်ဆင်ရန် အင်တာနက် လိုအပ်သည် | 編集には接続が必要です |
| Not saved | မသိမ်းနိုင်ခဲ့ပါ | 保存できませんでした |
| The server's version was kept | ဆာဗာ၏ ဗားရှင်းကို ထားရှိပါသည် | サーバーの内容を残しています |
| Install StudyMate / Not now | StudyMate ကို ထည့်သွင်းရန် / နောက်မှ | StudyMateをインストール / 今はしない |
| Update ready — Reload | အပ်ဒိတ် အသင့်ဖြစ်ပါပြီ — ပြန်ဖွင့်ရန် | アップデートの準備ができました — 再読み込み |

The iPhone steps (`pwa.install.iosStep1–3`) name Safari's own buttons. Japanese uses iOS's Japanese labels (共有, 「ホーム画面に追加」, 「追加」). Burmese keeps them in English (Share, Add to Home Screen, Add, Home Screen), on the assumption that the phone shows them in English.

Questions:
- Burmese "sync" is ပို့ ("send") everywhere: the pills, the banner and the sign-out warning. Does that read right for changes that are waiting to be sent, or is there a better word?
- The banner says အော့ဖ်လိုင်း (a loanword), while the offline page and `errors.offline` say အင်တာနက် မရှိပါ ("no internet"). Should one of them be used everywhere?
- Is it right that an iPhone set to Burmese shows Share and Add to Home Screen in English? If it shows Burmese words, which ones?
- Japanese "Not now" is 今はしない. Would あとで read more naturally on the install sheet?

## 5. Performance (SC-001, SC-002)

- Lighthouse (mobile) on `/s/today` of the production build: performance ≥ 90. Installability: no errors in the Manifest panel (Lighthouse 12 has no PWA category; R16).
- Cold start of the installed app with the cache warm, Moto G Power profile (4× CPU, Slow 4G): Today usable < 2 s. Measure with the Performance panel, from the start to the first Today card with data from the persisted cache.

## 6. Done means

The us1–us3 Playwright specs pass; the guard, sync-ops and pgTAP tests pass; typecheck and lint are clean; the banner, sheets and pills fit at 390×844 in all 3 languages at Large text; `specs/008-pwa-offline/spec.md` Status → Implemented.
