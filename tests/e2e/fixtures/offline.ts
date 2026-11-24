import { expect, type BrowserContext, type Page } from '@playwright/test'

// Spec 008 e2e helpers: the network switch, the service worker, and the device's offline data
// (IndexedDB `studymate`, Cache Storage). Opening IndexedDB creates it, so the readers check that
// the database exists first and never create it themselves.

export const goOffline = (context: BrowserContext) => context.setOffline(true)
export const goOnline = (context: BrowserContext) => context.setOffline(false)

/** The service worker controls the page (after the first load it claims open pages). */
export async function waitForWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
    timeout: 30_000,
  })
}

/** All rows of one table of the device database, or [] when there is no database. */
export function deviceRows<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const exists = (await indexedDB.databases()).some((d) => d.name === 'studymate')
    if (!exists) return []
    return new Promise<T[]>((resolve, reject) => {
      const open = indexedDB.open('studymate')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(name)) {
          db.close()
          return resolve([])
        }
        const request = db.transaction(name).objectStore(name).getAll()
        request.onsuccess = () => {
          db.close()
          resolve(request.result as T[])
        }
        request.onerror = () => reject(request.error)
      }
    })
  }, table)
}

export type OutboxRow = { id: string; type: string; state: string; error: string | null }

export const outboxRows = (page: Page) => deviceRows<OutboxRow>(page, 'outbox')

/** Everything queued has been sent and nothing was refused. */
export async function waitForSynced(page: Page) {
  await expect.poll(async () => (await outboxRows(page)).length, { timeout: 45_000 }).toBe(0)
}

/** The course has been kept for offline use with at least `files` files. */
export async function waitForKeptCourse(page: Page, courseId: string, files = 0) {
  await expect
    .poll(
      async () => {
        const rows = await deviceRows<{ courseId: string; mediaUrls: string[] }>(
          page,
          'offlineCourses',
        )
        return rows.find((row) => row.courseId === courseId)?.mediaUrls.length ?? -1
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThanOrEqual(files)
}

/** A page the worker has stored for offline use. */
export async function waitForCachedPage(page: Page, path: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async (url) => {
          const cache = await caches.open('pages')
          return Boolean(await cache.match(url, { ignoreSearch: true }))
        }, path),
      { timeout: 45_000 },
    )
    .toBe(true)
}

export const databaseNames = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))

export const cacheNames = (page: Page) => page.evaluate(() => caches.keys())
