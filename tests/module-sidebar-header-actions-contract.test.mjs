import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('nur wirklich schmale Modul-Sidebars stapeln Tutorial- und Einstellungsbutton neben der Überschrift', () => {
  for (const source of sources) {
    assert.match(
      source,
      /\.sidebar-panel \{[\s\S]*?container-type: inline-size;[\s\S]*?@container \(max-width: 158px\) \{\s+\.sidebar-header \{[\s\S]*?min-height: 79px;[\s\S]*?padding-right: 44px;[\s\S]*?\.sidebar-header-actions \{[\s\S]*?top: -12px;[\s\S]*?right: -6px;[\s\S]*?flex-direction: column;[\s\S]*?#view-settings-btn \{\s+order: 1;[\s\S]*?#view-tutorial-btn \{\s+order: 2;/,
    );
  }
});
