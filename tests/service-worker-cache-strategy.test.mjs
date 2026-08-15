import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceWorkerSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('loads JavaScript from the network before falling back to the offline cache', () => {
  assert.ok(
    serviceWorkerSource.includes(
      "return request.destination === 'script' || /\\.(?:js|mjs)$/i.test(url.pathname);",
    ),
  );
  assert.match(
    serviceWorkerSource,
    /if \(isCodeAssetRequest\(request, url\)\) \{\s*event\.respondWith\(networkFirst\(request, \{ cacheMode: 'reload' \}\)\);\s*return;/,
  );
});

test('reloads navigated documents before falling back to an offline copy', () => {
  assert.match(
    serviceWorkerSource,
    /const preloadResponse = cacheMode === 'reload'\s*\? null\s*: \(preloadResponsePromise \? await preloadResponsePromise : null\);/,
  );
  assert.match(
    serviceWorkerSource,
    /if \(request\.mode === 'navigate'\) \{[\s\S]*?fallbackUrl: OFFLINE_FALLBACK_URL,[\s\S]*?preloadResponsePromise: event\.preloadResponse,[\s\S]*?cacheMode: 'reload',[\s\S]*?\}\)\);/,
  );
});
