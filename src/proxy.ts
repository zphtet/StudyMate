import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE, hasLocale, matchAcceptLanguage } from '@/i18n/locales'

// Session refresh + OPTIMISTIC role routing (research R1; contracts/ui-routes.md › Proxy rules).
// Not authorization: layouts and every Route Handler / Server Action re-check with the guards.

const AUTH_PAGES = ['/sign-in', '/sign-up', '/verify-email', '/forgot-password']
const home = (role: unknown) => (role === 'admin' ? '/a/students' : '/s/today')

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Forward the path so server layouts can read it (src/app/s/layout.tsx exempts /s/me).
  const forwardHeaders = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', pathname)
    return headers
  }
  let response = NextResponse.next({ request: { headers: forwardHeaders() } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: forwardHeaders() } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  // getClaims() verifies the JWT and refreshes an expired session. Never use getSession() here.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const role = claims?.user_role
  const signedIn = Boolean(claims?.sub)

  // First visit: remember the browser's language so server and client agree (research R8).
  if (!hasLocale(request.cookies.get(LOCALE_COOKIE)?.value)) {
    response.cookies.set(
      LOCALE_COOKIE,
      matchAcceptLanguage(request.headers.get('accept-language')),
      {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      },
    )
  }

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url))
    // Keep refreshed auth cookies and the locale cookie.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }
  const toSignIn = () => redirectTo(`/sign-in?next=${encodeURIComponent(pathname + search)}`)

  if (pathname === '/') return redirectTo(signedIn ? home(role) : '/sign-in')

  if (AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return signedIn && role ? redirectTo(home(role)) : response
  }

  if (pathname === '/join' || pathname.startsWith('/join/')) {
    return role === 'admin' ? redirectTo('/a/students') : response
  }

  if (pathname.startsWith('/s/') || pathname === '/s') {
    if (!signedIn) return toSignIn()
    if (role === 'admin') return redirectTo('/a/students')
  }

  if (pathname.startsWith('/a/') || pathname === '/a') {
    if (!signedIn) return toSignIn()
    if (role === 'student') return redirectTo('/s/today')
  }

  return response
}

export const config = {
  // Everything except static files and images.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
}
