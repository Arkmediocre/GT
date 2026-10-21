const CACHE_NAME = 'gt-pwa-v2';
const APP_FILES = [
  './',
  './index.html',
  './level-select.html',
  './style.css?v=8',
  './game.js?v=12',
  './level-select.js?v=3',
  './leaderboard.js?v=6',
  './firebase-config.js',
  './manifest.webmanifest',
  './pwa.js?v=1',
  './icons/gt-icon.svg',
  './icons/gt-192.png',
  './icons/gt-512.png',
  './icons/apple-touch-icon.png',
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('gt-pwa-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const fallbackPath = url.pathname.endsWith('/level-select.html')
            ? './level-select.html'
            : './index.html';
          return await caches.match(request)
            || await caches.match(new URL(fallbackPath, self.registration.scope).href);
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
