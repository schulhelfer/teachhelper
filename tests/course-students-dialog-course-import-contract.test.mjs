import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesApp = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const gradesHtml = await readFile(new URL('../src/modules/grades/app.html', import.meta.url), 'utf8');
const gradesCss = await readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8');

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

  assert.ok(row.includes('id="course-dialog-students-dropzone"'));
  assert.ok(row.includes('id="course-dialog-roster-import"'));
  assert.ok(row.includes('id="course-dialog-roster-pills"'));

  const box = gradesCss.slice(
    gradesCss.indexOf('.course-dialog-roster-import {'),
    gradesCss.indexOf('.course-dialog-roster-pills {'),
  );
  assert.match(box, /border:\s*2px dashed var\(--dropzone-border\)/);
});

test('the course pills only offer rosters that can be imported', () => {
  const candidates = extractGradesMethod('listCourseDialogRosterImportCandidates()');

  assert.match(candidates, /Number\(course\.id\) !== currentCourseId/);
  assert.match(candidates, /courseAllowsSeatplanRoster\(course\)/);

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

  assert.deepEqual(objectKeysIn(courseImport, 'students.push({'), persisted);

  assert.match(courseImport, /this\.courseDialogDraft\.students\.slice\(\)/);
  assert.doesNotMatch(courseImport, /replacesExisting/);

  assert.match(courseImport, /if \(knownNameKeys\.has\(key\)\) \{\s*return;/);

  assert.match(courseImport, /performanceFlair: ""/);
});
