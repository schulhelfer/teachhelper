import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [seatplanHtml, seatplanApp, seatplanCss] = await Promise.all([
  read('../src/modules/seatplan/app.html'),
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
]);

test('die Erfassungsleiste steht über dem Raster statt im Scroll-Container', () => {
  const gridWrap = seatplanHtml.slice(
    seatplanHtml.indexOf('<div class="grid-wrap">'),
    seatplanHtml.indexOf('</main>'),
  );
  assert.doesNotMatch(gridWrap, /id="course-grade-overlay"/);

  const beforeGrid = seatplanHtml.slice(
    seatplanHtml.indexOf('<main class="main">'),
    seatplanHtml.indexOf('<div class="grid-wrap">'),
  );
  assert.match(beforeGrid, /id="course-grade-overlay" class="course-grade-bar" hidden/);

  assert.doesNotMatch(seatplanCss, /\.course-grade-bar \{[^}]*position: absolute/);
  assert.doesNotMatch(seatplanCss, /\.course-grade-overlay/);
});

test('die Leiste folgt dem Theme und wird nicht mitgedruckt', () => {
  assert.match(
    seatplanCss,
    /\.course-grade-bar \{[^}]*border: 1px solid var\(--module-surface-border\);\s+background: var\(--module-surface-strong\);\s+box-shadow: var\(--module-surface-shadow\);/,
  );
  assert.match(seatplanCss, /#sidebar-score,\s+#course-grade-overlay,[\s\S]*?display: none !important;/);
});

test('der Speichern-Button liegt in der Leiste statt darauf', () => {
  assert.match(
    seatplanCss,
    /\.course-grade-bar \.course-grade-bar-save \{[^}]*margin-left: 8px;[^}]*border-radius: 999px;[^}]*box-shadow: none;/,
  );
  assert.match(
    seatplanCss,
    /\.course-grade-bar \.course-grade-bar-save:hover:not\(:disabled\) \{[^}]*transform: none;[^}]*box-shadow: none;/,
  );
  assert.match(
    seatplanCss,
    /\.course-grade-bar \.course-grade-bar-save:active:not\(:disabled\) \{[^}]*transform: scale\(/,
  );
  assert.match(
    seatplanCss,
    /\.course-grade-bar \.course-grade-bar-save:disabled \{[^}]*opacity: 0\.55;/,
  );
});

test('der Modus-Text überschreibt den Chevron nicht', () => {
  assert.match(seatplanHtml, /<span class="course-grade-bar-mode-label">Einzelnote<\/span>\s*<span class="course-grade-bar-chevron"/);
  assert.match(seatplanApp, /els\.courseGradeEntryModeLabel\.textContent = getCourseGradeEntryModeLabel\(\);/);
  assert.doesNotMatch(seatplanApp, /els\.courseGradeEntryModeButton\.textContent =/);
});

test('Zähler und Abschluss-Dialog verlangen, dass jeder Schüler tatsächlich durchgegangen wurde', () => {
  assert.match(
    seatplanApp,
    /function getCourseGradeProgress\(\) \{[\s\S]*?getSeatedCourseGradeStudentIds\(\)[\s\S]*?seatedIds\.filter\(isCourseGradeStudentDone\)\.length/,
  );
  assert.match(
    seatplanApp,
    /function isCourseGradePromptReadyForSeatedStudents\(\) \{[\s\S]*?seatedIds\.every\(isCourseGradeStudentDone\);/,
  );
  assert.match(
    seatplanApp,
    /function isCourseGradeStudentDone\(studentId\) \{[\s\S]*?isCourseGradeOccurrenceMode\(\)[\s\S]*?isCourseGradeStudentChecked\(sid\)[\s\S]*?return Boolean\(state\.courseGradeHandledStudentIds\?\.has\(sid\)\);/,
  );
});

test('nur eine Note oder der Auslassen-Button zaehlen als erledigt', () => {
  // Das blosse Anklicken einer Person darf den Zaehler nicht bewegen: zwischen der
  // Studenten-Pruefung und der Auswahl darf nichts als erledigt markiert werden.
  assert.match(
    seatplanApp,
    /function openCourseGradePicker\(input\) \{[\s\S]*?if \(!studentId\) return;\n\s*selectStudentForCourseGrade\(studentId\);/,
  );

  // Erledigt wird ausschliesslich an drei Stellen gesetzt: echte Note, Auslassen-Button
  // und die Vorkommnis-Erfassung.
  assert.equal(seatplanApp.split('markCourseGradeStudentHandled(').length - 1, 4);
  assert.match(
    seatplanApp,
    /state\.courseGradeEntries\[sid\] = parsed\.value;[\s\S]*?markCourseGradeStudentHandled\(sid\);/,
  );
  assert.match(
    seatplanApp,
    /skipButton\.addEventListener\('click', event => \{[\s\S]*?markCourseGradeStudentHandled\(input\.dataset\.studentId \|\| ''\);/,
  );
});

test('die Sprungreihenfolge uebergeht nur erledigte Sitze', () => {
  assert.match(
    seatplanApp,
    /const handledSeatIds = new Set\([\s\S]*?handledStudentIds\.has\(String\(input\.dataset\.studentId \|\| ''\)\)/,
  );
  assert.match(seatplanApp, /visitedSeatIds: handledSeatIds,/);
});

test('ein Sichtbarkeitswechsel der Leiste skaliert das Raster neu', () => {
  assert.match(
    seatplanApp,
    /if \(courseGradeBarVisible !== visible\) \{\s+courseGradeBarVisible = visible;\s+updateGridAutoScale\(\);\s+\}/,
  );
});
