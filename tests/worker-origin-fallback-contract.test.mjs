import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperSource = await readFile(new URL('../src/shared/worker-origin-fallback.js', import.meta.url), 'utf8');
const ocrWorkerSource = await readFile(new URL('../src/shared/ocr-worker.js', import.meta.url), 'utf8');
const ocrVendorSource = await readFile(new URL('../src/shared/ocr-vendor.js', import.meta.url), 'utf8');
const fileProcessingClientSource = await readFile(new URL('../src/shared/file-processing-client.js', import.meta.url), 'utf8');

const capturedBlobs = [];

function loadHelper() {
  const source = helperSource.replace(/\bexport function\b/g, 'function');
  const factory = new Function(
    'Blob',
    'URL',
    `${source}\nreturn { createWorkerWithOriginFallback };`,
  );
  const FakeBlob = class {
    constructor(parts) { this.source = parts.join(''); }
  };
  const fakeUrl = {
    createObjectURL: (blob) => {
      capturedBlobs.push(blob.source);
      return `blob:null/${capturedBlobs.length}`;
    },
  };
  return factory(FakeBlob, fakeUrl);
}

function securityError() {
  const error = new Error("cannot be accessed from origin 'null'.");
  error.name = 'SecurityError';
  return error;
}

test('a module worker shim uses a dynamic import so it resolves in an opaque origin', () => {
  capturedBlobs.length = 0;
  const { createWorkerWithOriginFallback } = loadHelper();
  const urls = [];
  const workerFactory = (url) => {
    urls.push(String(url));
    if (urls.length === 1) throw securityError();
    return { id: 'worker' };
  };

  const worker = createWorkerWithOriginFallback(
    new URL('https://example.test/app/file-processing-worker.js'),
    { type: 'module', workerFactory },
  );

  assert.deepEqual(worker, { id: 'worker' });
  assert.match(urls[1], /^blob:/);
  const shim = capturedBlobs[0];
  assert.match(
    shim,
    /await import\("https:\/\/example\.test\/app\/file-processing-worker\.js"\)/,
    'the shim must use a dynamic import',
  );
  assert.doesNotMatch(
    shim,
    /^\s*import\s+"/,
    'a static import resolves against the blob: base URL and fails in an opaque origin',
  );
});

test('a classic worker shim uses importScripts and passes the real base URL', () => {
  capturedBlobs.length = 0;
  const { createWorkerWithOriginFallback } = loadHelper();
  let calls = 0;
  const workerFactory = () => {
    calls += 1;
    if (calls === 1) throw securityError();
    return { id: 'classic' };
  };

  createWorkerWithOriginFallback(new URL('https://example.test/app/ocr-worker.js'), { workerFactory });

  const shim = capturedBlobs[0];
  assert.match(shim, /importScripts\("https:\/\/example\.test\/app\/ocr-worker\.js"\)/);
  assert.match(
    shim,
    /__teachhelperWorkerBaseUrl = "https:\/\/example\.test\/app\/ocr-worker\.js"/,
    'a blob worker has no usable self.location, so the real base URL must be handed over',
  );
});

test('a non-SecurityError is not swallowed by the fallback', () => {
  const { createWorkerWithOriginFallback } = loadHelper();
  const workerFactory = () => { throw new TypeError('kaputt'); };
  assert.throws(
    () => createWorkerWithOriginFallback(new URL('https://example.test/w.js'), { workerFactory }),
    /kaputt/,
  );
});

test('the OCR worker resolves vendor URLs against the handed-over base URL', () => {
  assert.match(ocrWorkerSource, /self\.__teachhelperWorkerBaseUrl \|\| self\.location\.href/);
  assert.doesNotMatch(
    ocrWorkerSource,
    /new URL\(`\.\.\/vendor\/\$\{path\}`, self\.location\.href\)/,
    'self.location.href is blob:null inside the fallback worker',
  );
  assert.match(
    ocrWorkerSource,
    /workerBlobURL: false/,
    'tesseract must not nest another blob worker inside this worker: tests/roster-ocr-engine.test.mjs fails with true',
  );
});

test('both worker clients share the origin fallback instead of rolling their own', () => {
  for (const [name, source] of [['ocr-vendor.js', ocrVendorSource], ['file-processing-client.js', fileProcessingClientSource]]) {
    assert.match(
      source,
      /import \{ createWorkerWithOriginFallback \} from "\.\/worker-origin-fallback\.js"/,
      `${name} must use the shared fallback`,
    );
    assert.doesNotMatch(source, /createObjectURL/, `${name} must not build its own worker blob`);
  }
});
