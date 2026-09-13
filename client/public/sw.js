// Minimal service worker: makes the app installable on a phone (PWA). Network first; the
// app shell is cached so the icon opens even when the server is briefly unreachable.
const CACHE = 'opengrokbot-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).catch(() => undefined))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && url.origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, res.clone())).catch(() => undefined)
        return res
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('/'))),
  )
})
