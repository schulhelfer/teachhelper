import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const persistenceSource = await readFile(new URL('../src/modules/workspace/workspace-persistence.js', import.meta.url), 'utf8');

test('der manuelle JSON-Export wird als Download statt als navigierbares JSON ausgeliefert', () => {
  assert.match(persistenceSource, /function downloadBytes\(bytes, fileName\) \{[\s\S]*?type: 'application\/octet-stream'/);
  assert.match(persistenceSource, /anchor\.download = String\(fileName \|\| 'TeachHelper-Datenbank\.json'\);/);
  assert.match(persistenceSource, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 30_000\);/);
});
