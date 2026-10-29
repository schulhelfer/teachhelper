import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('BE-Notensystem bleibt je Leistung gespeichert und unabhängig von der Übersicht', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1200, height: 1000 } });
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
    const payload = { title: 'Testleistung', mode: 'test', halfYear: 'h1', categoryId, testScale: 'sek1', testTasks: [{ id: 'a', maxBe: 100 }] };
    const firstId = store.createGradeAssessment(courseId, payload);
    const secondId = store.createGradeAssessment(courseId, { ...payload, testDisplaySystem: 'points15' });
    const student = store.listGradeStudents(courseId)[0];
    store.setGradeTestEntry(student.id, firstId, { a: 90 });
    store.setGradeTestEntry(student.id, secondId, { a: 90 });
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
    const content = document.createElement('div');
    document.body.replaceChildren(content);
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store: api.data, refs: { gradesEntryPanel: document.createElement('div'), gradesEntryContent: content },
      selectedCourseId: courseId, selectedGradesEntryAssessmentId: firstId,
      gradesSubView: 'entry', currentView: 'grades', gradeOverviewDisplaySystem: 'points15',
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
      showInfoMessage: async (message) => { throw new Error(message); },
    });
    Object.defineProperty(app, 'activeSchoolYear', { value: year });
    const render = () => app.renderGradesEntryView(course, store.listGradeStudents(courseId), []);
    app.renderGradesView = render;
    const read = () => ({
      selected: content.querySelector('[data-grades-entry-test-display-system]:checked').value,
      grade: content.querySelector('[data-grade-test-result-student]').textContent,
      average: content.querySelector('[data-grade-test-average-result]').textContent,
      overview: app.getCurrentGradeOverviewDisplaySystem(),
    });
    const change = async (selector, value) => {
      const input = content.querySelector(`${selector}[value="${value}"]`);
      input.checked = true;
      await app.handleGradesSurfaceChange({ target: input });
    };
    render();
    const initial = read();
    const scoreInput = content.querySelector('[data-grade-test-score]');
    scoreInput.value = '80';
    await change('[data-grades-entry-test-display-system]', 'points15');
    const changed = read();
    const unsaved = store.getGradeAssessment(firstId).testDisplaySystem;
    const keptScore = app.gradesEntryDraft.entries[student.id].testScores.a;
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = firstId;
    render();
    const discarded = read();
    await change('[data-grades-entry-test-display-system]', 'points15');
    await app.applyGradesEntryAssessmentEditorValues(firstId, app.readGradesEntryEditorValues());
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = firstId;
    render();
    const reopened = read();
    await change('[data-grades-entry-test-display-system]', 'school');
    await app.applyGradesEntryAssessmentEditorValues(firstId, app.readGradesEntryEditorValues());
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = secondId;
    render();
    const second = read();
    app.gradeOverviewDisplaySystem = 'school';
    render();
    const changedOverview = read();
    const reloaded = store.normalizeGradeVaultState(JSON.parse(JSON.stringify(store.gradeVaultState)));
    const stored = reloaded.gradeAssessments.map((assessment) => assessment.testDisplaySystem);
    app.discardGradesEntryEditSession();
    app.selectedGradesEntryAssessmentId = firstId;
    render();
    await change('[data-grades-entry-test-scale]', 'sek2');
    const changedScale = read();
    const printContext = { assessment: app.buildGradesEntryAssessmentPreview(store.getGradeAssessment(firstId)), students: [student] };
    const print = app.buildGradesEntryTestPrintTable(printContext);
    const printedGrade = print.querySelector('tbody tr td:nth-child(2)').textContent;
    const archivedGrade = app.buildArchiveGradeBeMaskSection(course, [student], store.getGradeAssessment(firstId)).rows[0][1];
    for (const href of ['/src/shared/segment-control.css', '/src/modules/grades/app.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href;
      const loaded = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
      document.head.append(link);
      await loaded;
    }
    const scaleField = content.querySelector('.grades-entry-test-scale-field');
    const displayField = content.querySelector('.grades-entry-test-display-system-field');
    const wide = { scaleTop: scaleField.getBoundingClientRect().top, displayTop: displayField.getBoundingClientRect().top };
    window.beDisplayLayout = { scaleField, displayField };
    return { initial, changed, unsaved, keptScore, discarded, reopened, second, changedOverview, stored, changedScale, printedGrade, archivedGrade, wide };
  });
  assert.deepEqual(result.initial, { selected: 'school', grade: '1', average: '1', overview: 'points15' });
  assert.equal(result.changed.selected, 'points15');
  assert.equal(result.changed.grade, '11');
  assert.equal(result.changed.average, '11');
  assert.equal(result.changed.overview, 'points15');
  assert.equal(result.unsaved, 'school');
  assert.equal(result.keptScore, 80);
  assert.deepEqual(result.discarded, result.initial);
  assert.equal(result.reopened.selected, 'points15');
  assert.equal(result.reopened.grade, '14');
  assert.equal(result.second.selected, 'points15');
  assert.equal(result.changedOverview.grade, result.second.grade);
  assert.deepEqual(result.stored, ['school', 'points15']);
  assert.equal(result.changedScale.selected, 'school');
  assert.equal(result.printedGrade, '1');
  assert.equal(result.archivedGrade, '1');
  assert.ok(Math.abs(result.wide.scaleTop - result.wide.displayTop) < 1);
  await evaluate.setViewport({ width: 480, height: 900 });
  const narrow = await evaluate(() => {
    const { scaleField, displayField } = window.beDisplayLayout;
    return { scaleBottom: scaleField.getBoundingClientRect().bottom, displayTop: displayField.getBoundingClientRect().top };
  });
  assert.ok(narrow.displayTop >= narrow.scaleBottom);
});

test('EWH-DOCX verwendet das lokale Notensystem mit und ohne Prädikatsanhängsel', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const results = await evaluate(async () => {
    const { GradesApp } = await import('/src/modules/grades/app.js?dom-test');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { prepareDocxTemplate, createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const store = new WorkspaceStore();
    const app = Object.create(GradesApp.prototype);
    Object.assign(app, {
      store, getCurrentGradeOverviewDisplaySystem: () => 'points15',
      getGradeStudentLegalDisplayName: () => 'Testperson',
    });
    const template = await prepareDocxTemplate(new Uint8Array(await (await fetch('/src/modules/grades/expectation-horizon-template.docx')).arrayBuffer()));
    const results = [];
    for (const scale of ['sek1', 'sek2']) {
      for (const display of ['school', 'points15']) {
        for (const suffixes of [false, true]) {
          const context = {
            course: { subject: 'Testfach' }, students: [{ id: 1 }],
            values: {
              testScale: scale, testDisplaySystem: display, testPredicateSuffixes: suffixes,
              testTasks: [{ id: 'a', maxBe: 100 }], entries: { 1: { testScores: { a: 90 } } },
            },
          };
          const [record] = await app.buildExpectationHorizonStudentRecords(context, { includePercentile: false });
          const bytes = await createDocxFromPreparedTemplate(template, record.replacements, { tableColumnReplacements: record.tableColumnReplacements });
          const document = (await prepareDocxTemplate(bytes)).entries.find((entry) => entry.name === 'word/document.xml');
          const xml = new DOMParser().parseFromString(new TextDecoder().decode(document.data), 'application/xml');
          const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
          const text = (node) => [...node.getElementsByTagNameNS(ns, '*')]
            .map((item) => item.localName === 't' ? item.textContent : (item.localName === 'noBreakHyphen' ? '-' : ''))
            .join('');
          const table = [...xml.getElementsByTagNameNS(ns, 'tbl')].find((node) => text(node).includes('Prozentgrenze'));
          const labels = [...table.getElementsByTagNameNS(ns, 'tr')[0].getElementsByTagNameNS(ns, 'tc')].map(text);
          results.push({ scale, display, suffixes, labels });
        }
      }
    }
    return results;
  });
  for (const { display, suffixes, labels } of results) {
    assert.equal(labels[0], 'Note');
    if (display === 'school' && !suffixes) assert.deepEqual(labels.slice(1), ['1', '2', '3', '4', '5', '6']);
    if (display === 'school' && suffixes) assert.deepEqual(labels.slice(1), ['1+', '1', '1-', '2+', '2', '2-', '3+', '3', '3-', '4+', '4', '4-', '5+', '5', '5-', '6']);
    if (display === 'points15' && !suffixes) assert.deepEqual(labels.slice(1), ['13', '10', '07', '04', '01', '00']);
    if (display === 'points15' && suffixes) assert.equal(labels.length, 17);
  }
});
