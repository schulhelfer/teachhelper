import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesApp = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const gradesHtml = await readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8');
const gradesCss = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

// Method definitions are indented by two spaces, so the marker also skips call sites.
function extractGradesMethod(name) {
  const marker = `\n  ${name}`;
  const start = gradesApp.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = gradesApp.indexOf('{', start + marker.length);
  let depth = 0;
  for (let index = bodyStart; index < gradesApp.length; index += 1) {
    if (gradesApp[index] === '{') depth += 1;
    if (gradesApp[index] === '}') depth -= 1;
    if (depth === 0) return gradesApp.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

// Collects the keys of an object literal that starts at `marker` inside a method.
function objectKeysIn(body, marker) {
  const markerStart = body.indexOf(marker);
  assert.notEqual(markerStart, -1, `the method must build an object via ${marker}`);
  const literalStart = markerStart + marker.length - 1;
  let depth = 0;
  for (let index = literalStart; index < body.length; index += 1) {
    if (body[index] === '{') depth += 1;
    if (body[index] === '}') depth -= 1;
    if (depth === 0) {
      const literal = body.slice(literalStart, index + 1);
      return new Set([...literal.matchAll(/^\s+(\w+)\s*[:,]/gm)].map((match) => match[1]));
    }
  }
  throw new Error(`the object literal after ${marker} is incomplete`);
}

test('step 2 of the participant dialog offers both import surfaces side by side', () => {
  const rowStart = gradesHtml.indexOf('id="course-students-import-row"');
  assert.notEqual(rowStart, -1, 'the roster import step must group its surfaces in one row');
  const row = gradesHtml.slice(rowStart, gradesHtml.indexOf('</section>', rowStart));

  // The CSV dropzone and the course pills must stay in the same row, otherwise the
  // second dashed box no longer reads as an alternative to the file import.
  assert.ok(row.includes('id="course-dialog-students-dropzone"'));
  assert.ok(row.includes('id="course-dialog-roster-import"'));
  assert.ok(row.includes('id="course-dialog-roster-pills"'));

  // Both boxes must carry the dashed dropzone look of the seat plan sidebar.
  const box = gradesCss.slice(
    gradesCss.indexOf('.course-dialog-roster-import {'),
    gradesCss.indexOf('.course-dialog-roster-pills {'),
  );
  assert.match(box, /border:\s*2px dashed var\(--dropzone-border\)/);
});

test('the course pills only offer rosters that can be imported', () => {
  const candidates = extractGradesMethod('listCourseDialogRosterImportCandidates()');

  // Importing a course into itself would replace the list with a copy of itself.
  assert.match(candidates, /Number\(course\.id\) !== currentCourseId/);
  assert.match(candidates, /courseAllowsSeatplanRoster\(course\)/);

  // Counting participants must stay a read-only lookup: loading every other course
  // into the vault just to render pills would swap the active grade course.
  const refresh = extractGradesMethod('async refreshCourseDialogRosterImportCourses()');
  assert.match(refresh, /getGradeCourseRosterSummary/);
  assert.doesNotMatch(refresh, /withTemporaryGradeCourse/);
  assert.match(refresh, /count > 0/);
});

test('a roster taken from another course is added to the list, never swapped in', () => {
  const courseImport = extractGradesMethod('async importCourseDialogStudentsFromCourse(courseId)');
  const persisted = objectKeysIn(
    extractGradesMethod('validateCourseDialogStudents(students)'),
    '(student) => ({',
  );

  // Added rows must carry every persisted field, otherwise saving the dialog drops it.
  assert.deepEqual(objectKeysIn(courseImport, 'students.push({'), persisted);

  // The current rows keep their ids, so their grade entries survive and the save path
  // never has to confirm a deletion. Overwriting the array would lose both.
  assert.match(courseImport, /this\.courseDialogDraft\.students\.slice\(\)/);
  assert.doesNotMatch(courseImport, /replacesExisting/);

  // Importing the same course twice, or a second course that shares students, must
  // not create duplicate rows.
  assert.match(courseImport, /if \(knownNameKeys\.has\(key\)\) \{\s*return;/);

  // The other course cannot know this course's exam status.
  assert.match(courseImport, /performanceFlair: ""/);
});
