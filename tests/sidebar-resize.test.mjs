import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/shell/sidebar-resize.js', import.meta.url), 'utf8');
const { createSidebarResizeController } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

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

  dispatch(type, init = {}) {
    const event = {
      type,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...init,
    };
    [...(this.listeners.get(type) || [])].forEach((listener) => listener(event));
    return event;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(bounds) {
    super();
    this.bounds = { ...bounds };
    this.styles = new Map();
    this.classes = new Set();
    this.capturedPointers = new Set();
    this.releasedPointers = [];
    this.appended = [];
    this.style = {
      setProperty: (name, value) => this.styles.set(name, value),
      getPropertyValue: (name) => this.styles.get(name) || '',
    };
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }

  getBoundingClientRect() {
    return { ...this.bounds };
  }

  append(node) {
    this.appended.push(node);
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
    this.releasedPointers.push(pointerId);
  }
}

function createHarness({
  stored = {},
  scope = 'other',
  innerWidth = 1200,
  resizable = true,
  chromeCollapsed = false,
  chromeTransitionState = 'idle',
} = {}) {
  const state = { scope, resizable, chromeCollapsed, chromeTransitionState };
  const values = new Map(Object.entries(stored));
  const storageWrites = [];
  const localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const normalizedValue = String(value);
      values.set(key, normalizedValue);
      storageWrites.push([key, normalizedValue]);
    },
  };
  const view = new FakeEventTarget();
  view.innerWidth = innerWidth;
  view.localStorage = localStorage;
  view.frames = new Map();
  view.cancelledFrames = [];
  view.nextFrameId = 0;
  view.requestAnimationFrame = (callback) => {
    const frameId = ++view.nextFrameId;
    view.frames.set(frameId, callback);
    return frameId;
  };
  view.cancelAnimationFrame = (frameId) => {
    view.frames.delete(frameId);
    view.cancelledFrames.push(frameId);
  };
  view.flushFrames = () => {
    const frames = [...view.frames.entries()];
    view.frames.clear();
    frames.forEach(([frameId, callback]) => callback(frameId));
  };
  const observers = [];
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(target) {
      this.targets.push(target);
    }

    disconnect() {
      this.disconnected = true;
    }

    trigger() {
      this.callback();
    }
  }
  const app = new FakeElement({ left: 10, right: 1210, top: 0, height: 800 });
  const sidebar = new FakeElement({ left: 10, right: 370, top: 24, height: 520 });
  const handle = new FakeElement({ left: 0, right: 0, top: 0, height: 0 });
  const collapses = [];
  const widthChanges = [];
  let timestamp = 1000;
  const controller = createSidebarResizeController({
    app,
    sidebar,
    handle,
    view,
    ResizeObserverClass: FakeResizeObserver,
    getActiveScope: () => state.scope,
    isActiveTabResizable: () => state.resizable,
    getChromeCollapsed: () => state.chromeCollapsed,
    getChromeTransitionState: () => state.chromeTransitionState,
    onCollapseRequest: () => collapses.push(state.scope),
    onWidthChange: (nextScope, width) => widthChanges.push([nextScope, width]),
    now: () => timestamp,
  });
  return {
    app,
    sidebar,
    handle,
    view,
    observers,
    state,
    values,
    storageWrites,
    collapses,
    widthChanges,
    controller,
    setTimestamp(value) {
      timestamp = value;
    },
  };
}

function pointer(pointerId, clientX, options = {}) {
  return {
    button: 0,
    pointerId,
    clientX,
    clientY: 40,
    pointerType: 'mouse',
    ...options,
  };
}

test('applies default widths and switches between independent width scopes', () => {
  const harness = createHarness();
  assert.equal(harness.controller.getWidth('other'), 360);
  assert.equal(harness.controller.getWidth('planning'), 220);
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '360px');
  harness.state.scope = 'planning';
  harness.controller.applyActiveWidth();
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '220px');
  harness.controller.dispose();
});

test('loads scoped and legacy widths while rejecting invalid stored values', () => {
  const scoped = createHarness({
    stored: {
      'teachhelper:sidebar-width:planning': '244.6',
      'teachhelper:sidebar-width:other': '418.2',
      'teachhelper:shell-sidebar-width': '390',
    },
  });
  assert.equal(scoped.controller.getWidth('planning'), 245);
  assert.equal(scoped.controller.getWidth('other'), 418);
  assert.equal(scoped.app.style.getPropertyValue('--shell-sidebar-width'), '418px');
  scoped.controller.dispose();

  const legacy = createHarness({
    stored: {
      'teachhelper:sidebar-width:planning': '159',
      'teachhelper:shell-sidebar-width': '401',
    },
  });
  assert.equal(legacy.controller.getWidth('planning'), 220);
  assert.equal(legacy.controller.getWidth('other'), 401);
  legacy.controller.dispose();
});

test('clamps committed widths and persists and announces normalized values', () => {
  const harness = createHarness({ innerWidth: 1000 });
  assert.equal(harness.controller.setWidth('planning', 40), 160);
  assert.equal(harness.controller.setWidth('invalid', 900), 500);
  assert.equal(harness.controller.setWidth('planning', 'invalid'), null);
  assert.equal(harness.controller.getWidth('planning'), 160);
  assert.equal(harness.controller.getWidth('other'), 500);
  assert.deepEqual(harness.storageWrites, [
    ['teachhelper:sidebar-width:planning', '160'],
    ['teachhelper:sidebar-width:other', '500'],
  ]);
  assert.deepEqual(harness.widthChanges, [['planning', 160], ['other', 500]]);
  harness.controller.dispose();
});

test('commits pointer drags and restores the starting width after cancellation', () => {
  const harness = createHarness();
  const down = harness.handle.dispatch('pointerdown', pointer(7, 370));
  assert.equal(down.defaultPrevented, true);
  assert.equal(harness.app.classList.contains('is-sidebar-resizing'), true);
  assert.equal(harness.handle.hasPointerCapture(7), true);
  harness.handle.dispatch('pointermove', pointer(7, 460));
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '450px');
  harness.handle.dispatch('pointerup', pointer(7, 460));
  assert.equal(harness.controller.getWidth('other'), 450);
  assert.equal(harness.values.get('teachhelper:sidebar-width:other'), '450');
  assert.deepEqual(harness.widthChanges, [['other', 450]]);
  assert.equal(harness.app.classList.contains('is-sidebar-resizing'), false);
  assert.deepEqual(harness.handle.releasedPointers, [7]);

  harness.handle.dispatch('pointerdown', pointer(8, 460));
  harness.handle.dispatch('pointermove', pointer(8, 510));
  harness.handle.dispatch('pointercancel', pointer(8, 510));
  assert.equal(harness.controller.getWidth('other'), 450);
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '450px');
  assert.deepEqual(harness.widthChanges, [['other', 450]]);
  harness.controller.dispose();
});

test('clamps drag previews and commits to half the viewport width', () => {
  const harness = createHarness({ innerWidth: 1000 });
  harness.handle.dispatch('pointerdown', pointer(12, 370));
  harness.handle.dispatch('pointermove', pointer(12, 1010));
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '500px');
  harness.handle.dispatch('pointerup', pointer(12, 1010));
  assert.equal(harness.controller.getWidth('other'), 500);
  assert.equal(harness.values.get('teachhelper:sidebar-width:other'), '500');
  assert.deepEqual(harness.widthChanges, [['other', 500]]);
  harness.controller.dispose();
});

test('requests chrome collapse below the threshold without persisting the transient width', () => {
  const harness = createHarness();
  harness.handle.dispatch('pointerdown', pointer(3, 370));
  harness.handle.dispatch('pointermove', pointer(3, 150));
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '140px');
  harness.handle.dispatch('pointerup', pointer(3, 150));
  assert.deepEqual(harness.collapses, ['other']);
  assert.equal(harness.controller.getWidth('other'), 360);
  assert.equal(harness.values.has('teachhelper:sidebar-width:other'), false);
  assert.deepEqual(harness.widthChanges, []);
  harness.controller.dispose();
});

test('resets the active scope on double click and touch double tap', () => {
  const harness = createHarness();
  harness.controller.setWidth('other', 440);
  harness.storageWrites.length = 0;
  harness.widthChanges.length = 0;
  const doubleClick = harness.handle.dispatch('dblclick');
  assert.equal(doubleClick.defaultPrevented, true);
  assert.equal(harness.controller.getWidth('other'), 360);
  assert.deepEqual(harness.widthChanges, [['other', 360]]);

  harness.controller.setWidth('other', 430);
  harness.storageWrites.length = 0;
  harness.widthChanges.length = 0;
  harness.setTimestamp(2000);
  harness.handle.dispatch('pointerdown', pointer(10, 370, { pointerType: 'touch' }));
  harness.handle.dispatch('pointerup', pointer(10, 370, { pointerType: 'touch' }));
  assert.equal(harness.controller.getWidth('other'), 430);
  harness.setTimestamp(2250);
  harness.handle.dispatch('pointerdown', pointer(11, 370, { pointerType: 'touch' }));
  const secondTap = harness.handle.dispatch('pointerup', pointer(11, 370, { pointerType: 'touch' }));
  assert.equal(secondTap.defaultPrevented, true);
  assert.equal(harness.controller.getWidth('other'), 360);
  assert.deepEqual(harness.storageWrites, [['teachhelper:sidebar-width:other', '360']]);
  assert.deepEqual(harness.widthChanges, [['other', 360]]);
  harness.controller.dispose();
});

test('synchronizes storage and handle position through resize events and observers', () => {
  const harness = createHarness();
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-left'), '353px');
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-top'), '24px');
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-height'), '520px');
  assert.deepEqual(harness.observers[0].targets, [harness.app, harness.sidebar]);

  harness.view.dispatch('storage', {
    key: 'teachhelper:sidebar-width:other',
    newValue: '900.2',
  });
  assert.equal(harness.controller.getWidth('other'), 900);
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '900px');
  harness.view.dispatch('storage', {
    key: 'teachhelper:sidebar-width:other',
    newValue: '159',
  });
  assert.equal(harness.controller.getWidth('other'), 900);
  harness.view.dispatch('storage', {
    key: 'teachhelper:sidebar-width:planning',
    newValue: '238',
  });
  assert.equal(harness.controller.getWidth('planning'), 238);
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '900px');
  assert.deepEqual(harness.widthChanges, []);

  harness.sidebar.bounds = { left: 10, right: 410, top: 30, height: 480 };
  harness.view.dispatch('resize');
  harness.observers[0].trigger();
  assert.equal(harness.view.frames.size, 2);
  harness.view.flushFrames();
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-left'), '393px');
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-top'), '30px');
  assert.equal(harness.handle.style.getPropertyValue('--sidebar-resize-height'), '480px');
  harness.controller.dispose();
});

test('dispose removes listeners, observers and frames and cancels an active drag', () => {
  const harness = createHarness();
  harness.handle.dispatch('pointerdown', pointer(9, 370));
  harness.handle.dispatch('pointermove', pointer(9, 470));
  harness.view.dispatch('resize');
  assert.equal(harness.view.frames.size, 1);
  harness.controller.dispose();
  harness.controller.dispose();

  assert.equal(harness.app.classList.contains('is-sidebar-resizing'), false);
  assert.equal(harness.app.style.getPropertyValue('--shell-sidebar-width'), '360px');
  assert.deepEqual(harness.handle.releasedPointers, [9]);
  assert.equal(harness.observers[0].disconnected, true);
  assert.deepEqual(harness.view.cancelledFrames, [1]);
  assert.equal(harness.view.listenerCount('resize'), 0);
  assert.equal(harness.view.listenerCount('storage'), 0);
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'dblclick']) {
    assert.equal(harness.handle.listenerCount(type), 0);
  }

  harness.view.dispatch('storage', {
    key: 'teachhelper:sidebar-width:other',
    newValue: '480',
  });
  harness.handle.dispatch('dblclick');
  assert.equal(harness.controller.getWidth('other'), 360);
  assert.deepEqual(harness.widthChanges, []);
});
