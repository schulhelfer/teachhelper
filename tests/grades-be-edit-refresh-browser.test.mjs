import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE edits refresh existing and new assessments without persisting the draft', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const course = { id: 1, name: 'Kurs', color: '#336699' };
    const students = [{ id: 1, firstName: 'Anna' }, { id: 2, firstName: 'Ben' }];
    const snapshot = {
      id: 'sek2', label: 'Gespeicherter Schlüssel',
      thresholds: Array.from({ length: 16 }, (_, index) => [(15 - index) / 20, 15 - index]),
    };
    const assessment = {
      id: 7, courseId: 1, title: 'Test', mode: 'test', halfYear: 'h1', categoryId: 1,
      testScale: 'sek2', testScaleSnapshot: snapshot, testPredicateSuffixes: true,
      testTasks: [{ id: 'a', title: 'Aufgabe 1', maxBe: 10, afb: 'I' }],
    };
    let savedEntries = students.map((student) => ({
      studentId: student.id, assessmentId: 7, testScores: { a: 5 },
    }));
    let writes = 0;
    const content = document.createElement('div');
    content.id = 'grades-entry-content';
    document.body.replaceChildren(content);
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      refs: { gradesEntryContent: content }, selectedCourseId: 1,
      selectedGradesEntryAssessmentId: 7,
      gradeDeficitThreshold: 5,
      store: {
        getGradeAssessment: () => structuredClone(assessment),
        listGradeEntries: () => structuredClone(savedEntries),
        getGradeEntry: (id) => structuredClone(savedEntries.find((entry) => entry.studentId === id)),
        listGradeStudents: () => students,
        listCourses: () => [course],
        createGradeAssessmentSnapshot: () => ({ assessment, entries: savedEntries }),
        getGradeTestScaleSettings: () => null,
        buildGradeTestScaleSnapshot: (id) => ({
          id, label: 'Aktueller Schlüssel',
          thresholds: Array.from({ length: 16 }, (_, index) => [(15 - index) / 15, 15 - index]),
        }),
        clearGradeAssessmentEntries() { savedEntries = []; writes += 1; },
        setGradeTestEntry(studentId, assessmentId, testScores) {
          savedEntries.push({ studentId, assessmentId, testScores: structuredClone(testScores) });
          writes += 1;
          return true;
        },
      },
      getGradeCourseRevision: () => 1,
      resolveGradeOccurrenceCategoryId: () => null,
      getGradesEntryStructureCategories: () => [{ id: 1, subcategories: [] }],
      getMostUsedGradeAssessmentSelection: () => ({ categoryId: 1, subcategoryId: null }),
      getSortedGradeStudentsForNameOrder: (items) => items,
      getGradeStudentDisplayName: (student) => student.firstName,
      getGradeStudentPortraitUrl: () => '',
      shouldShowGradeStudentPortraitPlaceholders: () => false,
      getCurrentGradeOverviewDisplaySystem: () => 'points',
      getCurrentGradeOverviewPredicateSuffixes: () => true,
      courseAllowsGrades: () => true,
      updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {},
      renderGradesEntryDistributionOverlay() {}, syncSegmentControlSlideStates() {},
      refreshGradeTotals() {}, renderGradePrivacyOverlay() {}, hideGradePicker() {},
      isGradeCourseMutationContextActive: () => true,
    });
    Object.defineProperty(app, 'activeSchoolYear', { value: { id: 1 } });
    const render = () => {
      const active = app.selectedGradesEntryAssessmentId ? assessment : null;
      const draft = active ? app.getGradesEntryAssessmentDraft(active) : app.getGradesEntryDraft(1);
      content.replaceChildren(
        app.buildGradesTestEntryTable(course, students, active, draft),
        app.buildGradesEntryDistributionPanel(course, students, active, draft),
      );
    };
    const read = () => ({
      grades: [...content.querySelectorAll('[data-grade-test-result-student]')].map((node) => node.textContent),
      ratios: [...content.querySelectorAll('[data-grade-test-ratio-student]')].map((node) => node.textContent),
      average: content.querySelector('[data-grade-test-average-result]').textContent,
      averageRatio: content.querySelector('[data-grade-test-average-ratio]').textContent,
      taskAverage: content.querySelector('[data-grade-test-average-task]').textContent,
      distribution: content.querySelector('.grades-entry-distribution-chart').textContent.replace(/\s+/g, ' ').trim(),
    });
    const input = (id) => content.querySelector(`[data-grade-test-score][data-student-id="${id}"]`);
    const change = (id, value) => {
      input(id).value = value;
      if (!app.commitGradeCellInput(input(id))) throw new Error('BE commit failed');
      return read();
    };
    render();
    const initial = read();
    const edited = change(1, '10');
    render();
    const rerendered = read();
    const zero = change(1, '0');
    const cleared = change(1, '');
    input(1).value = '10';
    input(2).value = '0';
    const bulkOk = app.commitVisibleGradeTestScoreInputs(content);
    const bulk = read();
    const maxInput = content.querySelector('[data-grade-test-task-field="maxBe"]');
    maxInput.value = '20';
    app.updateGradeTestTaskFromInput(maxInput);
    app.refreshVisibleGradeTestResultsForTaskInput(maxInput);
    const maxChanged = read();
    const writesBeforeSave = writes;
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = 7;
    render();
    const discarded = read();
    change(1, '10');
    change(2, '');
    const beforeSave = read();
    const persisted = app.persistGradesEntryDraftEntries(7, 1, app.gradesEntryDraft, { replaceExisting: true });
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = 7;
    render();
    const reopened = read();
    app.discardGradesEntryEditSession();
    app.gradesEntryDraft = {
      courseId: 1, mode: 'test', title: 'Neu', halfYear: 'h1', categoryId: 1,
      testScale: 'sek2', testPredicateSuffixes: true, testTasks: assessment.testTasks, entries: {},
    };
    render();
    const fresh = change(1, '10');
    return { initial, edited, rerendered, zero, cleared, bulkOk, bulk, maxChanged,
      writesBeforeSave, discarded, beforeSave, persisted, reopened, fresh, savedEntries };
  });

  assert.deepEqual(result.initial.grades, ['10', '10']);
  assert.deepEqual(result.edited.grades, ['15', '10']);
  assert.match(result.edited.ratios[0], /^10 \/ 10/);
  assert.notEqual(result.edited.average, result.initial.average);
  assert.notEqual(result.edited.averageRatio, result.initial.averageRatio);
  assert.notEqual(result.edited.taskAverage, result.initial.taskAverage);
  assert.notEqual(result.edited.distribution, result.initial.distribution);
  assert.deepEqual(result.rerendered, result.edited);
  assert.equal(result.zero.grades[0], '00');
  assert.match(result.zero.ratios[0], /^0 \/ 10/);
  assert.equal(result.cleared.grades[0], '—');
  assert.equal(result.cleared.ratios[0], '—');
  assert.equal(result.cleared.average, result.initial.average);
  assert.equal(result.cleared.taskAverage, result.initial.taskAverage);
  assert.equal(result.bulkOk, true);
  assert.deepEqual(result.bulk.grades, ['15', '00']);
  assert.match(result.bulk.ratios[0], /^10 \/ 10/);
  assert.deepEqual(result.maxChanged.grades, ['10', '00']);
  assert.match(result.maxChanged.ratios[0], /^10 \/ 20/);
  assert.equal(result.writesBeforeSave, 0);
  assert.deepEqual(result.discarded, result.initial);
  assert.equal(result.persisted, 1);
  assert.deepEqual(result.reopened, result.beforeSave);
  assert.deepEqual(result.savedEntries, [{ studentId: 1, assessmentId: 7, testScores: { a: 10 } }]);
  assert.deepEqual(result.fresh.grades, ['15', '—']);
  assert.match(result.fresh.ratios[0], /^10 \/ 10/);
});
