/* Qrivo service worker — installable app shell + offline fallback. */
const VERSION = 'v2';
const PRECACHE = `qrivo-precache-${VERSION}`;
const RUNTIME = `qrivo-runtime-${VERSION}`;
const OFFLINE_URL = '/offline/';

const PRECACHE_URLS = [
  '/',
  '/businesses/',
  OFFLINE_URL,
  '/favicon.ico',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/qrivo-logo-192.webp',
  '/qrivo-logo.svg',
  '/site.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== PRECACHE && key !== RUNTIME)
        .map(key => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

function isPrivatePath(url) {
  return (
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/s/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/card-test-page')
  );
}

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch {
    // Storage can be full or blocked; the network response is still usable.
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivatePath(url)) return;

  // Never let an old manifest keep an installed app on the wrong start URL.
  if (url.pathname === '/site.webmanifest') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cacheResponse(RUNTIME, request, response);
          return response;
        }
        return (
          (await caches.match(request)) ||
          (await caches.match(OFFLINE_URL)) ||
          response
        );
      } catch {
        return (await caches.match(request)) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  const networkPromise = fetch(request)
    .then(response => cacheResponse(RUNTIME, request, response).then(() => response))
    .catch(() => null);

  // Keep the update alive even when we serve a cached copy immediately.
  event.waitUntil(networkPromise);

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await networkPromise;
    return response || Response.error();
  })());
});
