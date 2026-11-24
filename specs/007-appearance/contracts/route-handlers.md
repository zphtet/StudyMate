# Contract: Route Handlers — 007

No new routes. One response grows.

## GET `/api/me` (001, extended)

Guard `requireUser()` (unchanged). `MeResponse` gains three fields next to `colorMode`:

```ts
type MeResponse = {
  // … 001–006 fields unchanged
  colorMode: 'light' | 'dark' | 'system'
  themeId: ThemeId          // new
  fontId: FontId            // new
  textSize: TextSize        // new: from font_scale (0.93 → 'small', 1.00 → 'default', 1.13 → 'large')
}
```

The repo selects `themeId`, `fontId` and `fontScale` with the existing columns. The `/s` and `/a` layouts already load `me` and pass these four values to `AppearanceSync`. The Appearance view and the Me row read them from `meQuery`.
