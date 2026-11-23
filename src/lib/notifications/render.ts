// Rule and message text as the Admin (or student) wrote it, with its variables filled in for one
// recipient (spec 006 FR-005; research R12). Pure and client-safe: the dispatcher renders deliveries
// with it and the rule editor's preview uses it too. Callers pass `due` already formatted in the
// student's zone and language.

type Variable = 'name' | 'lesson' | 'course' | 'due'
export type MessageValues = Partial<Record<Variable, string | null>>

/** A variable, optionally wrapped in quotes: "…", “…”, '…', ‘…’ or 「…」. */
const VARIABLE = /(["“'‘「]?)\{(name|lesson|course|due)\}(["”'’」]?)/g
const PAIRS: Record<string, string> = { '"': '"', '“': '”', "'": "'", '‘': '’', '「': '」' }

/**
 * Fills `{name}`, `{lesson}`, `{course}` and `{due}`. A variable with no value is left out with its
 * quotes, never shown as `{lesson}` (Edge Cases), and the spaces around it are tidied. Unknown braces
 * stay as written. One pass, so a value that looks like a variable is never filled again.
 */
export function renderMessage(text: string, values: MessageValues) {
  let isMissing = false
  const filled = text.replace(VARIABLE, (_match, open: string, key: Variable, close: string) => {
    const value = values[key]
    if (value) return `${open}${value}${close}`
    isMissing = true
    // Drop the quotes only when they are a pair around the variable.
    return open && PAIRS[open] !== close ? open + close : ''
  })
  if (!isMissing) return filled
  return filled
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?;:、。！？])/g, '$1')
    .trim()
}
