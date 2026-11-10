import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('class flairs round-trip through participant controls and class sorting stays in the overview', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1400, height: 1000 } });
  const result = await evaluate(async () => {
    const { GradesApp, createGradeStudentNameElement } = await import('/src/modules/grades/app.js?dom-test');
    const { WorkspaceStore } = await import('/src/modules/workspace/store.js');
    const { createWorkspacePublicApi } = await import('/src/modules/workspace/public-api.js');
    const html = await (await fetch('/src/modules/grades/app.html')).text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...page.body.childNodes);
    for (const href of ['/src/modules/grades/app.css', '/src/shared/theme.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      const loaded = new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; });
      document.head.append(link);
      await loaded;
    }
    const store = new WorkspaceStore();
    const year = store.getActiveSchoolYear();
    const courseId = store.createCourse(year.id, 'Testkurs');
    const course = store.listCourses(year.id).find((item) => item.id === courseId);
    store.replaceGradeStudentsForCourse(courseId, [
      { lastName: 'Alpha', firstName: 'Zoe', classFlair: 'b', performanceFlair: 'P2' },
      { lastName: 'Beta', firstName: 'Ben', classFlair: 'a' },
      { lastName: 'Gamma', firstName: 'Ada', classFlair: 'a' },
      { lastName: 'Aaron', firstName: 'Sam' },
    ]);
    const api = createWorkspacePublicApi({ getStore: () => store, getRuntime: () => ({}), scope: 'grades' });
    const app = Object.create(GradesApp.prototype);
    let commitAllowed = true;
    let vaultAccessible = true;
    let saves = 0;
    Object.assign(app, {
      store: api.data,
      refs: {
        sidebarGradePrivacyActions: document.querySelector('#sidebar-grade-privacy-actions'),
        sidebarGradeSortSection: document.querySelector('#sidebar-grade-sort-section'),
        sidebarGradeNameOrderInputs: document.querySelectorAll('[data-grade-name-order]'),
        sidebarGradeClassSortControl: document.querySelector('#sidebar-grade-class-sort-control'),
        sidebarGradeClassSortToggle: document.querySelector('#sidebar-grade-class-sort-toggle'),
        courseDialogStudentsList: document.querySelector('#course-dialog-students-list'),
        courseStudentsDialog: document.querySelector('#course-students-dialog'),
        courseStudentsDialogId: document.querySelector('#course-students-dialog-id'),
        gradesTable: document.createElement('div'),
      },
      currentView: 'grades', gradesSubView: 'overview', gradesOverviewNameOrder: 'last',
      gradesEntryNameOrder: 'first', gradesOverviewSortByClass: false, selectedCourseId: courseId,
      getGradeCourseRevision: () => 1,
      canAccessGradeVault: () => vaultAccessible,
      isGradeVaultEncryptionEnabled: () => !vaultAccessible,
      isGradesTopTabActive: () => true,
      commitVisibleGradeInputs: () => commitAllowed,
      getGradeStudentPortraitUrl: () => '', shouldShowGradeStudentPortraits: () => false,
      removeGradeStudentPortraitOverlay() {}, resetCourseDialogRosterImport() {},
      closeGroupPopulateDialog() {}, closeGroupPhotoExtractionDialog() {},
      revokeGradeStudentPortraitObjectUrls() {}, renderAll() {},
      closeDialog: (dialog) => dialog.close(),
      runGradeCourseMutation: async (id, callback) => callback(),
      persistExplicitDatabaseSave: async () => { saves += 1; },
      showInfoMessage: async (message) => { throw new Error(message); },
      buildGradesTableModel: () => ({ headerRows: [], columns: [{ type: 'student' }] }),
      getCurrentGradeOverviewDisplaySystem: () => 'points15',
      getCurrentGradeOverviewPredicateSuffixes: () => true,
      shouldBlurGradeStudent: () => false,
      applyGradeLeftBoundaryClass() {}, applyGradeRightBoundaryClass() {},
      applyGradesOverviewColumnSelection() {}, applyVisibleHomeworkSummaryToneClasses() {},
      getGradesPrintColumns: () => [{ type: 'student' }],
      buildGradesPrintLookup: () => ({}),
    });
    app.refs.courseStudentsDialogId.value = courseId;
    document.body.append(app.refs.gradesTable);
    const students = () => store.listGradeStudents(courseId);
    const zoe = students().find((student) => student.firstName === 'Zoe');
    const beta = students().find((student) => student.firstName === 'Ben');
    const gamma = students().find((student) => student.firstName === 'Ada');
    const sam = students().find((student) => student.firstName === 'Sam');
    const render = () => app.refs.gradesTable.replaceChildren(app.buildGradesMasterTable(course, students(), []));
    app.renderGradesView = render;
    const ids = () => [...app.refs.gradesTable.querySelectorAll('[data-grade-student-name]')].map((node) => Number(node.dataset.gradeStudentName));
    render();
    const nameSorted = ids();
    const entry = createGradeStudentNameElement(zoe, 'Zoe Alpha');
    const entryPills = [...entry.querySelectorAll('.grades-student-flair')].map((node) => node.textContent);
    const classPill = app.refs.gradesTable.querySelector('.grades-student-class-flair');
    document.documentElement.dataset.theme = 'dark';
    const darkColor = getComputedStyle(classPill).color;
    document.documentElement.dataset.theme = 'light';
    const lightColor = getComputedStyle(classPill).color;
    const pillLabel = classPill.getAttribute('aria-label');
    app.updateSidebarGradeNameOrderToggleState();
    const overviewVisible = !app.refs.sidebarGradeClassSortControl.hidden && !app.refs.sidebarGradeClassSortToggle.disabled;
    app.handleGradeClassSortChangeRequest(true);
    const classSorted = ids();
    app.gradesOverviewNameOrder = 'first';
    render();
    const classFirstSorted = ids();
    const print = app.buildGradesPrintTable(course, students(), []);
    const printNames = [...print.querySelectorAll('tbody .student-col')].map((node) => node.textContent);
    app.privacyFocusedGradeStudentId = gamma.id;
    const privacyNext = app.getGradePrivacyNavigationStudentId('next');
    const entryOrder = app.getSortedGradeStudentsForNameOrder(students()).map((student) => student.id);
    app.gradesSubView = 'entry';
    app.updateSidebarGradeNameOrderToggleState();
    const entryHidden = app.refs.sidebarGradeClassSortControl.hidden && app.refs.sidebarGradeClassSortToggle.disabled;
    app.handleGradeClassSortChangeRequest(false);
    const entryIgnored = app.gradesOverviewSortByClass;
    app.gradesSubView = 'overview';
    app.locked = true;
    app.handleGradeClassSortChangeRequest(false);
    const lockedIgnored = app.gradesOverviewSortByClass && app.refs.sidebarGradeClassSortToggle.disabled;
    app.locked = false;
    vaultAccessible = false;
    app.handleGradeClassSortChangeRequest(false);
    const vaultIgnored = app.gradesOverviewSortByClass && app.refs.sidebarGradeClassSortToggle.disabled;
    vaultAccessible = true;
    commitAllowed = false;
    app.handleGradeClassSortChangeRequest(false);
    const invalidIgnored = app.gradesOverviewSortByClass && app.refs.sidebarGradeClassSortToggle.checked;
    commitAllowed = true;
    app.handleGradeClassSortChangeRequest(false);
    const disabledOrder = ids();
    const openDraft = () => {
      app.courseDialogDraft = app.buildCourseDialogDraft(course);
      app.renderCourseDialogStudents();
      return app.refs.courseDialogStudentsList.querySelector(`[data-grade-student-id="${zoe.id}"] [data-student-field="classFlair"]`);
    };
    let select = openDraft();
    const options = [...select.options].map((option) => [option.value, option.textContent]);
    select.value = 'g';
    app.handleCourseDialogStudentListInput({ target: select });
    const uncommitted = store.listGradeStudents(courseId).find((student) => student.id === zoe.id).classFlair;
    app.closeCourseStudentsDialog();
    select = openDraft();
    const cancelled = select.value;
    select.value = 'g';
    app.handleCourseDialogStudentListInput({ target: select });
    await app.submitCourseStudentsDialog();
    select = openDraft();
    const saved = select.value;
    select.value = '';
    app.handleCourseDialogStudentListInput({ target: select });
    await app.submitCourseStudentsDialog();
    const cleared = openDraft().value;
    return { zoe: zoe.id, beta: beta.id, gamma: gamma.id, sam: sam.id,
      nameSorted, classSorted, classFirstSorted, disabledOrder, printNames, entryOrder, privacyNext,
      entryPills, darkColor, lightColor, pillLabel, overviewVisible, entryHidden, entryIgnored,
      lockedIgnored, vaultIgnored, invalidIgnored, options, uncommitted, cancelled, saved, cleared, saves };
  });
  const { zoe, beta, gamma, sam } = result;
  assert.deepEqual(result.nameSorted, [sam, zoe, beta, gamma]);
  assert.deepEqual(result.classSorted, [beta, gamma, zoe, sam]);
  assert.deepEqual(result.classFirstSorted, [gamma, beta, zoe, sam]);
  assert.deepEqual(result.disabledOrder, [gamma, beta, sam, zoe]);
  assert.deepEqual(result.printNames, ['Ada Gamma', 'Ben Beta', 'Zoe Alpha', 'Sam Aaron']);
  assert.deepEqual(result.entryOrder, [gamma, beta, sam, zoe]);
  assert.equal(result.privacyNext, beta);
  assert.deepEqual(result.entryPills, ['P2', 'b']);
  assert.equal(result.pillLabel, 'Klasse b');
  assert.equal(result.darkColor, 'rgb(187, 247, 208)');
  assert.equal(result.lightColor, 'rgb(22, 101, 52)');
  for (const key of ['overviewVisible', 'entryHidden', 'entryIgnored', 'lockedIgnored', 'vaultIgnored', 'invalidIgnored']) {
    assert.equal(result[key], true, key);
  }
  assert.deepEqual(result.options, [['', 'Keine Klasse'], ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((value) => [value, value])]);
  assert.equal(result.uncommitted, 'b');
  assert.equal(result.cancelled, 'b');
  assert.equal(result.saved, 'g');
  assert.equal(result.cleared, '');
  assert.equal(result.saves, 2);
});
