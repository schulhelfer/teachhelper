import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [index, app, seatplanApp, seatplanHtml, runtime] = await Promise.all([
  readFile(new URL('../src/modules/grades/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/runtime.js', import.meta.url), 'utf8'),
]);

test('course seatplan navigation keeps the entry route while crossing the grades frame boundary', () => {
  assert.match(
    index,
    /const subview = source\.action === 'seatplan'\s*\|\|\s*source\.subview === 'entry'/,
  );
});

test('a locked course seatplan request shows the vault dialog as an overlay before resuming', () => {
  const navigation = app.match(/\n  async navigateGrades\(detail = null\) \{([\s\S]*?)\n  notifyParentGradesViewRequest\(/)?.[1] || '';
  assert.match(navigation, /navigation\.action === "seatplan"[\s\S]*?notifyParentGradeVaultOverlay\(true\)/);
  assert.match(navigation, /queueGradeVaultContinuation\(\{ type: "grades-navigation", detail: navigation \}\)/);
});

test('course-imported seatplans can safely switch courses without unlocking lesson-bound grade entry', () => {
  assert.match(seatplanApp, /function canSwitchCourseRoster\(\) \{[\s\S]*?!Number\(state\.courseContext\?\.lessonId \|\| 0\)[\s\S]*?!state\.courseGradeDraft/);
  assert.match(seatplanApp, /function hasUnsavedCourseSeatplanChanges\(\)/);
  assert.match(seatplanApp, /choice === 'save'[\s\S]*?pendingCourseSwitchCourseId = targetCourseId/);
  assert.match(seatplanApp, /choice !== 'discard'[\s\S]*?startGradeRosterImport\(targetCourseId\)/);
  assert.match(seatplanApp, /if \(targetCourseId\) startGradeRosterImport\(targetCourseId\)/);
  assert.match(seatplanHtml, /id="course-switch-dialog"/);
  assert.match(seatplanHtml, /id="course-switch-dialog-save"/);
  assert.match(seatplanHtml, /id="course-switch-dialog-discard"/);
});

test('course-imported seatplans keep the explicit reset next to the course pills', () => {
  assert.match(seatplanApp, /async function resetCourseRoster\(\)/);
  assert.match(seatplanApp, /state\.courseContext = null/);
  assert.match(seatplanApp, /resetCourseSeatplanForStudents\(\[\]\)/);
  assert.match(seatplanApp, /course-roster-reset-button/);
  assert.match(seatplanHtml, /id="course-roster-reset-button"[\s\S]*?class="app-action-reset-icon"/);
  assert.match(seatplanHtml, /id="course-roster-reset-dialog"/);
  assert.match(seatplanHtml, /id="course-roster-reset-dialog-confirm"/);
});

test('picking another course while bound asks whether to switch or to adopt its seatplan', () => {
  assert.match(seatplanApp, /async function chooseCourseRosterAction\(courseId\)/);
  assert.match(seatplanApp, /function requestCourseSeatplanAdoption\(sourceCourseId\)/);
  assert.doesNotMatch(seatplanApp, /const resetRequired = isCourseSeatplanMode\(\) && !isSelected/);
  assert.match(seatplanHtml, /id="course-roster-action-dialog"/);
  assert.match(seatplanHtml, /id="course-roster-action-switch"/);
  assert.match(seatplanHtml, /id="course-roster-action-adopt"/);
});

test('shell layout updates reuse the cached course pills instead of refreshing them repeatedly', () => {
  assert.match(
    seatplanApp,
    /if \(!interactive && \(pendingGradeRosterCoursesRequestId \|\| gradeRosterCoursesState !== 'idle'\)\) return/,
  );
});

test('switching a seatplan course reads a course snapshot without swapping the active grades course', () => {
  const rosterImport = app.match(/\n  async handleGradeRosterImportRequest\(detail = null\) \{([\s\S]*?)\n  getCourseForSeatplan\(/)?.[1] || '';
  assert.match(rosterImport, /await workspaceOwner\.getGradeCourseStateSnapshot\(course\.id\)/);
  assert.match(rosterImport, /courseState\.gradeSeatPlans/);
  assert.match(rosterImport, /: await this\.withTemporaryGradeCourse\(course\.id/);
});

test('a course snapshot waits for an in-flight grades course load before reading the roster', () => {
  const snapshot = runtime.match(/\n  async getGradeCourseStateSnapshot\(courseId\) \{([\s\S]*?)\n  setGradeCourseStudentCounts\(/)?.[1] || '';
  assert.match(snapshot, /await this\.courseLoadTail/);
});
