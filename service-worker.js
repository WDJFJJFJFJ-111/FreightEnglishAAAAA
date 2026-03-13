const CACHE_NAME = 'fet-v2.0';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/vocabulary.json',
  '/sentences.json',
  '/dialogues.json',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// Install: cache all assets
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for assets, network-first for API
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
