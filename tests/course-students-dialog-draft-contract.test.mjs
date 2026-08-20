import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesApp = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');

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

  assert.deepEqual(
    studentFieldsIn('buildCourseDialogDraft(course = null, options = {})'),
    persisted,
  );

  assert.deepEqual(studentFieldsIn('getCourseStudentsDialogSignature()'), persisted);

  const newRow = extractGradesMethod('addCourseDialogStudentDraft()');
  for (const field of persisted) {
    assert.match(newRow, new RegExp(`\\b${field}:`), `new student rows must seed ${field}`);
  }
});

test('a CSV roster re-import carries back the fields the CSV cannot supply', () => {
  const csvImport = 'extractStudentsFromCsvRows(rows, delimiter, fileName = "")';

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

  assert.match(body, /duplicateNameKeys\.forEach\(\(key\) => existingDataByNameKey\.delete\(key\)\)/);
  assert.match(
    body,
    /importedNameCounts\.get\([\s\S]{0,120}\) \|\| 0\) > 1\) \{\s*student\.rufname = "";\s*student\.performanceFlair = "";\s*student\.portrait = null;/,
  );
});
