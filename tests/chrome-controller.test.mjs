import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/shell/chrome-controller.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createChromeController } = await import(moduleUrl);

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, detail = {}) {
    const event = { type, key: '', ...detail };
    [...(this.listeners.get(type) || [])].forEach((listener) => listener(event));
    return event;
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(documentRef) {
    super();
    this.documentRef = documentRef;
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.inert = false;
    this.innerHTML = '';
    this.focusOptions = null;
  }

  append(child) {
    this.children.push(child);
  }

  contains(target) {
    return target === this || this.children.some((child) => child.contains(target));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus(options) {
    this.focusOptions = options;
    this.documentRef.activeElement = this;
  }

  blur() {
    if (this.documentRef.activeElement === this) this.documentRef.activeElement = null;
  }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.activeElement = null;
    this.documentElement = {};
    this.dialogOpen = false;
  }

  querySelector(selector) {
    return selector === 'dialog[open]' && this.dialogOpen ? {} : null;
  }
}

function createHarness(options = {}) {
  const documentRef = new FakeDocument();
  const app = new FakeElement(documentRef);
  const header = new FakeElement(documentRef);
  const tabNav = new FakeElement(documentRef);
  const sidebar = new FakeElement(documentRef);
  const sidebarFooter = new FakeElement(documentRef);
  const tutorialStart = new FakeElement(documentRef);
  const headerToggle = new FakeElement(documentRef);
  const overlayToggle = new FakeElement(documentRef);
  header.append(headerToggle);
  sidebarFooter.append(tutorialStart);
  const frames = new Map();
  const timers = new Map();
  const cancelledFrames = [];
  const clearedTimers = [];
  const calls = [];
  let nextId = 1;

  const controller = createChromeController({
    app,
    header,
    tabNav,
    sidebar,
    headerToggle,
    overlayToggle,
    documentRef,
    ElementClass: FakeElement,
    additionalCollapseFocusContainers: [sidebarFooter],
    additionalCollapseFocusTargets: [tutorialStart],
    initialCollapsed: options.initialCollapsed,
    isIOSDevice: options.isIOSDevice,
    requestAnimationFrame: (callback) => {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    setTimeout: (callback, delay) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => {
      clearedTimers.push(id);
      timers.delete(id);
    },
    matchMedia: () => ({ matches: Boolean(options.reducedMotion) }),
    getComputedStyle: () => ({
      getPropertyValue: (name) => ({
        '--chrome-transition-duration': '180ms',
        '--chrome-transition-duration-medium': '0.24s',
        '--chrome-transition-duration-short': '90ms',
      })[name] || '',
    }),
    onResetSidebarWidth: () => calls.push('reset-sidebar'),
    onCloseNavigationMenu: () => calls.push('close-menu'),
    onQueueNavigationLayoutSync: () => calls.push('queue-nav'),
    onQueueSettledIndicatorUpdate: () => calls.push('settle-indicator'),
    onTutorialEntryVisibilityChange: (visible) => calls.push(`tutorial:${visible}`),
    onRefreshLayouts: () => calls.push('refresh'),
    onRenderManualSaveControl: () => calls.push('manual'),
    onRenderVaultControl: () => calls.push('vault'),
  });

  const flushFrame = () => {
    const entry = frames.entries().next().value;
    if (!entry) return false;
    const [id, callback] = entry;
    frames.delete(id);
    callback();
    return true;
  };
  const flushTimer = () => {
    const entry = timers.entries().next().value;
    if (!entry) return false;
    const [id, timer] = entry;
    timers.delete(id);
    timer.callback();
    return timer.delay;
  };

  return {
    controller,
    documentRef,
    app,
    header,
    tabNav,
    sidebar,
    sidebarFooter,
    tutorialStart,
    headerToggle,
    overlayToggle,
    frames,
    timers,
    cancelledFrames,
    clearedTimers,
    calls,
    flushFrame,
    flushTimer,
  };
}

test('synchronizes expanded and collapsed initial state without starting a transition', () => {
  const expanded = createHarness();
  expanded.controller.sync();
  assert.equal(expanded.controller.isCollapsed(), false);
  assert.equal(expanded.controller.getTransitionState(), 'idle');
  assert.equal(expanded.header.hidden, false);
  assert.equal(expanded.tabNav.hidden, false);
  assert.equal(expanded.sidebar.hidden, false);
  assert.equal(expanded.overlayToggle.hidden, true);
  assert.equal(expanded.overlayToggle.disabled, true);
  assert.equal(expanded.headerToggle.getAttribute('aria-pressed'), 'false');
  assert.deepEqual(expanded.calls, ['queue-nav', 'vault', 'manual']);
  assert.equal(expanded.frames.size, 0);
  assert.equal(expanded.timers.size, 0);

  const collapsed = createHarness({ initialCollapsed: true });
  collapsed.controller.sync();
  assert.equal(collapsed.controller.isCollapsed(), true);
  assert.equal(collapsed.header.hidden, true);
  assert.equal(collapsed.header.inert, true);
  assert.equal(collapsed.tabNav.getAttribute('aria-hidden'), 'true');
  assert.equal(collapsed.sidebar.getAttribute('aria-hidden'), 'true');
  assert.equal(collapsed.overlayToggle.hidden, false);
  assert.equal(collapsed.overlayToggle.disabled, false);
  assert.equal(collapsed.overlayToggle.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(collapsed.calls, ['close-menu', 'vault', 'manual']);
});

test('runs collapse and expand through the existing transition boundaries', () => {
  const harness = createHarness();
  harness.controller.setCollapsed(true);
  assert.equal(harness.controller.isCollapsed(), true);
  assert.equal(harness.controller.getTransitionState(), 'collapsing');
  assert.equal(harness.overlayToggle.hidden, false);
  assert.equal(harness.overlayToggle.disabled, false);
  assert.deepEqual(harness.calls, ['queue-nav', 'tutorial:false', 'manual']);

  harness.controller.setCollapsed(false);
  assert.equal(harness.controller.getTransitionState(), 'collapsing');
  assert.equal(harness.flushFrame(), true);
  assert.equal(harness.app.classList.contains('is-collapsing'), false);
  assert.equal(harness.flushFrame(), true);
  assert.equal(harness.app.classList.contains('is-collapsing'), true);
  assert.equal(harness.timers.size, 1);
  assert.equal(harness.flushTimer(), 280);
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.app.classList.contains('chrome-collapsed'), true);
  assert.equal(harness.header.hidden, true);
  assert.equal(harness.tabNav.hidden, true);
  assert.deepEqual(harness.calls.slice(-6), [
    'tutorial:false',
    'close-menu',
    'vault',
    'manual',
    'refresh',
    'settle-indicator',
  ]);

  const frameCount = harness.frames.size;
  harness.controller.setCollapsed(true);
  assert.equal(harness.frames.size, frameCount);
  assert.equal(harness.controller.getTransitionState(), 'idle');

  harness.controller.setCollapsed(false);
  assert.equal(harness.calls.filter((call) => call === 'reset-sidebar').length, 1);
  assert.equal(harness.controller.getTransitionState(), 'expanding');
  harness.flushFrame();
  harness.flushFrame();
  harness.flushTimer();
  assert.equal(harness.controller.isCollapsed(), false);
  assert.equal(harness.controller.getTransitionState(), 'idle');
  assert.equal(harness.app.classList.contains('chrome-collapsed'), false);
  assert.equal(harness.app.classList.contains('is-chrome-layout-settling'), true);
  harness.flushFrame();
  assert.equal(harness.app.classList.contains('is-chrome-layout-settling'), false);
});

test('uses reduced motion and the single iOS frame without changing the default duration', () => {
  const desktop = createHarness();
  assert.equal(desktop.controller.getTransitionDuration(), 280);
  desktop.controller.setCollapsed(true);
  assert.equal(desktop.frames.size, 1);
  desktop.flushFrame();
  assert.equal(desktop.frames.size, 1);

  const ios = createHarness({ isIOSDevice: true, reducedMotion: true });
  assert.equal(ios.controller.getTransitionDuration(), 1);
  ios.controller.setCollapsed(true);
  assert.equal(ios.frames.size, 1);
  ios.flushFrame();
  assert.equal(ios.app.classList.contains('is-collapsing'), true);
  assert.equal(ios.frames.size, 0);
  assert.equal(ios.flushTimer(), 1);

  const fallback = createChromeController();
  assert.equal(fallback.getTransitionDuration(), 320);
});

test('moves focus out of hidden chrome and back from the overlay', () => {
  const harness = createHarness();
  harness.headerToggle.focus();
  harness.controller.setCollapsed(true);
  harness.flushFrame();
  harness.flushFrame();
  harness.flushTimer();
  assert.equal(harness.documentRef.activeElement, harness.overlayToggle);
  assert.deepEqual(harness.overlayToggle.focusOptions, { preventScroll: true });

  harness.controller.setCollapsed(false, { resetSidebarWidth: false });
  harness.flushFrame();
  harness.flushFrame();
  harness.flushTimer();
  assert.equal(harness.documentRef.activeElement, harness.headerToggle);
  assert.deepEqual(harness.headerToggle.focusOptions, { preventScroll: true });
  assert.equal(harness.calls.includes('reset-sidebar'), false);
  harness.flushFrame();

  harness.tutorialStart.focus();
  harness.controller.setCollapsed(true);
  harness.flushFrame();
  harness.flushFrame();
  harness.flushTimer();
  assert.equal(harness.documentRef.activeElement, harness.overlayToggle);
});

test('handles toggle controls and Escape only when no dialog or transition blocks it', () => {
  const harness = createHarness({ initialCollapsed: true });
  assert.equal(harness.headerToggle.listenerCount('click'), 1);
  assert.equal(harness.overlayToggle.listenerCount('click'), 1);
  assert.equal(harness.documentRef.listenerCount('keydown'), 1);

  harness.documentRef.dialogOpen = true;
  harness.documentRef.dispatch('keydown', { key: 'Escape' });
  assert.equal(harness.controller.getTransitionState(), 'idle');
  harness.documentRef.dialogOpen = false;
  harness.documentRef.dispatch('keydown', { key: 'Escape' });
  assert.equal(harness.controller.getTransitionState(), 'expanding');
  harness.overlayToggle.dispatch('click');
  assert.equal(harness.controller.getTransitionState(), 'expanding');
  harness.flushFrame();
  harness.flushFrame();
  harness.flushTimer();
  harness.headerToggle.dispatch('click');
  assert.equal(harness.controller.getTransitionState(), 'collapsing');
});

test('disposes listeners and pending work idempotently', () => {
  const harness = createHarness();
  harness.controller.setCollapsed(true);
  harness.flushFrame();
  harness.flushFrame();
  assert.equal(harness.timers.size, 1);
  assert.equal(harness.app.classList.contains('is-collapsing'), true);
  harness.controller.dispose();
  harness.controller.dispose();
  assert.equal(harness.headerToggle.listenerCount('click'), 0);
  assert.equal(harness.overlayToggle.listenerCount('click'), 0);
  assert.equal(harness.documentRef.listenerCount('keydown'), 0);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.clearedTimers.length, 1);
  assert.equal(harness.app.classList.contains('is-collapsing'), false);
  const collapsed = harness.controller.isCollapsed();
  harness.headerToggle.dispatch('click');
  harness.documentRef.dispatch('keydown', { key: 'Escape' });
  harness.controller.setCollapsed(false);
  assert.equal(harness.controller.isCollapsed(), collapsed);

  const pendingFrame = createHarness();
  pendingFrame.controller.setCollapsed(true);
  assert.equal(pendingFrame.frames.size, 1);
  pendingFrame.controller.dispose();
  assert.equal(pendingFrame.frames.size, 0);
  assert.equal(pendingFrame.cancelledFrames.length, 1);
});
