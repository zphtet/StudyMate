import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_JP, Noto_Sans_Myanmar } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { ThemeProvider } from 'next-themes'
import { Suspense, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { QueryProvider } from '@/lib/query/provider'
import './globals.css'

// Inter for Latin; Noto Sans JP and Myanmar cover Japanese and Burmese (research R9).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const notoJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-jp',
  display: 'swap',
  preload: false,
})
const notoMy = Noto_Sans_Myanmar({
  subsets: ['myanmar'],
  variable: '--font-noto-my',
  display: 'swap',
  preload: false,
})

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${notoJp.variable} ${notoMy.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: langScript }} />
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
