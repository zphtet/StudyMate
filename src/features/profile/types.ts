// contracts/route-handlers.md › GET /api/me
export type MeResponse = {
  id: string
  email: string
  role: 'student' | 'admin'
  displayName: string
  timezone: string
  locale: 'en' | 'my' | 'ja'
  /** spec 007 FR-001 (mode pulled into 001): light / dark / system */
  colorMode: 'light' | 'dark' | 'system'
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
