'use client'

import { useOnline } from './use-online'

/** The banner's "needs a connection" sentence, which every disabled write points to. */
export const NEEDS_CONNECTION_ID = 'needs-connection'

/**
 * A write that needs the server (spec 008 US2 scenario 4; research R14): offline the control stays
 * where it is, disabled, and screen readers hear why from the offline banner, which says it once
 * for the whole screen. Spread onto the control and combine `disabled` with its own:
 * `disabled={connection.disabled || isPending} aria-describedby={connection.describedBy}`.
 */
export function useNeedsConnection() {
  const isOnline = useOnline()
  return { disabled: !isOnline, describedBy: isOnline ? undefined : NEEDS_CONNECTION_ID }
}
