import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [gradesApp, seatplanApp] = await Promise.all([
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
]);

test('grade placeholders require at least one stored portrait in the course', () => {
  assert.match(gradesApp, /courseHasGradeStudentPortraits\(courseId\) \{[\s\S]*?this\.store\.listGradeStudents\(id\)[\s\S]*?normalizeGradeStudentPortrait\(student\?\.portrait\)/);
  assert.match(gradesApp, /shouldShowGradeStudentPortraitPlaceholders\(courseId\) \{\s*return this\.shouldShowGradeStudentPortraits\(\) && this\.courseHasGradeStudentPortraits\(courseId\);/);
});

test('grade entry tables hide portrait placeholders for portrait-free courses', () => {
  const entryMatches = gradesApp.match(/showPortraitPlaceholder: this\.shouldShowGradeStudentPortraitPlaceholders\(course\?\.id\)/g) || [];
  assert.equal(entryMatches.length, 2);
  assert.equal(gradesApp.includes('showPortraitPlaceholder: this.shouldShowGradeStudentPortraits()'), false);
});

test('participant management keeps its portrait placeholders and add controls', () => {
  assert.match(gradesApp, /\} else if \(showPortraits\) \{[\s\S]*?grade-student-portrait-placeholder--management[\s\S]*?student-portrait-select/);
});

test('course seatplan seats hide portrait placeholders for portrait-free courses', () => {
  assert.match(seatplanApp, /function courseHasGradeStudentPortraits\(\) \{[\s\S]*?state\.showGradeStudentPortraits[\s\S]*?student\?\.portrait\?\.data/);
  assert.match(seatplanApp, /\} else if \(courseHasGradeStudentPortraits\(\)\) \{[\s\S]*?seat-grade-student-portrait-placeholder/);
});
