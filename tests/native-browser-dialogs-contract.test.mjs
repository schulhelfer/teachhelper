import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fileActionsSource = await readFile(new URL('../src/app/classroom-file-actions.js', import.meta.url), 'utf8');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [indexHtml, main, runtime, seatplanHtml, seatplan] = await Promise.all([
  read('../index.html'),
  read('../src/app/app-runtime.js'),
  read('../src/modules/workspace/runtime.js'),
  read('../src/modules/seatplan/app.html'),
  read('../src/modules/seatplan/app.js'),
]);

const nativeBrowserDialog = /(?<![\w$.])(?:alert|confirm|prompt)\s*\(|(?:globalThis|window)\.(?:alert|confirm|prompt)\s*\(/;

test('PWA paths have no native browser alert, confirm, or prompt calls', () => {
  for (const source of [main, fileActionsSource, runtime, seatplan]) {
    assert.doesNotMatch(source, nativeBrowserDialog);
  }
});

test('the shell export and large-file confirmation use the shared app dialog', () => {
  assert.match(indexHtml, /<dialog id="shell-action-dialog"[\s\S]*?id="shell-action-dialog-input"[\s\S]*?id="shell-action-dialog-cancel"[\s\S]*?id="shell-action-dialog-secondary"[\s\S]*?id="shell-action-dialog-confirm"/);
  assert.match(fileActionsSource, /shellActionDialog\.prompt\(\{[\s\S]*?title: 'Dateiname festlegen'[\s\S]*?defaultValue: defaultName/);
  assert.match(fileActionsSource, /shellActionDialog\.choose\(\{[\s\S]*?title: 'Picker speichern'[\s\S]*?confirmValue: 'grades'/);
  assert.match(runtime, /await this\.confirmLargeFile\?\.\(\{[\s\S]*?formattedSize: formatFileSize\(size\)/);
  assert.doesNotMatch(runtime, /globalThis\.confirm/);
});

test('seatplan export uses an in-app filename dialog and all missing dialog fallbacks stop safely', () => {
  assert.match(seatplanHtml, /<dialog id="export-file-name-dialog"[\s\S]*?id="export-file-name-dialog-input"[\s\S]*?id="export-file-name-dialog-cancel"[\s\S]*?id="export-file-name-dialog-confirm"/);
  assert.match(seatplan, /function chooseExportFileName\(defaultName\) \{[\s\S]*?dialog\.showModal\(\)/);
  assert.match(seatplan, /const desiredName = await chooseExportFileName\(defaultName\);/);
  assert.match(seatplan, /Der Dialog zum Kurswechsel steht nicht zur Verfügung\./);
  assert.match(seatplan, /Der Dialog für die Erfassungsart steht nicht zur Verfügung\./);
});
