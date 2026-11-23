// StudyMate service worker, 006 part (research R7): show pushes and open them. Spec 008 replaces this
// file with Serwist's src/app/sw.ts and keeps these two handlers (008 FR-005). No caching here.

// Take over open windows at once, so a tapped notification can navigate them.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// The dispatcher sends { title, body, url, tag } (src/server/notifications/push.ts). `url` already
// carries ?n=<id>, so the app marks the item read when it opens.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'StudyMate', {
        body: data.body || '',
        tag: data.tag,
        data: { url: data.url || '/' },
      }),
      tellOpenWindows(),
    ]),
  )
})

// Focus a window of the app on the item's page, or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (!open) return self.clients.openWindow(url)
      // navigate() fails on a window this worker doesn't control; open a new one then.
      return open
        .focus()
        .then((w) => w.navigate(url))
        .catch(() => self.clients.openWindow(url))
    }),
  )
})

// Open windows refresh the bell (research R9).
function tellOpenWindows() {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ type: 'notifications' })))
}
