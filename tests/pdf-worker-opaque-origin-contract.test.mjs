import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);
const pdfVendorSource = await readFile(new URL('src/shared/pdf-vendor.js', rootUrl), 'utf8');

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'tests']);

async function collectHtmlFiles(directoryUrl, relativePath = '') {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(
        ...(await collectHtmlFiles(
          new URL(`${entry.name}/`, directoryUrl),
          `${relativePath}${entry.name}/`,
        )),
      );
    } else if (entry.name.endsWith('.html')) {
      files.push(`${relativePath}${entry.name}`);
    }
  }
  return files;
}

const htmlFiles = await collectHtmlFiles(rootUrl);
const pageSources = new Map(
  await Promise.all(
    htmlFiles.map(async (file) => [file, await readFile(new URL(file, rootUrl), 'utf8')]),
  ),
);

test('pdf.js receives a prebuilt worker in opaque-origin module frames', () => {
  assert.match(pdfVendorSource, /window\.origin === "null"/);
  assert.match(
    pdfVendorSource,
    /GlobalWorkerOptions\.workerPort = createWorkerWithOriginFallback\(/,
    'PDFWorker builds its own wrapper with type:"module", which Chromium refuses in an opaque origin',
  );
  assert.match(
    pdfVendorSource,
    /import \{ createWorkerWithOriginFallback \} from "\.\/worker-origin-fallback\.js"/,
    'pdf-vendor.js must reuse the shared fallback instead of rolling its own blob worker',
  );
});

test('the prebuilt worker port is only used where the native pdf.js path fails', () => {
  assert.match(
    pdfVendorSource,
    /if \(!isOpaqueOriginContext\(\) \|\| pdfjsLib\.GlobalWorkerOptions\.workerPort\) return;/,
    'a same-origin document must keep pdf.js own worker handling',
  );
  assert.match(pdfVendorSource, /workerSrc = PDF_JS_WORKER_URL\.href/);
});

test('every page allows blob: workers so the real pdf.js worker can start', () => {
  assert.ok(htmlFiles.length > 0, 'expected to find HTML documents');
  for (const file of htmlFiles) {
    const source = pageSources.get(file);
    assert.match(
      source,
      /worker-src 'self' blob:;/,
      `${file} must allow blob: in worker-src`,
    );
  }
});

test('relaxing worker-src does not loosen script execution', () => {
  for (const file of htmlFiles) {
    const source = pageSources.get(file);
    assert.match(source, /script-src 'self';/, `${file} must keep script-src 'self'`);
    assert.doesNotMatch(source, /'unsafe-inline'/, `${file} must not allow inline scripts`);
    assert.doesNotMatch(source, /'unsafe-eval'/, `${file} must not allow eval`);
  }
});
