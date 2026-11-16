import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [styleSource, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

function methodBody(signature) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = appSource.match(new RegExp(`\\n  ${escaped} \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(match, `${signature} muss vorhanden sein`);
  return match[0];
}

test('Die BE-Maske markiert nur den Kopf der aktiven Aufgabenspalte', () => {
  const updater = methodBody('updateActiveGradeTestColumnHeadHighlight(root)');
  assert.match(updater, /querySelectorAll\("\.grades-test-entry-table thead th"\)/);
  assert.match(updater, /dataset\.gradeTestTaskColumn/);
  assert.doesNotMatch(updater, /gradeTestParentTask|gradeTestGroup/);
  assert.match(updater, /classList\.toggle\("is-active-grade-column-head", isColumnHead\)/);
});

test('Die zentrale Kopfmarkierung bezieht die BE-Maske ein', () => {
  const updater = methodBody('updateActiveGradeColumnHeadHighlight(root = this.getActiveGradeInputRoot())');
  assert.match(updater, /this\.updateActiveGradeTestColumnHeadHighlight\(root\);/);
});

test('Fokus auf eine BE2-Zelle setzt die aktive Aufgabe, Verlassen entfernt sie', () => {
  const focusHandler = methodBody('handleGradesTableFocusIn(event)');
  assert.match(
    focusHandler,
    /this\.activeGradeTestTaskId = this\.getGradeTestTaskIdForInput\(gradeInput\);\s*this\.updateActiveGradeStudentHighlight\(\);/,
  );

  const blurHandler = methodBody('handleGradesTableBlur(event)');
  assert.match(blurHandler, /input\[data-grade-test-score='1'\]/);
  assert.match(blurHandler, /this\.activeGradeTestTaskId = null;\s*this\.updateActiveGradeColumnHeadHighlight\(\);/);

  const clearFocus = methodBody('clearActiveGradeStudentFocus(input = null)');
  assert.match(clearFocus, /this\.activeGradeTestTaskId = null;/);
});

test('Die markierte BE-Kopfzelle hat einen eigenen Stil', () => {
  assert.match(
    styleSource,
    /\.grades-test-entry-table thead th\.is-active-grade-column-head \{[^}]*--grade-cell-shadow:[^}]*var\(--accent-soft\)/,
  );
});
