import Image from 'next/image'

/**
 * The StudyMate logo (public/logo.png, the owner's artwork, 2026-11-24; replaces the check tile of
 * screenshots 01 and 15). Decorative: each screen names the app in its heading. Shown a little larger
 * than the old 48 px tile because the artwork has a wide transparent margin.
 */
export function AppMark() {
  return <Image src="/logo.png" alt="" width={64} height={64} className="size-16" />
}
