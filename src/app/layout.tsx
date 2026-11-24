import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { ThemeProvider } from 'next-themes'
import { Suspense, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { appearanceScript } from '@/lib/appearance'
import { QueryProvider } from '@/lib/query/provider'
import { fontVariables } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'StudyMate', template: '%s · StudyMate' },
  description: 'Plan lessons. Study a little every day.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0a09' },
  ],
}

// <html lang> follows the `locale` cookie. Reading the cookie on the server would make the whole
// document request-bound under Cache Components, so a tiny script sets it before paint instead.
const langScript = `try{var m=document.cookie.match(/(?:^|; )locale=(en|my|ja)(?:;|$)/);if(m)document.documentElement.lang=m[1]}catch(e){}`
// Spec 007 research R1: the same reason applies to the device's look (theme, font, text size, and
// the mode next-themes reads), from the `appearance` cookie, before first paint.

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fontVariables} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: langScript }} />
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Everything below reads the session or locale (cookies), so it renders per request. */}
          <Suspense fallback={null}>
            <NextIntlClientProvider>
              <QueryProvider>{children}</QueryProvider>
            </NextIntlClientProvider>
          </Suspense>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
