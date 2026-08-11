import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [runtimeSource, workspaceSource, planningSource, gradesSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

function methodSource(source, method) {
  const start = source.indexOf(`  async ${method}(`) >= 0
    ? source.indexOf(`  async ${method}(`)
    : source.indexOf(`  ${method}(`);
  const boundary = source.slice(start + 1).search(/\n  (?:async )?[A-Za-z_$][\w$]*\(/);
  assert.ok(start >= 0 && boundary >= 0, `${method} muss vorhanden sein`);
  return source.slice(start, start + 1 + boundary);
}

test('eine gemeinsame Disketten-Persistenz exportiert nur im manuellen Modus', () => {
  assert.match(runtimeSource, /async persistExplicitDatabaseSave\(\) \{\s+if \(!this\.isManualPersistenceMode\(\)\) return true;\s+return this\.saveManualDatabase\(\);/);
  assert.match(runtimeSource, /name === 'explicit-save'/);
  assert.match(workspaceSource, /'explicit-save'/);
});

test('ein abgebrochener Datenbank-Dateidialog wird still behandelt', () => {
  const planningStart = planningSource.indexOf('  async selectSyncFile(mode = "existing", options = {})');
  const planningEnd = planningSource.indexOf('\n  async acceptWorkspaceSyncFileHandle', planningStart);
  assert.ok(planningStart >= 0 && planningEnd > planningStart);
  const planningPicker = planningSource.slice(planningStart, planningEnd);
  assert.match(planningPicker, /mode === "new-empty"/);
  assert.match(planningPicker, /const owner = this\.workspaceController\.getOwner\?\.\(\);[\s\S]*?owner\?\.buildSyncFileSuggestedName\?\.\(\)/);
  assert.match(planningPicker, /error\?\.name !== "AbortError"/);
  assert.match(planningSource, /dbCreateNewBtn\.addEventListener\("click", async \(\) => \{\s+await this\.startEmptyDatabase\(\);/);
  assert.match(planningSource, /async startEmptyDatabase\(\)[\s\S]*?selectSyncFile\("new-empty", \{ schoolYearStart \}\)/);
});


test('die Disketten-Dialoge speichern nach erfolgreichen Datenbankänderungen', () => {
  for (const reason of [
    'planning-settings-save', 'planning-course-name-save', 'planning-course-subject-save',
    'planning-course-color-save', 'planning-course-save', 'planning-slot-series-save',
    'planning-cancellation-save', 'planning-topic-save', 'planning-free-range-save',
    'planning-special-day-save',
  ]) assert.match(planningSource, new RegExp(`persistExplicitDatabaseSave\\("${reason}"\\)`));

  for (const method of [
    'openCourseRenameDialog', 'openCourseSubjectDialog', 'submitCourseColorDialog',
    'submitCourseDialog', 'submitCourseStudentsDialog', 'submitCourseStructureDialog',
    'submitGradeAccommodationDialog', 'applySettingsSaveForActiveTab',
  ]) {
    assert.match(methodSource(gradesSource, method), /persistExplicitDatabaseSave\(\)/);
  }
  assert.match(methodSource(gradesSource, 'saveCurrentGradesEntry'), /saveGradesEntryImmediatelyAfterDiskSave\(\)/);
});

test('reine Entwurfs- und Vorlagen-Dialoge lösen keinen unvollständigen Datenbankexport aus', () => {
  for (const method of ['saveCompetenceExpectationsDialog', 'saveGradeTaskCompetenceDialog', 'saveExpectationHorizonDialog']) {
    assert.doesNotMatch(methodSource(gradesSource, method), /persistExplicitDatabaseSave/);
  }
});
