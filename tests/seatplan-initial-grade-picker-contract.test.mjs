import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const seatplanSource = await readFile(
  new URL('../src/modules/seatplan/app.js', import.meta.url),
  'utf8',
);
const gradePickerNavigationSource = await readFile(
  new URL('../src/modules/seatplan/grade-picker-navigation.js', import.meta.url),
  'utf8',
);
const { findNextCourseGradeSeat } = await import(
  `data:text/javascript;base64,${Buffer.from(gradePickerNavigationSource).toString('base64')}`,
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

test('advancing after a picker selection always opens the next grade picker', () => {
  assert.match(
    seatplanSource,
    /function getCourseGradeInputIndex\(inputs, input\) \{[\s\S]*?const directIndex = inputs\.indexOf\(input\);[\s\S]*?inputs\.findIndex\(candidate => String\(candidate\.dataset\.studentId \|\| ''\) === studentId\)/,
  );
  assert.match(
    seatplanSource,
    /function focusNextCourseGradeInput\(currentInput\) \{[\s\S]*?const nextState = findNextCourseGradeInput\(currentInput\);[\s\S]*?const next = nextState\.input;[\s\S]*?next\.focus\(\{ preventScroll: false \}\);[\s\S]*?openCourseGradePicker\(next\);/,
  );
  assert.match(
    seatplanSource,
    /function advanceCourseGradeInput\(currentInput, options = \{\}\) \{[\s\S]*?if \(!isCourseGradeMode\(\)\) return;[\s\S]*?focusNextCourseGradeInput\(currentInput\);/,
  );
});

test('grade picker exhausts connected seat groups before moving to another group', () => {
  const seatIds = ['1-1', '1-2', '2-1', '2-2', '1-5'];
  assert.deepEqual(
    findNextCourseGradeSeat({ currentSeatId: '1-1', seatIds, visitedSeatIds: new Set(['1-1']) }),
    { seatId: '1-2', completedPass: false },
  );
  assert.deepEqual(
    findNextCourseGradeSeat({ currentSeatId: '1-2', seatIds, visitedSeatIds: new Set(['1-1', '1-2']) }),
    { seatId: '2-2', completedPass: false },
  );
  assert.deepEqual(
    findNextCourseGradeSeat({
      currentSeatId: '2-2',
      seatIds,
      visitedSeatIds: new Set(['1-1', '1-2', '2-1', '2-2']),
    }),
    { seatId: '1-5', completedPass: false },
  );
});

test('grade picker ignores diagonal seats and reports a completed pass after the last seat', () => {
  const seatIds = ['1-1', '2-2', '1-2'];
  assert.deepEqual(
    findNextCourseGradeSeat({ currentSeatId: '1-1', seatIds, visitedSeatIds: new Set(['1-1']) }),
    { seatId: '1-2', completedPass: false },
  );
  assert.deepEqual(
    findNextCourseGradeSeat({
      currentSeatId: '1-2',
      seatIds,
      visitedSeatIds: new Set(seatIds),
    }),
    { seatId: '1-1', completedPass: true },
  );
});
