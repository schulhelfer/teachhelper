export async function createSubtaskHarness() {
  const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
  const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
  const { createWorkspacePublicApi } = await import('/src/modules/workspace/public-api.js');
  const { normalizeGradeTestTasks } = await import('/src/shared/school-data/grade-test-tasks.js');
  const store = new WorkspaceStore();
  const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
  const year = store.getActiveSchoolYear();
  const courseId = store.createCourse(year.id, 'Testkurs', '#336699');
  const course = api.data.getCourse(courseId);
  store.saveGradeStructure(courseId, [{ name: 'Leistungen', weight: 1 }]);
  store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Lernperson 1' }, { firstName: 'Lernperson 2' }]);
  const students = store.listGradeStudents(courseId);
  const categoryId = store.getGradeStructureForPeriod(courseId, 'h1').categories[0].id;
  const assessmentId = store.createGradeAssessment(courseId, {
    mode: 'test', title: 'Testleistung', categoryId, halfYear: 'h1', testScale: 'sek2',
    testTasks: [{ id: 'main', maxBe: 5 }, { id: 'single', maxBe: 5 }],
  });
  const content = document.createElement('div');
  content.id = 'grades-entry-content';
  const dialogTitle = document.createElement('h3');
  document.body.replaceChildren(content, dialogTitle);
  const app = Object.create(GradesApp.prototype);
  Object.assign(app, {
    store: api.data, refs: { gradesEntryContent: content, gradeTaskCompetenceDialogTitle: dialogTitle },
    selectedCourseId: courseId, selectedGradesEntryAssessmentId: assessmentId,
    gradeDeficitThreshold: 5, currentView: 'grades', gradesSubView: 'entry',
    getGradeCourseRevision: () => 1, resolveGradeOccurrenceCategoryId: () => null,
    getSortedGradeStudentsForNameOrder: (values) => values,
    getGradeStudentDisplayName: (student) => student.firstName,
    getGradeStudentLegalDisplayName: (student) => student.firstName,
    getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraitPlaceholders: () => false,
    getCurrentGradeOverviewDisplaySystem: () => 'points15', getCurrentGradeOverviewPredicateSuffixes: () => true,
    getGradeInputRoot: () => content, isGradeCourseNavigationEventBlocked: () => false,
    updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {}, refreshGradeTotals() {},
    renderGradePrivacyOverlay() {}, refreshVisibleGradesEntryDistribution() {},
    renderGradesEntryDistributionOverlay() {}, syncSegmentControlSlideStates() {},
    updateGradesEntryTableStickyScrollbar() {}, hideGradePicker() {}, openDialog() {}, closeDialog() {},
    isGradeCourseMutationContextActive: () => true, showConfirmMessage: async () => true,
  });
  const render = () => content.replaceChildren(app.buildGradesTestEntryTable(course, students, store.getGradeAssessment(app.selectedGradesEntryAssessmentId)));
  app.renderGradesView = render;
  render();
  const base = structuredClone(app.gradesEntryDraft);
  const reset = (tasks, entries = {}, template = null) => {
    app.selectedGradesEntryAssessmentId = assessmentId;
    app.gradesEntryDraft = { ...structuredClone(base), testTasks: normalizeGradeTestTasks(tasks, { ensureDefault: false }), entries, expectationHorizonTemplateFile: template };
    app.expectationHorizonTemplateFile = template;
    app.collapsedGradeTestTasks = new Set();
    app.gradesEntryDraftDirty = false;
    render();
  };
  const click = (target) => app.handleGradesSurfaceClick({ target, preventDefault() {}, stopPropagation() {} });
  const input = (taskId, studentId = students[0].id) => [...content.querySelectorAll('[data-grade-test-score]')]
    .find((node) => node.dataset.taskId === taskId && Number(node.dataset.studentId) === studentId);
  const summary = (studentId = students[0].id) => [...content.querySelectorAll('[data-grade-test-group-student]')]
    .find((node) => Number(node.dataset.gradeTestGroupStudent) === studentId);
  return { app, store, api, course, courseId, students, categoryId, assessmentId, content, dialogTitle, render, reset, click, input, summary };
}
