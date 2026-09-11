import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, styles] = await Promise.all([
  readFile(new URL('../src/modules/duplicate-check/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/duplicate-check/app.css', import.meta.url), 'utf8'),
]);

test('der Bildvergleich zeigt alle darstellbaren Bilder einer Gruppe gleichzeitig', () => {
  const start = source.indexOf('function openCompareDialog(group)');
  const end = source.indexOf('function renderPreviewPane(', start);
  const dialog = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(dialog, /const previewRecords = getPreviewRecordsForGroup\(group\);/);
  assert.match(dialog, /body\.append\(\.\.\.previewRecords\.map\(/);
  assert.doesNotMatch(dialog, /preview-nav-button|Zurück|Weiter|activePairIndex/);
});

test('die Bildübersicht ist responsiv und bleibt bei großen Gruppen scrollbar', () => {
  assert.match(styles, /\.preview-body \{\s+min-height: 0;\s+overflow: auto;\s+display: grid;\s+grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 280px\), 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*?\.preview-body \{\s+grid-template-columns: 1fr;/);
});
