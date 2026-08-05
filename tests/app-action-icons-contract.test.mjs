import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [styles, rootHtml, planningHtml, gradesJs, seatplanHtml, serviceWorker] = await Promise.all([
  readFile(new URL('../src/shared/app-action-icons.css', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);

test('shared action icons are available in every affected offline app shell', () => {
  assert.match(styles, /\.app-action-group/);
  assert.match(styles, /\.app-action-icon/);
  assert.match(styles, /\.app-action-reset-icon/);
  [rootHtml, planningHtml, seatplanHtml].forEach((source) => {
    assert.match(source, /app-action-icons\.css/);
  });
  assert.match(serviceWorker, /'\.\/src\/shared\/app-action-icons\.css'/);
});

test('direct dialog actions use app tooltips and place cancellation last', () => {
  assert.match(rootHtml, /id="preferences-reset"[\s\S]*data-tooltip="Zurücksetzen"[\s\S]*💾[\s\S]*id="preferences-cancel"[\s\S]*❌/);
  assert.match(planningHtml, /id="course-dialog-cancel"[\s\S]*data-tooltip="Abbrechen"/);
  assert.match(planningHtml, /data-tooltip="Speichern">💾<\/button>\s*<button[^>]*id="course-dialog-cancel"/);
  assert.match(seatplanHtml, /id="grid-dialog-cancel"[^>]*data-tooltip="Abbrechen">❌/);
  assert.match(seatplanHtml, /id="preferences-reset-all"[\s\S]*app-action-reset-icon[\s\S]*id="preferences-reset-gender"[\s\S]*💾[\s\S]*id="preferences-cancel"[\s\S]*❌/);
});

test('embedded and dynamic editors retain their event hooks while adopting the shared action design', () => {
  assert.match(planningHtml, /form="slot-form" class="dialog-icon-button app-action-icon"[\s\S]*data-tooltip="Slot speichern"/);
  assert.match(planningHtml, /id="slot-reset" class="ghost dialog-icon-button app-action-icon"/);
  assert.match(gradesJs, /data-grades-entry-save="1" aria-label="Speichern" data-tooltip="Speichern">💾/);
  assert.match(gradesJs, /data-grades-entry-cancel="1" aria-label="Abbrechen" data-tooltip="Abbrechen">❌/);
});
