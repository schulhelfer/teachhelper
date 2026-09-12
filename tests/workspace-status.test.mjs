import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rawSource = await readFile(new URL('../src/app/shell/workspace-status.js', import.meta.url), 'utf8');
const importEnd = rawSource.indexOf("const VALID_VAULT_MODES");
const source = `${[
  "const GRADES_GRADE_VAULT_STATE_EVENT = 'classroom:grades-grade-vault-state';",
  "const GRADES_MANUAL_SAVE_STATE_EVENT = 'classroom:grades-manual-save-state';",
  "const GRADES_READY_EVENT = 'classroom:grades-ready';",
  "const GRADES_UNSAVED_STATE_EVENT = 'classroom:grades-unsaved-state';",
  "const PLANNING_MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';",
  "const PLANNING_READY_EVENT = 'classroom:planning-ready';",
  "const PLANNING_UNSAVED_STATE_EVENT = 'classroom:planning-unsaved-state';",
  "const WORKSPACE_STATE_EVENT = 'classroom:workspace-state';",
].join('\n')}\n${rawSource.slice(importEnd)}`;
const { createWorkspaceStatusController } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const EVENTS = [
  'classroom:planning-manual-save-state',
  'classroom:grades-manual-save-state',
  'classroom:planning-unsaved-state',
  'classroom:grades-unsaved-state',
  'classroom:workspace-state',
  'classroom:grades-grade-vault-state',
  'classroom:planning-ready',
  'classroom:grades-ready',
  'beforeunload',
];

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target = this;
    [...(this.listeners.get(event.type) || [])].forEach((listener) => listener(event));
    return !event.defaultPrevented;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeCustomEvent {
  constructor(type, { detail = null, cancelable = false } = {}) {
    this.type = type;
    this.detail = detail;
    this.cancelable = cancelable;
    this.defaultPrevented = false;
    this.returnValue = undefined;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
}

class FakeEvent {
  constructor(type, { cancelable = false } = {}) {
    this.type = type;
    this.cancelable = cancelable;
    this.defaultPrevented = false;
    this.returnValue = undefined;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
}

function createHarness(options = {}) {
  const state = {
    activeTab: options.activeTab || 'planning',
    tabTransitionState: options.tabTransitionState || 'idle',
    chromeCollapsed: Boolean(options.chromeCollapsed),
    chromeTransitionState: options.chromeTransitionState || 'idle',
    moduleWindow: Boolean(options.moduleWindow),
  };
  const view = new FakeEventTarget();
  const changes = [];
  const controller = createWorkspaceStatusController({
    view,
    CustomEventClass: FakeCustomEvent,
    planningTabTarget: 'planning',
    gradesTabTarget: 'grades',
    planningTabTargets: ['planning', 'grades'],
    gradeVaultStatusTabTargets: ['planning', 'grades', 'seatplan', 'name-learning', 'groups', 'random-picker'],
    getActiveTab: () => state.activeTab,
    getTabTransitionState: () => state.tabTransitionState,
    getChromeCollapsed: () => state.chromeCollapsed,
    getChromeTransitionState: () => state.chromeTransitionState,
    supportsExternalFileSync: Boolean(options.supportsExternalFileSync),
    isModuleWindow: () => state.moduleWindow,
    onChange: (change) => changes.push(change),
  });
  return { controller, view, state, changes };
}

test('starts not ready, handles repeated ready events and resets on reinitialization', () => {
  const harness = createHarness();
  assert.deepEqual(harness.controller.getPlanningState(), {
    ready: false,
    initialPaintPending: true,
    accessReady: false,
    hasCourse: false,
    hasSlot: false,
  });
  assert.deepEqual(harness.controller.getGradesState(), {
    ready: false,
    initialPaintPending: true,
    hasCourse: false,
    hasStudents: false,
    vaultReady: false,
  });

  harness.controller.markPlanningReady({
    planningAccessReady: true,
    hasPlanningCourse: true,
    hasPlanningSlot: true,
  });
  harness.controller.markPlanningReady({ hasPlanningSlot: false });
  assert.deepEqual(harness.controller.getPlanningState(), {
    ready: true,
    initialPaintPending: false,
    accessReady: true,
    hasCourse: true,
    hasSlot: false,
  });
  assert.deepEqual(harness.changes.slice(0, 2), [
    { type: 'planning-ready', initialReadyTransition: true },
    { type: 'planning-ready', initialReadyTransition: false },
  ]);

  harness.controller.markGradesReady({
    gradeVaultMode: 'ready',
    gradeVaultDbConnected: true,
    hasGradeCourse: true,
    hasGradeStudents: true,
    gradeVaultUnlockConfigured: true,
    gradeVaultUnlocked: true,
  });
  harness.controller.markGradesReady({ hasGradeStudents: false });
  assert.deepEqual(harness.controller.getGradesState(), {
    ready: true,
    initialPaintPending: false,
    hasCourse: true,
    hasStudents: false,
    vaultReady: true,
  });
  assert.deepEqual(harness.changes.slice(2), [
    { type: 'grades-ready', initialReadyTransition: true },
    { type: 'grades-ready', initialReadyTransition: false },
  ]);
  harness.controller.dispose();

  const restarted = createHarness();
  assert.equal(restarted.controller.getPlanningState().ready, false);
  assert.equal(restarted.controller.getGradesState().ready, false);
  assert.equal(restarted.controller.getPlanningState().initialPaintPending, true);
  assert.equal(restarted.controller.getGradesState().initialPaintPending, true);
  restarted.controller.dispose();
});

test('normalizes manual-save and unsaved state and returns defensive snapshots', () => {
  const harness = createHarness();
  harness.controller.setManualSaveState({
    isManualMode: 1,
    dirty: 'yes',
    title: '  Eigene Datei speichern  ',
    ariaLabel: '   ',
  });
  assert.deepEqual(harness.controller.getManualSaveState(), {
    isManualMode: true,
    dirty: true,
    title: 'Eigene Datei speichern',
    ariaLabel: 'Eigene Datei speichern',
  });
  harness.controller.setUnsavedState({
    planningDirty: true,
    gradesSettingsDirty: true,
    dirtyGradeCourseIds: [12, '', null, 'c-4'],
  });
  const unsaved = harness.controller.getUnsavedState();
  assert.deepEqual(unsaved, {
    dirty: true,
    planningDirty: true,
    planningSettingsDirty: false,
    gradesDirty: false,
    gradesSettingsDirty: true,
    dirtyGradeCourseIds: ['12', 'null', 'c-4'],
  });
  unsaved.dirty = false;
  unsaved.dirtyGradeCourseIds.push('changed');
  assert.equal(harness.controller.getUnsavedState().dirty, true);
  assert.deepEqual(harness.controller.getUnsavedState().dirtyGradeCourseIds, ['12', 'null', 'c-4']);

  harness.controller.setManualSaveState();
  harness.controller.setUnsavedState();
  assert.deepEqual(harness.controller.getManualSaveState(), {
    isManualMode: false,
    dirty: false,
    title: 'Datenbank speichern',
    ariaLabel: 'Datenbank speichern',
  });
  assert.equal(harness.controller.getUnsavedState().dirty, false);
  harness.controller.dispose();
});

test('normalizes vault updates with the existing replacement and retention rules', () => {
  const harness = createHarness();
  harness.controller.setVaultState({
    ready: true,
    mode: 'unlock',
    dbConnected: true,
    backupConnected: true,
    hasGradeCourse: true,
    hasGradeStudents: true,
    configured: true,
    unlocked: false,
    encryptionEnabled: true,
    showGradeStudentPortraits: true,
    showNameLearningModule: true,
    nameLearningDueCount: 7,
    setupRequired: false,
  });
  assert.equal(harness.controller.canShowNameLearning(), true);
  assert.equal(harness.controller.shouldPromptVaultUnlock('grades'), true);
  const copy = harness.controller.getVaultState();
  copy.mode = 'changed';
  assert.equal(harness.controller.getVaultState().mode, 'unlock');

  harness.controller.setVaultState({ ready: false, mode: 'invalid' });
  assert.deepEqual(harness.controller.getVaultState(), {
    ready: false,
    mode: 'off',
    dbConnected: false,
    backupConnected: false,
    hasGradeCourse: false,
    hasGradeStudents: false,
    configured: false,
    unlocked: false,
    encryptionEnabled: false,
    showGradeStudentPortraits: false,
    showNameLearningModule: false,
    nameLearningDueCount: 7,
    setupRequired: false,
  });
  harness.controller.setVaultState({ nameLearningDueCount: -1 });
  assert.equal(harness.controller.getVaultState().nameLearningDueCount, null);
  harness.controller.dispose();
});

test('processes only shell workspace events in unsaved-then-vault order without deduplication', () => {
  const harness = createHarness();
  const snapshot = {
    ready: true,
    unsaved: { gradesDirty: true },
    vault: { mode: 'ready', dbConnected: true, configured: true, unlocked: true },
  };
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:workspace-state', {
    detail: { scope: 'grades', snapshot },
  }));
  harness.view.dispatchEvent({
    type: 'classroom:workspace-state',
    detail: { scope: 'shell', snapshot },
    defaultPrevented: false,
  });
  assert.deepEqual(harness.changes, []);

  const shellEvent = () => new FakeCustomEvent('classroom:workspace-state', {
    detail: { scope: 'shell', snapshot },
  });
  harness.view.dispatchEvent(shellEvent());
  harness.view.dispatchEvent(shellEvent());
  assert.deepEqual(harness.changes.map(({ type }) => type), ['unsaved', 'vault', 'unsaved', 'vault']);
  assert.equal(harness.controller.getUnsavedState().gradesDirty, true);
  assert.equal(harness.controller.getVaultState().ready, true);
  harness.controller.dispose();
});

test('preserves leave-guard priority and unsaved area decisions', () => {
  const harness = createHarness();
  harness.controller.setUnsavedState({ planningSettingsDirty: true });
  assert.equal(harness.controller.getLeaveGuard('groups'), 'planning');
  assert.equal(harness.controller.getLeaveGuard('grades'), null);
  assert.equal(harness.controller.getLeaveGuard('groups', { skipUnsavedPrompt: true }), null);

  harness.state.activeTab = 'grades';
  harness.controller.setUnsavedState({
    planningDirty: true,
    planningSettingsDirty: true,
    gradesDirty: true,
    gradesSettingsDirty: true,
  });
  assert.equal(harness.controller.getLeaveGuard('planning'), 'grades');
  assert.equal(harness.controller.getLeaveGuard('groups'), 'grades');
  assert.equal(harness.controller.getUnsavedAreaLabel(), 'Planung und Noten');
  harness.controller.setUnsavedState({ planningDirty: true });
  assert.equal(harness.controller.getUnsavedAreaLabel(), 'Planung');
  harness.controller.setUnsavedState({ gradesDirty: true });
  assert.equal(harness.controller.getUnsavedAreaLabel(), 'Noten');
  harness.controller.setUnsavedState({ planningSettingsDirty: true });
  assert.equal(harness.controller.getUnsavedAreaLabel(), 'Planung oder Noten');
  harness.controller.dispose();
});

test('derives manual-save and vault controls from current shell state', () => {
  const harness = createHarness();
  harness.controller.setManualSaveState({ isManualMode: true, dirty: false });
  assert.deepEqual(harness.controller.getManualSaveControlState(), {
    shouldShow: true,
    hidden: false,
    hasChanges: false,
    visible: true,
    disabled: true,
    attention: false,
    collapsed: false,
    title: 'Keine zu speichernden Änderungen',
    ariaLabel: 'Keine zu speichernden Änderungen',
    canRequest: false,
  });
  harness.controller.setManualSaveState({ isManualMode: true, dirty: true, title: 'Speichern' });
  harness.state.chromeCollapsed = true;
  const manual = harness.controller.getManualSaveControlState();
  assert.equal(manual.visible, false);
  assert.equal(manual.collapsed, true);
  assert.equal(manual.disabled, false);
  assert.equal(manual.canRequest, true);

  harness.controller.setVaultState({
    ready: true,
    mode: 'unlock',
    dbConnected: true,
    configured: true,
    unlocked: false,
  });
  assert.deepEqual(harness.controller.getVaultControlState(), {
    statusAvailable: true,
    locked: true,
    shouldShow: true,
    canRequest: true,
    action: 'unlock',
    actionLabel: 'Notenmodul entsperren',
    label: 'Notenmodul gesperrt',
  });
  harness.state.tabTransitionState = 'leaving';
  assert.equal(harness.controller.getVaultControlState().canRequest, false);
  harness.state.activeTab = 'work-phase';
  assert.equal(harness.controller.getVaultControlState().shouldShow, false);
  harness.controller.dispose();

  const external = createHarness({ supportsExternalFileSync: true });
  external.controller.setManualSaveState({ isManualMode: true, dirty: true });
  assert.equal(external.controller.getManualSaveControlState().shouldShow, false);
  assert.equal(external.controller.getManualSaveControlState().canRequest, true);
  external.controller.dispose();
});

test('blocks beforeunload only for dirty non-module shells', () => {
  const harness = createHarness();
  harness.controller.setUnsavedState({ dirty: true });
  const blocked = new FakeEvent('beforeunload', { cancelable: true });
  harness.view.dispatchEvent(blocked);
  assert.equal(blocked.defaultPrevented, true);
  assert.equal(blocked.returnValue, '');
  assert.equal(harness.controller.shouldBlockBeforeUnload(), true);

  harness.state.moduleWindow = true;
  const allowed = new FakeEvent('beforeunload', { cancelable: true });
  harness.view.dispatchEvent(allowed);
  assert.equal(allowed.defaultPrevented, false);
  assert.equal(harness.controller.shouldBlockBeforeUnload(), false);
  harness.controller.dispose();
});

test('binds both feature event variants and removes every listener on dispose', () => {
  const harness = createHarness();
  EVENTS.forEach((type) => assert.equal(harness.view.listenerCount(type), 1, type));
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:planning-manual-save-state', {
    detail: { isManualMode: true, dirty: true },
  }));
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:grades-unsaved-state', {
    detail: { gradesDirty: true },
  }));
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:grades-grade-vault-state', {
    detail: { ready: true, mode: 'ready' },
  }));
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:planning-ready'));
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:grades-ready'));
  assert.deepEqual(harness.changes.map(({ type }) => type), [
    'manual-save',
    'unsaved',
    'vault',
    'planning-ready',
    'grades-ready',
  ]);

  harness.controller.dispose();
  harness.controller.dispose();
  EVENTS.forEach((type) => assert.equal(harness.view.listenerCount(type), 0, type));
  const changesBefore = harness.changes.length;
  harness.view.dispatchEvent(new FakeCustomEvent('classroom:planning-ready'));
  harness.controller.setUnsavedState({ dirty: true });
  assert.equal(harness.changes.length, changesBefore);
});
