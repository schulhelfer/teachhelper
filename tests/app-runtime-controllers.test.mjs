import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassroomFileActions } from '../src/app/classroom-file-actions.js';
import { createModuleShellCoordinator } from '../src/app/module-shell-coordinator.js';
import { createIframeModuleShellBindings } from '../src/app/iframe-module-shell-bindings.js';
import { createModuleRegistry } from '../src/app/module-registry.js';
import { createIframeModuleAdapters } from '../src/app/iframe-module-adapters.js';
import {
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  TAB_GRADES,
  TAB_PLANNING,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
} from '../src/shell/tabs.js';

function createResources() {
  const cleanups = [];
  const pending = new Map();
  let nextId = 0;
  const schedule = (callback, delay = 0) => {
    const id = ++nextId;
    pending.set(id, { callback, delay });
    return id;
  };
  return {
    pending,
    registerCleanup: (cleanup) => cleanups.push(cleanup),
    bindRuntime(target, type, handler, options) {
      if (!target) return;
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    },
    setRuntimeTimeout: schedule,
    requestRuntimeFrame: schedule,
    clearRuntimeTimeout: (id) => pending.delete(id),
    cancelRuntimeSchedule: (id) => pending.delete(id),
    runNext() {
      const [id, { callback }] = pending.entries().next().value;
      pending.delete(id);
      callback();
    },
    dispose() {
      cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
    },
  };
}

function installWindow(t, view) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: view });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
}

function createCoordinatorHarness(t) {
  const resources = createResources();
  const view = new EventTarget();
  view.location = { href: 'https://teachhelper.example/' };
  view.requestAnimationFrame = resources.requestRuntimeFrame;
  installWindow(t, view);
  let activeTab = TAB_SEATPLAN;
  let transition = 'idle';
  let bridge = null;
  let shell = null;
  let tutorial = null;
  const calls = [];
  const classes = new Set();
  const frame = { src: 'https://teachhelper.example/seatplan', contentWindow: {} };
  const moduleRegistry = createModuleRegistry(createIframeModuleAdapters({
    frames: { getSeatplanFrame: () => frame },
    getBridgeController: () => bridge,
    els: {},
  }));
  const context = {
    ...resources,
    view,
    documentRef: new EventTarget(),
    appEl: {
      classList: {
        contains: (name) => name === 'app-tab-grades' ? activeTab === TAB_GRADES : classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
    },
    moduleRegistry,
    getActiveTab: () => activeTab,
    setActiveTab: (tab) => { activeTab = tab; calls.push(['tab', tab]); },
    getChromeTransitionState: () => transition,
    setChromeCollapsed: (...args) => calls.push(['chrome', ...args]),
    getBridgeController: () => bridge,
    getShellController: () => shell,
    getFirstRunTutorial: () => tutorial,
    getCourseContext: () => ({ suppressGradesAutoSelect: () => calls.push(['suppress']) }),
    openHelpEntry: () => calls.push(['help']),
    syncTutorialEntryHintToModules: () => calls.push(['hint']),
    showMessage: (...args) => calls.push(['message', ...args]),
  };
  const moduleBindings = createIframeModuleShellBindings(context);
  const coordinator = createModuleShellCoordinator({ ...context, moduleBindings });
  t.after(() => resources.dispose());
  return {
    coordinator, moduleBindings, resources, calls, classes,
    get activeTab() { return activeTab; },
    set activeTab(value) { activeTab = value; },
    set transition(value) { transition = value; },
    set bridge(value) { bridge = value; },
    set shell(value) { shell = value; },
    set tutorial(value) { tutorial = value; },
    dispatch: (type, detail) => view.dispatchEvent(new CustomEvent(type, { detail })),
    message(type, detail) {
      const event = new Event('message');
      Object.assign(event, { source: frame.contentWindow, origin: 'https://teachhelper.example', data: { type, detail } });
      view.dispatchEvent(event);
    },
  };
}

test('module callbacks resolve controllers assigned after the message bindings', (t) => {
  const harness = createCoordinatorHarness(t);
  harness.coordinator.bindMessages();
  harness.bridge = { dispatchGradesNavigation: (detail) => harness.calls.push(['navigate', detail]) };
  harness.dispatch('classroom:planning-view-request', { source: 'iframe', view: 'grades', courseId: 7 });
  assert.deepEqual(harness.calls, [
    ['suppress'],
    ['navigate', { source: 'iframe', view: 'grades', courseId: 7 }],
    ['tab', TAB_GRADES],
  ]);
  harness.resources.dispose();
  harness.calls.length = 0;
  harness.dispatch('classroom:planning-view-request', { source: 'iframe', view: 'grades' });
  assert.deepEqual(harness.calls, []);
});

test('vault overlay restores the source tab immediately and after delayed navigation', (t) => {
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  const harness = createCoordinatorHarness(t);
  harness.coordinator.bindMessages();
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: true });
  assert.equal(harness.classes.size, 0);
  harness.moduleBindings.bindVaultOverlay();
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: true });
  assert.ok(harness.classes.has('grade-vault-overlay-revealed-grades'));
  harness.activeTab = TAB_GRADES;
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: false });
  assert.equal(harness.activeTab, TAB_SEATPLAN);
  assert.deepEqual([...harness.resources.pending.values()].map(({ delay }) => delay), [360]);
  harness.activeTab = TAB_GRADES;
  harness.resources.runNext();
  assert.equal(harness.activeTab, TAB_SEATPLAN);
  harness.dispatch(GRADES_VIEW_REQUEST_EVENT, { source: 'iframe', view: 'overview' });
  assert.equal(harness.activeTab, TAB_SEATPLAN);
  now += 1501;
  harness.dispatch(GRADES_VIEW_REQUEST_EVENT, { source: 'iframe', view: 'overview' });
  assert.equal(harness.activeTab, TAB_GRADES);
});

test('vault overlays can release the source tab and dispose cancels restoration', (t) => {
  const harness = createCoordinatorHarness(t);
  harness.coordinator.bindMessages();
  harness.moduleBindings.bindVaultOverlay();
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: true });
  harness.activeTab = TAB_GRADES;
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: false });
  assert.equal(harness.resources.pending.size, 1);
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: true, preserveSourceTab: false });
  assert.equal(harness.resources.pending.size, 0);
  harness.dispatch(GRADES_VIEW_REQUEST_EVENT, { source: 'iframe', view: 'overview' });
  assert.equal(harness.activeTab, TAB_GRADES);
  harness.activeTab = TAB_SEATPLAN;
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: true });
  harness.dispatch(GRADES_GRADE_VAULT_OVERLAY_EVENT, { open: false });
  harness.resources.dispose();
  assert.equal(harness.resources.pending.size, 0);
});

test('seatplan chrome requests survive a tab change while waiting and cancel on dispose', (t) => {
  const harness = createCoordinatorHarness(t);
  harness.coordinator.bindMessages();
  harness.transition = 'collapsing';
  harness.message('classroom:seatplan-chrome-request', { source: 'iframe', collapsed: true });
  harness.activeTab = TAB_PLANNING;
  harness.resources.runNext();
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.resources.pending.size, 1);
  harness.transition = 'idle';
  harness.resources.runNext();
  assert.deepEqual(harness.calls, [['chrome', true, { resetSidebarWidth: false }]]);
  harness.message('classroom:seatplan-chrome-request', { source: 'iframe', collapsed: true });
  assert.equal(harness.resources.pending.size, 0);
  harness.message('classroom:seatplan-chrome-request', { source: 'iframe', collapsed: false });
  assert.equal(harness.resources.pending.size, 1);
  harness.resources.dispose();
  assert.equal(harness.resources.pending.size, 0);
});

test('file actions resolve late controllers and preserve picker confirmation, restore order and file handles', async (t) => {
  const calls = [];
  const resources = createResources();
  const classroom = { students: [], csvName: 'Original' };
  let classroomController = null;
  let groups = null;
  let workPhase = null;
  let coordinator = null;
  let autoDisableSelected = false;
  let allowReplacement = false;
  const handle = { name: 'saved.json' };
  const view = { showOpenFilePicker: async (options) => {
    calls.push(['picker', options.startIn]);
    throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
  } };
  installWindow(t, view);
  const actions = createClassroomFileActions({
    ...resources,
    documentRef: new EventTarget(),
    els: {},
    getActiveTab: () => TAB_RANDOM_PICKER,
    isRandomPickerTabActive: () => true,
    getClassroomState: () => classroomController,
    getGroupsController: () => groups,
    getWorkPhaseController: () => workPhase,
    getGradeRosterCoordinator: () => coordinator,
    getAutoDisableSelected: () => autoDisableSelected,
    setAutoDisableSelected: (value) => { autoDisableSelected = value; },
    sanitizeRandomPickerStudent: (student) => student,
    renderRandomPicker: () => calls.push(['render']),
  });
  classroomController = {
    getState: () => classroom,
    isDemoActive: () => false,
    updateState: (patch) => Object.assign(classroom, patch),
  };
  groups = { restorePlanState: (state, options) => calls.push(['groups', state.seats, options]) };
  workPhase = { restorePlanState: (state) => calls.push(['work', state.workOrder]) };
  coordinator = {
    getPickerBinding: () => ({ courseName: 'Kurs 7' }),
    confirmPickerBindingReplacement: async () => { calls.push(['confirm']); return allowReplacement; },
    clearPickerBinding: () => calls.push(['clear']),
  };
  assert.equal(actions.getSuggestedPlanFileName(), 'Kurs 7 (Picker)');
  const text = JSON.stringify({
    version: 1,
    students: [{ id: '01', first: 'Alex', last: 'Beispiel' }],
    csvName: 'Import',
    seats: { '1-1': ['01'] },
    workOrder: 'Recherche',
    randomPickerAutoDisableSelected: true,
  });
  const file = { name: 'import.json', size: text.length, text: async () => text };
  assert.equal(await actions.importPlanFromFile(file, handle), false);
  assert.equal(classroom.csvName, 'Original');
  assert.equal(autoDisableSelected, false);
  assert.deepEqual(calls, [['confirm']]);
  await actions.handlePlanImportAction();
  assert.deepEqual(calls.at(-1), ['picker', 'downloads']);
  calls.length = 0;
  allowReplacement = true;
  assert.equal(await actions.importPlanFromFile(file, handle), true);
  assert.equal(classroom.csvName, 'Import');
  assert.equal(autoDisableSelected, true);
  assert.deepEqual(calls, [
    ['confirm'], ['clear'],
    ['groups', { '1-1': ['01'] }, { restoreSeatAssignments: true }],
    ['work', 'Recherche'], ['render'],
  ]);
  await actions.handlePlanImportAction();
  assert.deepEqual(calls.at(-1), ['picker', handle]);
});
