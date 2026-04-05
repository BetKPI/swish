// Swish Service Worker — lightweight, cache-first for static assets
const CACHE_NAME = 'swish-v1';
const STATIC_ASSETS = ['/', '/manifest.json', '/logo.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API calls — always network
  if (url.pathname.startsWith('/api/')) return;

  // Static assets — cache first, network fallback
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetched = fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return res;
        });
        return cached || fetched;
      })
    );
  }
});
