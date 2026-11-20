# Feature Specification: Appearance — Themes, Fonts, Dark Mode, Language

**Feature Branch**: `007-appearance`
**Created**: 2026-11-20
**Status**: Draft
**Screens**: `12-Appearance.png`, `11-Profile.png`

## User Scenarios & Testing

### User Story 1 – Choose mode, theme and font (Priority: P2)
Applies to both Students and Admins.

**Independent Test**: Pick Dark + Sakura + Nunito + Large; whole app changes instantly and the choice is restored on another device.

**Acceptance Scenarios**
1. **Given** Me → Appearance, **When** the user picks Light, Dark or Auto, **Then** the app switches immediately; Auto follows the device setting live.
2. **Given** 10 colour themes (Indigo, Ocean, Teal, Forest, Sunset, Rose, Sakura, Lavender, Slate, Mocha), **When** one is picked, **Then** accents, buttons, progress bars and charts use it in both light and dark palettes.
3. **Given** 10 fonts (Inter, Nunito, Poppins, DM Sans, Manrope, Roboto, Atkinson Hyperlegible, Merriweather, M PLUS Rounded 1c, Zen Maru Gothic), **When** one is picked, **Then** all UI text uses it; Japanese falls back to Noto Sans JP and Burmese to Noto Sans Myanmar.
4. **Given** Text size Small / Default / Large, **Then** body and lesson text scale (14 / 15 / 17 px base).
5. **Given** the live preview card at the top, **Then** it reflects every change before leaving the screen.

### User Story 2 – Choose language (Priority: P1)
**Acceptance Scenarios**
1. **Given** English / မြန်မာ / 日本語 on Me, **When** chosen, **Then** all UI strings, dates and numbers switch to that locale.

### User Story 3 – No flash of the wrong theme (Priority: P2)
**Acceptance Scenarios**
1. **Given** a returning user, **When** the app opens (even offline), **Then** the saved theme and font apply before first paint.

### Edge Cases
- A font fails to load (offline, first time) → fallback stack is used and retried later.
- Theme contrast → every theme passes 4.5:1 for text on surface and on accent in both modes (automated check).
- Organisation-wide defaults are out of scope.

## Requirements

### Functional Requirements
- **FR-001**: Settings stored on the profile: `color_mode` (light / dark / system), `theme_id`, `font_id`, `font_scale`, `locale`; synced across devices.
- **FR-002**: Theme, font and locale are mirrored to cookies so the server renders the correct `data-theme`, font class and language on first paint; dark mode uses `next-themes` (no flash).
- **FR-003**: Each theme is a token set (accent, accent-soft, on-accent, surface, border, text, muted) for light and dark; components use tokens only.
- **FR-004**: Themes are shadcn/ui CSS variables in `globals.css` (`[data-theme=…]` and `.dark[data-theme=…]`), consumed by Tailwind v4 utilities.
- **FR-005**: Fonts come from `next/font/google` (self-hosted at build, `preload: false`) so only the chosen font downloads and it works offline.
- **FR-006**: Default: Auto mode, Indigo, Inter, Default size, device language if supported else English.

### Key Entities
- **Profile** (extended): color_mode, theme_id, font_id, font_scale, locale.
- **Theme** (static config in code): id, name, light tokens, dark tokens.

## Success Criteria
- **SC-001**: Theme change applies in under 100 ms with no layout shift.
- **SC-002**: All 20 theme × mode combinations pass the automated contrast test.
