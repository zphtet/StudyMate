# Feature Specification: Appearance — Themes, Fonts, Text Size

**Feature Branch**: `007-appearance`
**Created**: 2026-11-20
**Status**: Implemented
**Input**: User description: "007-appearance" (the draft spec written at project setup, refined)
**Screens**: `12-Appearance.png` (Appearance), `11-Profile.png` (Me: the Appearance row and Language)

## Clarifications

### Session 2026-11-24
- Q: When someone picks Small or Large text, should every piece of text in the app change size, or only body text and lesson content? → A: All text scales together: headings, buttons, tab labels, body and lessons (FR-008).
- Q: Does a colour theme recolour backgrounds and text, or only the accent? → A: Accent only: buttons, links, selected states, soft accent highlights, focus rings, progress and charts. Backgrounds, cards, borders and body text are the same neutral colours in every theme (FR-003).
- Q: Does the phone's status bar or browser bar colour follow the theme? → A: It follows Light or Dark only (the app's background), not the theme's accent (FR-015).
- Q: When appearance was changed on another device, may this device show its old look for a moment before switching? → A: Yes, once: on the first open after a change made elsewhere. When nothing changed elsewhere, the saved look shows from the first frame (FR-009, SC-003).

## User Scenarios & Testing

Appearance is the same for both roles: a Student opens it from Me at `/s/me/appearance`, an Admin from Me at `/a/me/appearance`. Each person's choice belongs to their account and follows them to every device.

Already delivered in 001 and kept as regression checks here (US4): the **Mode** choice (Light / Dark / Auto) and the **Language** buttons on Me. The current Appearance screen shows Mode and a note that "more is coming"; 007 replaces the note with the rest of 12-Appearance.png.

### User Story 1 – Pick a colour theme (Priority: P1)
A student or Admin opens Me → Appearance and picks one of 10 colour themes. The whole app takes on that colour at once, in light and dark mode, and their other devices show it too.

**Why this priority**: It's the main thing the screen offers and the part the app's colours depend on; fonts and text size build on the same screen.

**Independent Test**: As May, open Appearance, pick Sakura: the preview card, the buttons, progress bars, tab bar and charts across the app turn Sakura. Switch to Dark: still Sakura, in its dark palette. Sign in as May on a second browser: it opens in Sakura.

**Acceptance Scenarios**
1. **Given** Me → Appearance, **Then** the screen shows, top to bottom: a preview card, Mode, "Colour theme · {current}", "Font · {current}" and Text size (12-Appearance.png).
2. **Given** the 10 themes Indigo, Ocean, Teal, Forest, Sunset, Rose, Sakura, Lavender, Slate and Mocha shown as named colour swatches in two rows of five, **When** the user taps one, **Then** it is marked selected (a ring and a check), the heading shows its name, and the app's accent colour changes immediately — no Save button.
3. **Given** a theme is chosen, **Then** everything drawn in the accent colour uses it: primary buttons, links, selected tabs and chips, focus rings, progress bars, the heat calendar and charts, the preview card.
4. **Given** a theme in Dark mode, **Then** it uses that theme's dark palette, and switching Mode keeps the theme.
5. **Given** status colours (overdue, done, needs redo, warnings, destructive actions such as Sign out or Delete), **Then** they keep their meaning and colour whatever the theme.
6. **Given** the user picked a theme on one device, **When** they next open the app on another device where they're signed in, **Then** it shows that theme.
7. **Given** Me, **Then** the Appearance row shows the theme's swatch and "{Theme} · {Font} · {Mode}", e.g. "Indigo · Inter · Auto" (11-Profile.png).

---

### User Story 2 – Pick a font and text size (Priority: P2)
The user picks the typeface they find easiest to read and makes text smaller or larger.

**Why this priority**: Comfort and accessibility (dyslexia-friendly and larger text), after the theme.

**Independent Test**: Pick Atkinson Hyperlegible and Large: Today, a lesson and Shifts all show text in Atkinson Hyperlegible and bigger; Japanese text in the lesson uses a Japanese face, Burmese UI text a Burmese face; nothing is cut off at phone width.

**Acceptance Scenarios**
1. **Given** 10 fonts — Inter, Nunito, Poppins, DM Sans, Manrope, Roboto, Atkinson Hyperlegible, Merriweather, M PLUS Rounded 1c and Zen Maru Gothic — shown as tiles in two columns, each with "Aa" and its name written in that font, **When** the user taps one, **Then** it is selected and all text in the app uses it.
2. **Given** a font without Japanese or Burmese letters, **Then** Japanese text falls back to Noto Sans JP and Burmese text to Noto Sans Myanmar, so no text ever shows as empty boxes.
3. **Given** Text size Small / Default / Large, **When** one is picked, **Then** all text in the app scales together: Default is today's size, Small about 7% smaller, Large about 13% larger (the 14 / 15 / 17 px steps of the design).
4. **Given** Large, **Then** every screen still works at 390 px wide: no text is clipped or overlaps, nothing scrolls sideways, and tap targets stay at least 44 px.
5. **Given** the preview card, **Then** it shows each change of font and size before the user leaves the screen.

---

### User Story 3 – The right look from the first frame (Priority: P2)
A returning user opens the app and sees their own theme, mode, font and size straight away, never a flash of the default Indigo or a jump from one font to another.

**Why this priority**: A flash on every open makes a personal theme feel broken; it matters most on slow phones.

**Independent Test**: Choose Dark + Forest + Nunito + Large, then reload Today, Courses and the sign-in page several times on a throttled connection: the first painted frame is already dark Forest with large Nunito text.

**Acceptance Scenarios**
1. **Given** a returning user on a device that has used the app, **When** any page opens, **Then** the saved theme, mode, font and text size apply before the first paint.
2. **Given** the sign-in and sign-up pages on that device, **Then** they also use the device's last look.
3. **Given** a device signing in to the account for the first time, **Then** the account's appearance applies from the first screen after sign-in.
4. **Given** the chosen font is still downloading, **Then** text shows at once in a fallback face of similar size and switches when the font arrives, without moving the layout noticeably.
5. **Given** the user changed their appearance on another device, **When** they open the app here, **Then** it switches to the new look once on that open, and every later open shows it from the first frame.

---

### User Story 4 – Mode and language keep working (delivered in 001)
Regression checks only; no new behaviour.

**Acceptance Scenarios**
1. **Given** Mode Light, Dark or Auto, **Then** the app switches immediately; Auto follows the device's setting live while the app is open.
2. **Given** English / မြန်မာ / 日本語 on Me, **When** one is chosen, **Then** all UI text, dates and numbers switch to that language, including everything on the Appearance screen.

### Edge Cases
- **Saving fails** (no connection, server error): the change is undone on screen and an error message says it wasn't saved. (Changes made offline and sent later come with 008.)
- **Two devices change appearance at nearly the same time**: the last change saved wins, and each device shows it the next time it opens.
- **The chosen font can't be downloaded** (offline, first time): text uses the fallback face; the font is tried again on the next open.
- **Theme accents close to red** (Sunset, Rose, Sakura): status colours and destructive buttons stay distinguishable because they also carry a label or icon, never colour alone.
- **Japanese fonts with Burmese text** (M PLUS Rounded 1c, Zen Maru Gothic): Burmese falls back to Noto Sans Myanmar; **Merriweather** (serif) with Japanese falls back to Noto Sans JP.
- **Long Burmese or Japanese strings at Large size**: they wrap rather than truncate wherever a full label matters (buttons, row labels, headings).
- **Contrast**: every theme passes 4.5:1 for text on its background in both modes; a theme that can't is adjusted, not shipped.
- **Code blocks in lessons** keep a monospace face whatever the font choice.
- **Organisation-wide defaults** and per-device appearance are out of scope.

## Requirements

### Functional Requirements
- **FR-001**: Each user (Student and Admin) has their own appearance: mode (light / dark / auto), colour theme, font and text size, saved to their account and applied on every device they sign in on. Language stays as 001 built it.
- **FR-002**: The Appearance screen offers, in order: a preview card, Mode, Colour theme, Font and Text size (12-Appearance.png). Every choice applies immediately and is saved without a Save button.
- **FR-003**: There are 10 colour themes (Indigo, Ocean, Teal, Forest, Sunset, Rose, Sakura, Lavender, Slate, Mocha), each with a light and a dark palette. A theme sets only the accent colours: primary buttons, links, selected states, soft accent highlights, focus rings, progress bars and charts. Backgrounds, cards, borders and body text are the same neutral colours in every theme; status colours follow FR-004.
- **FR-004**: Status colours — overdue/late, done, needs redo, warnings and destructive actions — are the same in every theme.
- **FR-005**: In each of the 20 theme × mode combinations, every text colour reaches 4.5:1 contrast on the backgrounds it is used on. An automated check covers all 20.
- **FR-006**: There are 10 fonts (Inter, Nunito, Poppins, DM Sans, Manrope, Roboto, Atkinson Hyperlegible, Merriweather, M PLUS Rounded 1c, Zen Maru Gothic). The chosen font is used for all UI and lesson text except code, with Noto Sans JP for Japanese and Noto Sans Myanmar for Burmese wherever the font lacks those letters.
- **FR-007**: Outside the Appearance screen, a device downloads only the chosen font (plus the Japanese or Burmese fallback when that text appears). On the Appearance screen each font tile may load just enough of its font to show its own name.
- **FR-008**: Text size has three steps — Small, Default, Large — scaling all text together (about 93% / 100% / 113% of today's size). Every screen stays usable at 390 px with Large (no clipping, overlap or sideways scrolling; tap targets ≥ 44 px).
- **FR-009**: The device keeps the last-known appearance so the saved theme, mode, font and size apply before the first paint on every page, including sign-in and sign-up. When the account's appearance differs from what the device kept (changed on another device), the device switches to the account's once, on that open, and keeps it from then on; that one switch may be visible.
- **FR-010**: Defaults for a new account: Auto mode, Indigo, Inter, Default size. A signed-out device that has never been used shows these defaults.
- **FR-011**: The preview card is a sample Today card — a time-of-day greeting with the viewer's name, a "6-day streak" chip, the lesson "Particles は vs が" with "JLPT N4 Grammar · 15 min · 私は学生です。", a progress bar, and "Focus 15" and "Mark complete" buttons. It uses sample content, not the viewer's data, and its buttons do nothing. Admins see the same card.
- **FR-012**: The Me row "Appearance" shows the chosen theme's swatch and "{Theme} · {Font} · {Mode}" (11-Profile.png).
- **FR-013**: Theme names, section headings and size labels are translated in English, Burmese and Japanese; font names are shown as written by their designers and not translated.
- **FR-014**: If saving a change fails, the screen returns to the saved value and shows an error message.
- **FR-015**: The phone's status bar and the browser bar follow Light or Dark (the app's background colour), not the colour theme.

### Permissions

| Action | Student | Admin |
|---|---|---|
| See and change their own appearance | ✓ | ✓ |
| See or change anyone else's appearance | – | – |

### Key Entities
- **Profile** (extended use; the fields exist since the initial schema): colour mode, theme, font, text size and language, per person.
- **Theme** (fixed list in the app): id, display name, swatch colour, light accent palette, dark accent palette.
- **Font** (fixed list in the app): id, display name, fallback for Japanese and for Burmese.

## Success Criteria

### Measurable Outcomes
- **SC-001**: A theme or mode change shows across the visible screen within 0.1 s of the tap, with no content moving.
- **SC-002**: All 20 theme × mode combinations pass the automated 4.5:1 contrast check.
- **SC-003**: For a returning user whose appearance wasn't changed on another device, the first painted frame of any page already shows their saved theme, mode and text size, in 10 out of 10 reloads on a throttled mobile connection.
- **SC-004**: With Large text, every screen of both roles at 390 × 844 shows no clipped text and no sideways scrolling.
- **SC-005**: Opening any page other than Appearance downloads at most one Latin UI font, plus a Japanese or Burmese fallback only when that text is on the page.
- **SC-006**: A user can find and change theme, font and size in under 30 seconds from Me, with no Save step.

## Assumptions
- Mode (Light / Dark / Auto) and Language were built in 001 (owner decision 2026-11-20); 007 doesn't change them beyond showing Mode on the redesigned screen and adding theme and font to the Me row.
- Another signed-in device picks up a change when the app is next opened or reloaded there; live push of appearance changes between open devices isn't needed.
- "Even offline" (draft US3) depends on 008, which caches the app for offline use; 007 makes sure the look is known on the device without asking the server.
- Text sizes follow the draft's 14 / 15 / 17 px steps as ratios of today's Default size, so Default screens keep matching the existing screenshots.
- The preview card's sample text is the same in every language except the translated greeting, buttons and chip; the lesson title stays as in the design to show Japanese in the chosen font.
- Organisation-wide defaults, custom colours and per-device appearance are out of scope.
