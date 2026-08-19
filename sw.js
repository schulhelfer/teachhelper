// Bewusst kein Import aus src/shared/app-version.js: Die Identität des Service Workers muss von
// genau einer Datei abhängen. Bei einem Import besteht das Skript für den Update-Vergleich des
// Browsers aus zwei Dateien, die ein CDN (GitHub Pages) unabhängig voneinander cacht. Liefert es
// sw.js und die Versionsdatei unterschiedlich frisch aus, sieht der Browser abwechselnd zwei
// Skript-Varianten und installiert endlos neu. Der Wert wird per Test mit APP_VERSION synchron
// gehalten.
const APP_VERSION = '34';

const CACHE_PREFIX = 'teachhelper';
const PRECACHE_NAME = `${CACHE_PREFIX}-precache-v${APP_VERSION}`;
const RUNTIME_NAME = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './src/main.js',
  './src/app/bootstrap.js',
  './src/app/dom.js',
  './src/app/first-run-tutorial.js',
  './src/app/planning-seatplan-bridge.js',
  './src/app/pwa-install-prompt.js',
  './src/app/pwa-updates.js',
  './src/app/shell.css',
  './src/app/shell.js',
  './src/shared/theme.css',
  './src/shared/theme-preload.js',
  './src/shared/theme.js',
  './src/shared/theme-bridge.js',
  './src/shared/segment-control.css',
  './src/shared/app-action-icons.css',
  './src/shared/app-tooltips.css',
  './src/shared/app-tooltips.js',
  './src/shared/tutorial-entry-hint.js',
  './src/shared/tutorial-entry-state.js',
  './src/shared/app-version.js',
  './src/shared/error-reporting.js',
  './src/shared/file-guards.js',
  './src/shared/docx-template.js',
  './src/shared/planning-note-links.js',
  './src/shared/planning-rich-text.js',
  './src/shared/workspace-client.css',
  './src/shared/school-data/defaults.js',
  './src/shared/messages.js',
  './src/shared/module-frame-bridge.js',
  './src/shared/roster-store.js',
  './src/shared/school-data/messages.js',
  './src/shared/school-data/index.js',
  './src/shared/school-data/grades.js',
  './src/shared/school-data/grade-integrity.js',
  './src/shared/school-data/sync-safety.js',
  './src/shared/school-data/thdb.js',
  './src/shared/sidebar-resize.js',
  './src/shared/touch-long-press.js',
  './src/shared/pdf-vendor.js',
  './src/shared/student-sync-bus.js',
  './src/shared/timer-store.js',
  './src/shell/tabs.js',
  './src/modules/planning/index.js',
  './src/modules/planning/app.html',
  './src/modules/planning/app.css',
  './src/modules/planning/app.js',
  './src/modules/planning/bridge.js',
  './src/modules/grades/index.js',
  './src/modules/grades/app.html',
  './src/modules/grades/app.css',
  './src/modules/grades/app.js',
  './src/modules/grades/bridge.js',
  './src/modules/grades/percentile-rank.js',
  './src/modules/grades/expectation-horizon-template.docx',
  './src/modules/grades/competence-expectations-template.docx',
  './src/modules/workspace/index.js',
  './src/modules/workspace/runtime.js',
  './src/modules/workspace/archive-pdf.js',
  './src/modules/workspace/local-value-store.js',
  './src/modules/workspace/client.js',
  './src/modules/workspace/components.js',
  './src/modules/workspace/crypto.js',
  './src/modules/workspace/store.js',
  './src/modules/merger/index.js',
  './src/modules/duplicate-check/index.js',
  './src/modules/qr/index.js',
  './src/modules/seatplan/index.js',
  './src/modules/name-learning/index.js',
  './src/modules/name-learning/app.html',
  './src/modules/name-learning/app.css',
  './src/modules/name-learning/app.js',
  './src/modules/name-learning/session.js',
];

const DEFERRED_ASSETS = [
  './THIRD_PARTY_NOTICES.md',
  './icon-512.png',
  './src/modules/seatplan/app.html',
  './src/modules/seatplan/app.css',
  './src/modules/seatplan/app.js',
  './src/modules/merger/app.html',
  './src/modules/merger/app.css',
  './src/modules/merger/app.js',
  './src/modules/duplicate-check/app.html',
  './src/modules/duplicate-check/app.css',
  './src/modules/duplicate-check/app.js',
  './src/modules/qr/app.html',
  './src/modules/qr/app.css',
  './src/modules/qr/app.js',
  './src/modules/qr/vendor/qrcode.min.js',
  './src/modules/qr/vendor/jsQR.js',
  './src/vendor/jszip/3.10.1/jszip.min.js',
  './src/vendor/jszip/3.10.1/LICENSE.markdown',
  './src/vendor/pdf-lib/1.17.1/pdf-lib.min.js',
  './src/vendor/pdf-lib/1.17.1/LICENSE.md',
  './src/vendor/pdfjs-dist/6.2.108/build/pdf.mjs',
  './src/vendor/pdfjs-dist/6.2.108/build/pdf.worker.mjs',
  './src/vendor/pdfjs-dist/6.2.108/LICENSE',
];
const OFFLINE_FALLBACK_URL = './index.html';

// Alle Dateien, die zu genau dieser Version gehören. Sie werden ausschließlich aus dem
// versionierten Precache bedient, damit ein aufgeschobenes Update ("Später") die laufende
// Version nicht Datei für Datei durch die neue ersetzt.
const PINNED_ASSET_PATHS = new Set(
  [...APP_SHELL, ...DEFERRED_ASSETS].map((asset) => new URL(asset, self.location.href).pathname),
);

function isPinnedAsset(url) {
  return url.origin === self.location.origin && PINNED_ASSET_PATHS.has(url.pathname);
}

const DEFERRED_IDLE_MS = 3000;
const DEFERRED_MAX_WAIT_MS = 60000;
const DEFERRED_CONCURRENCY = 2;

let updateActivationToken = null;
let lastRequestAt = Date.now();
let deferredPrecachePromise = null;
let deferredPrecacheAttached = false;

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
    || /\.(?:css|js|mjs|docx|png|svg|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$/i.test(url.pathname)
  );
}

async function preCacheAppShell() {
  const cache = await caches.open(PRECACHE_NAME);
  // Ein vollständiger Precache dieser Version wird nicht angefasst: Eine Neuinstallation derselben
  // Version kostet dann keinen einzigen Request. Ist er unvollständig, wird alles neu geholt statt
  // nur die Lücken gefüllt - so heilt eine Installation, die während eines Deployments eine
  // Mischung aus zwei Versionen erwischt hat, sich beim nächsten Anlauf selbst.
  const cached = await Promise.all(APP_SHELL.map((asset) => cache.match(asset)));
  if (cached.every(Boolean)) return;
  const results = await Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)));
  const failedAssets = results
    .map((result, index) => (result.status === 'rejected' ? APP_SHELL[index] : null))
    .filter(Boolean);
  if (failedAssets.length > 0) {
    console.warn('TeachHelper SW precache skipped assets:', failedAssets);
  }
}

async function waitForRequestIdle() {
  const deadline = Date.now() + DEFERRED_MAX_WAIT_MS;
  for (;;) {
    const quietFor = Date.now() - lastRequestAt;
    if (quietFor >= DEFERRED_IDLE_MS) return;
    const waitMs = Math.min(DEFERRED_IDLE_MS - quietFor, Math.max(0, deadline - Date.now()));
    if (waitMs <= 0) return;
    await new Promise((resolve) => { setTimeout(resolve, waitMs); });
  }
}

async function precacheDeferredAssets() {
  const cache = await caches.open(PRECACHE_NAME);
  const queue = DEFERRED_ASSETS.slice();
  const drain = async () => {
    while (queue.length > 0) {
      const asset = queue.shift();
      if (await cache.match(asset)) continue;
      try {
        await cache.add(asset);
      } catch {
      }
    }
  };
  await Promise.all(Array.from({ length: DEFERRED_CONCURRENCY }, drain));
}

function ensureDeferredPrecache() {
  if (!deferredPrecachePromise) {
    deferredPrecachePromise = (async () => {
      await waitForRequestIdle();
      await precacheDeferredAssets();
    })().catch(() => null);
  }
  return deferredPrecachePromise;
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

async function matchCached(request) {
  const runtime = await caches.open(RUNTIME_NAME);
  const runtimeMatch = await runtime.match(request, { ignoreSearch: true });
  if (runtimeMatch) return runtimeMatch;
  const precache = await caches.open(PRECACHE_NAME);
  return precache.match(request, { ignoreSearch: true });
}

async function networkFirst(request, {
  fallbackUrl = null,
  preloadResponsePromise = null,
  cacheMode = undefined,
} = {}) {
  try {
    const preloadResponse = preloadResponsePromise ? await preloadResponsePromise : null;
    const response = preloadResponse || await fetch(request, { cache: cacheMode });
    await putInRuntimeCache(request, response);
    return response;
  } catch (error) {
    const cached = await matchCached(request);
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

async function precacheFirst(request, { fallbackUrl = null } = {}) {
  const precache = await caches.open(PRECACHE_NAME);
  const pinned = await precache.match(request, { ignoreSearch: true });
  if (pinned) return pinned;

  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (shouldCacheResponse(response)) {
      await precache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await matchCached(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await precache.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) {
        return fallback;
      }
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, event = null) {
  const cached = await matchCached(request);
  const networkPromise = fetch(request, { cache: 'no-cache' })
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
        // Der Start wird aus dem versionierten Precache bedient; ein Preload-Request wäre
        // bei jedem Start umsonst (und würde von Chrome als ungenutzt angemahnt).
        await self.registration.navigationPreload.disable();
      } catch {

      }
    }
    await self.clients.claim();
    void ensureDeferredPrecache();
  })());
});

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SET_UPDATE_TOKEN') {
    if (typeof data.token === 'string' && data.token.length > 0) {
      updateActivationToken = data.token;
    }
    return;
  }

  if (
    data.type === 'SKIP_WAITING'
    && typeof data.token === 'string'
    && data.token.length > 0
    && data.token === updateActivationToken
  ) {
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
  lastRequestAt = Date.now();

  if (!deferredPrecacheAttached) {
    deferredPrecacheAttached = true;
    event.waitUntil(ensureDeferredPrecache());
  }

  if (isPinnedAsset(url)) {
    event.respondWith(precacheFirst(request, {
      fallbackUrl: request.mode === 'navigate' ? OFFLINE_FALLBACK_URL : null,
    }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, {
      fallbackUrl: OFFLINE_FALLBACK_URL,
      preloadResponsePromise: event.preloadResponse,
      cacheMode: 'no-cache',
    }));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
