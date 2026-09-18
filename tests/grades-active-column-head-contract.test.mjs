import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [styleSource, appSource] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
]);

test('Die Kopfmarkierung wird zentral ueber den Spaltenschluessel gesetzt und wieder entfernt', () => {
  const updater = appSource.match(
    /updateActiveGradeColumnHeadHighlight\(root = this\.getActiveGradeInputRoot\(\)\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(updater, 'updateActiveGradeColumnHeadHighlight muss vorhanden sein');
  assert.match(updater[0], /querySelectorAll\("\.grades-master-table thead th"\)/);
  assert.match(updater[0], /classList\.toggle\("is-active-grade-column-head", isColumnHead\)/);
  assert.doesNotMatch(updater[0], /is-active-grade-group-head/);
});

test('Genau die unmittelbar uebergeordnete Kategorie wird mitmarkiert', () => {
  const updater = appSource.match(
    /updateActiveGradeColumnHeadHighlight\(root = this\.getActiveGradeInputRoot\(\)\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(updater);
  assert.match(updater[0], /dataset\.gradeHeadParentGroupKey/);
  assert.match(updater[0], /parentGroupKeys\.add\(parentGroupKey\)/);
  assert.match(
    updater[0],
    /isDirectColumnHead\(node\)\s*\|\| \(Boolean\(headGroupKey\) && parentGroupKeys\.has\(headGroupKey\)\)/,
  );
});

test('Die Kopfzellen tragen eigene Gruppe und unmittelbare Elterngruppe im Markup', () => {
  const headerCellBody = appSource.match(
    /renderGradesTableHeaderCell\(cell, options = \{\}\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(headerCellBody);
  assert.match(
    headerCellBody[0],
    /const headGroupKey = this\.getGradeHeaderCellGroupKey\(cell\);\s*if \(headGroupKey\) \{\s*th\.dataset\.gradeHeadGroupKey = headGroupKey;/,
  );
  assert.match(
    headerCellBody[0],
    /const headParentGroupKey = this\.getActiveGradeColumnParentGroupKey\(cell\);[\s\S]*?th\.dataset\.gradeHeadParentGroupKey = headParentGroupKey;/,
  );

  const parentHelper = appSource.match(
    /getActiveGradeColumnParentGroupKey\(column\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(parentHelper, 'getActiveGradeColumnParentGroupKey muss vorhanden sein');
  assert.match(parentHelper[0], /subcategory:\$\{period\}:\$\{categoryId\}:\$\{subcategoryId\}/);
  assert.match(parentHelper[0], /category:\$\{period\}:\$\{categoryId\}/);
});

test('Die Kette ueber die unmittelbare Gruppe hinaus bleibt unmarkiert', () => {
  const groupHelper = appSource.match(
    /getGradeHeaderCellGroupKey\(cell\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(groupHelper, 'getGradeHeaderCellGroupKey muss vorhanden sein');
  assert.doesNotMatch(groupHelper[0], /type === "period"/);
  assert.doesNotMatch(appSource, /gradeHeadAncestorKeys|getGradeHeaderCellAncestorKeys/);
  assert.doesNotMatch(styleSource, /is-active-grade-group-head/);
});

test('Die Markierung folgt dem Fokus einer errechneten Zelle ohne Neuaufbau', () => {
  const focusHandler = appSource.match(
    /handleGradesTableFocusIn\(event\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(focusHandler, 'handleGradesTableFocusIn muss vorhanden sein');
  assert.match(
    focusHandler[0],
    /this\.updateActiveGradeColumnHeadHighlight\(\);\s*this\.openGradePickerForInput\(gradeInput, \{ mode: "override" \}\)/,
  );
});

test('Die Markierung wird nach dem Neuaufbau der Tabelle wiederhergestellt', () => {
  const renderTable = appSource.match(
    /renderGradesTable\(course, students, groupedAssessments, options = \{\}\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(renderTable, 'renderGradesTable muss vorhanden sein');
  assert.match(
    renderTable[0],
    /this\.updateActiveGradeColumnHeadHighlight\(this\.refs\.gradesTable\)/,
  );
});

test('Die Markierung toent ueber die Shadow-Variable statt ueber den Hintergrund', () => {
  assert.match(
    styleSource,
    /\.grades-master-table thead th\.is-active-grade-column-head \{[\s\S]*?--grade-cell-shadow:[\s\S]*?var\(--border-focus\)[\s\S]*?var\(--accent-soft\)[\s\S]*?font-weight: 700;[\s\S]*?\}/,
  );
  const activeHeadRule = styleSource.match(
    /\.grades-master-table thead th\.is-active-grade-column-head \{([\s\S]*?)\}/,
  );
  assert.ok(activeHeadRule);
  assert.doesNotMatch(activeHeadRule[1], /^\s*background:/m);
});

test('Die Kopfmarkierung gilt auch fuer errechnete Spalten, nicht nur fuer Leistungsspalten', () => {
  assert.doesNotMatch(
    styleSource,
    /\.grades-master-table thead th\.grade-assessment-col\.is-active-grade-column-head \{/,
  );
});

test('Die bearbeitete Zelle einer errechneten Note wird markiert', () => {
  assert.match(
    styleSource,
    /\.grades-master-table td\.is-grade-override-editing \{[\s\S]*?--grade-cell-shadow:[\s\S]*?var\(--border-focus\)[\s\S]*?var\(--accent-soft\)[\s\S]*?\}/,
  );
  const overrideCellRule = styleSource.match(
    /\.grades-master-table td\.is-grade-override-editing \{([\s\S]*?)\}/,
  );
  assert.ok(overrideCellRule);
  assert.doesNotMatch(overrideCellRule[1], /^\s*background:/m);
});

test('Der Kopf der errechneten Spalte wird beim Bearbeiten ueber den Spaltenschluessel markiert', () => {
  const keyHelper = appSource.match(
    /getActiveGradeColumnHeadKeys\(\) \{[\s\S]*?\n  \}/,
  );
  assert.ok(keyHelper, 'getActiveGradeColumnHeadKeys muss vorhanden sein');
  assert.match(keyHelper[0], /normalizeGradeOverrideEditorContext\(this\.activeGradeOverrideContext\)/);
  assert.match(keyHelper[0], /"total:year"/);
  assert.match(keyHelper[0], /period-total:\$\{period\}/);
  assert.match(keyHelper[0], /category:\$\{period\}:\$\{categoryId\}/);
  assert.match(keyHelper[0], /subcategory:\$\{period\}:\$\{categoryId\}:\$\{subcategoryId\}/);
  assert.match(keyHelper[0], /assessment:\$\{activeAssessmentId\}/);
  assert.doesNotMatch(keyHelper[0], /groupKeys/);
});

test('Die Kategorie bekommt nur Toenung, die exakte Spalte zusaetzlich den Rahmen', () => {
  assert.match(
    styleSource,
    /\.grades-master-table thead th\.is-active-grade-column-head \{\s*--grade-cell-shadow: inset 0 999px 0 var\(--accent-soft\);[\s\S]*?font-weight: 700;[\s\S]*?\}/,
  );
  assert.match(
    styleSource,
    /\.grades-master-table thead th\.is-active-grade-column-head\[data-grade-column-key\],\s*\.grades-master-table thead th\.is-active-grade-column-head\[data-grade-assessment-id\] \{[\s\S]*?var\(--border-focus\)[\s\S]*?\}/,
  );
  assert.match(
    styleSource,
    /\.grades-master-table thead th\.is-active-grade-column-head \.grades-master-group-title/,
  );
});

test('Der Schuelername bleibt beim Bearbeiten einer errechneten Note markiert', () => {
  const tableBody = appSource.match(
    /buildGradesMasterTable\([\s\S]*?\n  \}/,
  );
  assert.ok(tableBody, 'buildGradesMasterTable muss vorhanden sein');
  assert.match(
    tableBody[0],
    /const isActiveNameCell = \([\s\S]*?overrideContext[\s\S]*?Number\(overrideContext\.studentId \|\| 0\) === Number\(student\.id\)[\s\S]*?\)/,
  );
  assert.match(
    tableBody[0],
    /Number\(overrideContext\.courseId \|\| 0\) === Number\(course\?\.id \|\| 0\)/,
  );
});

test('Stundenbezug und aktive Spalte kollidieren nicht', () => {
  assert.match(
    styleSource,
    /\.grades-master-table thead th\.grade-assessment-col\.is-lesson-spotlight\.is-active-grade-column-head \{[\s\S]*?box-shadow:[\s\S]*?var\(--accent-soft\)[\s\S]*?\}/,
  );
});
