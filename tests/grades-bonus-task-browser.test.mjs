import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('Zusatzaufgabe in den BE-Optionen zählt BE2, aber nicht BE1, und übersteht Aufteilen, Zusammenfassen und Speichern', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1400, height: 1000 } });
  const result = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { createWorkspacePublicApi } = await import('/src/modules/workspace/public-api.js');
    const store = new WorkspaceStore();
    const year = store.getActiveSchoolYear();
    const courseId = store.createCourse(year.id, 'Testkurs', '#336699');
    const course = store.listCourses(year.id).find((item) => item.id === courseId);
    store.saveGradeStructure(courseId, [{ name: 'Leistungen', weight: 1, subcategories: [] }]);
    store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Testperson' }]);
    const categoryId = store.getGradeStructureForPeriod(courseId, 'h1').categories[0].id;
    const assessmentId = store.createGradeAssessment(courseId, {
      title: 'Testleistung', mode: 'test', halfYear: 'h1', categoryId, testScale: 'sek2',
      testTasks: [
        { id: 'one', maxBe: 10 },
        { id: 'two', maxBe: 10 },
        { id: 'three', maxBe: 5 },
      ],
    });
    const student = store.listGradeStudents(courseId)[0];
    store.setGradeTestEntry(student.id, assessmentId, { one: 8, two: 6, three: 4 });
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
    const content = document.createElement('div');
    document.body.replaceChildren(content);
    const confirmations = [];
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data, refs: { gradesEntryPanel: document.createElement('div'), gradesEntryContent: content },
      selectedCourseId: courseId, selectedGradesEntryAssessmentId: assessmentId,
      gradesSubView: 'entry', currentView: 'grades', gradeOverviewDisplaySystem: 'points15', skippedGradeEntries: new Set(),
      gradeOverviewPredicateSuffixes: true,
      getGradeCourseRevision: () => 1,
      isGradeCourseMutationContextActive: () => true,
      isGradeCourseNavigationEventBlocked: () => false,
      canAccessGradeVault: () => true, courseAllowsGrades: () => true,
      getSortedGradeStudentsForNameOrder: (students) => students,
      getGradeStudentDisplayName: () => 'Testperson',
      getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraitPlaceholders: () => false,
      hideGradesTitleDatePicker() {}, hideGradePrivacyOverlay() {}, hideGradePicker() {},
      renderGradesEntryDistributionOverlay() {}, bindGradesEntryTableScrollSync() {}, updateGradesEntryTableStickyScrollbar() {},
      updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {},
      runAfterSegmentControlSlide: (event, callback) => callback(),
      confirmGradesEntryAssessmentDestructiveChanges: async () => true,
      showConfirmMessage: async (message) => { confirmations.push(message); return true; },
      ensureStoredExpectationHorizonTemplateLoaded: async () => {},
      showInfoMessage: async (message) => { throw new Error(message); },
    });
    Object.defineProperty(app, 'activeSchoolYear', { value: year });
    app.renderGradesView = () => app.renderGradesEntryView(course, store.listGradeStudents(courseId), []);
    const select = () => content.querySelector('select[data-grades-entry-bonus-task]');
    const choose = async (value) => {
      select().value = value;
      await app.handleGradesSurfaceChange({ target: select() });
    };
    const read = () => ({
      options: [...select().options].map((option) => [option.value, option.textContent]),
      selected: select().value,
      ratio: content.querySelector('[data-grade-test-ratio-student]').textContent,
      badges: [...content.querySelectorAll('th .grade-test-bonus-badge')]
        .map((badge) => badge.closest('th').dataset.gradeTestTaskColumn || badge.closest('th').dataset.gradeTestGroup),
      dirty: app.gradesEntryDraftDirty === true,
    });
    app.renderGradesView();
    const initial = read();
    await choose('three');
    const marked = read();
    const addSubTask = () => app.handleGradesSurfaceClick({
      target: content.querySelector('[data-grade-test-add-subtask="three"]'), preventDefault() {}, stopPropagation() {},
    });
    await addSubTask();
    await addSubTask();
    const split = read();
    const secondPartMax = [...content.querySelectorAll('input[data-grade-test-task-field="maxBe"]')]
      .find((input) => input.dataset.taskId === 'three-part-2');
    secondPartMax.value = '2';
    await choose('three-part-2');
    const childMarked = read();
    await app.handleGradesSurfaceClick({
      target: content.querySelector('[data-grade-test-merge-subtasks="three"]'), preventDefault() {}, stopPropagation() {},
    });
    const merged = read();
    await choose('three');
    await app.applyGradesEntryAssessmentEditorValues(assessmentId, app.readGradesEntryEditorValues());
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = assessmentId;
    app.renderGradesView();
    const reopened = read();
    const saved = store.getGradeAssessment(assessmentId).testTasks.map((task) => task.isBonus === true);
    const grade = store.getGradeEntry(student.id, assessmentId).value;
    const disabledOutsideBe = (() => {
      app.discardGradesEntryEditSession();
      app.selectedGradesEntryAssessmentId = null;
      app.gradesEntryDraft = { courseId, mode: 'grade' };
      app.renderGradesView();
      return select().disabled && select().closest('.grades-entry-be-options').classList.contains('is-hidden');
    })();
    return { initial, marked, split, childMarked, merged, reopened, saved, grade, disabledOutsideBe, confirmations };
  });

  assert.deepEqual(result.initial.options, [
    ['', 'Keine'], ['one', 'Aufgabe 1'], ['two', 'Aufgabe 2'], ['three', 'Aufgabe 3'],
  ]);
  assert.equal(result.initial.selected, '');
  assert.equal(result.initial.ratio, '18 / 25 = 72%');
  assert.deepEqual(result.initial.badges, []);

  assert.equal(result.marked.selected, 'three');
  assert.equal(result.marked.ratio, '18 / 20 = 90%');
  assert.deepEqual(result.marked.badges, ['three']);
  assert.equal(result.marked.dirty, true);

  assert.deepEqual(result.split.options.slice(3), [
    ['three', 'Aufgabe 3 (gesamt)'], ['three-part-1', 'Aufgabe 3a'], ['three-part-2', 'Aufgabe 3b'],
  ]);
  assert.equal(result.split.selected, 'three');
  assert.deepEqual(result.split.badges, ['three']);
  assert.equal(result.split.ratio, '18 / 20 = 90%');

  assert.equal(result.childMarked.selected, 'three-part-2');
  assert.deepEqual(result.childMarked.badges, ['three-part-2']);
  assert.equal(result.childMarked.ratio, '18 / 25 = 72%');

  assert.equal(result.confirmations.length, 1);
  assert.match(result.confirmations[0], /Markierung als Zusatzaufgabe wird aufgehoben/);
  assert.equal(result.merged.selected, '');
  assert.equal(result.merged.ratio, '18 / 27 = 66%');

  assert.equal(result.reopened.selected, 'three');
  assert.equal(result.reopened.ratio, '18 / 20 = 90%');
  assert.deepEqual(result.saved, [false, false, true]);
  assert.equal(typeof result.grade, 'number');
  assert.equal(result.disabledOutsideBe, true);
});
