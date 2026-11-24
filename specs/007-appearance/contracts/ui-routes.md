# Contract: UI routes — 007

Rules for every screen: phone first (390×844), tap targets ≥ 44 px at every text size, theme tokens only, all text from the message files.

| Route | What | Screenshot |
| --- | --- | --- |
| `/s/me/appearance` · `/a/me/appearance` | the full Appearance screen (replaces 001's Mode + note) | `12-Appearance.png` |
| `/s/me` · `/a/me` | the Appearance row shows the swatch and "{Theme} · {Font} · {Mode}" | `11-Profile.png` |
| every page, signed in or out | the saved look applies before the first paint (pre-paint script) | – |
| `/s/*` and `/a/*` layouts | `AppearanceSync` replaces `ThemeSync` | – |

## Appearance screen

Top to bottom, inside the existing sub-page header (Back, "Appearance"):

1. **Preview card** (FR-011): rounded card. "Good evening, May" (the viewer's name, time of day) with a "6-day streak" chip on the right; "Particles は vs が"; "JLPT N4 Grammar · 15 min · 私は学生です。"; a progress bar at 60%; "Focus 15" (outline look) and "Mark complete" (primary look) side by side, drawn as styled `span`s, not buttons. Not interactive: the card is `role="img"` with `aria-label` "Preview", so it is read as one image and nothing inside it takes focus.
2. **Mode**: "Mode" heading and the 001 three-way control (Light / Dark / Auto), `role="radiogroup"`.
3. **Colour theme**: heading "Colour theme · {name}". 10 swatches in a 5-column grid, each a 44 px+ round button with the name under it (`role="radio"`, `aria-checked`, accessible name = theme name). Selected: a 2 px ring in the theme colour with a gap, a white check inside, bold name.
4. **Font**: heading "Font · {name}". 10 tiles in 2 columns, each ≥ 56 px high: "Aa" and the font name, both in that font. Selected: `border-primary` (2 px) and `bg-accent`. `role="radio"`.
5. **Text size**: "Text size" heading and a three-way control like Mode (Small / Default / Large), each label shown at its own size.

Every change applies immediately (no Save). While a save is in flight the control stays usable; on error the previous value comes back and a toast shows the error (FR-014).

## Me row

`SettingsRow` with a 20 px round swatch as its icon, label "Appearance", value "{Theme} · {Font} · {Mode}" (e.g. "Indigo · Inter · Auto"), chevron. Same on both roles' Me.

## Intentional differences from the screenshots

- The screenshot's preview card is May's Today card; the preview always shows the sample lesson and a "6-day streak" chip, for Admins too (FR-011).
- Text size labels are each drawn at their own size (Small smaller, Large larger), as in the screenshot; Default is the selected look.
- Theme swatches are 44 px, not the screenshot's 36 px, for the tap-target minimum (constitution V). The grid keeps five per row at 390 px.
