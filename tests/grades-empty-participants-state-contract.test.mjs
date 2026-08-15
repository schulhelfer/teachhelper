import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

function extractClassMethod(name, nextName) {
  const start = appSource.indexOf(`\n  ${name}(`);
  const end = appSource.indexOf(`\n  ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} must exist before ${nextName}`);
  return appSource.slice(start, end);
}

test('empty grade entry views keep enough layout height for their message and add button', () => {
  const method = extractClassMethod('renderGradesEntryEmptyState', 'ensureGradesEntrySaveNoticeOverlay');

  assert.match(method, /classList\.add\("is-empty-state"\)/);
  assert.doesNotMatch(method, /classList\.toggle\("is-empty-state", showUnlockButton\)/);
  assert.match(method, /primaryAction === "createCourse" \|\| primaryAction === "manageStudents"/);
  assert.match(method, /class="sidebar-add-btn"[\s\S]*sidebar-add-plus/);
  assert.match(appCss, /\.grades-entry-content\.is-empty-state\s*\{[\s\S]*?min-height:\s*100%/);
});

test('rendering a populated grade entry view clears all empty-state positioning classes', () => {
  const method = extractClassMethod('renderGradesEntryView', 'renderGradesViewWithEntryModeFade');

  assert.match(method, /classList\.remove\("is-empty-state"\)/);
  assert.match(method, /classList\.remove\("has-offset-empty-state"\)/);
  assert.match(method, /"Noch keine Teilnehmenden eingetragen"[\s\S]*primaryAction: "manageStudents"/);
});
