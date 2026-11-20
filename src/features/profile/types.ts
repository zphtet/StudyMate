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
  link: null | {
    id: string
    status: 'pending' | 'active'
    admin: { id: string; displayName: string }
    requestedAt: string
  }
  notices: { id: string; key: 'admin_deleted'; sentAt: string }[]
  invite: null | { code: string; url: string }
}
