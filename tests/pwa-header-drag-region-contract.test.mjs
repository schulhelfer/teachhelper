import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shellCss = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');

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

function selectorsWithRegion(block, region) {
  return [...block.matchAll(/([^{}]+)\{[^{}]*app-region:\s*([a-z-]+)[^{}]*\}/g)]
    .filter((match) => match[2].trim() === region)
    .map((match) => match[1])
    .join(',');
}

test('die Kopfzeilen-Container geben ihren Leerraum als Ziehfläche frei', () => {
  const block = windowControlsOverlayBlock();
  const dragSelectors = selectorsWithRegion(block, 'drag');
  assert.match(dragSelectors, /\.app-header\b/);
  assert.match(
    dragSelectors,
    /\.tab-nav/,
    'der freie Platz rechts der Tabs gehoert zur .tab-nav - ohne drag laesst sich das Fenster dort nicht verschieben',
  );
  assert.match(dragSelectors, /\.app-header-title/);
  assert.doesNotMatch(
    dragSelectors,
    /\.app-header-actions/,
    'der Leerraum der Aktionsleiste ist schon ueber .app-header ziehbar - eine eigene Ziehflaeche '
    + 'legt sich als volle Header-Zeile wieder ueber die no-drag-Aussparung der Versionsnummer',
  );
});

test('kein pauschaler Reset nimmt den Kindern der Kopfzeile die Ziehfläche', () => {
  const block = windowControlsOverlayBlock();
  const neutralSelectors = selectorsWithRegion(block, 'none');
  assert.doesNotMatch(
    neutralSelectors,
    /\.app-header\s*>\s*\*/,
    'app-region: none auf allen Kindern vererbt sich auf die .tab-nav und macht die Leerflaechen unziehbar',
  );
});

test('alles Bedienbare in der Kopfzeile bleibt anklickbar', () => {
  const block = windowControlsOverlayBlock();
  const noDragSelectors = selectorsWithRegion(block, 'no-drag');
  assert.match(noDragSelectors, /\.app-header button/);
  assert.match(noDragSelectors, /\.app-header \[role='button'\]/);
  assert.match(
    noDragSelectors,
    /\.more-tools-menu/,
    'das Dropdown-Panel liegt ueber der Ziehflaeche und braucht eigene Klicks',
  );
});
