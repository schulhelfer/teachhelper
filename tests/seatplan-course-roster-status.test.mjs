import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/seatplan/app.js', import.meta.url),
  'utf8',
);

test('course seatplans hide the redundant grade-roster status text', () => {
  const method = appSource.match(/function updateCsvStatusDisplay\(\) \{[\s\S]*?\n          \}/)?.[0] || '';
  assert.match(method, /isCourseSeatplanMode\(\)[\s\S]*?els\.csvStatus\.hidden = true/);
  assert.match(method, /els\.csvStatus\.hidden = false[\s\S]*?renderCsvStatus\(state\.csvName\)/);
  assert.doesNotMatch(method, /Kursteilnehmer aus dem Notenmodul/);
});
