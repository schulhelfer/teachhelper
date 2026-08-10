import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeSource = await readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8');

test('der manuelle JSON-Export wird als Download statt als navigierbares JSON ausgeliefert', () => {
  assert.match(runtimeSource, /function downloadBytes\(bytes, fileName\) \{[\s\S]*?type: 'application\/octet-stream'/);
  assert.match(runtimeSource, /anchor\.download = String\(fileName \|\| 'TeachHelper-Datenbank\.json'\);/);
  assert.match(runtimeSource, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 30_000\);/);
});
