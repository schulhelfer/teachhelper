import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGradesInternals } from './helpers/grades-module.mjs';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const {
  normalizeGradeTestTasks, getGradeTestScoringTasks, calculateGradeTaskScoreSummary, calculateGradeTaskAverageSummary,
  calculateGradeTestRatio, calculateGradeTestValue, calculateGradeTestMaxBeSum,
  calculateGradeTestAfbShares, calculateGradeTestAverageState, getGradeTestBonusTaskChoices,
} = await loadGradesInternals([
  'normalizeGradeTestTasks', 'getGradeTestScoringTasks', 'calculateGradeTaskScoreSummary', 'calculateGradeTaskAverageSummary',
  'calculateGradeTestRatio', 'calculateGradeTestValue', 'calculateGradeTestMaxBeSum',
  'calculateGradeTestAfbShares', 'calculateGradeTestAverageState', 'getGradeTestBonusTaskChoices',
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

test('main task follow-up and competences apply to every part and keep the part values for later', () => {
  const parent = { id: 'main', deficitDiagnosisFollowUp: true, competenceExpectationIds: ['k3'], customCompetenceText: 'Gesamt', subTasks: [
    { id: 'a', maxBe: 3, competenceExpectationIds: ['k1'], customCompetenceText: 'Eigene A' },
    { id: 'b', maxBe: 6 },
  ] };
  const normalized = normalizeGradeTestTasks([parent]);
  assert.equal(normalized[0].deficitDiagnosisFollowUp, true);
  assert.deepEqual(normalized[0].competenceExpectationIds, ['k3']);
  assert.equal(normalized[0].customCompetenceText, 'Gesamt');
  assert.deepEqual(normalized[0].subTasks[0].competenceExpectationIds, ['k1']);
  const effective = (tasks) => getGradeTestScoringTasks(tasks).map((task) => [task.deficitDiagnosisFollowUp,
    task.competenceExpectationIds, task.customCompetenceText, Boolean(task.inheritedDeficitFollowUp), Boolean(task.inheritedCompetences)]);
  assert.deepEqual(effective(normalized), [[true, ['k3'], 'Gesamt', true, true], [true, ['k3'], 'Gesamt', true, true]]);
  assert.equal(calculateGradeTaskScoreSummary(normalized, { a: 3, b: 1 }).requiresFollowUp, true);
  assert.deepEqual(effective([{ ...parent, deficitDiagnosisFollowUp: false, competenceExpectationIds: [], customCompetenceText: '' }]),
    [[false, ['k1'], 'Eigene A', false, false], [false, [], '', false, false]]);
  assert.deepEqual(effective([{ ...parent, competenceExpectationIds: [], customCompetenceText: '' }]),
    [[true, ['k1'], 'Eigene A', true, false], [true, [], '', true, false]]);
  const store = new WorkspaceStore();
  store.replaceGradeStudentsForCourse(3, [{ firstName: 'Lernperson 1' }]);
  const assessmentId = store.createGradeAssessment(3, { mode: 'test', testTasks: [parent] });
  const reopened = new WorkspaceStore();
  reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
  const saved = reopened.getGradeAssessment(assessmentId).testTasks[0];
  assert.deepEqual([saved.deficitDiagnosisFollowUp, saved.competenceExpectationIds, saved.customCompetenceText], [true, ['k3'], 'Gesamt']);
  assert.deepEqual(saved.subTasks[0].competenceExpectationIds, ['k1']);
});

const bonusTasks = [
  { id: 'one', maxBe: 10, afb: 'I' },
  { id: 'two', maxBe: 10, afb: 'II' },
  { id: 'extra', maxBe: 5, afb: 'III', isBonus: true },
];

test('bonus task normalization keeps exactly one flag and a main task flag covers all parts', () => {
  const normalized = normalizeGradeTestTasks([
    { id: 'a', maxBe: 2, isBonus: true },
    { id: 'b', maxBe: 3, isBonus: true },
    { id: 'c', isBonus: 'yes', subTasks: [{ id: 'c1', maxBe: 1, isBonus: true }] },
  ]);
  assert.deepEqual(normalized.map((task) => task.isBonus === true), [true, false, false]);
  assert.equal(normalized[2].subTasks[0].isBonus, undefined);
  assert.equal('isBonus' in normalized[1], false);
  assert.deepEqual(normalizeGradeTestTasks(normalized), normalized);
  const group = normalizeGradeTestTasks([
    { id: 'main', isBonus: true, subTasks: [{ id: 'x', maxBe: 2, isBonus: true }, { id: 'y', maxBe: 3 }] },
  ]);
  assert.equal(group[0].isBonus, true);
  assert.equal(group[0].subTasks[0].isBonus, undefined);
  assert.deepEqual(getGradeTestScoringTasks(group).map((task) => [task.isBonus, task.inheritedBonus]), [[true, true], [true, true]]);
  const child = getGradeTestScoringTasks([{ id: 'main', subTasks: [{ id: 'x', maxBe: 2 }, { id: 'y', maxBe: 3, isBonus: true }] }]);
  assert.deepEqual(child.map((task) => task.isBonus === true), [false, true]);
});

test('bonus task BE2 count towards the total while its BE1 does not', () => {
  assert.equal(calculateGradeTestMaxBeSum(bonusTasks), 20);
  const ratio = calculateGradeTestRatio(bonusTasks, { one: 8, two: 6, extra: 4 });
  assert.equal(ratio.maxSum, 20);
  assert.equal(ratio.earnedSum, 18);
  assert.equal(ratio.ratio, 0.9);
  const capped = calculateGradeTestRatio(bonusTasks, { one: 10, two: 9, extra: 5 });
  assert.equal(capped.earnedSum, 24);
  assert.equal(capped.ratio, 1);
  assert.equal(calculateGradeTestRatio(bonusTasks, { extra: 9 }).earnedSum, 5);
  assert.equal(calculateGradeTestRatio([{ id: 'extra', maxBe: 5, isBonus: true }], { extra: 3 }), null);
  assert.equal(calculateGradeTestValue(bonusTasks, { one: 8, two: 6, extra: 4 }),
    calculateGradeTestValue([{ id: 'a', maxBe: 20 }], { a: 18 }));
  const average = calculateGradeTestAverageState(bonusTasks, [{ one: 8, two: 6, extra: 4 }, { one: 2, two: 2 }]);
  assert.equal(average.ratioState.maxSum, 20);
  assert.equal(average.ratioState.earnedSum, 11);
  assert.deepEqual(calculateGradeTestAfbShares(bonusTasks).rows.map((row) => row.be), [10, 10, 5]);
  const groupRatio = calculateGradeTestRatio([
    { id: 'one', maxBe: 10 },
    { id: 'main', isBonus: true, subTasks: [{ id: 'x', maxBe: 2 }, { id: 'y', maxBe: 3 }] },
  ], { one: 5, x: 2, y: 1 });
  assert.deepEqual([groupRatio.maxSum, groupRatio.earnedSum], [10, 8]);
});

test('bonus task choices list main tasks, whole groups and single parts', () => {
  const choices = getGradeTestBonusTaskChoices([
    { id: 'one', maxBe: 2 },
    { id: 'main', subTasks: [{ id: 'x', maxBe: 2 }, { id: 'y', maxBe: 3, isBonus: true }] },
  ]);
  assert.deepEqual(choices.map((choice) => [choice.id, choice.label, choice.selected]), [
    ['one', 'Aufgabe 1', false],
    ['main', 'Aufgabe 2 (gesamt)', false],
    ['x', 'Aufgabe 2a', false],
    ['y', 'Aufgabe 2b', true],
  ]);
});

test('workspace storage grades with the bonus rule and round trips the bonus flag', () => {
  const store = new WorkspaceStore();
  store.replaceGradeStudentsForCourse(3, [{ firstName: 'Lernperson 1' }]);
  const student = store.listGradeStudents(3)[0];
  const assessmentId = store.createGradeAssessment(3, { mode: 'test', testTasks: bonusTasks });
  store.setGradeTestEntry(student.id, assessmentId, { one: 8, two: 6, extra: 4 });
  assert.equal(store.getGradeEntry(student.id, assessmentId).value,
    calculateGradeTestValue([{ id: 'a', maxBe: 20 }], { a: 18 }));
  const reopened = new WorkspaceStore();
  reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
  assert.equal(reopened.getGradeAssessment(assessmentId).testTasks[2].isBonus, true);
  const updated = structuredClone(reopened.getGradeAssessment(assessmentId).testTasks).map(({ isBonus, ...task }) => task);
  reopened.updateGradeAssessment(assessmentId, { testTasks: updated });
  assert.equal(reopened.getGradeEntry(student.id, assessmentId).value,
    calculateGradeTestValue([{ id: 'a', maxBe: 25 }], { a: 18 }));
});
