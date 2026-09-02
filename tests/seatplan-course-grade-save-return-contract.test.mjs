import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  .then((text) => text.replace(/\r\n/g, '\n'));

const [appBridge, main] = await Promise.all([
  read('../src/app/planning-seatplan-bridge.js'),
  read('../src/main.js'),
]);

test('a successful seatplan grade save is forwarded to the seatplan', () => {
  const start = appBridge.indexOf('saveResultTarget.addEventListener(GRADES_COURSE_GRADE_SAVE_RESULT_EVENT');
  const end = appBridge.indexOf('\n\n  return {', start);
  const handler = appBridge.slice(start, end);

  assert.ok(start >= 0 && end > start, 'the seatplan grade save result handler must exist');
  assert.match(handler, /seatplanController\?\.sendCourseGradeSaveResult\?\.\(detail\);/);
  assert.match(
    handler,
    /const matchesPendingRequest = Boolean\([\s\S]*?pending\.requestId === String\(detail\.requestId \|\| ''\)[\s\S]*?pending\.courseId === Number\(detail\.courseId \|\| 0\)[\s\S]*?pending\.contextToken === String\(detail\.contextToken \|\| ''\)[\s\S]*?pending\.rosterToken === String\(detail\.rosterToken \|\| ''\)/,
  );
  assert.doesNotMatch(handler, /onCourseGradeSaveSuccess/);
  assert.doesNotMatch(main, /onCourseGradeSaveSuccess:/);
});
