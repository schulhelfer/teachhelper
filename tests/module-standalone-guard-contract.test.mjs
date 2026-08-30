import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((source) => source.split('\r\n').join('\n'));

const MODULE_TABS = {
  grades: 'grades',
  planning: 'planning',
  seatplan: 'seatplan',
  'name-learning': 'name-learning',
  merger: 'merger',
  'duplicate-check': 'duplicate-check',
  qr: 'qr',
};

const DEEP_LINK_MODULES = new Set(['merger', 'duplicate-check', 'qr']);

const guard = await read('../src/shared/module-standalone-guard.js');
const pages = new Map(
  await Promise.all(
    Object.keys(MODULE_TABS).map(async (name) => [name, await read(`../src/modules/${name}/app.html`)]),
  ),
);

test('jede Modulseite bindet den Standalone-Guard als erstes Skript ein', () => {
  for (const [name, source] of pages) {
    const firstScript = source.match(/<script\b[^>]*>/);
    assert.ok(firstScript, `${name}: kein Skript gefunden`);
    assert.match(
      firstScript[0],
      /src="\.\.\/\.\.\/shared\/module-standalone-guard\.js"/,
      `${name}: der Guard muss das erste Skript der Seite sein`,
    );
    assert.match(
      firstScript[0],
      new RegExp(`data-module-tab="${MODULE_TABS[name]}"`),
      `${name}: data-module-tab fehlt oder passt nicht zum Modul`,
    );
  }
});

test('das CSP-Meta steht weiterhin vor dem Guard', () => {
  for (const [name, source] of pages) {
    const cspIndex = source.search(/<meta\b[^>]*http-equiv="Content-Security-Policy"/i);
    const guardIndex = source.search(/<script\b[^>]*module-standalone-guard\.js/);
    assert.ok(cspIndex >= 0, `${name}: CSP-Meta fehlt`);
    assert.ok(guardIndex > cspIndex, `${name}: der Guard darf nicht vor dem CSP-Meta stehen`);
  }
});

test('der Guard greift nur im Top-Level-Dokument und stoppt den Seitenaufbau', () => {
  assert.match(guard, /window\.parent && window\.parent !== window\) return;/);
  assert.match(guard, /window\.top && window\.top !== window\) return;/);
  assert.match(guard, /window\.location\.replace\(target\)/);
  assert.match(guard, /document\.documentElement\.remove\(\)/);
});

test('nur ausklinkbare Werkzeuge bekommen einen Shell-Deeplink', async () => {
  const deepLinkMatch = guard.match(/const DEEP_LINK_TABS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(deepLinkMatch, 'DEEP_LINK_TABS fehlt');
  const tabs = [...deepLinkMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...tabs].sort(), [...DEEP_LINK_MODULES].sort());

  const moduleWindow = await read('../src/app/module-window.js');
  for (const tab of tabs) {
    assert.ok(
      moduleWindow.includes(`'${tab}'`) || moduleWindow.includes(`TAB_${tab.replace(/-/g, '_').toUpperCase()}`),
      `${tab} muss ein bekannter Tear-Off-Tab sein`,
    );
  }
  assert.match(guard, /searchParams\.set\('tab', requestedTab\)/);
  assert.match(guard, /searchParams\.set\('window', 'module'\)/);
});

test('grades und planning starten ohne Shell niemals einen schreibenden Workspace', async () => {
  for (const name of ['grades', 'planning']) {
    const source = await read(`../src/modules/${name}/app.js`);
    const fallback = source.match(/getParentWorkspaceController\(\)\s*\|\|\s*createWorkspaceController\(\{[\s\S]*?\}\)/);
    assert.ok(fallback, `${name}: Workspace-Fallback nicht gefunden`);
    assert.match(
      fallback[0],
      /ephemeral: true/,
      `${name}: der Fallback-Controller muss ephemer bleiben`,
    );
  }
});

test('der Guard wird mit der App-Shell vorgecacht', async () => {
  const serviceWorker = await read('../sw.js');
  assert.match(serviceWorker, /'\.\/src\/shared\/module-standalone-guard\.js',/);
});
