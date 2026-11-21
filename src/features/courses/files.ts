// Stable app URL of a stored lesson file (spec 002 research.md R3). The Route Handler
// /api/lesson-files/[resourceId]/[name] checks access and redirects to a short-lived signed URL;
// the name is for display and type detection only. Parentheses are escaped too, so the URL is safe
// inside Markdown `![name](url)`.
export const lessonFileUrl = (resourceId: string, name: string) =>
  `/api/lesson-files/${resourceId}/${encodeURIComponent(name).replace(
    /[()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`

/** Markdown for an inline image or audio file; brackets in the name can't end the alt text early. */
export const inlineMediaMarkdown = (resourceId: string, name: string) =>
  `![${name.replace(/[[\]\\]/g, '\\$&')}](${lessonFileUrl(resourceId, name)})`
