// Messages between the page and the service worker (contracts/service-worker.md › Worker).
// The worker imports only the types; the helpers run in the page.

export type WorkerRequest = { type: 'KEEP'; urls: string[] } | { type: 'FORGET'; urls: string[] }

export type WorkerReply =
  { type: 'KEPT'; url: string; bytes: number; ok: boolean } | { type: 'FORGOT' }

export type KeptFile = { url: string; bytes: number; ok: boolean }

function controller() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.controller
}

/**
 * Asks the worker to store each URL through its caching rules, one at a time (research R3).
 * Resolves with what each one cost. Without a controlling worker (dev, first load) nothing is kept.
 */
export function keepUrls(urls: string[]): Promise<KeptFile[]> {
  const worker = controller()
  if (!worker || urls.length === 0) return Promise.resolve([])
  return new Promise((resolve) => {
    const kept: KeptFile[] = []
    const channel = new MessageChannel()
    channel.port1.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (data.type !== 'KEPT') return
      kept.push({ url: data.url, bytes: data.bytes, ok: data.ok })
      if (kept.length === urls.length) {
        channel.port1.close()
        resolve(kept)
      }
    }
    worker.postMessage({ type: 'KEEP', urls } satisfies WorkerRequest, [channel.port2])
  })
}

/** Asks the worker to drop these URLs from the pages and media caches (research R3 eviction). */
export function forgetUrls(urls: string[]): Promise<void> {
  const worker = controller()
  if (!worker || urls.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    worker.postMessage({ type: 'FORGET', urls } satisfies WorkerRequest, [channel.port2])
  })
}

/** Lets a waiting worker take over (research R13); the page reloads on `controllerchange`. */
export async function skipWaiting() {
  const registration = await navigator.serviceWorker.getRegistration()
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
}
