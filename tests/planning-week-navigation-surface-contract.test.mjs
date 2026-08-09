import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8');

test('die Wochenansicht zeichnet keinen Navigationsschatten über dem Tabellenraster', () => {
  assert.match(
    source,
    /body\[data-view="week"\] \.header-glass \{\s+box-shadow: none;/,
  );
});
