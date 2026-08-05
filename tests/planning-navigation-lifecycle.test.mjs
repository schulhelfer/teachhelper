import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const planningSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);
const shellSource = await readFile(
  new URL('../src/app/shell.js', import.meta.url),
  'utf8',
);
const planningBridgeSource = await readFile(
  new URL('../src/modules/planning/bridge.js', import.meta.url),
  'utf8',
);

function extractClassMethod(source, name) {
  const match = new RegExp(`\\n  ${name}\\(`).exec(source);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

test('shell requests the planning week only when entering the planning tab', () => {
  const start = shellSource.indexOf('  function renderTabs()');
  const end = shellSource.indexOf('  function clearTabTransitionTimer()', start);
  const renderTabsSource = shellSource.slice(start, end);

  assert.ok(renderTabsSource.includes('const enteredPlanningTab ='));
  assert.ok(renderTabsSource.includes('lastRenderedActiveTab !== TAB_PLANNING'));
  assert.ok(renderTabsSource.includes('if (enteredPlanningTab)'));
  assert.ok(renderTabsSource.includes("source: 'shell-tab-entry'"));
  assert.equal(
    renderTabsSource.includes('if (state.activeTab === TAB_PLANNING)'),
    false,
    'ordinary shell renders must not reset the planning subview',
  );
});

test('shell status updates do not rebuild an unchanged planning view', () => {
  const handleWorkspaceState = Function(
    `"use strict"; return ({${extractClassMethod(planningSource, 'handleWorkspaceState')}}).handleWorkspaceState;`,
  )();
  const calls = { renderAll: 0, footer: 0, archive: 0 };
  const harness = {
    isStandaloneWorkspace: false,
    workspaceRevision: 4,
    workspaceHydrated: true,
    settingsDirty: false,
    locked: false,
    lockReason: '',
    currentView: 'week',
    activeSettingsTab: 'dayoff',
    refs: { sidebarCourseList: {} },
    updateAccessLock() {},
    updateSidebarArchiveButtonState() { calls.archive += 1; },
    renderSidebarFooterActions() { calls.footer += 1; },
    renderAll() { calls.renderAll += 1; },
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

  assert.deepEqual(calls, { renderAll: 0, footer: 1, archive: 1 });
  assert.equal(harness.currentView, 'week');
});

test('planning ready notifications are deduplicated by visible state', () => {
  const methodSource = extractClassMethod(planningSource, 'queuePlanningReadySignal');
  assert.ok(methodSource.includes('const signature = JSON.stringify(detail)'));
  assert.ok(methodSource.includes('signature === this._lastPlanningReadySignalSignature'));
  assert.ok(methodSource.indexOf('return;') < methodSource.indexOf('window.dispatchEvent'));
});

test('settings navigation has a defined planning context', () => {
  assert.ok(planningSource.includes('const requestedSettingsContext = "planning"'));
});

test('planning bridge does not echo shell view requests back to the shell', () => {
  const outgoingStart = planningBridgeSource.indexOf('const outgoingEvents = new Set([');
  const outgoingEnd = planningBridgeSource.indexOf(']);', outgoingStart);
  const outgoingEvents = planningBridgeSource.slice(outgoingStart, outgoingEnd);

  assert.ok(outgoingStart >= 0, 'planning bridge must declare its outgoing events');
  assert.equal(
    outgoingEvents.includes('VIEW_REQUEST_EVENT'),
    false,
    'view requests are shell-to-frame commands and must not be mirrored to the parent',
  );
  assert.ok(
    planningBridgeSource.includes("incomingEvents = new Set([\n    VIEW_REQUEST_EVENT"),
    'the bridge must continue accepting shell view requests',
  );
});

test('a shell view message reaches planning exactly once without a parent postMessage', () => {
  const listeners = new Map();
  const parentMessages = [];
  const parent = {
    postMessage(message, origin) {
      parentMessages.push({ message, origin });
    },
  };
  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail ?? null;
    }
  }
  const fakeWindow = {
    location: { origin: 'https://teachhelper.test' },
    parent,
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
  };

  vm.runInNewContext(planningBridgeSource, {
    window: fakeWindow,
    document: { documentElement: { dataset: {} } },
    CustomEvent: FakeCustomEvent,
  });

  let deliveredViewRequests = 0;
  fakeWindow.addEventListener('classroom:planning-view-request', () => {
    deliveredViewRequests += 1;
  });
  fakeWindow.dispatchEvent({
    type: 'message',
    source: parent,
    origin: fakeWindow.location.origin,
    data: {
      type: 'classroom:planning-view-request',
      detail: { view: 'week', source: 'shell-tab-entry' },
    },
  });

  assert.equal(deliveredViewRequests, 1);
  assert.deepEqual(parentMessages, []);
});

test('planning bridge applies the shell fullscreen state to its document', () => {
  const listeners = new Map();
  const parent = { postMessage() {} };
  const documentElement = { dataset: {} };
  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail ?? null;
    }
  }
  const fakeWindow = {
    location: { origin: 'https://teachhelper.test' },
    parent,
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
    },
  };

  vm.runInNewContext(planningBridgeSource, {
    window: fakeWindow,
    document: { documentElement },
    CustomEvent: FakeCustomEvent,
  });

  const sendShellLayout = (collapsed) => fakeWindow.dispatchEvent({
    type: 'message',
    source: parent,
    origin: fakeWindow.location.origin,
    data: {
      type: 'classroom:planning-shell-layout',
      detail: { collapsed },
    },
  });

  sendShellLayout(true);
  assert.equal(documentElement.dataset.shellCollapsed, 'true');
  sendShellLayout(false);
  assert.equal(documentElement.dataset.shellCollapsed, 'false');
});
