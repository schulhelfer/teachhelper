import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import * as tabs from '../src/shell/tabs.js';
import * as studentSync from '../src/shared/student-sync-bus.js';
import * as workspaceMessages from '../src/shared/school-data/messages.js';

const source = (await readFile(new URL('../src/app/planning-seatplan-bridge.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from '[^']+';\n/gm, '')
  .replace('export function', 'function');

function createHarness({ ready = true, missingHosts = false } = {}) {
  const calls = [];
  const timers = new Map();
  const frames = new Map();
  const controllers = new Map();
  const mounts = [];
  let sequence = 0;
  const schedule = (map) => (callback, delay) => {
    const id = ++sequence;
    map.set(id, { callback, delay });
    return id;
  };
  const view = new EventTarget();
  view.setTimeout = schedule(timers);
  view.clearTimeout = (id) => timers.delete(id);
  const documentBus = new EventTarget();
  const els = Object.fromEntries([
    'mergerHost', 'duplicateCheckHost', 'qrHost', 'nameLearningHost', 'planningHost', 'gradesHost',
    'seatplanMainHost', 'seatplanSideHost', 'seatplanDialogHost',
  ].map((id) => [id, missingHosts ? null : { dataset: {} }]));
  const mount = (id) => ({ host, mainHost }) => {
    const target = host || mainHost;
    target.dataset.initialized = '1';
    mounts.push(id);
    const controller = {
      frame: { loading: 'lazy' },
      applyShellLayout: (detail) => calls.push([id, 'layout', detail]),
      post: (...args) => { calls.push([id, 'post', ...args]); return id === 'planning' ? undefined : true; },
      navigate: (detail) => calls.push([id, 'navigate', detail]),
      requestTabLeave: (detail) => { calls.push([id, 'leave', detail]); return id === 'planning' ? undefined : true; },
      send: (detail) => calls.push([id, 'roster', detail]),
      sendCourseContext: (detail) => calls.push([id, 'course', detail]),
      sendGradeRosterImportResult: (detail) => calls.push([id, 'import', detail]),
      sendGradeRosterCoursesOutdated: () => calls.push([id, 'courses-outdated']),
      dispose: () => { calls.push([id, 'dispose']); delete target.dataset.initialized; },
    };
    controllers.set(id, controller);
    return controller;
  };
  const context = {
    ...tabs, ...studentSync, ...workspaceMessages,
    CustomEvent, Event, Promise,
    window: view,
    document: documentBus,
    setTimeout: view.setTimeout,
    clearTimeout: view.clearTimeout,
    requestAnimationFrame: schedule(frames),
    cancelAnimationFrame: (id) => frames.delete(id),
    getWorkspaceClient: () => ({
      getLifecycle: () => ({ ready, revision: 12 }),
      getSnapshot: () => ({ vault: { encryptionEnabled: true, unlocked: false } }),
    }),
    mountPlanning: mount('planning'), mountGrades: mount('grades'), mountMerger: mount('merger'),
    mountQr: mount('qr'), mountDuplicateCheck: mount('duplicate-check'),
    mountSeatplan: mount('seatplan'), mountNameLearning: mount('name-learning'),
  };
  const createBridge = vm.runInNewContext(`${source}\ncreatePlanningSeatplanBridge;`, context);
  const bridge = createBridge({ els, documentBus, getChromeCollapsed: () => true,
    rosterStore: { getState: () => ({ students: [{ id: '1', first: 'Ada' }] }) } });
  return { bridge, view, documentBus, timers, frames, calls, mounts, controllers,
    setReady(value) { ready = value; },
    dispatch(type, detail) { view.dispatchEvent(new CustomEvent(type, { detail })); },
  };
}

test('workspace readiness resumes pending navigation without duplicate mounts or changing revision', () => {
  const h = createHarness({ ready: false });
  assert.equal(h.bridge.dispatchPlanningViewRequest({ view: 'course', courseId: 9 }), false);
  assert.deepEqual(h.mounts, ['grades']);
  assert.equal(h.bridge.dispatchGradesNavigation({ courseId: 9 }), false);
  h.setReady(true);
  h.dispatch(tabs.GRADES_READY_EVENT, {});
  assert.deepEqual(h.mounts, ['grades', 'planning']);
  h.bridge.ensureTabInitialized('planning');
  h.bridge.ensureTabInitialized('grades');
  h.dispatch(tabs.GRADES_READY_EVENT, {});
  assert.deepEqual(h.mounts, ['grades', 'planning']);
  const navigation = h.calls.find(([id, method]) => id === 'grades' && method === 'navigate');
  assert.equal(navigation[2].baseRevision, 12);
  assert.equal(navigation[2].courseId, 9);
  const planning = h.calls.find(([id, method]) => id === 'planning' && method === 'post');
  assert.equal(planning[3].workspaceRevision, 12);
  assert.equal(planning[3].courseId, 9);
  h.bridge.dispose();
});

test('module layouts preserve active-tab payloads, initial roster and vault access', () => {
  const h = createHarness();
  for (const id of ['merger', 'duplicate-check', 'qr', 'name-learning', 'grades', 'planning', 'seatplan']) {
    h.bridge.ensureTabInitialized(id);
    h.bridge.applyModuleShellLayout(id, { activeTab: 'seatplan' });
    const layout = h.calls.filter(([module, method]) => module === id && method === 'layout').at(-1)[2];
    assert.equal(layout.collapsed, true);
    assert.equal(Object.hasOwn(layout, 'activeTab'), ['grades', 'seatplan'].includes(id));
    if (Object.hasOwn(layout, 'activeTab')) assert.equal(layout.activeTab, 'seatplan');
  }
  assert.equal(h.calls.find(([id, method]) => id === 'seatplan' && method === 'roster')[2].students[0].first, 'Ada');
  assert.equal(h.calls.find(([id, method]) => id === 'name-learning' && method === 'post')[2].detail.locked, true);
  h.bridge.sendCourseSeatplanContext({ courseId: 9 });
  assert.equal(h.calls.at(-1)[2].courseId, 9);
  h.dispatch(tabs.GRADES_GRADE_VAULT_STATE_EVENT, { encryptionEnabled: true, unlocked: false });
  assert.equal(h.calls.at(-1)[2].clearGradeStudentPortraits, true);
  h.bridge.dispose();
});

test('shell workspace changes mark the seatplan course pills as outdated', () => {
  const h = createHarness();
  const outdatedCalls = () => h.calls.filter(([, method]) => method === 'courses-outdated').map(([id]) => id);
  h.dispatch(workspaceMessages.WORKSPACE_STATE_EVENT, { scope: 'shell' });
  assert.deepEqual(outdatedCalls(), []);
  h.bridge.ensureTabInitialized('seatplan');
  h.dispatch(workspaceMessages.WORKSPACE_STATE_EVENT, { scope: 'grades' });
  h.dispatch(workspaceMessages.WORKSPACE_STATE_EVENT, { scope: 'shell' });
  assert.deepEqual(outdatedCalls(), ['seatplan']);
  h.bridge.dispose();
  h.dispatch(workspaceMessages.WORKSPACE_STATE_EVENT, { scope: 'shell' });
  assert.deepEqual(outdatedCalls(), ['seatplan']);
});

test('disposal cancels deferred mounts, frame retries, listeners and pending leave requests', async () => {
  const h = createHarness();
  h.bridge.ensureTabInitialized('planning');
  assert.deepEqual(h.mounts, ['planning']);
  assert.equal([...h.timers.values()][0].delay, 4000);
  const deferred = [...h.timers.values()][0].callback;
  h.bridge.scheduleModuleLayoutRefresh('seatplan');
  const staleCallbacks = [...h.timers.values(), ...h.frames.values()].map(({ callback }) => callback);
  h.bridge.dispose();
  h.bridge.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  deferred();
  staleCallbacks.forEach((callback) => callback());
  h.dispatch(tabs.PLANNING_READY_EVENT, {});
  h.dispatch(workspaceMessages.WORKSPACE_OWNER_READY_EVENT, {});
  h.bridge.ensureTabInitialized('grades');
  h.bridge.dispatchGradesNavigation({ courseId: 1 });
  assert.deepEqual(h.mounts, ['planning']);
  const before = h.calls.length;
  h.documentBus.dispatchEvent(new CustomEvent(studentSync.STUDENTS_UPDATED_EVENT, { detail: { students: [] } }));
  h.dispatch(tabs.GRADES_GRADE_VAULT_STATE_EVENT, {});
  assert.equal(h.calls.length, before);
  h.bridge.disposeModule('planning');
  h.bridge.disposeModule('planning');
  assert.equal(h.calls.filter(([, method]) => method === 'dispose').length, 1);
  const waiting = createHarness();
  const leave = waiting.bridge.requestGradesTabLeaveConfirmation();
  waiting.bridge.dispose();
  assert.equal(await leave, false);
  assert.equal(await waiting.bridge.requestGradesTabLeaveConfirmation(), false);
  const pendingWorkspace = createHarness({ ready: false });
  pendingWorkspace.bridge.ensureTabInitialized('planning');
  pendingWorkspace.bridge.dispose();
  pendingWorkspace.setReady(true);
  pendingWorkspace.dispatch(workspaceMessages.WORKSPACE_OWNER_READY_EVENT, {});
  pendingWorkspace.dispatch(tabs.GRADES_READY_EVENT, {});
  assert.deepEqual(pendingWorkspace.mounts, ['grades']);
});

test('tab leave keeps controller return semantics and matching responses', async () => {
  const h = createHarness();
  assert.equal(await h.bridge.requestPlanningTabLeaveConfirmation(), false);
  const grades = h.bridge.requestGradesTabLeaveConfirmation();
  const requestId = h.calls.at(-1)[2].requestId;
  h.dispatch(tabs.GRADES_TAB_LEAVE_RESULT_EVENT, { requestId: 'wrong', allowed: true });
  h.dispatch(tabs.GRADES_TAB_LEAVE_RESULT_EVENT, { requestId, allowed: true });
  assert.equal(await grades, true);
  h.bridge.dispose();
});

test('missing hosts and repeated initialization remain harmless', () => {
  const h = createHarness({ missingHosts: true });
  for (const id of ['planning', 'grades', 'merger', 'duplicate-check', 'qr', 'seatplan', 'name-learning']) {
    h.bridge.ensureTabInitialized(id);
    h.bridge.ensureTabInitialized(id);
    h.bridge.applyModuleShellLayout(id, {});
  }
  assert.deepEqual(h.mounts, []);
  h.bridge.dispose();
});
