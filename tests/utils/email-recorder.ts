import type { Email, EmailSender } from '@/server/notifications/email'

// An EmailSender for tests (spec 006 research R13): records every email instead of sending it.

export function emailRecorder() {
  const sent: Email[] = []
  const sender: EmailSender = {
    async send(email) {
      sent.push(email)
    },
  }
  return { sender, sent }
}
