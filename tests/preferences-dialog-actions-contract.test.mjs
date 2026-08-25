import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('conditions dialog uses Planning-style icon actions in its header', () => {
  const dialog = htmlSource.slice(
    htmlSource.indexOf('<dialog id="preferences-dialog"'),
    htmlSource.indexOf('</dialog>', htmlSource.indexOf('<dialog id="preferences-dialog"')),
  );

  assert.match(dialog, /<div class="dialog-actions-top app-action-group">[\s\S]*id="preferences-reset"[\s\S]*<svg class="preferences-reset-icon app-action-reset-icon"[\s\S]*id="preferences-cancel"[\s\S]*❌[\s\S]*type="submit"[\s\S]*✔️/);
  assert.match(dialog, /data-tooltip="Zurücksetzen"[\s\S]*data-tooltip="Abbrechen"[\s\S]*data-tooltip="Übernehmen"/);
  assert.doesNotMatch(dialog, /<div class="dialog-actions">[\s\S]*id="preferences-reset"/);
});
