import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const bridgeSource = await readFile(
  new URL('../src/app/planning-seatplan-bridge.js', import.meta.url),
  'utf8',
);

function extractBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} must exist`);
  const bodyStart = source.indexOf('{', start + marker.length);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${marker} is incomplete`);
}

const PLANNING_READY_EVENT = 'classroom:planning-ready';
const TAB_PLANNING = 'planning';
const TAB_GRADES = 'grades';

function createHarness({ planningInitSucceeds = true } = {}) {
  const calls = [];
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;

  const view = {
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
  };

  const context = vm.createContext({
    window: view,
    PLANNING_READY_EVENT,
    TAB_PLANNING,
    TAB_GRADES,
    TAB_MERGER: 'merger',
    TAB_DUPLICATE_CHECK: 'duplicate-check',
    TAB_QR: 'qr',
    TAB_SEATPLAN: 'seatplan',
    TAB_NAME_LEARNING: 'name-learning',
    DEFERRED_GRADES_MOUNT_TIMEOUT_MS: 4000,
    cancelDeferredGradesMount: null,
    tabInitState: {
      [TAB_PLANNING]: false,
      [TAB_GRADES]: false,
    },
    els: {},
    documentBus: null,
    initGradesTab: () => { calls.push('grades'); },
    initPlanningTab: () => {
      calls.push('planning');
      return planningInitSucceeds;
    },
    initMergerTab: () => {},
    initDuplicateCheckTab: () => {},
    initQrTab: () => {},
    initSeatplanTabNative: () => {},
    initNameLearningTab: () => {},
  });

  vm.runInContext(
    [
      extractBlock(bridgeSource, '  const mountGradesTabNow = '),
      extractBlock(bridgeSource, '  const scheduleGradesTabMount = '),
      extractBlock(bridgeSource, '  function ensureTabInitialized(tab)'),
    ].join('\n'),
    context,
  );

  return {
    calls,
    context,
    ensureTabInitialized: (tab) => vm.runInContext(`ensureTabInitialized(${JSON.stringify(tab)})`, context),
    firePlanningReady: () => {
      for (const handler of [...(listeners.get(PLANNING_READY_EVENT) || [])]) {
        listeners.get(PLANNING_READY_EVENT).delete(handler);
        handler();
      }
    },
    runTimers: () => {
      for (const [id, timer] of [...timers]) {
        timers.delete(id);
        timer.callback();
      }
    },
    pendingTimerDelays: () => [...timers.values()].map((timer) => timer.delay),
    listenerCount: (type) => (listeners.get(type)?.size || 0),
  };
}

test('the planning tab mounts before the grades module is started', () => {
  const harness = createHarness();
  harness.ensureTabInitialized(TAB_PLANNING);

  assert.deepEqual(harness.calls, ['planning'], 'grades must not mount in the same task');
  assert.equal(harness.listenerCount(PLANNING_READY_EVENT), 1);
  assert.deepEqual(harness.pendingTimerDelays(), [4000]);
});

test('grades mounts as soon as planning reports that it is ready', () => {
  const harness = createHarness();
  harness.ensureTabInitialized(TAB_PLANNING);
  harness.firePlanningReady();

  assert.deepEqual(harness.calls, ['planning', 'grades']);
  assert.deepEqual(harness.pendingTimerDelays(), [], 'the fallback timer must be cleared');
});

test('grades still mounts when planning never reports readiness', () => {
  const harness = createHarness();
  harness.ensureTabInitialized(TAB_PLANNING);
  harness.runTimers();

  assert.deepEqual(harness.calls, ['planning', 'grades']);
  assert.equal(harness.listenerCount(PLANNING_READY_EVENT), 0);
});

test('switching to the grades tab during the wait mounts it immediately', () => {
  const harness = createHarness();
  harness.ensureTabInitialized(TAB_PLANNING);
  harness.ensureTabInitialized(TAB_GRADES);

  assert.deepEqual(harness.calls, ['planning', 'grades']);
  assert.deepEqual(harness.pendingTimerDelays(), []);
  assert.equal(harness.listenerCount(PLANNING_READY_EVENT), 0);

  harness.firePlanningReady();
  harness.runTimers();
  assert.deepEqual(harness.calls, ['planning', 'grades']);
});

test('grades is not deferred when planning waits for the workspace instead', () => {
  const harness = createHarness({ planningInitSucceeds: false });
  harness.ensureTabInitialized(TAB_PLANNING);

  assert.deepEqual(harness.calls, ['planning', 'grades']);
  assert.deepEqual(harness.pendingTimerDelays(), []);
});
