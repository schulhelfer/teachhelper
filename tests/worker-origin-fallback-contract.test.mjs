import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperSource = await readFile(new URL('../src/shared/worker-origin-fallback.js', import.meta.url), 'utf8');
const ocrWorkerSource = await readFile(new URL('../src/shared/ocr-worker.js', import.meta.url), 'utf8');
const ocrVendorSource = await readFile(new URL('../src/shared/ocr-vendor.js', import.meta.url), 'utf8');
const fileProcessingClientSource = await readFile(new URL('../src/shared/file-processing-client.js', import.meta.url), 'utf8');

const capturedBlobs = [];

function loadHelper(origin, WorkerStub) {
  const source = helperSource.replace(/\bexport function\b/g, 'function');
  const factory = new Function(
    'Blob',
    'URL',
    'window',
    'Worker',
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
  const fakeWindow = origin === undefined ? undefined : { origin, location: { origin } };
  return factory(FakeBlob, fakeUrl, fakeWindow, WorkerStub);
}

function securityError() {
  const error = new Error("cannot be accessed from origin 'null'.");
  error.name = 'SecurityError';
  return error;
}

test('an opaque origin uses the blob shim on the first call without attempting the real URL', () => {
  capturedBlobs.length = 0;
  const urls = [];
  const WorkerStub = class {
    constructor(url) {
      urls.push(String(url));
      this.id = 'worker';
    }
  };
  const { createWorkerWithOriginFallback } = loadHelper('null', WorkerStub);

  createWorkerWithOriginFallback(
    new URL('https://example.test/app/file-processing-worker.js'),
    { type: 'module' },
  );

  assert.equal(
    urls.length,
    1,
    'a cross-origin worker request is refused asynchronously via onerror, so it must never be attempted',
  );
  assert.match(urls[0], /^blob:/);
  assert.match(
    capturedBlobs[0],
    /import\("https:\/\/example\.test\/app\/file-processing-worker\.js"\)/,
  );
});

test('the blob fallback of a module worker is started as a classic worker', () => {
  capturedBlobs.length = 0;
  const optionsSeen = [];
  const WorkerStub = class {
    constructor(url, options) {
      optionsSeen.push(options);
      this.id = 'worker';
    }
  };
  const { createWorkerWithOriginFallback } = loadHelper('null', WorkerStub);

  createWorkerWithOriginFallback(
    new URL('https://example.test/app/file-processing-worker.js'),
    { type: 'module' },
  );

  assert.deepEqual(
    optionsSeen,
    [undefined],
    'Chromium refuses a type:"module" blob worker in an opaque origin, so the shim must be classic',
  );
});

test('the module shim queues messages that arrive before the import resolves', () => {
  capturedBlobs.length = 0;
  const WorkerStub = class {
    constructor() { this.id = 'worker'; }
  };
  const { createWorkerWithOriginFallback } = loadHelper('null', WorkerStub);

  createWorkerWithOriginFallback(
    new URL('https://example.test/app/file-processing-worker.js'),
    { type: 'module' },
  );

  const shim = capturedBlobs[0];
  assert.match(shim, /queued\.push\(event\)/, 'the client posts immediately after construction');
  assert.match(shim, /queued\.splice\(0\)/, 'buffered messages must be replayed once the module is live');
  assert.doesNotMatch(shim, /^\s*await import/, 'top-level await is unavailable in a classic worker');
  assert.match(
    shim,
    /self\.dispatchEvent\(new MessageEvent\("message"/,
    'pdf.worker.mjs listens via addEventListener, which a replay through self.onmessage never reaches',
  );
});

test('a same-origin document starts the worker from the real URL and builds no blob', () => {
  capturedBlobs.length = 0;
  const urls = [];
  const WorkerStub = class {
    constructor(url) {
      urls.push(String(url));
      this.id = 'worker';
    }
  };
  const { createWorkerWithOriginFallback } = loadHelper('https://example.test', WorkerStub);

  createWorkerWithOriginFallback(
    new URL('https://example.test/app/file-processing-worker.js'),
    { type: 'module' },
  );

  assert.deepEqual(urls, ['https://example.test/app/file-processing-worker.js']);
  assert.equal(capturedBlobs.length, 0);
});

test('an injected worker factory bypasses the opaque-origin detection', () => {
  capturedBlobs.length = 0;
  const urls = [];
  const { createWorkerWithOriginFallback } = loadHelper('null');
  const workerFactory = (url) => {
    urls.push(String(url));
    return { id: 'stub' };
  };

  createWorkerWithOriginFallback(new URL('https://example.test/w.js'), { workerFactory });

  assert.deepEqual(urls, ['https://example.test/w.js']);
  assert.equal(capturedBlobs.length, 0);
});

test('the origin fallback decides up front instead of waiting for an asynchronous worker error', () => {
  assert.match(
    helperSource,
    /window\.origin === "null" \|\| window\.location\.origin === "null"/,
    'a sandboxed frame without allow-same-origin never throws synchronously in Chromium',
  );
});

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
    /import\("https:\/\/example\.test\/app\/file-processing-worker\.js"\)/,
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
