import { Zen_Maru_Gothic } from 'next/font/google'

// Spec 007 research R6 (T039): a Japanese font, so its CSS has a rule per Unicode slice and weight.
// Only loaded through ./index's dynamic import, when chosen or on Appearance.
const font = Zen_Maru_Gothic({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
})

export default font.style.fontFamily
