import type { PushPayload } from './push'

// One recipient's phone notification for everything delivered to them in one run (spec 006 research
// R5; US4 scenario 3). One row keeps its own text and link; several become "{n} reminders" opening
// the inbox. Each row is still its own inbox item. Pure, so the dispatcher passes the translated title.

export type BundleRow = {
  id: string
  title: string
  body: string
  url: string | null
  /** data-model.md Notification.push: false for "Copy me" copies and rules with push off. */
  push: boolean
  urgent: boolean
}

export type BundleOptions = {
  /** The recipient's inbox: `/s/inbox` or `/a/inbox`. */
  inbox: string
  /** "{n} reminders" in the recipient's language. */
  bundleTitle: (n: number) => string
}

/** A bundle's body names this many items; its title gives the count. */
const LISTED = 3

export function bundle(
  rows: BundleRow[],
  { inbox, bundleTitle }: BundleOptions,
): PushPayload | null {
  const pushable = rows.filter((row) => row.push)
  if (pushable.length === 0) return null
  if (pushable.length === 1) return single(pushable[0], inbox)

  const listed = [...pushable.filter((row) => row.urgent), ...pushable.filter((row) => !row.urgent)]
  return {
    title: bundleTitle(pushable.length),
    body: listed
      .slice(0, LISTED)
      .map((row) => row.title)
      .join(' · '),
    url: inbox,
    // A newer bundle replaces the older one on the phone rather than stacking (R5).
    tag: 'bundle',
  }
}

/**
 * Tapping opens the row's link, or the inbox, with `?n=<id>` so the app marks it read (FR-007;
 * research R9). `tag` is the row id, so a resent notice replaces the old one.
 */
function single(row: BundleRow, inbox: string): PushPayload {
  const url = row.url ?? inbox
  return {
    title: row.title,
    body: row.body,
    url: `${url}${url.includes('?') ? '&' : '?'}n=${row.id}`,
    tag: row.id,
  }
}
