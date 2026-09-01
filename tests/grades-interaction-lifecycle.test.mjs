import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gradesSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(gradesSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = gradesSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < gradesSource.length; index += 1) {
    if (gradesSource[index] === '{') depth += 1;
    if (gradesSource[index] === '}') depth -= 1;
    if (depth === 0) return gradesSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

test('shell status updates do not rebuild an unchanged grades view', () => {
  const handleWorkspaceState = Function(
    `"use strict"; return ({${extractClassMethod('handleWorkspaceState')}}).handleWorkspaceState;`,
  )();
  const calls = {
    renderAll: 0,
    renderViewState: 0,
    vaultBanner: 0,
    vaultActions: 0,
    settingsActions: 0,
  };
  const harness = {
    workspaceRevision: 4,
    workspaceHydrated: true,
    settingsDirty: true,
    locked: false,
    lockReason: '',
    currentView: 'grades',
    activeSettingsTab: 'gradeTestScales',
    refs: { sidebarCourseList: {} },
    captureGradeVaultAutoLockNotice() {},
    applyWorkspacePersistenceStatus() {},
    shouldPreserveActiveGradesEntryControl() { return false; },
    updateAccessLock() {},
    renderAll() { calls.renderAll += 1; },
    renderViewState() { calls.renderViewState += 1; },
    renderGradeVaultBanner() { calls.vaultBanner += 1; },
    updateGradeVaultActionButtons() { calls.vaultActions += 1; },
    updateSettingsActionButtons() { calls.settingsActions += 1; },
    renderBackupSection() {},
    renderDatabaseSection() {},
  };

  handleWorkspaceState.call(harness, {
    revision: 4,
    hydrated: true,
    ready: true,
    scope: 'shell',
    snapshot: {},
  });

  assert.deepEqual(calls, {
    renderAll: 0,
    renderViewState: 1,
    vaultBanner: 1,
    vaultActions: 1,
    settingsActions: 1,
  });
});

test('grade workspace changes still rebuild the visible grades data once', () => {
  const handleWorkspaceState = Function(
    `"use strict"; return ({${extractClassMethod('handleWorkspaceState')}}).handleWorkspaceState;`,
  )();
  let renderCount = 0;
  handleWorkspaceState.call({
    workspaceRevision: 4,
    workspaceHydrated: true,
    settingsDirty: true,
    refs: { sidebarCourseList: {} },
    captureGradeVaultAutoLockNotice() {},
    applyWorkspacePersistenceStatus() {},
    presentGradeVaultAutoLockNotice() { return Promise.resolve(); },
    shouldPreserveActiveGradesEntryControl() { return false; },
    renderAll() { renderCount += 1; },
    refreshSidebarCourseStudentCounts() { return Promise.resolve(); },
  }, {
    revision: 5,
    hydrated: true,
    ready: true,
    scope: 'grades',
    snapshot: {},
  });

  assert.equal(renderCount, 1);
});

test('grade workspace changes do not replace a course picker or mode control being used', () => {
  const handleWorkspaceState = Function(
    `"use strict"; return ({${extractClassMethod('handleWorkspaceState')}}).handleWorkspaceState;`,
  )();
  let renderCount = 0;
  const harness = {
    workspaceRevision: 4,
    workspaceHydrated: true,
    settingsDirty: true,
    refs: { sidebarCourseList: {} },
    pendingWorkspaceRenderAfterEntryInteraction: false,
    captureGradeVaultAutoLockNotice() {},
    applyWorkspacePersistenceStatus() {},
    shouldPreserveActiveGradesEntryControl() { return true; },
    renderAll() { renderCount += 1; },
  };

  handleWorkspaceState.call(harness, {
    revision: 5,
    hydrated: true,
    ready: true,
    scope: 'grades',
    snapshot: {},
  });

  assert.equal(renderCount, 0);
  assert.equal(harness.pendingWorkspaceRenderAfterEntryInteraction, true);
  assert.equal(harness.workspaceRevision, 5);
});

test('updating test tasks reports success after updating the active draft', () => {
  const method = extractClassMethod('updateGradeTestContextTasks');

  assert.match(method, /this\.gradesEntryDraft\s*=/);
  assert.match(method, /return true;/);
  assert.doesNotMatch(method, /\bfullySaved\b/);
});

test('grades entry controls establish a short render guard before grade-cell blur commits', () => {
  const trackInteraction = Function(
    `"use strict"; return ({${extractClassMethod('trackGradesEntryControlInteraction')}}).trackGradesEntryControlInteraction;`,
  )();
  const courseSelect = {
    closest(selector) {
      return selector.includes('.grades-entry-config select:not(:disabled)') ? this : null;
    },
  };
  const harness = { pendingGradesEntryControlInteractionUntil: 0 };

  globalThis.Element = class Element {};
  Object.setPrototypeOf(courseSelect, Element.prototype);
  try {
    trackInteraction.call(harness, { target: courseSelect });
    assert.ok(harness.pendingGradesEntryControlInteractionUntil >= Date.now());
  } finally {
    delete globalThis.Element;
  }
});

test('entry sidebar clicks never clear a saved assessment as overview focus', () => {
  const shouldClear = Function(
    `"use strict"; return ({${extractClassMethod('shouldClearGradesOverviewFocusForExternalTarget')}}).shouldClearGradesOverviewFocusForExternalTarget;`,
  )();
  const target = {
    closest() { return null; },
  };

  globalThis.Element = class Element {};
  Object.setPrototypeOf(target, Element.prototype);
  try {
    const entryHarness = {
      isGradesOverviewVisible() { return false; },
      isGradesOverviewFocusActive() { return true; },
    };
    assert.equal(shouldClear.call(entryHarness, target), false);

    const overviewHarness = {
      isGradesOverviewVisible() { return true; },
      isGradesOverviewFocusActive() { return true; },
    };
    assert.equal(shouldClear.call(overviewHarness, target), true);
  } finally {
    delete globalThis.Element;
  }
});

test('workspace renders do not implicitly close an open grades context menu', () => {
  assert.equal(extractClassMethod('renderAll').includes('this.hideContextMenu()'), false);
});

test('a changed database file keeps the grade draft open instead of rejecting navigation', async () => {
  const saveImmediately = Function(
    'WORKSPACE_ERROR_PERSISTENCE_CONFLICT',
    `"use strict"; return ({${extractClassMethod('saveGradesEntryImmediatelyAfterDiskSave')}}).saveGradesEntryImmediatelyAfterDiskSave;`,
  )('PERSISTENCE_CONFLICT');
  const messages = [];
  const harness = {
    canAccessGradeVault() { return true; },
    async saveGradeVaultChanges() {
      const error = new Error('Die Datenbankdatei wurde außerhalb dieses Workspace geändert.');
      error.code = 'PERSISTENCE_CONFLICT';
      throw error;
    },
    async showInfoMessage(message, title) { messages.push({ message, title }); },
  };

  assert.equal(await saveImmediately.call(harness), false);
  assert.deepEqual(messages, [{
    message: 'Die Datenbankdatei wurde außerhalb dieses Workspace geändert. Zum Schutz wurde sie nicht überschrieben. Der Notenentwurf bleibt geöffnet.',
    title: 'Datenbankkonflikt',
  }]);
});

test('the workspace owner is authoritative while the first unlocked grade course finishes loading', () => {
  const isGradeCourseLoaded = Function(
    `"use strict"; return ({${extractClassMethod('isGradeCourseLoaded')}}).isGradeCourseLoaded;`,
  )();
  const harness = {
    gradeVaultSession: { loadedGradeCourseId: null },
    getWorkspaceOwnerApp() {
      return { isGradeCourseLoaded: (courseId) => Number(courseId) === 7 };
    },
  };

  assert.equal(isGradeCourseLoaded.call(harness, 7), true);
});

test('automatic roster discovery uses a read-only workspace summary', () => {
  const request = extractClassMethod('handleGradeRosterCoursesRequest');
  assert.match(request, /getGradeCourseRosterSummary/);
  assert.doesNotMatch(request, /withTemporaryGradeCourse/);
});

test('opening roster management creates its draft from the requested course snapshot', async () => {
  const openCourseStudentsDialog = Function(
    `"use strict"; return ({${extractClassMethod('openCourseStudentsDialog')}}).openCourseStudentsDialog;`,
  )();
  const calls = [];
  const course = { id: 8, name: '8a' };
  const harness = {
    activeSchoolYear: { id: 1 },
    refs: { courseStudentsDialog: {}, courseStudentsDialogId: { value: '' } },
    canAccessGradeVault() { return true; },
    store: {
      listCourses() { return [course]; },
    },
    async ensureGradeCourseLoaded(courseId) {
      assert.equal(courseId, 8);
      return true;
    },
    async buildCourseDialogDraftForCourse(nextCourse) {
      const courseId = Number(nextCourse.id);
      calls.push(`load:${courseId}`);
      return { students: [{ id: 81, firstName: 'Ada' }] };
    },
    getCourseStudentsDialogSignature() { return ''; },
    resetCourseDialogRosterImport() { calls.push('roster-reset'); },
    async refreshCourseDialogRosterImportCourses() { calls.push('roster-pills'); },
    renderCourseDialogStudents() { calls.push('render'); },
    openDialog() { calls.push('open'); },
    setSyncStatus() { throw new Error('loading must not fail'); },
  };

  await openCourseStudentsDialog.call(harness, course.id);

  assert.deepEqual(calls, ['load:8', 'roster-reset', 'render', 'open', 'roster-pills']);
  assert.equal(harness.refs.courseStudentsDialogId.value, '8');
  assert.equal(harness.courseDialogDraft.students.length, 1);
});

test('opening grade structure management creates its draft from the requested course snapshot', async () => {
  const openCourseStructureDialog = Function(
    `"use strict"; return ({${extractClassMethod('openCourseStructureDialog')}}).openCourseStructureDialog;`,
  )();
  const calls = [];
  const course = { id: 8, name: '8a' };
  const harness = {
    activeSchoolYear: { id: 1 },
    refs: {
      courseStructureDialog: {},
      courseStructureDialogId: { value: '' },
      courseStructureDialogTitle: { textContent: '' },
    },
    canAccessGradeVault() { return true; },
    store: {
      listCourses() { return [course]; },
    },
    async ensureGradeCourseLoaded(courseId) {
      assert.equal(courseId, 8);
      return true;
    },
    async buildCourseDialogDraftForCourse(nextCourse) {
      const courseId = Number(nextCourse.id);
      calls.push(`load:${courseId}`);
      return { periodCategories: { h1: [], h2: [] } };
    },
    renderCourseDialogStructure() { calls.push('render'); },
    openDialog() { calls.push('open'); },
    setSyncStatus() { throw new Error('loading must not fail'); },
  };

  await openCourseStructureDialog.call(harness, course.id);

  assert.deepEqual(calls, ['load:8', 'render', 'open']);
  assert.equal(harness.refs.courseStructureDialogId.value, '8');
  assert.equal(harness.refs.courseStructureDialogTitle.textContent, 'Notenstruktur · 8a');
});

test('course dialog drafts use the requested read-only grade course snapshot', async () => {
  const buildCourseDialogDraftForCourse = Function(
    `"use strict"; return ({${extractClassMethod('buildCourseDialogDraftForCourse')}}).buildCourseDialogDraftForCourse;`,
  )();
  const course = { id: 8, name: '8a' };
  const gradeState = {
    gradeStudents: [{ id: 81, courseId: 8, firstName: 'Ada' }],
    gradeStructures: [{ courseId: 8, periodCategories: { h1: [{ name: 'Mitarbeit' }], h2: [] } }],
  };
  const harness = {
    getWorkspaceOwnerApp() {
      return {
        async getGradeCourseStateSnapshot(courseId) {
          assert.equal(courseId, 8);
          return gradeState;
        },
      };
    },
    buildCourseDialogDraft(nextCourse, options) {
      assert.equal(nextCourse, course);
      return options;
    },
  };

  const result = await buildCourseDialogDraftForCourse.call(harness, course);

  assert.equal(result.gradeState, gradeState);
});

test('fresh grades context menus survive incidental opening layout events', () => {
  const isFreshContextMenu = Function(
    `"use strict"; return ({${extractClassMethod('isFreshContextMenu')}}).isFreshContextMenu;`,
  )();
  const harness = {
    refs: { contextMenu: { hidden: false } },
    contextMenuOpenedAt: Date.now(),
  };

  assert.equal(isFreshContextMenu.call(harness), true);
  harness.contextMenuOpenedAt = Date.now() - 1000;
  assert.equal(isFreshContextMenu.call(harness), false);
});
