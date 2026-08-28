import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/duplicate-check/app.js', import.meta.url), 'utf8');

test('the ZIP dropzone opens the native file input directly from user activation', () => {
  const pickerStart = source.indexOf('function openZipPicker()');
  const pickerEnd = source.indexOf('function toggleDuplicateRule(', pickerStart);
  const picker = source.slice(pickerStart, pickerEnd);

  assert.notEqual(pickerStart, -1);
  assert.notEqual(pickerEnd, -1);
  assert.match(picker, /if \(tutorialDemoActive\) return;\s+ui\.zipInput\?\.click\(\);/);
  assert.doesNotMatch(picker, /showOpenFilePicker|await|catch/);
});
