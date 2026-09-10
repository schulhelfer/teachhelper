import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, main] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('the picker reloads saved JSON state instead of replacing the shared CSV roster', () => {
  assert.match(
    html,
    /id="random-picker-import"[\s\S]*?title="Gespeicherten Pickerstand laden">Picker<br>laden<\/button>/,
  );
  assert.match(
    main,
    /randomPickerController = mountRandomPicker\(\{[\s\S]*?onImport: \(\) => \{\s*void handlePlanImportAction\(\);\s*\},[\s\S]*?onExport:/,
  );
  assert.doesNotMatch(
    main,
    /onImport: \(\) => \{[\s\S]{0,300}?els\.file\.(?:click|value)/,
  );
});

test('the shared CSV roster remains exclusively available through the Groups dropzone', () => {
  assert.match(main, /els\.csvDropZone\.addEventListener\('drop', async \(e\) => \{/);
  assert.match(main, /const csvFile = droppedFiles\.find\(isCsvFile\);/);
  assert.match(main, /await importCsvFromFile\(csvFile\);/);
});
