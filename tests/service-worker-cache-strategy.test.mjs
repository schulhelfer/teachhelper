import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceWorkerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

function assetList(name) {
  const match = serviceWorkerSource.match(
    new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`),
  );
  assert.ok(match, `service worker must declare ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

test('serves static assets from the cache and revalidates them in the background', () => {
  assert.match(
    serviceWorkerSource,
    /if \(isStaticAssetRequest\(request, url\)\) \{\s*event\.respondWith\(staleWhileRevalidate\(request, event\)\);\s*\}/,
  );
  assert.doesNotMatch(serviceWorkerSource, /isCodeAssetRequest/);
  assert.doesNotMatch(serviceWorkerSource, /networkFirst\(request, \{ cacheMode: 'reload' \}\)/);
});

test('background revalidation asks the server instead of trusting the HTTP cache', () => {
  assert.match(
    serviceWorkerSource,
    /const networkPromise = fetch\(request, \{ cache: 'no-cache' \}\)/,
  );
});

// Gilt nur für Dateien außerhalb von APP_SHELL/DEFERRED_ASSETS; die versionierten Dateien
// laufen über precacheFirst und werden nie durch den Runtime-Cache überschrieben.
test('reads the runtime cache before the precache so refreshed files win', () => {
  assert.match(
    serviceWorkerSource,
    /async function matchCached\(request\) \{[\s\S]*?caches\.open\(RUNTIME_NAME\)[\s\S]*?caches\.open\(PRECACHE_NAME\)[\s\S]*?\}/,
  );
  assert.match(
    serviceWorkerSource,
    /async function staleWhileRevalidate[\s\S]*?const cached = await matchCached\(request\);/,
  );
});

test('files of this version are pinned to the versioned precache', () => {
  assert.match(
    serviceWorkerSource,
    /const PINNED_ASSET_PATHS = new Set\(\s*\[\.\.\.APP_SHELL, \.\.\.DEFERRED_ASSETS\]/,
  );
  assert.match(
    serviceWorkerSource,
    /if \(isPinnedAsset\(url\)\) \{\s*event\.respondWith\(precacheFirst\(request, \{[\s\S]*?\}\)\);\s*return;\s*\}/,
  );

  const fetchHandler = serviceWorkerSource.match(/addEventListener\('fetch'[\s\S]*$/);
  assert.ok(fetchHandler, 'service worker must handle fetch');
  assert.ok(
    fetchHandler[0].indexOf('isPinnedAsset(url)') < fetchHandler[0].indexOf("request.mode === 'navigate'"),
    'pinned files must be answered before the generic navigation and asset strategies',
  );

  const precacheFirstBody = serviceWorkerSource.match(
    /async function precacheFirst\([\s\S]*?\n\}/,
  );
  assert.ok(precacheFirstBody, 'service worker must declare precacheFirst');
  assert.match(precacheFirstBody[0], /caches\.open\(PRECACHE_NAME\)/);
  assert.doesNotMatch(
    precacheFirstBody[0],
    /putInRuntimeCache|staleWhileRevalidate/,
    'pinned files must never be refreshed in place while the old version is running',
  );
});

test('the app shell is served from the precache instead of the network on start', () => {
  const fetchHandler = serviceWorkerSource.match(/addEventListener\('fetch'[\s\S]*$/);
  assert.ok(fetchHandler, 'service worker must handle fetch');
  assert.match(
    fetchHandler[0],
    /fallbackUrl: request\.mode === 'navigate' \? OFFLINE_FALLBACK_URL : null,/,
  );

  const activateBody = serviceWorkerSource.match(/addEventListener\('activate'[\s\S]*?\n\}\);/);
  assert.ok(activateBody, 'service worker must handle activate');
  assert.match(activateBody[0], /navigationPreload\.disable\(\)/);
  assert.doesNotMatch(activateBody[0], /navigationPreload\.enable\(\)/);
});

test('unknown navigations still fall back to the network and the offline shell', () => {
  assert.match(
    serviceWorkerSource,
    /if \(request\.mode === 'navigate'\) \{[\s\S]*?fallbackUrl: OFFLINE_FALLBACK_URL,[\s\S]*?cacheMode: 'no-cache',[\s\S]*?\}\)\);/,
  );
  assert.match(
    serviceWorkerSource,
    /const preloadResponse = preloadResponsePromise \? await preloadResponsePromise : null;/,
  );
});

test('the service worker carries its own version marker so updates are detected', async () => {
  const appVersionSource = await readFile(
    new URL('../src/shared/app-version.js', import.meta.url),
    'utf8',
  );
  const appVersion = appVersionSource.match(/APP_VERSION\s*=\s*'([^']+)'/);
  assert.ok(appVersion, 'app-version.js must export APP_VERSION');

  const marker = serviceWorkerSource.match(/const SW_VERSION_MARKER\s*=\s*'([^']+)'/);
  assert.ok(marker, 'sw.js must declare SW_VERSION_MARKER');
  assert.equal(
    marker[1],
    appVersion[1],
    'SW_VERSION_MARKER in sw.js must be bumped together with APP_VERSION',
  );
});

test('precaching the app shell does not bypass the HTTP cache', () => {
  assert.match(
    serviceWorkerSource,
    /APP_SHELL\.map\(\(asset\) => cache\.add\(asset\)\)/,
  );
  assert.doesNotMatch(serviceWorkerSource, /\{ cache: 'reload' \}/);
  assert.doesNotMatch(serviceWorkerSource, /cache\.add\(new Request\(/);
});

test('heavy optional assets are precached after the start, not during install', () => {
  const appShell = assetList('APP_SHELL');
  const deferred = assetList('DEFERRED_ASSETS');

  for (const asset of [
    './src/vendor/pdfjs-dist/6.2.108/build/pdf.worker.mjs',
    './src/vendor/pdfjs-dist/6.2.108/build/pdf.mjs',
    './src/vendor/pdf-lib/1.17.1/pdf-lib.min.js',
    './src/vendor/jszip/3.10.1/jszip.min.js',
    './src/modules/qr/vendor/jsQR.js',
  ]) {
    assert.ok(deferred.includes(asset), `${asset} must be deferred`);
    assert.ok(!appShell.includes(asset), `${asset} must not block install`);
  }

  for (const asset of [
    './index.html',
    './src/main.js',
    './src/app/shell.css',
    './src/modules/planning/app.js',
    './src/modules/grades/app.js',
  ]) {
    assert.ok(appShell.includes(asset), `${asset} must stay in the app shell`);
    assert.ok(!deferred.includes(asset), `${asset} must not be deferred`);
  }

  assert.equal(
    appShell.filter((asset) => deferred.includes(asset)).length,
    0,
    'no asset may appear in both precache stages',
  );
});

test('deferred precaching waits for the app to go quiet', () => {
  assert.match(
    serviceWorkerSource,
    /function ensureDeferredPrecache\(\) \{[\s\S]*?await waitForRequestIdle\(\);\s*await precacheDeferredAssets\(\);/,
  );
  assert.match(serviceWorkerSource, /lastRequestAt = Date\.now\(\);/);
});

test('deferred precaching never holds the activate event open', () => {
  const activateBody = serviceWorkerSource.match(
    /addEventListener\('activate'[\s\S]*?\n\}\);/,
  );
  assert.ok(activateBody, 'service worker must handle activate');
  assert.doesNotMatch(activateBody[0], /await\s+ensureDeferredPrecache\(\)/);
  assert.doesNotMatch(activateBody[0], /await\s+precacheDeferredAssets\(\)/);
  assert.doesNotMatch(activateBody[0], /await\s+waitForRequestIdle\(\)/);
  assert.match(activateBody[0], /void ensureDeferredPrecache\(\);/);

  assert.match(
    serviceWorkerSource,
    /if \(!deferredPrecacheAttached\) \{\s*deferredPrecacheAttached = true;\s*event\.waitUntil\(ensureDeferredPrecache\(\)\);\s*\}/,
  );
});
