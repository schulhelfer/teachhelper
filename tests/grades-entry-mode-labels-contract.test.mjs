import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

test('the assessment mode control uses compact descriptive labels', () => {
  assert.match(appSource, /value = "grade";[\s\S]*?setAttribute\("aria-label", "Einzelnote"\)[\s\S]*?textContent = "Einzel\u00adnote"/);
  assert.match(appSource, /value = "test";[\s\S]*?setAttribute\("aria-label", "Bewertungseinheiten"\)[\s\S]*?textContent = "Bewertungs\u00adeinheiten"/);
  assert.match(appSource, /value = "homework";[\s\S]*?setAttribute\("aria-label", "Vorkommnis"\)[\s\S]*?textContent = "Vorkommnis"/);
  assert.match(cssSource, /\.grades-entry-mode-field \.assessment-mode-option \.grades-entry-mode-label \{[\s\S]*?font-size: 0\.76rem;[\s\S]*?hyphens: manual;/);
  const modeControl = appSource.slice(
    appSource.indexOf('.className = "grades-entry-field grades-entry-mode-field'),
    appSource.indexOf('if (occurrenceCategories.length > 1)'),
  );
  assert.ok(modeControl.length > 0);
  assert.doesNotMatch(modeControl, /setAttribute\("title"|\.title =/);
});

test('the standard grade-entry table reads only its declared draft entries', () => {
  const start = appSource.indexOf('\n  buildGradesEntryTable(');
  const end = appSource.indexOf('\n  getActiveGradeTestContext(', start);
  assert.ok(start >= 0 && end > start, 'standard entry table must be present');
  const table = appSource.slice(start, end);
  assert.doesNotMatch(table, /Object\.prototype\.hasOwnProperty\.call\(entries,/);
  assert.match(table, /Object\.prototype\.hasOwnProperty\.call\(draftEntries,/);
});

test('the BE entry table declares each student entry before using its scores', () => {
  const start = appSource.indexOf('\n  buildGradesTestEntryTable(');
  const end = appSource.indexOf('\n  openGradesEntryCoursePicker(', start);
  assert.ok(start >= 0 && end > start, 'BE entry table must be present');
  const table = appSource.slice(start, end);
  const entryDeclaration = table.indexOf('const entry = Object.prototype.hasOwnProperty.call(entries, student.id)');
  const scoreDeclaration = table.indexOf('const scores = normalizeGradeTestScores(entry?.testScores);', entryDeclaration);
  const scoreUse = table.indexOf('calculateGradeTestValue(tasks, scores', scoreDeclaration);
  assert.ok(entryDeclaration >= 0 && scoreDeclaration > entryDeclaration && scoreUse > scoreDeclaration);
});
