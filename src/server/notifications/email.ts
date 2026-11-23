import 'server-only'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'

// Email for the weekly summary only (spec 006 FR-001, FR-019; research R13), through Resend
// (constitution VII). The dispatcher sends through an EmailSender, so tests swap in a recorder
// (tests/utils/email-recorder.ts).

export type Email = { to: string; subject: string; html: string }

export type EmailSender = { send(email: Email): Promise<void> }

let client: Resend | null = null

export const resendSender: EmailSender = {
  async send({ to, subject, html }) {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM
    if (!apiKey || !from) {
      // R13: without a key or sender (local development) the email is skipped; the inbox has it.
      console.warn('[email] RESEND_API_KEY or RESEND_FROM is not set; weekly summary email skipped')
      return
    }
    client ??= new Resend(apiKey)
    const { error } = await client.emails.send({ from, to, subject, html })
    if (error) throw new Error(`[email] Resend refused the email: ${error.name} ${error.message}`)
  },
}

/**
 * Each user's sign-in address, from Supabase Auth (spec Assumptions: email goes only there). One
 * statement for any number of users.
 */
export async function emailAddresses(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>()
  const rows = await prisma.$queryRaw<{ id: string; email: string }[]>`
    select id::text, email from auth.users
    where id = any(${userIds}::uuid[]) and email is not null`
  return new Map(rows.map((row) => [row.id, row.email]))
}
