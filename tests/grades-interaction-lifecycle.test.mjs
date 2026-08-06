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

test('workspace renders do not implicitly close an open grades context menu', () => {
  assert.equal(extractClassMethod('renderAll').includes('this.hideContextMenu()'), false);
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
