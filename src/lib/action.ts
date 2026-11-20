import 'server-only'
import { ZodError, type ZodType } from 'zod'
import { AuthError } from '@/server/auth/guards'
import { isNextInternalError } from './next-errors'
import type { ActionError, Result } from './result'

// Wrappers for Server Actions (contracts/server-actions.md). Each parses its input with a Zod schema
// and returns a Result instead of throwing, so the client gets a translatable error code.
//
// - action(): guarded actions. The handler MUST call a guard from src/server/auth/guards.ts first.
// - publicAction(): the public auth actions only (sign up, confirm, sign in, reset, language), which run
//   before a user exists. Exception justified in plan.md › Complexity Tracking.

/** Expected failure with an error code from contracts/server-actions.md. */
export class ActionFailure extends Error {
  constructor(
    public code: string,
    public params?: Record<string, number | string>,
  ) {
    super(code)
  }
}

export function fail(code: string, params?: Record<string, number | string>): never {
  throw new ActionFailure(code, params)
}

function toError(error: unknown): ActionError {
  if (error instanceof ActionFailure) return { code: error.code, params: error.params }
  if (error instanceof ZodError) return { code: 'invalid_input' }
  if (error instanceof AuthError) {
    return {
      code:
        error.status === 401 ? 'unauthenticated' : error.status === 403 ? 'forbidden' : 'not_found',
    }
  }
  console.error('[action] unexpected error', error)
  return { code: 'unexpected' }
}

function wrap<I, O>(schema: ZodType<I>, handler: (input: I) => Promise<O>) {
  return async (raw: unknown): Promise<Result<O>> => {
    try {
      const input = schema.parse(raw)
      return { ok: true, data: await handler(input) }
    } catch (error) {
      // redirect()/notFound() from next/navigation must propagate.
      if (isNextInternalError(error)) throw error
      return { ok: false, error: toError(error) }
    }
  }
}

export const action = wrap
export const publicAction = wrap
