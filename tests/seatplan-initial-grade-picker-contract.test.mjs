import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const seatplanSource = await readFile(
  new URL('../src/modules/seatplan/app.js', import.meta.url),
  'utf8',
);

test('opening a course grade context preserves its initial picker through seatplan activation', () => {
  assert.match(seatplanSource, /let preserveCourseGradeModeOnSeatplanActivation = false;/);
  assert.match(
    seatplanSource,
    /if \(gradeConfig && courseGradeConfigMatchesContext\(gradeConfig, state\.courseContext\)\) \{[\s\S]*?preserveCourseGradeModeOnSeatplanActivation = !seatplanTabWasActive;[\s\S]*?openFirst: true/,
  );
  assert.match(
    seatplanSource,
    /const preserveCourseGradeMode = preserveCourseGradeModeOnSeatplanActivation;[\s\S]*?preserveCourseGradeModeOnSeatplanActivation = false;[\s\S]*?if \(isCourseGradeMode\(\) && !preserveCourseGradeMode\)/,
  );
  assert.match(
    seatplanSource,
    /if \(!input\) \{[\s\S]*?attempt < COURSE_GRADE_INITIAL_PICKER_RETRY_LIMIT[\s\S]*?openFirstCourseGradePicker\(attempt \+ 1\)/,
  );
});
