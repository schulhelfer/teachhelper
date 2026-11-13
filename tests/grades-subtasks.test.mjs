import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const {
  normalizeGradeTestTasks, getGradeTestScoringTasks, calculateGradeTaskScoreSummary, calculateGradeTaskAverageSummary,
  calculateGradeTestRatio, calculateGradeTestValue, calculateGradeTestMaxBeSum,
  calculateGradeTestAfbShares, calculateGradeTestAverageState,
} = await loadGradesInternals([
  'normalizeGradeTestTasks', 'getGradeTestScoringTasks', 'calculateGradeTaskScoreSummary', 'calculateGradeTaskAverageSummary',
  'calculateGradeTestRatio', 'calculateGradeTestValue', 'calculateGradeTestMaxBeSum',
  'calculateGradeTestAfbShares', 'calculateGradeTestAverageState',
]);
const { WorkspaceStore } = await import(await createWorkspaceModuleLoader()('store.js'));
const tasks = [
  { id: 'main', maxBe: 99, afb: 'III', subTasks: [
    { id: 'part-a', maxBe: 3, afb: 'I', deficitDiagnosisFollowUp: true,
      competenceExpectationIds: ['k1'], customCompetenceText: 'Erwartung A' },
    { id: 'part-b', maxBe: 5.5, afb: 'II', competenceExpectationIds: ['k2'] },
  ] },
  { id: 'single', maxBe: 1.5, afb: 'III' },
];

test('normalization retains old tasks and makes child IDs unique throughout an assessment', () => {
  const legacy = normalizeGradeTestTasks([{ id: 'a', maxBe: '3,5', afb: 'ii' }]);
  assert.equal(legacy[0].maxBe, 3.5);
  assert.equal(legacy[0].afb, 'II');
  assert.equal(legacy[0].subTasks, undefined);
  const normalized = normalizeGradeTestTasks([
    { id: 'main', subTasks: [{ id: 'single' }, { id: 'same' }, { id: 'same' }] },
    { id: 'single' },
  ]);
  const ids = normalized.flatMap((task) => [task.id, ...(task.subTasks || []).map((child) => child.id)]);
  assert.equal(new Set(ids).size, 5);
  assert.equal(normalized[1].id, 'single');
  assert.deepEqual(normalizeGradeTestTasks(normalized), normalized);
  assert.deepEqual(getGradeTestScoringTasks(normalized).map((task) => task.label), ['1a', '1b', '1c', '2']);
  const many = getGradeTestScoringTasks([{ id: 'main', subTasks: Array.from({ length: 27 }, () => ({})) }]);
  assert.equal(many.at(-1).label, '1aa');
});

test('grades, AFB and averages count leaf tasks once and retain half points', () => {
  assert.equal(calculateGradeTestMaxBeSum(tasks), 10);
  const scores = { main: 99, 'part-a': 2.5, 'part-b': 4, single: 1.5 };
  const ratio = calculateGradeTestRatio(tasks, scores);
  assert.equal(ratio.maxSum, 10);
  assert.equal(ratio.earnedSum, 8);
  assert.equal(calculateGradeTestValue(tasks, scores), calculateGradeTestValue([
    { id: 'a', maxBe: 10 },
  ], { a: 8 }));
  assert.equal(calculateGradeTestRatio(tasks, { main: 99 }), null);
  assert.deepEqual(calculateGradeTestAfbShares(tasks).rows.map((row) => row.be), [3, 5.5, 1.5]);
  const average = calculateGradeTestAverageState(tasks, [scores, { 'part-a': 0, 'part-b': 2, single: 0.5 }]);
  assert.deepEqual(average.taskAverages, { 'part-a': 1.25, 'part-b': 3, single: 1 });
  assert.equal(average.ratioState.maxSum, 10);
});

test('group summaries distinguish empty, zero, incomplete and follow-up values', () => {
  const children = tasks[0].subTasks;
  const empty = calculateGradeTaskScoreSummary(children);
  assert.equal(empty.earnedSum, null);
  assert.equal(empty.incomplete, true);
  assert.equal(empty.requiresFollowUp, false);
  const zero = calculateGradeTaskScoreSummary(children, { 'part-a': 0 });
  assert.equal(zero.earnedSum, 0);
  assert.equal(zero.incomplete, true);
  assert.equal(zero.requiresFollowUp, true);
  const complete = calculateGradeTaskScoreSummary(children, { 'part-a': 1, 'part-b': 4 });
  assert.equal(complete.earnedSum, 5);
  assert.equal(complete.incomplete, false);
  assert.equal(complete.requiresFollowUp, false);
});

test('workspace storage retains child scores, recalculates after edits and round trips nested metadata', () => {
  const store = new WorkspaceStore();
  store.replaceGradeStudentsForCourse(3, [{ firstName: 'Lernperson 1' }]);
  const student = store.listGradeStudents(3)[0];
  const assessmentId = store.createGradeAssessment(3, { mode: 'test', testTasks: tasks });
  assert.equal(store.setGradeTestEntry(student.id, assessmentId, {
    main: 99, 'part-a': 2.5, 'part-b': 4, single: 1.5, unknown: 7,
  }), true);
  const entry = store.getGradeEntry(student.id, assessmentId);
  assert.deepEqual(entry.testScores, { 'part-a': 2.5, 'part-b': 4, single: 1.5 });
  assert.equal(entry.value, calculateGradeTestValue(tasks, entry.testScores));
  const reopened = new WorkspaceStore();
  reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
  const restored = structuredClone(reopened.getGradeAssessment(assessmentId));
  assert.equal(restored.testTasks[0].maxBe, null);
  assert.equal(restored.testTasks[0].subTasks[0].customCompetenceText, 'Erwartung A');
  assert.deepEqual(restored.testTasks[0].subTasks[0].competenceExpectationIds, ['k1']);
  assert.deepEqual(reopened.getGradeEntry(student.id, assessmentId).testScores, entry.testScores);
  restored.testTasks[0].subTasks[1].maxBe = 10;
  reopened.updateGradeAssessment(assessmentId, { testTasks: restored.testTasks });
  assert.equal(reopened.getGradeEntry(student.id, assessmentId).value,
    calculateGradeTestValue(restored.testTasks, entry.testScores));
  restored.testTasks[0].subTasks = restored.testTasks[0].subTasks.slice(1);
  reopened.updateGradeAssessment(assessmentId, { testTasks: restored.testTasks });
  assert.deepEqual(reopened.getGradeEntry(student.id, assessmentId).testScores, { 'part-b': 4, single: 1.5 });
});

test('group and overall averages use learner totals when different part scores are missing', () => {
  const children = [{ id: 'a', maxBe: 5 }, { id: 'b', maxBe: 5 }];
  const entries = [{ a: 5 }, { b: 5 }, {}];
  assert.deepEqual(calculateGradeTaskAverageSummary(children, entries), { earnedAverage: 5, invalid: false });
  assert.deepEqual(calculateGradeTaskAverageSummary(children, [{ a: 0 }, {}]), { earnedAverage: 0, invalid: false });
  assert.deepEqual(calculateGradeTaskAverageSummary(children, [{}]), { earnedAverage: null, invalid: false });
  const average = calculateGradeTestAverageState([{ id: 'main', subTasks: children }], entries);
  assert.equal(average.ratioState.earnedSum, 5);
  assert.equal(average.ratioState.maxSum, 10);
  assert.equal(average.ratioState.ratio, 0.5);
});

test('group summaries flag scores exceeding a reduced maximum and malformed stored values', () => {
  const children = [{ id: 'a', maxBe: 5 }, { id: 'b', maxBe: 5 }];
  const overflow = calculateGradeTaskScoreSummary(children, { a: 8, b: 4 });
  assert.equal(overflow.invalid, true);
  assert.equal(overflow.earnedSum, 12);
  assert.equal(calculateGradeTaskScoreSummary(children, { a: 3.5, b: 4 }).invalid, false);
  assert.equal(calculateGradeTaskScoreSummary(children, { a: 'invalid' }).invalid, true);
  assert.equal(calculateGradeTaskScoreSummary(children, { a: null }).invalid, false);
  assert.equal(calculateGradeTaskScoreSummary([{ id: 'a' }], { a: 2 }).invalid, true);
  assert.equal(calculateGradeTaskAverageSummary(children, [{ a: 8 }, { b: 4 }]).invalid, true);
});
