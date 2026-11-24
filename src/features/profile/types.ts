import type { ColorMode, FontId, TextSize, ThemeId } from '@/lib/appearance'

// contracts/route-handlers.md › GET /api/me
export type MeResponse = {
  id: string
  email: string
  role: 'student' | 'admin'
  displayName: string
  timezone: string
  locale: 'en' | 'my' | 'ja'
  /** Spec 007 FR-001 (contracts/route-handlers.md › GET /api/me): the account's look. */
  colorMode: ColorMode
  themeId: ThemeId
  fontId: FontId
  textSize: TextSize
  /** Spec 004 FR-008: study days a week the student aims for (1–7). */
  weeklyGoalDays: number
  link: null | {
    id: string
    status: 'pending' | 'active'
    admin: { id: string; displayName: string }
    requestedAt: string
  }
  notices: { id: string; key: 'admin_deleted'; sentAt: string }[]
  invite: null | { code: string; url: string }
}
