// contracts/route-handlers.md › GET /api/admin/overview
export type AdminOverview = {
  invite: { code: string; url: string }
  checklist: {
    courseCreated: boolean
    studentInvited: boolean
    courseAssigned: boolean
    remindersOn: boolean
  }
  done: number
}
