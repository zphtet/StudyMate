import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findSubmissionFile } from '@/features/progress/repo'
import { handle, NotFound } from '@/lib/http'
import { createServerClient } from '@/lib/supabase/server'
import { AuthError, requireSubmissionReviewer, requireUser } from '@/server/auth/guards'

// GET /api/submissions/[submissionId]/files/[name] (spec 004 contracts/route-handlers.md, research.md
// R7): a stable URL for one assignment photo. The student who owns the submission, or their linked
// Admin when it isn't a Draft (requireSubmissionReviewer). Redirects to a 1-hour signed URL made with
// the caller's own Supabase client, so Storage RLS applies as well. Anything else is 404.

const SIGNED_URL_SECONDS = 60 * 60
const paramsSchema = z.object({ submissionId: z.uuid(), name: z.string().min(1).max(200) })

export function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string; name: string }> },
) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = paramsSchema.safeParse(await params)
    if (!parsed.success) throw new NotFound('file_not_found')
    const { submissionId, name } = parsed.data

    if (me.role === 'admin') {
      await requireSubmissionReviewer(submissionId).catch((error: unknown) => {
        if (error instanceof AuthError && error.status === 404) throw new NotFound('file_not_found')
        throw error
      })
    }
    // Students only find their own submissions; the basename must be one of its attachments.
    const path = await findSubmissionFile(submissionId, name, me.role === 'student' ? me.id : null)
    if (!path) throw new NotFound('file_not_found')

    const supabase = await createServerClient()
    const { data, error } = await supabase.storage
      .from('submissions')
      .createSignedUrl(path, SIGNED_URL_SECONDS)
    if (error || !data) throw new NotFound('file_not_found')

    return NextResponse.redirect(data.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  })
}
