import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [seatplanApp, seatplanCss, gradesApp, gradesCss] = await Promise.all([
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/app.css'),
]);

test('der Sitzplan-Picker speichert nicht mehr selbst, sondern leert den Eintrag', () => {
  assert.doesNotMatch(seatplanApp, /grade-picker-save/);
  assert.doesNotMatch(seatplanCss, /grade-picker-save/);

  assert.match(
    seatplanApp,
    /appendGradeButton\(null, \{ className: 'grade-picker-clear', label: 'Eintrag leeren' \}\);\s+appendGradeButton\(0\);/,
  );

  assert.match(seatplanApp, /\.forEach\(value => appendGradeButton\(value\)\);/);

  assert.match(
    seatplanApp,
    /value === null\s*\?\s*state\.courseGradeEntries\[studentId\] === undefined/,
  );

  const start = seatplanApp.indexOf('function openCourseGradePicker(input)');
  const end = seatplanApp.indexOf('\n\n          function createCourseGradeInput', start);
  const picker = seatplanApp.slice(start, end);
  assert.ok(start >= 0 && end > start, 'der Sitzplan-Notenpicker muss vorhanden sein');
  assert.doesNotMatch(picker, /dataset\.tooltip/);
});

test('das Notenmodul bietet die Leer-Taste nur in der Notentabelle an', () => {
  assert.match(
    gradesApp,
    /if \(value === 0 && this\.gradePickerState\.mode === "table"\) \{[\s\S]*?clearButton\.className = "grade-picker-clear";[\s\S]*?this\.applyGradePickerClear\(\)/,
  );
  assert.match(gradesApp, /resetButton\.className = "reset-action grade-picker-override-reset";/);
});

test('die Leer-Taste im Notenmodul löscht auch eine bereits gespeicherte Note', () => {
  assert.match(
    gradesApp,
    /hasOwnProperty\.call\(input\.dataset, "gradeOriginalValue"\)\s+&& input\.dataset\.gradeDirty !== "1"\s+&& String\(input\.value \|\| ""\) === ""/,
  );
  assert.match(
    gradesApp,
    /applyGradePickerClear\(\) \{[\s\S]*?input\.value = "";[\s\S]*?input\.dataset\.gradeDirty = "1";[\s\S]*?this\.commitGradeCellInput\(input\);/,
  );
});

test('die Leer-Taste sitzt unten links, der Auslassen-Button bleibt unten rechts', () => {
  assert.match(seatplanCss, /button\.grade-picker-clear \{\s+grid-column: 1;\s+\}/);
  assert.match(seatplanCss, /button\.grade-picker-skip \{\s+grid-column: 3;/);
  assert.match(gradesCss, /button\.grade-picker-clear \{\s+grid-column: 1;\s+\}/);
  assert.match(gradesCss, /button\.grade-picker-skip \{\s+grid-column: 3;/);
});
