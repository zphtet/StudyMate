/** The share link behind an invite code (contracts/route-handlers.md › GET /api/me `invite.url`). */
export const inviteUrl = (code: string) =>
  `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/join/${code}`
