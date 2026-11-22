import { resizeImage } from '@/lib/image'
import { createBrowserClient } from '@/lib/supabase/client'
import { ActionResultError } from '@/lib/result'
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, type ResourceInput } from './schemas'

// Lesson file uploads from the browser (spec 002 research.md R3). The browser uploads with the
// admin's own token (Storage RLS: owner of the course folder, lesson in that course); the Server
// Action addLessonResource then records the row. The bucket enforces the same size and type limits.

const BUCKET = 'lesson-files'

/** Photos straight from a phone may be larger than 10 MB before they are resized. */
const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024
/** Re-encoded by the canvas; GIFs keep their animation, so they are uploaded as they are. */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
}

export type UploadKind = 'file' | 'image' | 'audio'
export type FileProblem = 'file_too_large' | 'file_type_not_allowed'

/** Size and type checks before uploading (data-model.md LessonResource.sizeBytes, R3 allow-list). */
export function checkFile(
  file: { size: number; type: string },
  { resizes = false }: { resizes?: boolean } = {},
): FileProblem | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return 'file_type_not_allowed'
  const limit = resizes && RESIZABLE.has(file.type) ? MAX_SOURCE_IMAGE_BYTES : MAX_FILE_BYTES
  return file.size > limit ? 'file_too_large' : null
}

/** File extension for the storage path: from the type when known, else from the name. */
export function extensionFor(name: string, type: string) {
  const fromType = EXTENSION_BY_TYPE[type]
  if (fromType) return fromType
  const dot = name.lastIndexOf('.')
  const fromName = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  return /^[a-z0-9]{1,5}$/.test(fromName) ? fromName : 'bin'
}

/** data-model.md LessonResource.storagePath: `<courseId>/<lessonId>/<uuid>.<ext>`. */
export const storagePathFor = (
  courseId: string,
  lessonId: string,
  extension: string,
  id: string = crypto.randomUUID(),
) => `${courseId}/${lessonId}/${id}.${extension}`

/** Name shown to students (1–200 chars). Inline audio keeps an audio extension, which is how the
 *  Markdown renderer recognises it. */
function displayName(name: string, extension: string, kind: UploadKind) {
  let result = name.trim() || `file.${extension}`
  if (kind === 'audio' && !result.toLowerCase().endsWith(`.${extension}`)) {
    result = `${result}.${extension}`
  }
  if (result.length > 200) result = `${result.slice(0, 190)}.${extension}`
  return result
}

/**
 * Checks, resizes (inline images) and uploads one file; returns the input for addLessonResource.
 * Throws ActionResultError with file_too_large, file_type_not_allowed, upload_failed or offline.
 */
export async function uploadLessonFile({
  courseId,
  lessonId,
  file,
  kind,
}: {
  courseId: string
  lessonId: string
  file: File
  kind: UploadKind
}): Promise<Extract<ResourceInput, { storagePath: string }>> {
  const resizes = kind === 'image' && RESIZABLE.has(file.type)
  const problem = checkFile(file, { resizes })
  if (problem) throw new ActionResultError(problem)

  const body = resizes ? await resizeImage(file, { keepUpTo: MAX_FILE_BYTES }) : file
  if (body.size > MAX_FILE_BYTES) throw new ActionResultError('file_too_large')
  const type = body.type || file.type
  const extension = extensionFor(file.name, type)
  const storagePath = storagePathFor(courseId, lessonId, extension)

  const { error } = await createBrowserClient()
    .storage.from(BUCKET)
    .upload(storagePath, body, { contentType: type, upsert: false })
  if (error) throw new ActionResultError(navigator.onLine ? 'upload_failed' : 'offline')

  return { kind, name: displayName(file.name, extension, kind), storagePath, sizeBytes: body.size }
}

/** Removes an uploaded file whose row could not be recorded. Best effort. */
export async function discardUpload(storagePath: string) {
  await createBrowserClient().storage.from(BUCKET).remove([storagePath])
}
