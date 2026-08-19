import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesApp = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');

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

// Collects the keys of a student object literal inside a method. `marker` must end
// on the literal's opening brace. Handles `key: value` and shorthand `key,` alike.
function studentFieldsIn(name, marker = '(student) => ({') {
  const body = extractGradesMethod(name);
  const markerStart = body.indexOf(marker);
  assert.notEqual(markerStart, -1, `${name} must build student objects via ${marker}`);
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
  throw new Error(`${name} student literal is incomplete`);
}

test('the participant dialog round-trips every persisted student field', () => {
  const persisted = studentFieldsIn('validateCourseDialogStudents(students)');
  assert.deepEqual(
    [...persisted].sort(),
    ['firstName', 'id', 'lastName', 'performanceFlair', 'portrait', 'rufname'],
  );

  // Loading must read back every field the save path writes — otherwise merely
  // opening and saving "Teilnehmende verwalten" silently clears the missing one.
  assert.deepEqual(
    studentFieldsIn('buildCourseDialogDraft(course = null, options = {})'),
    persisted,
  );

  // The dirty check must observe every field, otherwise an edit to it is
  // treated as pristine and discarded without warning.
  assert.deepEqual(studentFieldsIn('getCourseStudentsDialogSignature()'), persisted);

  // A manually added row must seed every field so it renders and saves correctly.
  const newRow = extractGradesMethod('addCourseDialogStudentDraft()');
  for (const field of persisted) {
    assert.match(newRow, new RegExp(`\\b${field}:`), `new student rows must seed ${field}`);
  }
});

test('a CSV roster re-import carries back the fields the CSV cannot supply', () => {
  const csvImport = 'extractStudentsFromCsvRows(rows, delimiter, fileName = "")';

  // Re-importing recreates every student with a fresh id, so anything the CSV does
  // not contain must be matched back by name or it is lost for the whole course.
  assert.deepEqual(
    studentFieldsIn(csvImport, 'students.push({'),
    studentFieldsIn('validateCourseDialogStudents(students)'),
  );

  const body = extractGradesMethod(csvImport);
  for (const field of ['rufname', 'performanceFlair', 'portrait']) {
    assert.match(
      body,
      new RegExp(`carried\\?\\.${field}`),
      `${field} must be carried over from the matching existing student`,
    );
  }

  // A name that is not unique on either side must carry nothing, since there is no
  // way to tell which record belongs to which row.
  assert.match(body, /duplicateNameKeys\.forEach\(\(key\) => existingDataByNameKey\.delete\(key\)\)/);
  assert.match(
    body,
    /importedNameCounts\.get\([\s\S]{0,120}\) \|\| 0\) > 1\) \{\s*student\.rufname = "";\s*student\.performanceFlair = "";\s*student\.portrait = null;/,
  );
});
