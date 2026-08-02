import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssSources = await Promise.all([
  ['sidebar-help-button', '../src/app/shell.css'],
  ['settings-nav-btn', '../src/modules/planning/app.css'],
  ['module-tutorial-button', '../src/modules/duplicate-check/app.css'],
  ['module-tutorial-button', '../src/modules/merger/app.css'],
  ['module-tutorial-button', '../src/modules/qr/app.css'],
  ['module-tutorial-button', '../src/modules/seatplan/app.css'],
].map(async ([selector, path]) => ({
  selector,
  source: await readFile(new URL(path, import.meta.url), 'utf8'),
})));

test('zeigt auf jedem Tutorial-Einstieg den Finger-Cursor', () => {
  cssSources.forEach(({ selector, source }) => {
    const selectorPattern = selector.replaceAll('-', '\\-');
    assert.match(
      source,
      new RegExp(`\\.${selectorPattern}\\s*\\{[\\s\\S]{0,520}?cursor:\\s*pointer;`),
    );
  });
});
