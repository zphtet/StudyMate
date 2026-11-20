import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { safeNext } from '@/lib/safe-next'
import { createServerClient } from '@/lib/supabase/server'

// Magic link from the confirmation email (contracts/route-handlers.md › /auth/callback).
// Exchanges the one-time code for a session, then continues like a verified code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const fail = NextResponse.redirect(new URL('/sign-in?error=link_expired', origin))
  if (!code) return fail

  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return fail

  // The user has just proved who they are; read only their own role to pick the home screen.
  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { role: true },
  })
  const home = profile?.role === 'admin' ? '/a/welcome' : '/join'
  return NextResponse.redirect(new URL(next ?? home, origin))
}
