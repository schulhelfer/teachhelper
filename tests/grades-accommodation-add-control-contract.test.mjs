import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appHtml = await readFile(
  new URL('../src/modules/grades/app.html', import.meta.url),
  'utf8',
);

test('the accommodation dialog places its add-card button below the cards', () => {
  const dialogStart = appHtml.indexOf('<dialog id="grade-accommodation-dialog"');
  const dialogEnd = appHtml.indexOf('</dialog>', dialogStart);
  const dialog = appHtml.slice(dialogStart, dialogEnd);
  const actionsEnd = dialog.indexOf('</div>', dialog.indexOf('<div class="dialog-actions-top'));
  const addButton = dialog.indexOf('id="grade-accommodation-add"');

  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, 'accommodation dialog must exist');
  assert.ok(addButton > actionsEnd, 'add-card button must not be in the upper action group');
  assert.match(dialog, /<div class="button-row grade-accommodation-add-row">[\s\S]*?id="grade-accommodation-add" class="sidebar-add-btn"[\s\S]*?sidebar-add-plus/);
});
