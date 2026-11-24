import type { FontId } from '@/lib/appearance'

/**
 * Spec 007 research R6, decided in T039 (2026-11-24): M PLUS Rounded 1c and Zen Maru Gothic are
 * Japanese fonts whose @font-face CSS (a rule per Unicode slice and weight, ~550 KB) blocked every
 * page's first paint for every user. They load on demand instead: their modules are only reached
 * through these dynamic imports, so their CSS is in separate chunks. Loading one sets its
 * --font-<id> variable on <html>'s inline style, which the [data-font] rule in globals.css reads;
 * until then the stack's fallbacks show, as with any font still downloading (display: swap).
 */
const loaders = {
  'm-plus-rounded': () => import('./m-plus-rounded'),
  'zen-maru': () => import('./zen-maru'),
} satisfies Partial<Record<FontId, () => Promise<{ default: string }>>>

type LazyFontId = keyof typeof loaders

export const isLazyFont = (id: string | undefined): id is LazyFontId =>
  id !== undefined && id in loaders

/** Loads a lazy font once and points its CSS variable at it; other fonts are a no-op. */
export async function loadLazyFont(id: string | undefined) {
  if (!isLazyFont(id)) return
  const { default: family } = await loaders[id]()
  document.documentElement.style.setProperty(`--font-${id}`, family)
}

export const loadAllLazyFonts = () =>
  Promise.all(Object.keys(loaders).map((id) => loadLazyFont(id)))
