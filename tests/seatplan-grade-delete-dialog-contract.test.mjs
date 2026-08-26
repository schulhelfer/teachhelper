import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [html, app] = await Promise.all([
  read('../src/modules/seatplan/app.html'),
  read('../src/modules/seatplan/app.js'),
]);

test('deleting existing seatplan grades uses the module dialog instead of a browser confirmation', () => {
  assert.match(html, /<dialog id="course-grade-delete-dialog"[\s\S]*?id="course-grade-delete-dialog-message"[\s\S]*?id="course-grade-delete-dialog-cancel"[\s\S]*?id="course-grade-delete-dialog-confirm"/);
  assert.match(app, /function chooseCourseGradeDeletion\(deletedChanges, occurrenceMode\) \{[\s\S]*?courseGradeDeleteDialog\.showModal\(\)/);
  assert.match(app, /const confirmed = await chooseCourseGradeDeletion\(deletedChanges, occurrenceMode\);/);
  assert.doesNotMatch(app, /const confirmed = confirm\(occurrenceMode/);
});

test('save callers await the deletion confirmation before continuing', () => {
  assert.match(app, /if \(!await requestCourseGradeSave\(\)\) \{/);
  assert.match(app, /async function requestCourseGradeSave\(\)/);
});
