// Shared by Server Actions (src/lib/action.ts) and the client. contracts/server-actions.md › Result.

export type ActionError = { code: string; params?: Record<string, number | string> }
export type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError }

/** Thrown on the client by `unwrap` so useMutation's onError receives the action's error code. */
export class ActionResultError extends Error {
  constructor(
    public code: string,
    public params?: Record<string, number | string>,
  ) {
    super(code)
  }
}

/** Turn a Result into data or a thrown ActionResultError (for useMutation). */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data
  throw new ActionResultError(result.error.code, result.error.params)
}
