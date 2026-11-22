// Markdown size limit shared by lesson content (spec 002 data-model.md Lesson.contentMd, database
// CHECK octet_length <= 204800) and assignment answers (spec 004 data-model.md Submission.body_md).

export const MAX_CONTENT_BYTES = 204_800

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length
