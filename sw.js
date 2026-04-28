import { APP_VERSION } from './src/shared/app-version.js';

const CACHE_PREFIX = 'teachhelper';
const PRECACHE_NAME = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME_NAME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './src/main.js',
  './src/app/dom.js',
  './src/app/planning-seatplan-bridge.js',
  './src/app/pwa-updates.js',
  './src/app/shell.js',
  './src/shared/app-version.js',
  './src/shared/error-reporting.js',
  './src/shared/messages.js',
  './src/shared/student-sync-bus.js',
  './src/shared/timer-store.js',
  './src/shell/theme.js',
  './src/shell/tabs.js',
  './src/modules/planning/index.js',
  './src/modules/planning/app.html',
  './src/modules/planning/app.css',
  './src/modules/planning/app.js',
  './src/modules/planning/bridge.js',
  './src/modules/merger/index.js',
  './src/modules/merger/app.html',
  './src/modules/merger/app.css',
  './src/modules/merger/app.js',
  './src/modules/duplicate-check/index.js',
  './src/modules/duplicate-check/app.html',
  './src/modules/duplicate-check/app.css',
  './src/modules/duplicate-check/app.js',
  './src/modules/seatplan/index.js',
  './src/modules/seatplan/app.html',
  './src/modules/seatplan/app.css',
  './src/modules/seatplan/app.js',
];
const OFFLINE_FALLBACK_URL = './index.html';

function shouldCacheResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== 'basic') return false;
  const cacheControl = String(response.headers.get('Cache-Control') || '').toLowerCase();
  return !cacheControl.includes('no-store');
}

function isStaticAssetRequest(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return false;
  if (request.destination === 'document') return false;
  return (
    request.destination === 'script'
    || request.destination === 'style'
    || request.destination === 'image'
    || request.destination === 'font'
    || request.destination === 'manifest'
    || /\.(?:css|js|mjs|png|svg|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname)
  );
}

async function preCacheAppShell() {
  const cache = await caches.open(PRECACHE_NAME);
  const results = await Promise.allSettled(
    APP_SHELL.map((asset) => cache.add(new Request(asset, { cache: 'reload' })))
  );
  const failedAssets = results
    .map((result, index) => (result.status === 'rejected' ? APP_SHELL[index] : null))
    .filter(Boolean);
  if (failedAssets.length > 0) {
    console.warn('TeachHelper SW precache skipped assets:', failedAssets);
  }
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(`${CACHE_PREFIX}-`) && key !== PRECACHE_NAME && key !== RUNTIME_NAME)
      .map((key) => caches.delete(key))
  );
}

async function putInRuntimeCache(request, response) {
  if (!shouldCacheResponse(response)) return response;
  const cache = await caches.open(RUNTIME_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, { fallbackUrl = null, preloadResponsePromise = null } = {}) {
  try {
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : null;
    const response = preloadResponse || await fetch(request);
    await putInRuntimeCache(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, event = null) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then((response) => putInRuntimeCache(request, response))
    .catch(() => null);
  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(networkPromise);
  }

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error(`No cached response for ${request.url}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(preCacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanupOldCaches();
    if ('navigationPreload' in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch {
        // Navigation preload is optional.
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, {
      fallbackUrl: OFFLINE_FALLBACK_URL,
      preloadResponsePromise: event.preloadResponse,
    }));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
