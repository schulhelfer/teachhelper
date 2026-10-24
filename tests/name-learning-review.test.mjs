import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorkspaceController } from '../src/modules/workspace/index.js';
import { createWorkspaceClient } from '../src/modules/workspace/client.js';

const source = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  async handleNameLearningReviewRequest(');
const end = source.indexOf('\n  getCourseForSeatplan(', start);
assert.ok(start >= 0 && end > start);
const handleReview = Function(`"use strict"; return ({${source.slice(start, end)}}).handleNameLearningReviewRequest;`)();

async function fixture(t) {
  const controller = createWorkspaceController({ ephemeral: true });
  t.after(() => controller.dispose());
  const grades = createWorkspaceClient(controller, 'grades');
  const shell = createWorkspaceClient(controller, 'shell');
  await grades.operations.setGradeVaultEncryptionEnabledFromSettings(false);
  const courseId = grades.data.createCourse(grades.data.getActiveSchoolYear().id, 'Testkurs');
  const [student] = await grades.operations.runGradeCourseMutation(courseId, () => (
    grades.data.replaceGradeStudentsForCourse(courseId, [{
      firstName: 'Ada', lastName: 'Beispiel', portrait: { mime: 'image/webp', data: 'AA==' },
    }])
  ));
  grades.data.setSetting('nameLearningDueSummary', { complete: true, courses: { [courseId]: [{ dueAt: 0, count: 1 }] } });
  const results = [];
  const harness = {
    store: grades.data,
    canAccessGradeVault: () => true,
    canCommitImmediateGradeCourseMutation: (...args) => grades.operations.canCommitImmediateGradeCourseMutation(...args),
    runGradeCourseMutation: (...args) => grades.operations.runGradeCourseMutation(...args),
    dispatchNameLearningReviewResult: (detail) => results.push(detail),
  };
  const detail = { courseId, studentId: student.id, progress: { stage: 1, dueAt: Date.now() + 86400000 } };
  return { grades, shell, courseId, student, harness, results, detail };
}

test('an immediate review publishes zero due cards to the shell before returning', async (t) => {
  const { grades, shell, courseId, student } = await fixture(t);
  const counts = [];
  shell.subscribe((detail) => counts.push(detail.snapshot.vault.nameLearningDueCount));
  assert.equal(shell.getSnapshot().vault.nameLearningDueCount, 1);
  grades.data.saveNameLearningProgress(courseId, student.id, { stage: 1, dueAt: Date.now() + 86400000 });
  assert.equal(shell.getSnapshot().vault.nameLearningDueCount, 0);
  assert.equal(counts.at(-1), 0);
  grades.data.saveNameLearningProgress(courseId, student.id, { stage: 0, dueAt: 0 });
  assert.equal(counts.at(-1), 1);
});

test('the last review does not wait in the file operation queue for an already loaded course', async (t) => {
  const { shell, harness, detail, results } = await fixture(t);
  harness.runGradeCourseMutation = () => { throw new Error('Review must not wait for file operations'); };
  const pending = handleReview.call(harness, detail);
  assert.equal(results[0]?.ok, true);
  assert.equal(shell.getSnapshot().vault.nameLearningDueCount, 0);
  assert.equal(await pending, true);
});

test('a review of another course still loads and commits through the course transaction', async (t) => {
  const { grades, shell, courseId, harness, detail, results } = await fixture(t);
  const otherCourse = grades.data.createCourse(grades.data.getActiveSchoolYear().id, 'Anderer Kurs');
  await grades.operations.ensureGradeCourseLoaded(otherCourse);
  assert.equal(await handleReview.call(harness, detail), true);
  assert.equal(grades.operations.isGradeCourseLoaded(courseId), true);
  assert.equal(shell.getSnapshot().vault.nameLearningDueCount, 0);
  assert.equal(results[0]?.ok, true);
});

test('a missing learner still returns a failed review', async (t) => {
  const { shell, harness, detail, results } = await fixture(t);
  assert.equal(await handleReview.call(harness, { ...detail, studentId: 9999 }), false);
  assert.equal(results[0]?.code, 'NAME_LEARNING_STUDENT_MISSING');
  assert.equal(shell.getSnapshot().vault.nameLearningDueCount, 1);
});
