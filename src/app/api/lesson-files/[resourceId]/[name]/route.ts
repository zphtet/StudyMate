import { NextResponse } from 'next/server'
import { z } from 'zod'
import { findLessonFile } from '@/features/courses/lesson-repo'
import { handle, NotFound } from '@/lib/http'
import { createServerClient } from '@/lib/supabase/server'
import { AuthError, requireLessonOwner, requireUser } from '@/server/auth/guards'

// GET /api/lesson-files/[resourceId]/[name] (spec 002 contracts/route-handlers.md › Files,
// research.md R3): a stable URL for Markdown and attachment lists. Checks access, then redirects to a
// 1-hour signed URL made with the caller's own Supabase client, so Storage RLS applies as well.
// `[name]` is for display and type detection only. Links have no file → 404.

const SIGNED_URL_SECONDS = 60 * 60

export function GET(_request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  return handle(async () => {
    await requireUser()
    const id = z.uuid().safeParse((await params).resourceId)
    const file = id.success ? await findLessonFile(id.data) : null
    if (!file) throw new NotFound('file_not_found')

    await requireLessonOwner(file.lessonId).catch((error: unknown) => {
      if (error instanceof AuthError && error.status === 404) throw new NotFound('file_not_found')
      throw error
    })

    const supabase = await createServerClient()
    const { data, error } = await supabase.storage
      .from('lesson-files')
      .createSignedUrl(file.storagePath, SIGNED_URL_SECONDS)
    if (error || !data) throw new NotFound('file_not_found')

    return NextResponse.redirect(data.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  })
}
