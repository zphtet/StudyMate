import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthError } from '@/server/auth/guards'
import { isNextInternalError } from './next-errors'

// Route Handler wrapper (contracts/route-handlers.md): JSON body on success; errors as
// { error: { code, message } } with 400/401/403/404. The handler MUST call a guard first.

export class NotFound extends Error {
  constructor(public code: string) {
    super(code)
  }
}

const json = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status })

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await fn()
    if (body instanceof Response) return body
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (isNextInternalError(error)) throw error
    if (error instanceof ZodError) return json(400, 'invalid_input', 'Invalid input')
    if (error instanceof NotFound) return json(404, error.code, 'Not found')
    if (error instanceof AuthError) {
      if (error.status === 401) return json(401, 'unauthenticated', error.message)
      if (error.status === 403) return json(403, 'forbidden', error.message)
      return json(404, 'not_found', error.message)
    }
    console.error('[route] unexpected error', error)
    return json(500, 'unexpected', 'Something went wrong')
  }
}
