import 'server-only'
import { redirect } from 'next/navigation'
import { AuthError, requireUser } from './guards'

/** For layouts and pages: same check as requireUser(), but redirects instead of throwing. */
export async function requirePageUser() {
  try {
    return await requireUser()
  } catch (error) {
    if (error instanceof AuthError) redirect('/sign-in')
    throw error
  }
}
