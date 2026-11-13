import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorkspaceModuleLoader } from './helpers/workspace-modules.mjs';

const source = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const load = createWorkspaceModuleLoader();
const { WorkspaceStore } = await import(await load('store.js'));

function extractMethod(name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(source);
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

const scheduled = [];
const methods = Function(
  'cloneJsonValue', 'normalizeGradeAssessmentMode', 'getGradeDeficitThresholdDefaultForScale', 'requestAnimationFrame',
  `return ({${[
    'duplicateGradeAssessmentWithoutResults', 'resolveUnsavedGradesEntryNavigation', 'discardGradesEntryEditSession',
  ].map(extractMethod).join(',\n')}});`,
)((value) => structuredClone(value), (value) => value, () => 4, (callback) => scheduled.push(callback));

function createHarness() {
  const assessment = {
    id: 7, courseId: 3, title: 'Leistung', mode: 'test', halfYear: 'h2', weight: 2,
    categoryId: 10, subcategoryId: 11, yearLevel: 12, courseLevel: 'eA', assessmentNumber: 2,
    topic: 'Thema', examDurationMinutes: 90, createdAt: '2025-01-01T00:00:00.000Z', sortOrder: 3,
    testScale: 'sek2', testDisplaySystem: 'school', testPredicateSuffixes: false,
    testScaleSnapshot: { id: 'sek2', label: 'Gespeicherter Schlüssel', thresholds: [[0.9, 15], [0, 0]] },
    testTasks: [{ id: 'a', title: 'Aufgabe 1', maxBe: 10, afb: 'II', deficitDiagnosisFollowUp: true,
      competenceExpectationIds: ['k1'], customCompetenceText: 'Erwartete Leistung', sortOrder: 1 }],
    competenceExpectations: [{ id: 't1', topic: 'Thema', competencies: [{ id: 'k1', text: 'Kompetenz' }] }],
    expectationHorizonTemplateFile: { name: 'Vorlage.docx', bytes: [80, 75, 3, 4] },
  };
  const harness = {
    ...methods, assessment, selectedCourseId: 3, selectedGradesEntryAssessmentId: 8,
    gradesEntryDraft: { courseId: 3, title: 'Vorheriger Entwurf' }, gradesEntryDraftDirty: false,
    skippedGradeEntries: new Set(['7:1']), gradesEntryEditSnapshot: { assessmentId: 8 },
    store: { getGradeAssessment: () => harness.assessment }, refs: {},
    canAccessGradeVault: () => true, canCommitImmediateGradeCourseMutation: () => true,
    isGradeAssessmentAssignmentValid: () => true, getGradeCourseRevision: () => 9,
    commitVisibleGradeInputs: () => true, showChoiceMessage: async () => 'cancel',
    setSyncStatus() {}, hideGradePicker() {}, clearGradesOverviewAssessmentSpotlight() {},
    clearPrivacyFocusedGradeStudent() {}, clearPendingGradesOverviewAutoScroll() {},
    markGradesEntryDraftDirty() { this.gradesEntryDraftDirty = true; },
    clearGradesEntryDraftDirty() { this.gradesEntryDraftDirty = false; },
    renderViewState() {}, renderSidebarCourseList() {}, renderGradesView() {},
  };
  return harness;
}

test('BE duplication creates an independent template draft with no results or original identity', async () => {
  const app = createHarness();
  const original = structuredClone(app.assessment);
  assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), true);
  const draft = app.gradesEntryDraft;
  assert.equal(draft.title, 'Leistung (NT)');
  assert.equal(draft.isMakeupAssessment, true);
  assert.deepEqual(draft.entries, {});
  for (const field of ['id', 'assessmentId', 'createdAt', 'sortOrder']) assert.equal(draft[field], undefined);
  for (const field of Object.keys(original).filter((key) => !['id', 'title', 'createdAt', 'sortOrder'].includes(key))) {
    assert.deepEqual(draft[field], original[field], field);
  }
  assert.equal(draft.baseCourseRevision, 9);
  assert.equal(draft.baseFingerprint, '');
  assert.equal(app.gradesEntryDraftDirty, true);
  assert.equal(app.gradesSubView, 'entry');
  assert.equal(app.selectedGradesEntryAssessmentId, null);
  assert.equal(app.gradesEntryEditSnapshot, null);
  assert.equal(app.skippedGradeEntries.size, 0);
  draft.testTasks[0].competenceExpectationIds.push('k2');
  draft.competenceExpectations[0].competencies[0].text = 'Geändert';
  draft.expectationHorizonTemplateFile.bytes[0] = 0;
  draft.testScaleSnapshot.thresholds[0][0] = 0.1;
  assert.deepEqual(app.assessment, original);
  app.discardGradesEntryEditSession();
  assert.equal(app.gradesEntryDraft, null);
  assert.equal(app.gradesEntryDraftDirty, false);
  assert.deepEqual(app.assessment, original);
  scheduled.splice(0).forEach((callback) => callback());
});

test('invalid duplication requests leave the current draft intact', async () => {
  const scenarios = [
    (app) => { app.assessment = null; },
    (app) => { app.assessment.courseId = 4; },
    (app) => { app.assessment.mode = 'grade'; },
    (app) => { app.assessment.mode = 'homework'; },
    (app) => { app.selectedCourseId = 4; },
    (app) => { app.canAccessGradeVault = () => false; },
    (app) => { app.canCommitImmediateGradeCourseMutation = () => false; },
    (app) => { app.isGradeAssessmentAssignmentValid = () => false; },
    (app) => { app.commitVisibleGradeInputs = () => false; },
  ];
  for (const prepare of scenarios) {
    const app = createHarness();
    const draft = app.gradesEntryDraft;
    prepare(app);
    assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), false);
    assert.equal(app.gradesEntryDraft, draft);
    assert.equal(app.selectedGradesEntryAssessmentId, 8);
  }
});

test('BE duplication preserves independent subtask settings and clears all child results', async () => {
  const app = createHarness();
  app.assessment.testTasks[0].subTasks = [
    { id: 'part-a', maxBe: 3, afb: 'I', competenceExpectationIds: ['k1'], deficitDiagnosisFollowUp: true },
    { id: 'part-b', maxBe: 5, afb: 'II', customCompetenceText: 'Erwartung B' },
  ];
  const original = structuredClone(app.assessment);
  assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), true);
  assert.deepEqual(app.gradesEntryDraft.testTasks, original.testTasks);
  assert.deepEqual(app.gradesEntryDraft.entries, {});
  app.gradesEntryDraft.testTasks[0].subTasks[0].competenceExpectationIds.push('k2');
  app.gradesEntryDraft.testTasks[0].subTasks[1].maxBe = 7;
  assert.deepEqual(app.assessment, original);
  scheduled.splice(0).forEach((callback) => callback());
});

test('unsaved-entry cancellation and context changes during the dialog preserve the old draft', async () => {
  for (const change of [
    () => {},
    (app) => { app.assessment = null; },
    (app) => { app.selectedCourseId = 4; },
    (app) => { app.canAccessGradeVault = () => false; },
    (app) => { app.canCommitImmediateGradeCourseMutation = () => false; },
  ]) {
    const app = createHarness();
    app.gradesEntryDraftDirty = true;
    const draft = app.gradesEntryDraft;
    app.showChoiceMessage = async () => { change(app); return app.assessment && app.selectedCourseId === 3
      && app.canAccessGradeVault() && app.canCommitImmediateGradeCourseMutation() ? 'cancel' : 'discard'; };
    assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), false);
    assert.equal(app.gradesEntryDraft, draft);
    assert.equal(app.gradesEntryDraftDirty, true);
  }
});

test('confirmed discard opens the copy and asynchronous source loss prevents opening', async () => {
  const app = createHarness();
  app.gradesEntryDraftDirty = true;
  app.showChoiceMessage = async () => 'discard';
  assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), true);
  assert.equal(app.gradesEntryDraft.title, 'Leistung (NT)');
  const pending = createHarness();
  const draft = pending.gradesEntryDraft;
  pending.resolveUnsavedGradesEntryNavigation = async () => { pending.assessment = null; return true; };
  assert.equal(await pending.duplicateGradeAssessmentWithoutResults(7, 3), false);
  assert.equal(pending.gradesEntryDraft, draft);
  scheduled.splice(0).forEach((callback) => callback());
});

test('assessment creation accepts a saved scale snapshot and keeps current defaults without one', () => {
  const store = new WorkspaceStore();
  const snapshot = store.buildGradeTestScaleSnapshot('sek2');
  snapshot.label = 'Ursprünglicher Schlüssel';
  snapshot.thresholds[0][0] = 0.99;
  const settings = store.getGradeTestScaleSettings();
  settings.sek2.label = 'Aktueller Schlüssel';
  settings.sek2.thresholds[0][0] = 0.97;
  store.setGradeTestScaleSettings(settings);
  const copiedId = store.createGradeAssessment(3, { mode: 'test', testScale: 'sek2', testScaleSnapshot: snapshot });
  const freshId = store.createGradeAssessment(3, { mode: 'test', testScale: 'sek2' });
  assert.deepEqual(store.getGradeAssessment(copiedId).testScaleSnapshot, snapshot);
  assert.deepEqual(store.getGradeAssessment(freshId).testScaleSnapshot, store.buildGradeTestScaleSnapshot('sek2'));
  snapshot.thresholds[0][0] = 0.5;
  assert.equal(store.getGradeAssessment(copiedId).testScaleSnapshot.thresholds[0][0], 0.99);
  const gradeId = store.createGradeAssessment(3, { mode: 'grade', testScaleSnapshot: snapshot });
  assert.equal(store.getGradeAssessment(gradeId).testScaleSnapshot, null);
});


test('BE copies always start as makeup assessments', async () => {
  for (const value of [undefined, false, true]) {
    const app = createHarness();
    app.assessment.isMakeupAssessment = value;
    assert.equal(await app.duplicateGradeAssessmentWithoutResults(7, 3), true);
    assert.equal(app.gradesEntryDraft.isMakeupAssessment, true);
    assert.equal(app.assessment.isMakeupAssessment, value);
  }
  scheduled.splice(0).forEach((callback) => callback());
});

test('makeup assessment state defaults to false and survives updates and vault round trips', () => {
  const store = new WorkspaceStore();
  const regularId = store.createGradeAssessment(3, { mode: 'test' });
  const makeupId = store.createGradeAssessment(3, { mode: 'test', isMakeupAssessment: true });
  assert.equal(store.getGradeAssessment(regularId).isMakeupAssessment, false);
  assert.equal(store.getGradeAssessment(makeupId).isMakeupAssessment, true);
  store.updateGradeAssessment(makeupId, { title: 'Überarbeitet' });
  assert.equal(store.getGradeAssessment(makeupId).isMakeupAssessment, true);
  const reopened = new WorkspaceStore();
  reopened.replaceGradeVaultState(JSON.parse(JSON.stringify(store.exportGradeVaultStateSnapshot())));
  assert.equal(reopened.getGradeAssessment(makeupId).isMakeupAssessment, true);
  reopened.updateGradeAssessment(makeupId, { isMakeupAssessment: false });
  assert.equal(reopened.getGradeAssessment(makeupId).isMakeupAssessment, false);
  store.replaceGradeVaultState(JSON.parse(JSON.stringify(reopened.exportGradeVaultStateSnapshot())));
  assert.equal(store.getGradeAssessment(makeupId).isMakeupAssessment, false);
  store.updateGradeAssessment(makeupId, { isMakeupAssessment: true, mode: 'grade' });
  assert.equal(store.getGradeAssessment(makeupId).isMakeupAssessment, false);
  for (const mode of ['grade', 'homework']) {
    const id = store.createGradeAssessment(3, { mode, isMakeupAssessment: true });
    assert.equal(store.getGradeAssessment(id).isMakeupAssessment, false);
  }
  const legacy = store.exportGradeVaultStateSnapshot();
  delete legacy.gradeAssessments.find((assessment) => assessment.id === regularId).isMakeupAssessment;
  legacy.gradeAssessments.find((assessment) => assessment.id === makeupId).isMakeupAssessment = true;
  store.replaceGradeVaultState(legacy);
  assert.equal(store.getGradeAssessment(regularId).isMakeupAssessment, false);
  assert.equal(store.getGradeAssessment(makeupId).isMakeupAssessment, false);
});
