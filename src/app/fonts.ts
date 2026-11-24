import {
  Atkinson_Hyperlegible,
  DM_Sans,
  Inter,
  M_PLUS_Rounded_1c,
  Manrope,
  Merriweather,
  Noto_Sans_JP,
  Noto_Sans_Myanmar,
  Nunito,
  Poppins,
  Roboto,
  Zen_Maru_Gothic,
} from 'next/font/google'

// Spec 007 research R6: the 10 UI fonts (src/lib/appearance.ts fontIds) and the Japanese and Burmese
// fallbacks (constitution VI), self-hosted at build. None is preloaded: every family is only a CSS
// variable on <html>, [data-font] picks one as --font-active (globals.css), and the browser
// downloads a face only when text uses it (FR-007, SC-005). Static families get the weights the app
// uses (400 body, 500 medium, 600 semibold, 700 bold); variable ones cover them all.

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: false,
})
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
  preload: false,
})
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
  preload: false,
})
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
  preload: false,
})
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
})
const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
  preload: false,
})
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-atkinson',
  display: 'swap',
  preload: false,
})
const merriweather = Merriweather({
  subsets: ['latin'],
  variable: '--font-merriweather',
  display: 'swap',
  preload: false,
})
const mPlusRounded = M_PLUS_Rounded_1c({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-m-plus-rounded',
  display: 'swap',
  preload: false,
})
const zenMaru = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-zen-maru',
  display: 'swap',
  preload: false,
})

// Fallbacks for Japanese and Burmese text in any UI font (001 research R9).
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

/** Every font's CSS variable class, for <html>. */
export const fontVariables = [
  inter,
  nunito,
  poppins,
  dmSans,
  manrope,
  roboto,
  atkinson,
  merriweather,
  mPlusRounded,
  zenMaru,
  notoJp,
  notoMy,
]
  .map((font) => font.variable)
  .join(' ')
