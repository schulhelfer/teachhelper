import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shellCss = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function windowControlsOverlayBlock() {
  const start = shellCss.indexOf('@media (display-mode: window-controls-overlay)');
  assert.ok(start >= 0, 'der Window-Controls-Overlay-Block muss existieren');
  const bodyStart = shellCss.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < shellCss.length; index += 1) {
    if (shellCss[index] === '{') depth += 1;
    if (shellCss[index] === '}') depth -= 1;
    if (depth === 0) return shellCss.slice(start, index + 1);
  }
  throw new Error('der Window-Controls-Overlay-Block ist unvollständig');
}

test('die Tab-Leiste wandert im PWA-Fenster mit dem Titel mit', () => {
  const block = windowControlsOverlayBlock();
  assert.match(
    block,
    /\.app-header-actions \{\s*padding-left: calc\(var\(--window-controls-left\)[\s\S]*?\);\s*\}/,
  );
});

test('der Titelbereich um die Versionsnummer ist keine Fenster-Ziehfläche', () => {
  const block = windowControlsOverlayBlock();
  const noDragRules = [...block.matchAll(/([^{}]+)\{[^{}]*app-region:\s*no-drag[^{}]*\}/g)]
    .map((match) => match[1]);
  const selectors = noDragRules.join(',');
  assert.match(selectors, /\.app-header-title-label/);
  assert.match(selectors, /\.app-header-version/);
  assert.match(selectors, /\.app-header \[role='button'\]/);
});

test('die Versionsnummer behält den Zeiger-Cursor', () => {
  assert.match(
    shellCss,
    /\.app-header-version\[role='button'\] \{[\s\S]*?cursor: pointer;/,
  );
});

test('die Versionsnummer bleibt eine Schaltfläche im Titel-Label', () => {
  assert.match(
    indexHtml,
    /class="app-header-title-label"[\s\S]*?id="app-header-version"[\s\S]*?role="button"/,
  );
});
