# Contract: Server Actions — 007

Actions use 001's `action(schema, fn)` wrapper, return `Result<T>` and call their guard first; the caller's id comes from the guard. Schemas live in `src/features/profile/schemas.ts`, shared with the Appearance view. The id lists come from `src/lib/appearance.ts`, the one source for themes, fonts and sizes.

## Field schemas

```ts
colorMode = z.enum(['light', 'dark', 'system'])                  // 001, unchanged
themeId   = z.enum(themeIds)   // indigo, ocean, teal, forest, sunset, rose, sakura, lavender, slate, mocha
fontId    = z.enum(fontIds)    // inter, nunito, poppins, dm-sans, manrope, roboto, atkinson, merriweather, m-plus-rounded, zen-maru
textSize  = z.enum(['small', 'default', 'large'])                // ↔ font_scale 0.93 / 1.00 / 1.13

type Appearance = { colorMode: ColorMode; themeId: ThemeId; fontId: FontId; textSize: TextSize }
```

## `saveAppearance(input)` — new, replaces 001's `setColorMode`

```ts
input = { colorMode?, themeId?, fontId?, textSize? }   // at least one ('invalid_input')
→ Result<Appearance>                                   // the saved values, all four
```
- Guard `requireUser()`.
- `prisma.profile.update({ where: { id: me.id }, data })`, with `textSize` mapped to `fontScale`.
- Writes the `appearance` cookie from the returned values (data-model.md › Device state).
- Errors: `invalid_input` (empty or unknown value, from Zod), `unexpected`. No new error codes.
- `setColorMode` and `colorModeSchema`'s object wrapper are deleted; the Appearance view's Mode control calls `saveAppearance({ colorMode })`.

## Changed: preference cookies (001)

`setPreferenceCookies(profile)` in `src/features/auth/preferences.ts` also writes `appearance` when it is given the four fields. `signIn` and `verifyEmailCode` select `colorMode`, `themeId`, `fontId`, `fontScale` with `locale` and `timezone` and pass them; `signUp` has no profile yet and leaves the device's cookie alone, and a brand-new account's profile holds the defaults (`system.indigo.inter.default`). Their results are unchanged. Because the forms then navigate client-side (`router.replace`), `sign-in-form.tsx` and `verify-email-form.tsx` apply the new cookie (`applyAppearance` + `setTheme`) before navigating (research R1).

`setLocale` and `updateProfile` are unchanged.
