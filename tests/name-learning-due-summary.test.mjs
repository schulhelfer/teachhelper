import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/shared/name-learning-due-summary.js', import.meta.url), 'utf8');
const dueSummary = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const NOW = 1_700_000_000_000;
const portrait = { mime: 'image/webp', data: 'AA==' };

test('the public summary contains only anonymous due-time buckets for usable portraits', () => {
  const buckets = dueSummary.buildNameLearningDueBuckets({
    gradeStudents: [
      { courseId: 10, id: 1, portrait },
      { courseId: 10, id: 2, portrait },
      { courseId: 10, id: 3, portrait },
      { courseId: 10, id: 4, portrait: null },
      { courseId: 11, id: 5, portrait },
    ],
    gradeNameLearning: [
      { courseId: 10, studentId: 1, dueAt: NOW - 1 },
      { courseId: 10, studentId: 2, dueAt: NOW + 1 },
      { courseId: 10, studentId: 4, dueAt: NOW - 1 },
    ],
  }, 10);

  assert.deepEqual(buckets, [
    { dueAt: 0, count: 1 },
    { dueAt: NOW - 1, count: 1 },
    { dueAt: NOW + 1, count: 1 },
  ]);
});

test('the public due count advances without opening the name-learning module', () => {
  const summary = {
    complete: true,
    courses: {
      10: [{ dueAt: 0, count: 1 }, { dueAt: NOW - 1, count: 2 }, { dueAt: NOW + 1, count: 3 }],
      11: [{ dueAt: 0, count: 9 }],
      12: [{ dueAt: 0, count: 8 }],
    },
  };
  const courses = [
    { id: 10, schoolYearId: 1 },
    { id: 11, schoolYearId: 1, noGrades: true },
    { id: 12, schoolYearId: 2 },
  ];

  assert.equal(dueSummary.countPublicNameLearningDueCards(summary, courses, 1, NOW), 3);
  assert.equal(dueSummary.countPublicNameLearningDueCards(summary, courses, 1, NOW + 1), 6);
  assert.equal(dueSummary.countPublicNameLearningDueCards({ complete: false, courses: {} }, courses, 1, NOW), null);
});

test('public summaries discard invalid or deleted course buckets', () => {
  assert.deepEqual(dueSummary.normalizeNameLearningDueSummary({
    complete: true,
    courses: {
      10: [{ dueAt: 5, count: 1 }, { dueAt: 5, count: 2 }],
      99: [{ dueAt: 0, count: 4 }],
    },
  }, new Set([10])), {
    complete: true,
    courses: { 10: [{ dueAt: 5, count: 3 }] },
  });
});
