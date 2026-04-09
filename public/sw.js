// Swish Service Worker — lightweight, cache-first for static assets
const CACHE_NAME = 'swish-v4';
// Only cache truly static assets — NOT the HTML page
const STATIC_ASSETS = ['/manifest.json', '/logo.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Delete ALL old caches on activate to bust stale pages
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

  // HTML pages — always network first (never serve stale pages)
  if (e.request.mode === 'navigate') return;

  // Static assets only — cache first, network fallback
  if (e.request.method === 'GET' && (url.pathname.startsWith('/_next/') || STATIC_ASSETS.includes(url.pathname))) {
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
