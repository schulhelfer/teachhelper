import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

test('die fixierte Notenübersichtskopfzeile deckt den Tabellenrumpf vollständig ab', () => {
  assert.match(
    source,
    /\.grades-master-table \{\s+position: relative;\s+isolation: isolate;/,
  );
  assert.match(
    source,
    /\.grades-master-table thead \{[\s\S]*?z-index: 30;[\s\S]*?isolation: isolate;[\s\S]*?background: var\(--surface-week-header\);/,
  );
});
