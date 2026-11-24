'use client'

/**
 * Spec 008 research R6: online, a write uses its Server Action as before (with its inline errors);
 * offline, or when the request can't reach the server, the change goes to the outbox instead.
 * Mutations that call this need `networkMode: 'always'`, or TanStack Query pauses them offline.
 */
export async function runOrQueue<T>({
  online,
  queue,
}: {
  online: () => Promise<T>
  queue: () => Promise<unknown>
}): Promise<{ isQueued: true } | { isQueued: false; data: T }> {
  if (!navigator.onLine) {
    await queue()
    return { isQueued: true }
  }
  try {
    return { isQueued: false, data: await online() }
  } catch (error) {
    // A Server Action that never reached the server rejects with a TypeError ("Failed to fetch").
    if (!(error instanceof TypeError)) throw error
    await queue()
    return { isQueued: true }
  }
}
