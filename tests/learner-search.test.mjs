import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/shared/learner-search.js', import.meta.url), 'utf8');
const { findLearnerMatches, normalizeLearnerSearchText } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const roster = [
  { studentId: 1, courseId: 10, courseName: 'Deutsch', firstName: 'Märta', lastName: 'Müller' },
  { studentId: 2, courseId: 11, courseName: 'Mathe', firstName: 'Märta', lastName: 'Müller' },
  { studentId: 3, courseId: 12, courseName: 'Bio', firstName: 'Marta', lastName: 'Meier', rufname: 'Mäxchen' },
  { studentId: 4, courseId: 13, courseName: 'Chemie', firstName: '', lastName: '', isPlaceholder: true },
];

test('learner search normalizes accents, spacing, and case', () => {
  assert.equal(normalizeLearnerSearchText('  MÄRTA-Müller '), 'marta muller');
});

test('learner search groups equal names across courses and ranks exact names first', () => {
  const matches = findLearnerMatches(roster, 'marta muller');
  assert.equal(matches[0].name, 'Märta Müller');
  assert.deepEqual(matches[0].courses.map((course) => course.courseName), ['Deutsch', 'Mathe']);
});

test('learner search uses preferred names and excludes empty placeholders', () => {
  const matches = findLearnerMatches(roster, 'maxchen');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Marta Meier');
  assert.equal(matches.some((match) => !match.name), false);
});
