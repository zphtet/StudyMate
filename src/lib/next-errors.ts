/**
 * Errors Next.js uses for control flow (redirect(), notFound(), "this route is dynamic" during
 * prerender…). They carry a string `digest` and must be re-thrown, never turned into a response.
 */
export function isNextInternalError(error: unknown): boolean {
  return typeof (error as { digest?: unknown } | null)?.digest === 'string'
}
