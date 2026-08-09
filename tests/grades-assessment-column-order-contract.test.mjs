import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [storeSource, appSource, cssSource] = await Promise.all([
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/grades/app.css', import.meta.url), 'utf8'),
]);

function extractClassMethod(source, name) {
  const match = new RegExp(`\\n  ${name}\\(`).exec(source);
  assert.ok(match, `${name} must exist`);
  const start = match.index + 1;
  const bodyStart = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

const groupKey = (assessment) => [
  Number(assessment?.courseId || 0),
  assessment?.halfYear === 'h2' ? 'h2' : 'h1',
  Number(assessment?.categoryId || 0),
  Number(assessment?.subcategoryId || 0),
].join(':');

const reorderGradeAssessments = Function(
  'getGradeAssessmentOrderGroupKey',
  `"use strict"; return ({${extractClassMethod(storeSource, 'reorderGradeAssessments')}}).reorderGradeAssessments;`,
)(groupKey);

test('new assessments retain a creation timestamp and use per-group order', () => {
  assert.match(storeSource, /createdAt: new Date\(\)\.toISOString\(\)/);
  assert.match(storeSource, /getGradeAssessmentOrderGroupKey\(orderGroup\)/);
  assert.match(storeSource, /createdAt: String\(item\.createdAt \|\| ""\)/);
  assert.match(storeSource, /\.sort\(compareGradeAssessmentsByOrder\)/);
});

test('the store reorders one complete assessment sibling group atomically', () => {
  const assessments = [
    { id: 1, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 0, sortOrder: 1 },
    { id: 2, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 0, sortOrder: 2 },
    { id: 3, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 11, sortOrder: 1 },
  ];
  let saves = 0;
  const store = {
    gradeVaultState: { gradeAssessments: assessments },
    getGradeAssessment(id) { return assessments.find((assessment) => assessment.id === Number(id)) || null; },
    _saveGradeVault() { saves += 1; },
  };

  assert.equal(reorderGradeAssessments.call(store, 7, [2, 1]), true);
  assert.deepEqual(assessments.map((assessment) => assessment.sortOrder), [2, 1, 1]);
  assert.equal(saves, 1);
});

test('the store rejects incomplete and cross-group reorder requests without mutation', () => {
  const assessments = [
    { id: 1, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 0, sortOrder: 1 },
    { id: 2, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 0, sortOrder: 2 },
    { id: 3, courseId: 7, halfYear: 'h1', categoryId: 10, subcategoryId: 11, sortOrder: 1 },
  ];
  const before = structuredClone(assessments);
  const store = {
    gradeVaultState: { gradeAssessments: assessments },
    getGradeAssessment(id) { return assessments.find((assessment) => assessment.id === Number(id)) || null; },
    _saveGradeVault() { throw new Error('must not save'); },
  };

  assert.equal(reorderGradeAssessments.call(store, 7, [1]), false);
  assert.equal(reorderGradeAssessments.call(store, 7, [1, 3]), false);
  assert.deepEqual(assessments, before);
});

test('the overview exposes a constrained drag handle and visible insertion state', () => {
  assert.match(appSource, /data-grade-drag-assessment=/);
  assert.match(appSource, /handleGradeAssessmentColumnDragOver\(event\)/);
  assert.match(appSource, /getGradeAssessmentColumnOrderGroupKey\(target\.assessment\) !== drag\.groupKey/);
  assert.match(appSource, /this\.store\.reorderGradeAssessments\(sourceAssessment\.courseId, orderedIds\)/);
  assert.match(appSource, /this\.renderGradesView\(\)/);
  assert.match(cssSource, /is-assessment-drag-target-before/);
  assert.match(cssSource, /is-assessment-drag-target-after/);
  assert.match(cssSource, /\.grade-assessment-label \{[\s\S]*?grid-template-rows: minmax\(1\.55rem, auto\) 1\.15rem/);
  assert.match(cssSource, /\.grade-assessment-label > \.grade-assessment-meta \{[\s\S]*?grid-row: 2/);
});
