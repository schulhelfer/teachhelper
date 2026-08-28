import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [merger, seatplan] = await Promise.all([
  read('../src/modules/merger/app.js'),
  read('../src/modules/seatplan/app.js'),
]);

test('PDF picker opens synchronously from the dropzone user event', () => {
  const pickerStart = merger.indexOf('function openSharedPdfPicker(target)');
  const pickerEnd = merger.indexOf('function findMergeDragAfterElement(', pickerStart);
  const picker = merger.slice(pickerStart, pickerEnd);

  assert.notEqual(pickerStart, -1);
  assert.notEqual(pickerEnd, -1);
  assert.match(picker, /ui\.sharedPdfInput\.value = "";\s+ui\.sharedPdfInput\.click\(\);/);
  assert.doesNotMatch(picker, /setTimeout/);
});

test('seatplan import uses the native input directly instead of an iframe-incompatible picker', () => {
  assert.doesNotMatch(seatplan, /function pickPlanFileWithPicker/);
  assert.match(
    seatplan,
    /els\.importPlan\.addEventListener\('click', \(\) => \{\s+els\.importPlanFile\?\.click\(\);\s+\}\);/,
  );
});
