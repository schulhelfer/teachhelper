import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [html, app, css] = await Promise.all([
  read('../src/modules/seatplan/app.html'),
  read('../src/modules/seatplan/app.js'),
  read('../src/modules/seatplan/app.css'),
]);

test('the grade overlay offers a guarded course-binding reset', () => {
  assert.match(
    html,
    /id="course-grade-overlay"[\s\S]*?id="course-grade-overlay-reset"[\s\S]*?aria-label="Kursbindung lösen"[\s\S]*?data-tooltip="Kursbindung lösen"/,
  );
  assert.match(html, /id="course-roster-reset-grade-warning"[\s\S]*?Ungespeicherte Noteneingaben werden verworfen/);
  assert.match(app, /function canResetCourseRoster\(\) \{[\s\S]*?!state\.pendingCourseGradeConfigRequestId[\s\S]*?!state\.pendingCourseGradeSaveRequestId/);
  assert.match(app, /courseGradeOverlayReset\.disabled = !visible \|\| !canResetCourseRoster\(\)/);
  assert.match(app, /els\.courseGradeOverlayReset\?\.addEventListener\('click',[\s\S]*?resetCourseRoster\(\)/);
  assert.match(css, /\.course-grade-bar \.course-grade-bar-reset \{/);
});

test('resetting from grade mode discards its draft before clearing the course seatplan', () => {
  assert.match(app, /async function resetCourseRoster\(\) \{[\s\S]*?if \(!canResetCourseRoster\(\)\) return;[\s\S]*?state\.courseContext = null;[\s\S]*?resetCourseGradeMode\(\);[\s\S]*?resetCourseSeatplanForStudents\(\[\]\);/);
  assert.match(app, /const gradeMode = isCourseGradeMode\(\);[\s\S]*?courseRosterResetGradeWarning\.hidden = !gradeMode;/);
});
