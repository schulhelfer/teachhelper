import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rawSource = await readFile(new URL('../src/app/shell/tab-controller.js', import.meta.url), 'utf8');
const importEnd = rawSource.indexOf('const TAB_REGION_SELECTOR');
const source = `${[
  "const TAB_DUPLICATE_CHECK = 'duplicate-check';",
  "const TAB_GRADES = 'grades';",
  "const TAB_GROUPS = 'groups';",
  "const TAB_MERGER = 'merger';",
  "const TAB_NAME_LEARNING = 'name-learning';",
  "const TAB_PLANNING = 'planning';",
  "const TAB_QR = 'qr';",
  "const TAB_RANDOM_PICKER = 'random-picker';",
  "const TAB_SEATPLAN = 'seatplan';",
  "const TAB_WORK_PHASE = 'work-phase';",
  "const normalizeTab = (tab) => ['duplicate-check', 'grades', 'groups', 'merger', 'name-learning', 'planning', 'qr', 'random-picker', 'seatplan', 'work-phase'].includes(tab) ? tab : 'groups';",
].join('\n')}\n${rawSource.slice(importEnd)}`;
const { createTabController } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

class FakeClassList {
  constructor(names = []) {
    this.names = new Set(names);
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.names.has(name) : Boolean(force);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor(classes = []) {
    this.classList = new FakeClassList(classes);
    this.attributes = new Map();
    this.children = [];
    this.hidden = false;
    this.textContent = '';
    this.display = 'block';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  matches(selector) {
    return selector.split(',').some((part) => {
      const className = part.trim().replace(/^\./, '');
      return this.classList.contains(className);
    });
  }
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(options = {}) {
  const app = new FakeElement(['app', ...(options.appClasses || [])]);
  const side = new FakeElement(['side']);
  const main = new FakeElement(['main']);
  app.append(side, main);
  const buttons = new Map(
    ['planning', 'grades', 'groups', 'merger', 'duplicate-check', 'qr', 'random-picker', 'seatplan', 'name-learning', 'work-phase']
      .map((tab) => [tab, new FakeElement(['tab-button'])])
  );
  const regions = {
    mergerShell: new FakeElement(['merger-shell']),
    duplicateCheckShell: new FakeElement(['duplicate-check-shell']),
    qrShell: new FakeElement(['qr-shell']),
    planningShell: new FakeElement(['planning-shell']),
    nameLearningShell: new FakeElement(['name-learning-shell']),
    seatplanSideHost: new FakeElement(),
    seatplanMainHost: new FakeElement(),
    groupsMainHost: new FakeElement(),
    randomPickerHost: new FakeElement(),
    monitorShell: new FakeElement(['monitor-shell']),
    workOrderShell: new FakeElement(['work-order-shell']),
    timerShell: new FakeElement(['timer-shell']),
  };
  app.append(
    regions.mergerShell,
    regions.duplicateCheckShell,
    regions.qrShell,
    regions.planningShell,
    regions.nameLearningShell,
    regions.monitorShell,
    regions.workOrderShell,
    regions.timerShell
  );
  const dueCount = new FakeElement();
  const tabNav = new FakeElement();
  tabNav.querySelectorAll = (selector) => selector === '[data-name-learning-due-count]'
    ? [dueCount]
    : [];
  const workOrderHintOverlay = new FakeElement();
  const timers = new Map();
  const frames = new Map();
  const clearedTimers = [];
  const cancelledFrames = [];
  let nextTimerId = 1;
  let nextFrameId = 1;
  const calls = [];
  const mirroredTabs = [];
  const workspace = {
    leaveGuard: null,
    promptVault: false,
    showNameLearning: true,
    planningState: { initialPaintPending: true },
    gradesState: { initialPaintPending: true },
    vaultState: { nameLearningDueCount: 3 },
    getPlanningState() {
      return { ...this.planningState };
    },
    getGradesState() {
      return { ...this.gradesState };
    },
    getVaultState() {
      return { ...this.vaultState };
    },
    canShowNameLearning() {
      return this.showNameLearning;
    },
    getLeaveGuard(nextTab, guardOptions) {
      calls.push(['guard', nextTab, guardOptions]);
      return typeof this.leaveGuard === 'function'
        ? this.leaveGuard(nextTab, guardOptions)
        : this.leaveGuard;
    },
    shouldPromptVaultUnlock(nextTab) {
      calls.push(['vault-check', nextTab]);
      return this.promptVault;
    },
  };
  const sidebarResize = {
    applyActiveWidth() {
      calls.push(['sidebar']);
    },
  };
  const tabNavLayout = {
    syncAfterTabRender() {
      calls.push(['nav-sync']);
    },
  };
  const gradesLeave = options.gradesLeave || (() => Promise.resolve(false));
  const planningLeave = options.planningLeave || (() => Promise.resolve(false));
  const controller = createTabController({
    elements: {
      app,
      tabNav,
      tabButtons: [...buttons].map(([tab, button]) => [button, tab]),
      ...regions,
      tabNameLearning: buttons.get('name-learning'),
      seatPreferencesLabel: new FakeElement(),
      groupSeatPreferences: new FakeElement(),
      workOrderHintOverlay,
    },
    initialActiveTab: options.initialActiveTab || 'planning',
    documentRef: { documentElement: new FakeElement() },
    HTMLElementClass: FakeElement,
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      clearedTimers.push(id);
      timers.delete(id);
    },
    matchMedia: () => ({ matches: Boolean(options.reducedMotion) }),
    getComputedStyle: (element) => ({
      display: element.display,
      getPropertyValue: (name) => name === '--tab-switch-duration'
        ? (options.transitionDuration || '120ms')
        : '',
    }),
    workspaceStatus: workspace,
    sidebarResize,
    tabNavLayout,
    onActiveTabStateChange(tab) {
      mirroredTabs.push(tab);
      calls.push(['mirror', tab]);
    },
    onEnsureTabInitialized(tab) {
      calls.push(['ensure', tab]);
    },
    onDispatchPlanningViewRequest(detail) {
      calls.push(['planning-view', detail]);
    },
    onRenderRandomPicker() {
      calls.push(['picker']);
    },
    onPositionWorkOrderHintOverlay() {
      calls.push(['work-hint']);
    },
    onRefreshLayouts() {
      calls.push(['refresh']);
    },
    onRequestGradeVault(detail) {
      calls.push(['vault-request', detail]);
    },
    onResolveGradesTabLeave() {
      calls.push(['grades-leave']);
      return gradesLeave();
    },
    onResolvePlanningTabLeave() {
      calls.push(['planning-leave']);
      return planningLeave();
    },
    onRenderVaultControl() {
      calls.push(['vault-render']);
    },
    onRenderManualSaveControl() {
      calls.push(['manual-render']);
    },
    onActiveTabChange(tab) {
      calls.push(['active-change', tab]);
    },
    onTabActivating(tab, previousTab) {
      calls.push(['activating', tab, previousTab]);
    },
  });

  function runNextTimer(delay = null) {
    const entry = [...timers].find(([, timer]) => delay === null || timer.delay === delay);
    assert.ok(entry, `expected a pending timer${delay === null ? '' : ` with delay ${delay}`}`);
    const [id, timer] = entry;
    timers.delete(id);
    timer.callback();
  }

  function runFrames() {
    while (frames.size) {
      const entries = [...frames];
      frames.clear();
      entries.forEach(([, callback]) => callback());
    }
  }

  return {
    app,
    buttons,
    calls,
    cancelledFrames,
    clearedTimers,
    controller,
    dueCount,
    frames,
    main,
    mirroredTabs,
    regions,
    runFrames,
    runNextTimer,
    side,
    timers,
    workOrderHintOverlay,
    workspace,
  };
}

test('renders the initial tab state and only dispatches the planning entry once', () => {
  const harness = createHarness();
  harness.controller.render();

  assert.equal(harness.controller.getActiveTab(), 'planning');
  assert.equal(harness.app.classList.contains('app-tab-planning'), true);
  assert.equal(harness.app.classList.contains('planning-initial-paint-pending'), true);
  assert.equal(harness.regions.planningShell.hidden, false);
  assert.equal(harness.regions.mergerShell.hidden, true);
  assert.equal(harness.regions.groupsMainHost.hidden, true);
  assert.equal(harness.buttons.get('planning').classList.contains('active'), true);
  assert.equal(harness.buttons.get('planning').getAttribute('aria-selected'), 'true');
  assert.equal(harness.buttons.get('groups').getAttribute('aria-selected'), 'false');
  assert.equal(harness.buttons.get('name-learning').hidden, false);
  assert.equal(harness.dueCount.hidden, false);
  assert.equal(harness.dueCount.textContent, ' (3)');
  assert.equal(harness.calls.filter(([name]) => name === 'planning-view').length, 1);

  harness.controller.render();
  assert.equal(harness.calls.filter(([name]) => name === 'planning-view').length, 1);
  assert.equal(harness.calls.filter(([name]) => name === 'sidebar').length, 2);
  assert.equal(harness.calls.filter(([name]) => name === 'nav-sync').length, 2);
});

test('re-renders an identical tab without starting a transition or tutorial notification', () => {
  const harness = createHarness({ initialActiveTab: 'groups' });
  harness.controller.setActiveTab('groups', { showTutorialHint: true });

  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.calls.filter(([name]) => name === 'ensure').length, 1);
  assert.equal(harness.calls.filter(([name]) => name === 'refresh').length, 1);
  assert.equal(harness.calls.some(([name]) => name === 'activating'), false);
  assert.equal(harness.calls.some(([name]) => name === 'active-change'), false);
});

test('switches immediately for reduced motion while preserving callback order', () => {
  const harness = createHarness({ initialActiveTab: 'planning', reducedMotion: true });
  harness.workspace.promptVault = true;
  harness.controller.setActiveTab('grades', { showTutorialHint: true });

  assert.equal(harness.controller.getActiveTab(), 'grades');
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.deepEqual(harness.mirroredTabs, ['grades']);
  assert.equal(harness.regions.planningShell.hidden, true);
  assert.equal(harness.buttons.get('grades').classList.contains('active'), true);
  const names = harness.calls.map(([name]) => name);
  assert.ok(names.indexOf('guard') < names.indexOf('vault-request'));
  assert.ok(names.indexOf('vault-request') < names.indexOf('activating'));
  assert.ok(names.indexOf('activating') < names.indexOf('mirror'));
  assert.ok(names.indexOf('mirror') < names.indexOf('ensure'));
  assert.ok(names.indexOf('ensure') < names.indexOf('refresh'));
  assert.ok(names.indexOf('refresh') < names.indexOf('active-change'));
});

test('switches without animation when no tab region is currently rendered', () => {
  const harness = createHarness({ initialActiveTab: 'groups' });
  harness.app.children.forEach((region) => {
    region.display = 'none';
  });
  harness.controller.setActiveTab('qr');

  assert.equal(harness.controller.getActiveTab(), 'qr');
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.calls.filter(([name, tab]) => name === 'ensure' && tab === 'qr').length, 1);
});

test('runs leave and enter phases through their existing timer and frame boundaries', () => {
  const harness = createHarness({ initialActiveTab: 'groups' });
  harness.controller.setActiveTab('merger', { showTutorialHint: true });

  assert.equal(harness.controller.getActiveTab(), 'groups');
  assert.equal(harness.controller.getTransitionState(), 'leaving');
  assert.equal(harness.app.classList.contains('is-tab-switching'), true);
  assert.equal(harness.side.classList.contains('tab-switch-leave'), true);

  harness.runNextTimer(120);
  assert.equal(harness.controller.getActiveTab(), 'merger');
  assert.equal(harness.controller.getTransitionState(), 'entering');
  assert.equal(harness.regions.mergerShell.hidden, false);
  assert.equal(harness.regions.mergerShell.classList.contains('tab-switch-enter'), true);
  assert.equal(harness.calls.some(([name, tab]) => name === 'active-change' && tab === 'merger'), false);

  harness.runFrames();
  assert.equal(harness.regions.mergerShell.classList.contains('tab-switch-enter'), false);
  harness.runNextTimer(120);
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.app.classList.contains('is-tab-switching'), false);
  assert.equal(harness.calls.filter(([name, tab]) => name === 'active-change' && tab === 'merger').length, 1);
});

test('keeps only the latest pending request during a running transition', () => {
  const harness = createHarness({ initialActiveTab: 'groups' });
  harness.controller.setActiveTab('merger', { showTutorialHint: true });
  harness.controller.setActiveTab('qr', { showTutorialHint: false });
  harness.controller.setActiveTab('duplicate-check', { showTutorialHint: true });

  harness.runNextTimer(120);
  harness.runFrames();
  harness.runNextTimer(120);
  assert.equal(harness.controller.getTransitionState(), 'leaving');
  assert.equal(harness.controller.getActiveTab(), 'merger');

  harness.runNextTimer(120);
  harness.runFrames();
  harness.runNextTimer(120);
  assert.equal(harness.controller.getActiveTab(), 'duplicate-check');
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.calls.some(([name, tab]) => name === 'ensure' && tab === 'qr'), false);
  assert.equal(harness.calls.filter(([name]) => name === 'active-change').length, 1);
  assert.deepEqual(
    harness.calls.filter(([name]) => name === 'activating').map((call) => call.slice(1)),
    [
      ['merger', 'groups'],
      ['qr', 'groups'],
      ['duplicate-check', 'groups'],
      ['duplicate-check', 'merger'],
    ]
  );
});

test('serializes grades and planning leave confirmation without changing rejected tabs', async () => {
  const gradesDeferred = createDeferred();
  const gradesHarness = createHarness({
    initialActiveTab: 'grades',
    reducedMotion: true,
    gradesLeave: () => gradesDeferred.promise,
  });
  gradesHarness.workspace.leaveGuard = (_nextTab, options) => options.skipUnsavedPrompt ? null : 'grades';
  gradesHarness.controller.setActiveTab('groups', { showTutorialHint: true });
  gradesHarness.controller.setActiveTab('merger');
  assert.equal(gradesHarness.calls.filter(([name]) => name === 'grades-leave').length, 1);
  gradesDeferred.resolve(true);
  await gradesDeferred.promise;
  await Promise.resolve();
  assert.equal(gradesHarness.controller.getActiveTab(), 'groups');
  assert.equal(gradesHarness.calls.filter(([name]) => name === 'active-change').length, 1);

  const planningDeferred = createDeferred();
  const planningHarness = createHarness({
    initialActiveTab: 'planning',
    reducedMotion: true,
    planningLeave: () => planningDeferred.promise,
  });
  planningHarness.workspace.leaveGuard = (_nextTab, options) => options.skipUnsavedPrompt ? null : 'planning';
  planningHarness.controller.setActiveTab('groups');
  planningDeferred.resolve(false);
  await planningDeferred.promise;
  await Promise.resolve();
  assert.equal(planningHarness.controller.getActiveTab(), 'planning');
  assert.equal(planningHarness.calls.filter(([name]) => name === 'planning-leave').length, 1);

  const rejectedDeferred = createDeferred();
  const rejectedHarness = createHarness({
    initialActiveTab: 'planning',
    reducedMotion: true,
    planningLeave: () => rejectedDeferred.promise,
  });
  rejectedHarness.workspace.leaveGuard = () => 'planning';
  rejectedHarness.controller.setActiveTab('groups');
  rejectedDeferred.reject(new Error('cancel'));
  await assert.rejects(rejectedDeferred.promise);
  await Promise.resolve();
  assert.equal(rejectedHarness.controller.getActiveTab(), 'planning');
});

test('keeps immediate activation free of layout refresh and transition work', () => {
  const harness = createHarness({ initialActiveTab: 'groups' });
  harness.controller.setActiveTabImmediate('random-picker', { showTutorialHint: true });

  assert.equal(harness.controller.getActiveTab(), 'random-picker');
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.calls.filter(([name]) => name === 'picker').length, 1);
  assert.equal(harness.calls.some(([name]) => name === 'refresh'), false);
  assert.equal(harness.calls.filter(([name]) => name === 'active-change').length, 1);
});

test('dispose cancels pending transitions, frames, deferred work and guard continuations idempotently', async () => {
  const guardDeferred = createDeferred();
  const guardHarness = createHarness({
    initialActiveTab: 'grades',
    reducedMotion: true,
    gradesLeave: () => guardDeferred.promise,
  });
  guardHarness.workspace.leaveGuard = (_nextTab, options) => options.skipUnsavedPrompt ? null : 'grades';
  guardHarness.controller.setActiveTab('groups');
  guardHarness.controller.dispose();
  guardHarness.controller.dispose();
  guardDeferred.resolve(true);
  await guardDeferred.promise;
  await Promise.resolve();
  assert.equal(guardHarness.controller.getActiveTab(), 'grades');

  const transitionHarness = createHarness({ initialActiveTab: 'groups' });
  transitionHarness.controller.setActiveTab('merger');
  assert.equal(transitionHarness.timers.size, 1);
  transitionHarness.runNextTimer(120);
  assert.equal(transitionHarness.frames.size, 1);
  transitionHarness.controller.dispose();
  transitionHarness.controller.dispose();
  assert.equal(transitionHarness.timers.size, 0);
  assert.equal(transitionHarness.frames.size, 0);
  assert.equal(transitionHarness.clearedTimers.length, 1);
  assert.equal(transitionHarness.cancelledFrames.length, 1);
  assert.equal(transitionHarness.controller.getTransitionState(), 'idle');
  assert.equal(transitionHarness.app.classList.contains('is-tab-switching'), false);
  assert.equal(transitionHarness.side.classList.contains('tab-switch-leave'), false);

  const workHintHarness = createHarness({ initialActiveTab: 'groups' });
  workHintHarness.workOrderHintOverlay.classList.add('visible');
  workHintHarness.controller.setActiveTabImmediate('work-phase');
  assert.equal(workHintHarness.timers.size, 1);
  workHintHarness.controller.dispose();
  assert.equal(workHintHarness.timers.size, 0);
  assert.equal(workHintHarness.calls.some(([name]) => name === 'work-hint'), false);
});
