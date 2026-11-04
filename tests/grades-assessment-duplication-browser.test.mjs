import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE header duplication opens an empty draft and persists an independent editable copy', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const [{ GradesApp }, { WorkspaceStore }, { WorkspaceRuntime }, { createWorkspacePublicApi }] = await Promise.all([
      import('/src/modules/grades/app.js?dom-test'),
      import('/src/modules/workspace/store.js'),
      import('/src/modules/workspace/runtime.js'),
      import('/src/modules/workspace/public-api.js'),
    ]);
    const store = new WorkspaceStore();
    const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
    const year = store.getActiveSchoolYear();
    const courseId = store.createCourse(year.id, 'Testkurs', '#336699');
    const templateBytes = Array.from(new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer()));
    let sourceId;
    let gradeId;
    let occurrenceId;
    await runtime.runGradeCourseMutation(courseId, () => {
      store.saveGradeStructure(courseId, [{ name: 'Leistungen', weight: 1,
        subcategories: [{ name: 'Schriftlich', weight: 1 }] }]);
      store.replaceGradeStudentsForCourse(courseId, [{ firstName: 'Testperson 1' }, { firstName: 'Testperson 2' }]);
      const category = store.getGradeStructureForPeriod(courseId, 'h1').categories[0];
      const assignment = { halfYear: 'h1', categoryId: category.id, subcategoryId: category.subcategories[0].id };
      sourceId = store.createGradeAssessment(courseId, {
        ...assignment, title: 'Klassenarbeit', mode: 'test', weight: 2, testScale: 'sek2',
        testDisplaySystem: 'points15', testPredicateSuffixes: false, yearLevel: 12, courseLevel: 'eA',
        assessmentNumber: 2, topic: 'Thema', examDurationMinutes: 90,
        testTasks: [{ id: 'a', title: 'Aufgabe 1', maxBe: 10, afb: 'II', deficitDiagnosisFollowUp: true,
          competenceExpectationIds: ['k1'], customCompetenceText: 'Erwartete Leistung' }],
        competenceExpectations: [{ id: 't1', topic: 'Thema', competencies: [{ id: 'k1', text: 'Kompetenz' }] }],
        expectationHorizonTemplateFile: { name: 'Original.docx', bytes: templateBytes },
      });
      gradeId = store.createGradeAssessment(courseId, { ...assignment, title: 'Einzelnote', mode: 'grade' });
      occurrenceId = store.createGradeAssessment(courseId, { ...assignment, title: 'Vorkommnis', mode: 'homework' });
      for (const student of store.listGradeStudents(courseId)) {
        store.setGradeTestEntry(student.id, sourceId, { a: 5 }, { expectationHorizonComment: 'Individueller Kommentar' });
      }
    }, { skipAutoSave: true });
    const original = structuredClone(store.createGradeAssessmentSnapshot(sourceId));
    const settings = store.getGradeTestScaleSettings();
    settings.sek2.thresholds[0][0] = 0.8;
    store.setGradeTestScaleSettings(settings);
    let bytes = (await runtime.buildContainer('seed')).bytes;
    runtime.isManualPersistenceMode = () => true;
    runtime.manualLoaded = true;
    runtime.databaseLoaded = true;
    runtime.commitPersistedVaultContainer(bytes);
    runtime.courseRepository.completeSave({ clearDeleted: true });
    let writes = 0;
    runtime.persistence.downloadBytes = (value) => { bytes = value.slice(); writes += 1; };
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => runtime, scope: 'grades' });
    const content = document.createElement('div');
    content.id = 'grades-entry-content';
    const menu = document.createElement('div');
    menu.hidden = true;
    const table = document.createElement('table');
    table.className = 'grades-master-table';
    const header = document.createElement('th');
    header.className = 'grade-assessment-col';
    header.dataset.courseId = String(courseId);
    header.dataset.gradeAssessmentId = String(sourceId);
    table.append(header);
    document.body.replaceChildren(table, content, menu);
    const messages = [];
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data, workspaceClient: api,
      refs: { gradesEntryPanel: document.createElement('div'), gradesEntryContent: content, contextMenu: menu },
      selectedCourseId: courseId, currentView: 'grades', gradesSubView: 'overview', shellTabContext: 'grades',
      skippedGradeEntries: new Set([`${sourceId}:1`]), gradeOverviewDisplaySystem: 'points15',
      gradeOverviewPredicateSuffixes: true,
      getSortedGradeStudentsForNameOrder: (students) => students,
      getGradeStudentDisplayName: (student) => student.firstName,
      getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraitPlaceholders: () => false,
      hideGradesTitleDatePicker() {}, hideGradePrivacyOverlay() {}, hideGradePicker() {},
      clearGradesOverviewAssessmentSpotlight() {}, clearPrivacyFocusedGradeStudent() {}, clearPendingGradesOverviewAutoScroll() {},
      renderViewState() {}, renderSidebarCourseList() {},
      renderGradesEntryDistributionOverlay() {}, bindGradesEntryTableScrollSync() {}, updateGradesEntryTableStickyScrollbar() {},
      updateGradeVaultActionButtons() {}, dispatchGradesUnsavedState() {},
      syncSegmentControlSlideStates() {}, refreshOpenExpectationHorizonDialogTemplate() {}, focusGradeAssessmentInput() {},
      ensureGradeVaultReadyForGradesEntryMutation: () => true,
      confirmGradesEntryAfbRequirementsBeforeSave: async () => true,
      showInfoMessage: async (message) => { messages.push(message); },
      openGradesOverviewForCourse: () => true, notifyParentToast() {},
      runAfterSegmentControlSlide: (event, callback) => callback(),
    });
    Object.defineProperty(app, 'activeSchoolYear', { value: year });
    app.renderGradesView = () => app.renderGradesEntryView(app.store.getCourse(courseId), app.store.listGradeStudents(courseId), []);
    let opening;
    app.duplicateGradeAssessmentWithoutResults = (id, course) => {
      opening = GradesApp.prototype.duplicateGradeAssessmentWithoutResults.call(app, id, course);
      return opening;
    };
    table.addEventListener('contextmenu', (event) => app.handleGradesSurfaceContextMenu(event));
    const menuFor = (id) => {
      header.dataset.gradeAssessmentId = String(id);
      header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 20, clientY: 20 }));
      return [...menu.querySelectorAll('button')].find((button) => button.textContent === 'Leistungseintrag duplizieren (ohne Ergebnisse)');
    };
    const onlyBe = !menuFor(gradeId) && !menuFor(occurrenceId);
    menuFor(sourceId).click();
    const opened = await opening;
    await new Promise(requestAnimationFrame);
    const initialDraft = structuredClone(app.gradesEntryDraft);
    const emptyValues = [...content.querySelectorAll('[data-grade-test-score]')].map((input) => input.value);
    const focusedTitle = document.activeElement === content.querySelector('[data-grades-entry-title]');
    const draftOnly = store.listGradeAssessments(courseId).length === 3 && writes === 0;
    const snapshotPreview = app.getGradeTestEntryScaleSnapshot(null, app.gradesEntryDraft);
    const copiedFields = ['courseId', 'halfYear', 'weight', 'categoryId', 'subcategoryId', 'yearLevel', 'courseLevel',
      'assessmentNumber', 'topic', 'examDurationMinutes', 'testScale', 'testScaleSnapshot', 'testDisplaySystem',
      'testPredicateSuffixes', 'testTasks', 'competenceExpectations', 'expectationHorizonTemplateFile']
      .every((key) => JSON.stringify(initialDraft[key]) === JSON.stringify(original.assessment[key]));
    app.gradesEntryDraft.testTasks[0].customCompetenceText = 'Angepasste Erwartung';
    const templateChanged = app.storeTemporaryExpectationHorizonTemplateFile({ name: 'Nachschrift.docx', bytes: templateBytes });
    app.renderGradesView();
    const scoreInput = content.querySelector('[data-grade-test-score]');
    scoreInput.value = '8';
    app.commitGradeCellInput(scoreInput);
    const draftGrade = content.querySelector('[data-grade-test-result-student]').textContent;
    const draftAverage = content.querySelector('[data-grade-test-average-result]').textContent;
    const printedGrade = app.buildGradesEntryTestPrintTable(app.getGradesEntryPrintContext())
      .querySelector('tbody tr td:nth-child(2)').textContent;
    const sourceUnchangedBeforeSave = JSON.stringify(store.createGradeAssessmentSnapshot(sourceId)) === JSON.stringify(original);
    const saved = await app.saveCurrentGradesEntry();
    await runtime.operationTail;
    const copy = store.listGradeAssessments(courseId).find((assessment) => assessment.title === 'Klassenarbeit (Kopie)');
    const originalUnchanged = JSON.stringify(store.createGradeAssessmentSnapshot(sourceId)) === JSON.stringify(original);
    const reopenedStore = new WorkspaceStore();
    const reopenedRuntime = new WorkspaceRuntime(reopenedStore, { eventTarget: new EventTarget() });
    await reopenedRuntime.loadBytes(bytes, 'manual');
    await reopenedRuntime.ensureGradeCourseLoaded(courseId);
    const reopenedApi = createWorkspacePublicApi({ getStore: () => reopenedStore, getRuntime: () => reopenedRuntime, scope: 'grades' });
    app.store = reopenedApi.data;
    app.workspaceClient = reopenedApi;
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = copy.id;
    app.renderGradesView();
    const reopened = app.store.getGradeAssessment(copy.id);
    const entries = app.store.listGradeEntries().filter((entry) => entry.assessmentId === copy.id);
    const reopenedValues = [...content.querySelectorAll('[data-grade-test-score]')].map((input) => input.value);
    const reopenedGrade = content.querySelector('[data-grade-test-result-student]').textContent;
    app.discardGradesEntryEditSession();
    app.gradesSubView = 'overview';
    content.replaceChildren();
    await app.duplicateGradeAssessmentWithoutResults(sourceId, courseId);
    const scaleInput = content.querySelector('[data-grades-entry-test-scale][value="sek1"]');
    scaleInput.checked = true;
    await app.handleGradesSurfaceChange({ target: scaleInput });
    const switchedSnapshot = app.getGradeTestEntryScaleSnapshot(null, app.gradesEntryDraft);
    const switchedDraftSnapshot = app.gradesEntryDraft.testScaleSnapshot;
    const expectedSwitchedSnapshot = app.store.buildGradeTestScaleSnapshot('sek1');
    app.discardGradesEntryEditSession();
    return {
      opened, onlyBe, draftOnly, focusedTitle, copiedFields, emptyValues,
      initialEntries: initialDraft.entries, initialIdentity: initialDraft.assessmentId || null,
      clearedSkipped: app.skippedGradeEntries.size === 0,
      preservedSnapshot: JSON.stringify(snapshotPreview) === JSON.stringify(original.assessment.testScaleSnapshot),
      sourceUnchangedBeforeSave, templateChanged, saved, writes, messages, originalUnchanged,
      independentId: copy.id !== sourceId, hasCreationTimestamp: Boolean(copy.createdAt), appended: copy.sortOrder > store.getGradeAssessment(occurrenceId).sortOrder,
      templateName: reopened.expectationHorizonTemplateFile.name,
      competenceText: reopened.testTasks[0].customCompetenceText,
      storedSnapshot: JSON.stringify(reopened.testScaleSnapshot) === JSON.stringify(original.assessment.testScaleSnapshot),
      entryCount: entries.length, entryComments: entries.map((entry) => entry.expectationHorizonComment),
      reopenedValues, draftGrade, draftAverage, printedGrade, reopenedGrade,
      changedScale: switchedDraftSnapshot === null && JSON.stringify(switchedSnapshot) === JSON.stringify(expectedSwitchedSnapshot),
      discarded: app.gradesEntryDraft === null && app.store.listGradeAssessments(courseId).length === 4,
    };
  });
  for (const field of ['opened', 'onlyBe', 'draftOnly', 'focusedTitle', 'copiedFields', 'clearedSkipped', 'preservedSnapshot',
    'sourceUnchangedBeforeSave', 'templateChanged', 'saved', 'originalUnchanged', 'independentId', 'hasCreationTimestamp',
    'appended', 'storedSnapshot', 'changedScale', 'discarded']) assert.equal(result[field], true, field);
  assert.deepEqual(result.emptyValues, ['', '']);
  assert.deepEqual(result.initialEntries, {});
  assert.equal(result.initialIdentity, null);
  assert.equal(result.writes, 1);
  assert.deepEqual(result.messages, []);
  assert.equal(result.templateName, 'Nachschrift.docx');
  assert.equal(result.competenceText, 'Angepasste Erwartung');
  assert.equal(result.entryCount, 1);
  assert.deepEqual(result.entryComments, ['']);
  assert.deepEqual(result.reopenedValues, ['8', '']);
  assert.equal(result.reopenedGrade, result.draftGrade);
  assert.equal(result.draftAverage, result.draftGrade);
  assert.equal(result.printedGrade, result.draftGrade);
  assert.notEqual(result.draftGrade, '15');
});
