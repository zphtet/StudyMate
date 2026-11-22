import { ActionResultError } from './result'

// Browser-side photo resizing before upload (spec 002 research.md R3; spec 004 research.md R7). Lesson
// images and assignment photos are shrunk to MAX_IMAGE_EDGE and re-encoded as WebP, or JPEG where the
// browser can't make WebP.

/** Long edge of an uploaded image after resizing. */
export const MAX_IMAGE_EDGE = 1600
const IMAGE_QUALITY = 0.82

/** Size that fits `max` px on the long edge, keeping the aspect ratio; smaller images stay as they are. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_EDGE) {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  return width >= height
    ? { width: max, height: Math.round((height * max) / width) }
    : { width: Math.round((width * max) / height), height: max }
}

function toBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY))
}

/**
 * Shrinks a photo to MAX_IMAGE_EDGE and re-encodes it as WebP (JPEG where WebP can't be made). A file
 * that already fits and is at most `keepUpTo` bytes is returned as it is; pass 0 to always re-encode.
 * Throws ActionResultError('upload_failed') when the browser can't draw it.
 */
export async function resizeImage(file: File, { keepUpTo }: { keepUpTo: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  if (width === bitmap.width && file.size <= keepUpTo) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ActionResultError('upload_failed')
  context.drawImage(bitmap, 0, 0, width, height)
  const webp = await toBlob(canvas, 'image/webp')
  if (webp?.type === 'image/webp') {
    bitmap.close()
    return webp
  }
  // JPEG has no transparency: paint a white background first.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const jpeg = await toBlob(canvas, 'image/jpeg')
  if (!jpeg) throw new ActionResultError('upload_failed')
  return jpeg
}
