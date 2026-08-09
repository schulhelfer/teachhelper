import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('die Sidebar-Trennlinie erreicht im kompakten Layout die obere Modulkante', () => {
  for (const source of sources) {
    assert.match(
      source,
      /@media \(max-width: 1200px\) \{\s+\.app-window > \.sidebar-resize-handle::before \{\s+top: calc\(0px - var\(--sidebar-resize-top, 0px\)\);/,
    );
  }
});

test('die Sidebar-Grenze wird nicht doppelt durch eine zusätzliche Pseudolinie gezeichnet', () => {
  for (const source of sources) {
    assert.match(
      source,
      /@media \(max-width: 980px\) \{\s+\.app-window \{\s+grid-template-columns: minmax\(160px, min\(var\(--module-sidebar-width\), 50vw\)\) minmax\(0, 1fr\);/,
    );
    assert.doesNotMatch(source, /\.sidebar-panel::after/);
    assert.match(
      source,
      /@media \(max-width: 319px\) \{\s+\.sidebar-resize-handle \{\s+display: none !important;\s+pointer-events: none;\s+cursor: default;/,
    );
  }
});
