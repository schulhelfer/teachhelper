import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const seatplan = await read('../src/modules/seatplan/app.js');

test('seatplan import uses the native input directly instead of an iframe-incompatible picker', () => {
  assert.doesNotMatch(seatplan, /function pickPlanFileWithPicker/);
  assert.match(
    seatplan,
    /els\.importPlan\.addEventListener\('click', \(\) => \{\s+els\.importPlanFile\?\.click\(\);\s+\}\);/,
  );
});
