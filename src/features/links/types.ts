// contracts/route-handlers.md › GET /api/invites/preview
export type InvitePreview = {
  admin: { displayName: string }
  /** The admin's Active courses ("Admin · 3 courses ready"). */
  activeCourses: number
}

// contracts/route-handlers.md › GET /api/admin/students (requests), served at
// /api/admin/students/requests because spec 003 already answers /api/admin/students.
export type JoinRequest = {
  linkId: string
  student: { id: string; displayName: string }
  requestedAt: string
}
