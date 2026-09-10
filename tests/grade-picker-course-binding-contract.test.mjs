import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [gradesApp, gradesBridge, gradesIndex, shellBridge, main, indexHtml, shellCss] = await Promise.all([
  read('../src/modules/grades/app.js'),
  read('../src/modules/grades/bridge.js'),
  read('../src/modules/grades/index.js'),
  read('../src/app/planning-seatplan-bridge.js'),
  read('../src/main.js'),
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
  assert.match(main, /mode: isRandomPickerTabActive\(\) \? 'picker' : 'roster'/);
  assert.match(main, /gradePickerBinding = \{/);
  assert.match(main, /getStudents: \(\) => gradePickerBinding\?\.students \|\| state\.students/);
  assert.match(main, /const preferenceStudents = isRandomPickerTabActive\(\)[\s\S]*?gradePickerBinding\?\.students \|\| state\.students/);
  assert.match(main, /gradePickerBinding\.autoDisableSelected = value;[\s\S]*?if \(!deferSave\) saveGradePickerConfig\(\)/);
  assert.match(main, /student\.randomWeight = weight;[\s\S]*?if \(gradePickerBinding && !deferSave\) saveGradePickerConfig\(\)/);
  assert.match(main, /onConditionsSaved: \(\) => saveGradePickerConfig\(\)/);
  const saveResultHandler = main.match(/document\.addEventListener\(GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, \(event\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(saveResultHandler, 'Picker-Speicherergebnis muss behandelt werden');
  assert.doesNotMatch(saveResultHandler[1], /importGradeRosterCourse/);
  assert.match(main, /els\.randomPickerCourseReset\?\.addEventListener\('click'/);
  assert.match(indexHtml, /id="random-picker-course-reset"[\s\S]*?class="app-action-reset-icon"/);
  assert.match(shellCss, /\.random-picker-course-reset-button \{[\s\S]*?width: 26px;/);
});
