import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);
const resizeSource = await readFile(new URL('../src/shared/sidebar-resize.js', import.meta.url), 'utf8');

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

test('die Sidebar bleibt im kompakten Layout bündig mit dem Modulrand', () => {
  for (const source of sources) {
    assert.match(
      source,
      /@media \(max-width: 1200px\) \{\s+\.app-window \{\s+grid-template-columns: minmax\(160px, min\(var\(--module-sidebar-width\), 50vw\)\) minmax\(0, 1fr\);\s+\/\* Keep the sidebar flush with the module edge at browser zoom levels\. \*\/\s+padding: 0;\s+column-gap: 0;/,
    );
    assert.doesNotMatch(source, /@media \(max-width: 1200px\) \{[\s\S]{0,360}\.app-window \{[\s\S]{0,240}padding: 10px;/);
  }
});

test('die horizontalen Sidebar-Trenner verwenden die Theme-Farbe', () => {
  for (const source of sources) {
    assert.match(
      source,
      /\.sidebar-list li\[data-course-id="separator"\] \{\s+margin: 0\.2rem 0 0\.1rem;\s+padding-top: 0\.45rem;\s+border-top: 1px solid var\(--sidebar-border\);/,
    );
  }
});

test('die Sidebar-Fläche ist gegen darunterliegende Hauptansichten deckend', () => {
  for (const source of sources) {
    assert.match(
      source,
      /\.sidebar-panel \{\s+position: relative;\s+background: var\(--sidebar-surface-opaque, var\(--sidebar-surface\)\);/,
    );
  }
});

test('die Scrollbar-Spur der Sidebar bleibt Teil ihrer Fläche', () => {
  for (const source of sources) {
    assert.match(
      source,
      /\.sidebar-panel \{\s+scrollbar-color: var\(--scrollbar-thumb\) transparent;\s+\}\s+\.sidebar-panel::-webkit-scrollbar-track \{\s+background: var\(--sidebar-surface-opaque, var\(--sidebar-surface\)\);/,
    );
  }
});

test('der Resize-Griff zentriert die Sidebar-Linie auf ihrer tatsächlichen Kante', () => {
  assert.match(
    resizeSource,
    /--sidebar-resize-left', `\$\{Math\.round\(sidebarBounds\.right - appBounds\.left - 7\)\}px`/,
  );
});
