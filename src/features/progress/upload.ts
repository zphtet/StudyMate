import { resizeImage } from '@/lib/image'
import { ActionResultError } from '@/lib/result'
import { MAX_IMAGE_BYTES, type Attachment } from './schemas'

// Assignment photos (spec 004 FR-003, research.md R7). The browser resizes each photo to 1600 px and
// re-encodes it, then uploads it with the student's own token to
// `submissions/<studentId>/<lessonId>/<uuid>.<ext>` (Storage RLS: their own folder). saveDraft then
// records `{ path, name, size }`. The bucket enforces the same 2 MB and WebP/JPEG limits.

const BUCKET = 'submissions'

/** supabase-js loads on the first photo, not with the lesson screen (spec 004 T082). */
const bucket = async () =>
  (await import('@/lib/supabase/client')).createBrowserClient().storage.from(BUCKET)
/** The bucket's allowed_mime_types; anything else (PNG, HEIC…) is re-encoded. */
const STORED_TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }
/** Photos straight from a phone camera may be large before they are resized. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024

/** The shown name: the picked file's name, 1–200 characters. */
function displayName(name: string, extension: string) {
  const trimmed = name.trim() || `photo.${extension}`
  return trimmed.length > 200 ? `${trimmed.slice(0, 190)}.${extension}` : trimmed
}

/**
 * Resizes and uploads one photo; returns the attachment for saveDraft. Throws ActionResultError with
 * file_type_not_allowed, file_too_large (over 2 MB after resizing), upload_failed or offline.
 */
export async function uploadSubmissionImage(
  studentId: string,
  lessonId: string,
  file: File,
): Promise<Attachment> {
  if (!file.type.startsWith('image/')) throw new ActionResultError('file_type_not_allowed')
  if (file.size > MAX_SOURCE_BYTES) throw new ActionResultError('file_too_large')

  let body: Blob
  try {
    // Only WebP or JPEG files that already fit may skip re-encoding.
    body = await resizeImage(file, { keepUpTo: file.type in STORED_TYPES ? MAX_IMAGE_BYTES : 0 })
  } catch (error) {
    if (error instanceof ActionResultError) throw error
    throw new ActionResultError('file_type_not_allowed') // the browser can't decode it
  }
  const extension = STORED_TYPES[body.type]
  if (!extension) throw new ActionResultError('file_type_not_allowed')
  if (body.size > MAX_IMAGE_BYTES) throw new ActionResultError('file_too_large')

  const path = `${studentId}/${lessonId}/${crypto.randomUUID()}.${extension}`
  const { error } = await (
    await bucket()
  ).upload(path, body, { contentType: body.type, upsert: false })
  if (error) throw new ActionResultError(navigator.onLine ? 'upload_failed' : 'offline')
  return { path, name: displayName(file.name, extension), size: body.size }
}

/** Deletes a photo the student removed (research.md R7). Throws offline / upload_failed. */
export async function removeSubmissionImage(path: string) {
  const { error } = await (await bucket()).remove([path])
  if (error) throw new ActionResultError(navigator.onLine ? 'upload_failed' : 'offline')
}
