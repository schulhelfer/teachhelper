import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [gradesApp, gradesBridge, gradesIndex, shellBridge, coordinator, main, indexHtml, shellCss] = await Promise.all([
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/bridge.js'),
  read('../src/modules/grades/index.js'),
  read('../src/app/planning-seatplan-bridge.js'),
  read('../src/app/grade-roster-coordinator.js'),
  read('../src/app/app-runtime.js'),
  read('../index.html'),
  read('../src/app/shell.css'),
]);

test('der Picker-Transport lädt kursgebundene Konfigurationen und leitet Speichern durch alle Brücken', () => {
  assert.match(gradesApp, /detail\?\.mode === "picker"/);
  assert.match(gradesApp, /pickerConfig: mode === "picker" \? importPayload\.pickerConfig : null/);
  assert.match(gradesBridge, /COURSE_PICKER_CONFIG_SAVE_REQUEST_EVENT/);
  assert.match(gradesBridge, /COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT/);
  assert.match(gradesIndex, /GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT/);
  assert.match(shellBridge, /function requestGradePickerConfigSave\(detail = null\)/);
  assert.match(shellBridge, /GRADES_COURSE_PICKER_CONFIG_SAVE_REQUEST_EVENT/);
  assert.match(shellBridge, /GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT/);
});

test('Picker-Speicherungen warten auf die Entsperrung und akzeptieren keine veraltete Kursliste', () => {
  const method = gradesApp.match(/\n  async handleCoursePickerConfigSaveRequest\(detail = null\) \{([\s\S]*?)\n  async handleCourseSeatplanSaveRequest/);
  assert.ok(method, 'Picker-Speicherhandler muss vorhanden sein');
  const body = method[1];
  assert.match(body, /queueGradeVaultContinuation\(\{ type: "picker-config-save", detail \}\)/);
  assert.match(body, /workspaceOwner\.store\.listGradeStudents\(courseId\)/);
  assert.match(body, /currentRosterToken !== rosterToken/);
  assert.match(body, /STALE_GRADE_CONTEXT/);
  assert.match(body, /workspaceOwner\.store\.saveGradePickerConfig\(courseId, config\)/);
  assert.match(body, /runGradeCourseMutation\(courseId,[\s\S]*?\{ preserveRoster: true \}\)/);
  assert.match(gradesApp, /action\.type === "picker-config-save"/);
});

test('die Shell bindet den Picker live an den Kurs und speichert Änderungen einschließlich automatischer Deaktivierung', () => {
  assert.match(main, /from '\.\/grade-roster-coordinator\.js'/);
  assert.match(main, /gradeRosterCoordinator = createGradeRosterCoordinator\(\{/);
  assert.match(coordinator, /mode: isRandomPickerActive\(\) \? 'picker' : 'roster'/);
  assert.match(coordinator, /pickerBinding = \{/);
  assert.match(main, /getStudents: \(\) => gradeRosterCoordinator\.getPickerStudents\(classroomState\.getState\(\)\.students\)/);
  assert.match(main, /const preferenceStudents = isRandomPickerTabActive\(\)[\s\S]*?gradeRosterCoordinator\.getPickerStudents\(classroomState\.getState\(\)\.students\)/);
  assert.match(coordinator, /pickerBinding\.autoDisableSelected = value;[\s\S]*?savePickerConfig\(\{ deferSave \}\)/);
  assert.match(main, /student\.randomWeight = weight;[\s\S]*?gradeRosterCoordinator\.savePickerConfig\(\{ deferSave \}\)/);
  assert.match(main, /onConditionsSaved: \(\) => gradeRosterCoordinator\.savePickerConfig\(\)/);
  const saveResultHandler = coordinator.match(/const handlePickerSaveResult = \(event\) => \{([\s\S]*?)\n  \};/);
  assert.ok(saveResultHandler, 'Picker-Speicherergebnis muss behandelt werden');
  assert.doesNotMatch(saveResultHandler[1], /importCourse/);
  assert.match(coordinator, /bind\(randomPickerCourseReset, 'click', clearPickerBinding\)/);
  assert.doesNotMatch(main, /\bgradePickerBinding\b/);
  assert.match(indexHtml, /id="random-picker-course-reset"[\s\S]*?class="app-action-reset-icon"/);
  assert.match(shellCss, /\.random-picker-course-reset-button \{[\s\S]*?width: 26px;/);
});

test('der Picker platziert die Kursbindung wie der Sitzplan neben der Importüberschrift', () => {
  assert.match(
    indexHtml,
    /<div class="roster-import-heading">\s*<strong>Importiere die Namensliste<\/strong>\s*<button id="random-picker-course-reset"/,
  );
  assert.doesNotMatch(indexHtml, /random-picker-course-reset-row/);
  assert.match(shellCss, /\.roster-import-heading \{[\s\S]*?justify-content: space-between;/);
  assert.match(coordinator, /randomPickerCourseReset\.hidden = !bound \|\| !isRandomPickerActive\(\)/);
});

test('die Kurs-Pills markieren ohne Auswahl keinen Kurs als importiert', () => {
  const render = coordinator.match(/courses\.forEach\(\(course\) => \{([\s\S]*?)\n    \}\);/);
  assert.ok(render, 'Kurs-Pills müssen gerendert werden');
  assert.match(render[1], /selectedCourseId > 0 && courseId === selectedCourseId/);
  assert.doesNotMatch(render[1], /: Number\(course\?\.id \|\| 0\) === selectedCourseId\)/);
  assert.match(render[1], /isRandomPickerActive\(\)\s*\?\s*Boolean\(pickerBinding\) && courseId === pickerBinding\.courseId/);
});
