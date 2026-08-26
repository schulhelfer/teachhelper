import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appBridge, main] = await Promise.all([
  readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

test('a successful seatplan grade save returns to planning after forwarding its result', () => {
  const start = appBridge.indexOf('saveResultTarget.addEventListener(GRADES_COURSE_GRADE_SAVE_RESULT_EVENT');
  const end = appBridge.indexOf('\n\n  return {', start);
  const handler = appBridge.slice(start, end);

  assert.ok(start >= 0 && end > start, 'the seatplan grade save result handler must exist');
  assert.match(handler, /seatplanController\?\.sendCourseGradeSaveResult\?\.\(detail\);/);
  assert.match(
    handler,
    /const matchesPendingRequest = Boolean\([\s\S]*?pending\.requestId === String\(detail\.requestId \|\| ''\)[\s\S]*?pending\.courseId === Number\(detail\.courseId \|\| 0\)[\s\S]*?pending\.contextToken === String\(detail\.contextToken \|\| ''\)[\s\S]*?pending\.rosterToken === String\(detail\.rosterToken \|\| ''\)/,
  );
  assert.match(
    handler,
    /if \([\s\S]*?matchesPendingRequest[\s\S]*?detail\.ok === true[\s\S]*?typeof onCourseGradeSaveSuccess === 'function'[\s\S]*?\) \{\s+onCourseGradeSaveSuccess\(detail\);/,
  );
});

test('the shell returns to planning and confirms a successful seatplan grade save', () => {
  const start = main.indexOf('bridgeController = createPlanningSeatplanBridge({');
  const end = main.indexOf('\n  SharedRosterStore.subscribe', start);
  const setup = main.slice(start, end);

  assert.ok(start >= 0 && end > start, 'the planning-seatplan bridge setup must exist');
  assert.match(
    setup,
    /onCourseGradeSaveSuccess: \(\) => \{\s+setActiveTab\(TAB_PLANNING\);\s+showMessage\('Noten gespeichert', 'success', \{\s+presentation: 'toast',\s+durationMs: 1500,/,
  );
});
