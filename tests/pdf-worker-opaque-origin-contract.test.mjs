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

test('pdf.js falls back to its blob: worker wrapper in opaque-origin module frames', () => {
  // Module-iframes ohne allow-same-origin dürfen keinen Worker von einer https:-URL
  // starten. Ohne diese Umschaltung fällt pdf.js still auf den Main-Thread-Fake-Worker
  // zurück und blockiert die UI beim Rendern jeder PDF-Seite.
  assert.match(pdfVendorSource, /window\.origin === "null"/);
  assert.match(pdfVendorSource, /pdfjsLib\.PDFWorker\._isSameOrigin = \(\) => false;/);
});

test('the opaque-origin switch stays guarded against pdf.js internals changing', () => {
  assert.match(
    pdfVendorSource,
    /typeof pdfjsLib\.PDFWorker\?\._isSameOrigin === "function"/,
  );
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
