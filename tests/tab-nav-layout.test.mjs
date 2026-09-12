import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/shell/tab-nav-layout.js', import.meta.url), 'utf8');
const { createTabNavLayoutController } = await import(
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
      target: this,
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
    const next = force === undefined ? !this.names.has(name) : Boolean(force);
    if (next) this.names.add(name);
    else this.names.delete(name);
    return next;
  }
}

class FakeElement extends FakeEventTarget {
  constructor({ classes = [], dataset = {}, width = 0, height = 40, left = 0, top = 0 } = {}) {
    super();
    this.classList = new FakeClassList(classes);
    this.dataset = { ...dataset };
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this._offsetParent = null;
    this.hidden = false;
    this.clientWidth = width;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    this.offsetLeft = left;
    this.offsetTop = top;
    this.offsetWidth = width;
    this.offsetHeight = height;
    this.bounds = { left, top, width, height };
    this.styles = new Map();
    this.style = {
      transition: '',
      setProperty: (name, value) => this.styles.set(name, value),
      getPropertyValue: (name) => this.styles.get(name) || '',
    };
  }

  get offsetParent() {
    return this.attributes.has('data-tab-overflow') ? null : this._offsetParent;
  }

  set offsetParent(value) {
    this._offsetParent = value;
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      child.offsetParent = this;
      this.children.push(child);
    });
  }

  getBoundingClientRect() {
    return {
      ...this.bounds,
      right: this.bounds.left + this.bounds.width,
      bottom: this.bounds.top + this.bounds.height,
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  matches(selector) {
    if (selector === '[data-more-tools-target]') return Boolean(this.dataset.moreToolsTarget);
    if (selector === '[data-tab-target]') return Boolean(this.dataset.tabTarget);
    if (selector === '.tab-button.active') {
      return this.classList.contains('tab-button') && this.classList.contains('active');
    }
    return false;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      element.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(element) {
    if (element === this) return true;
    return this.children.some((child) => child.contains(element));
  }

  focus(options) {
    this.ownerDocument.activeElement = this;
    this.focusOptions = options;
  }
}

function createHarness({ available = 600, activeTab = 'grades' } = {}) {
  const documentRef = new FakeEventTarget();
  documentRef.activeElement = null;
  const view = new FakeEventTarget();
  view.innerWidth = 1200;
  view.innerHeight = 800;
  view.frames = new Map();
  view.timers = new Map();
  view.cancelledFrames = [];
  view.clearedTimers = [];
  view.nextFrameId = 0;
  view.nextTimerId = 0;
  view.requestAnimationFrame = (callback) => {
    const id = ++view.nextFrameId;
    view.frames.set(id, callback);
    return id;
  };
  view.cancelAnimationFrame = (id) => {
    view.frames.delete(id);
    view.cancelledFrames.push(id);
  };
  view.setTimeout = (callback, delay) => {
    const id = ++view.nextTimerId;
    view.timers.set(id, { callback, delay });
    return id;
  };
  view.clearTimeout = (id) => {
    view.timers.delete(id);
    view.clearedTimers.push(id);
  };
  view.flushFrames = () => {
    let count = 0;
    while (view.frames.size) {
      const frames = [...view.frames.values()];
      view.frames.clear();
      frames.forEach((callback) => callback());
      count += frames.length;
      if (count > 100) throw new Error('frame loop');
    }
  };
  view.flushTimers = () => {
    const timers = [...view.timers.values()];
    view.timers.clear();
    timers.forEach(({ callback }) => callback());
  };
  view.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', columnGap: '8' });
  const visualViewport = new FakeEventTarget();
  visualViewport.width = 1200;
  visualViewport.height = 800;
  view.visualViewport = visualViewport;
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
  const assignDocument = (element) => {
    element.ownerDocument = documentRef;
    element.children.forEach(assignDocument);
  };
  const app = new FakeElement();
  const tabNav = new FakeElement({ width: available, height: 48 });
  tabNav.clientWidth = available;
  const tabIndicator = new FakeElement({ classes: ['tab-indicator'] });
  const moreTools = new FakeElement({ classes: ['more-tools'], width: 120 });
  const moreToolsTrigger = new FakeElement({
    classes: ['tab-button', 'more-tools-trigger'],
    width: 120,
    left: 300,
  });
  const moreToolsMenu = new FakeElement({ classes: ['more-tools-menu'] });
  moreToolsMenu.hidden = true;
  moreTools.append(moreToolsTrigger, moreToolsMenu);
  moreToolsTrigger.offsetParent = tabNav;
  const definitions = [
    { target: '', width: 34 },
    { target: 'grades', width: 100 },
    { target: 'planning', width: 100 },
    { target: 'groups', width: 100 },
    { target: 'merger', width: 100 },
    { target: 'qr', width: 100 },
  ];
  let left = 0;
  const tabs = definitions.map(({ target, width }) => {
    const tab = new FakeElement({
      classes: target ? ['tab-button'] : ['tab-unlock-button'],
      dataset: target ? { tabTarget: target } : {},
      width,
      left,
    });
    left += width + 8;
    if (target === activeTab) tab.classList.add('active');
    return tab;
  });
  ['groups', 'merger', 'qr'].forEach((target) => {
    moreToolsMenu.append(new FakeElement({ dataset: { moreToolsTarget: target }, width: 100 }));
  });
  tabNav.append(...tabs, tabIndicator, moreTools);
  moreToolsTrigger.offsetParent = tabNav;
  assignDocument(app);
  assignDocument(tabNav);
  const state = { activeTab, transition: 'idle' };
  const tabRequests = [];
  const controller = createTabNavLayoutController({
    app,
    tabNav,
    tabIndicator,
    moreTools,
    moreToolsTrigger,
    moreToolsMenu,
    view,
    documentRef,
    ResizeObserverClass: FakeResizeObserver,
    HTMLElementClass: FakeElement,
    ElementClass: FakeElement,
    NodeClass: FakeElement,
    protectedTabTargets: ['grades', 'planning'],
    getActiveTab: () => state.activeTab,
    getTabTransitionState: () => state.transition,
    getIndicatorSettleDelay: () => 320,
    onTabRequest: (target) => tabRequests.push(target),
  });
  return {
    app,
    tabNav,
    tabIndicator,
    moreTools,
    moreToolsTrigger,
    moreToolsMenu,
    menuItems: moreToolsMenu.children,
    tabs,
    state,
    tabRequests,
    view,
    visualViewport,
    documentRef,
    observers,
    controller,
  };
}

function setActiveTab(harness, target) {
  harness.state.activeTab = target;
  harness.tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tabTarget === target);
  });
}

test('keeps all tabs visible when they fit and positions the active indicator', () => {
  const harness = createHarness();
  harness.view.flushFrames();
  assert.equal(harness.tabNav.classList.contains('is-tools-condensed'), false);
  assert.equal(harness.controller.isTabOverflowed('groups'), false);
  assert.equal(harness.menuItems.every((item) => item.hidden), true);
  assert.equal(harness.tabIndicator.classList.contains('is-ready'), true);
  assert.equal(harness.tabIndicator.style.getPropertyValue('--tab-indicator-x'), '42.00px');
  assert.equal(harness.tabIndicator.style.getPropertyValue('--tab-indicator-width'), '100.00px');
  harness.controller.dispose();
});

test('moves only unprotected tabs into overflow and represents an active overflow tab', () => {
  const harness = createHarness({ available: 380 });
  harness.view.flushFrames();
  assert.equal(harness.tabNav.classList.contains('is-tools-condensed'), true);
  assert.equal(harness.controller.isTabOverflowed('grades'), false);
  assert.equal(harness.controller.isTabOverflowed('planning'), false);
  assert.deepEqual(
    harness.menuItems.filter((item) => !item.hidden).map((item) => item.dataset.moreToolsTarget),
    ['groups', 'merger', 'qr'],
  );

  setActiveTab(harness, 'qr');
  harness.controller.syncAfterTabRender();
  harness.view.flushFrames();
  assert.equal(harness.moreToolsTrigger.classList.contains('active'), true);
  assert.equal(harness.moreToolsTrigger.getAttribute('aria-selected'), 'true');
  assert.equal(harness.menuItems[2].getAttribute('aria-current'), 'page');
  assert.equal(harness.tabIndicator.style.getPropertyValue('--tab-indicator-x'), '300.00px');
  assert.equal(harness.tabIndicator.style.getPropertyValue('--tab-indicator-width'), '120.00px');
  harness.controller.dispose();
});

test('reassigns overflow after observer and viewport resize reactions', () => {
  const harness = createHarness({ available: 380 });
  harness.view.flushFrames();
  harness.tabNav.clientWidth = 600;
  harness.observers[0].trigger();
  harness.view.flushFrames();
  assert.equal(harness.tabNav.classList.contains('is-tools-condensed'), false);

  harness.tabNav.clientWidth = 380;
  harness.view.innerWidth = 1000;
  harness.view.dispatch('resize');
  assert.equal(harness.tabNav.classList.contains('is-tools-condensed'), true);
  assert.equal(harness.app.classList.contains('is-viewport-resizing'), true);
  assert.equal([...harness.view.timers.values()][0].delay, 160);
  harness.view.flushTimers();
  assert.equal(harness.app.classList.contains('is-viewport-resizing'), false);

  harness.tabNav.clientWidth = 600;
  harness.visualViewport.dispatch('resize');
  harness.view.flushFrames();
  assert.equal(harness.tabNav.classList.contains('is-tools-condensed'), false);
  harness.controller.dispose();
});

test('opens, dismisses and keyboard-navigates the More Tools menu', () => {
  const harness = createHarness({ available: 380 });
  harness.view.flushFrames();
  harness.moreToolsTrigger.dispatch('click');
  assert.equal(harness.moreToolsMenu.hidden, false);
  assert.equal(harness.moreToolsTrigger.getAttribute('aria-expanded'), 'true');

  const openEvent = harness.moreToolsTrigger.dispatch('keydown', { key: 'ArrowDown' });
  harness.view.flushFrames();
  assert.equal(openEvent.defaultPrevented, true);
  assert.equal(harness.documentRef.activeElement, harness.menuItems[0]);
  harness.moreToolsMenu.dispatch('keydown', { key: 'ArrowDown', target: harness.menuItems[0] });
  assert.equal(harness.documentRef.activeElement, harness.menuItems[1]);
  harness.moreToolsMenu.dispatch('keydown', { key: 'End', target: harness.menuItems[1] });
  assert.equal(harness.documentRef.activeElement, harness.menuItems[2]);
  harness.moreToolsMenu.dispatch('keydown', { key: 'Home', target: harness.menuItems[2] });
  assert.equal(harness.documentRef.activeElement, harness.menuItems[0]);
  harness.moreToolsMenu.dispatch('keydown', { key: 'ArrowUp', target: harness.menuItems[0] });
  assert.equal(harness.documentRef.activeElement, harness.menuItems[2]);

  harness.moreToolsMenu.dispatch('keydown', { key: 'Escape', target: harness.menuItems[2] });
  assert.equal(harness.moreToolsMenu.hidden, true);
  assert.equal(harness.documentRef.activeElement, harness.moreToolsTrigger);
  harness.moreToolsTrigger.dispatch('click');
  harness.documentRef.dispatch('pointerdown', { target: new FakeElement() });
  assert.equal(harness.moreToolsMenu.hidden, true);
  harness.controller.dispose();
});

test('requests activation through the injected callback and closes the menu', () => {
  const harness = createHarness({ available: 380 });
  harness.view.flushFrames();
  harness.moreToolsTrigger.dispatch('click');
  const click = harness.moreToolsMenu.dispatch('click', { target: harness.menuItems[1] });
  assert.equal(click.defaultPrevented, false);
  assert.deepEqual(harness.tabRequests, ['merger']);
  assert.equal(harness.moreToolsMenu.hidden, true);
  assert.equal(harness.moreToolsTrigger.getAttribute('aria-expanded'), 'false');
  harness.controller.dispose();
});

test('moves focus to the trigger when a focused tab enters overflow', () => {
  const harness = createHarness();
  harness.view.flushFrames();
  const qr = harness.tabs.find((tab) => tab.dataset.tabTarget === 'qr');
  qr.focus();
  harness.tabNav.clientWidth = 380;
  harness.controller.queueLayoutSync({ immediate: true });
  assert.equal(harness.documentRef.activeElement, harness.moreToolsTrigger);
  assert.deepEqual(harness.moreToolsTrigger.focusOptions, { preventScroll: true });
  harness.controller.dispose();
});

test('dispose removes all listeners, observers, frames and timers idempotently', () => {
  const harness = createHarness({ available: 380 });
  harness.view.flushFrames();
  harness.moreToolsTrigger.dispatch('keydown', { key: 'ArrowDown' });
  harness.tabNav.clientWidth = 600;
  harness.observers[0].trigger();
  harness.view.innerWidth = 900;
  harness.view.dispatch('resize');
  assert.ok(harness.view.frames.size > 0);
  assert.ok(harness.view.timers.size > 0);
  harness.controller.dispose();
  harness.controller.dispose();

  assert.equal(harness.moreToolsMenu.hidden, true);
  assert.equal(harness.app.classList.contains('is-viewport-resizing'), false);
  assert.equal(harness.observers[0].disconnected, true);
  assert.equal(harness.view.frames.size, 0);
  assert.equal(harness.view.timers.size, 0);
  assert.equal(harness.view.listenerCount('resize'), 0);
  assert.equal(harness.visualViewport.listenerCount('resize'), 0);
  assert.equal(harness.documentRef.listenerCount('pointerdown'), 0);
  assert.equal(harness.documentRef.listenerCount('keydown'), 0);
  assert.equal(harness.documentRef.listenerCount('fullscreenchange'), 0);
  assert.equal(harness.documentRef.listenerCount('webkitfullscreenchange'), 0);
  assert.equal(harness.moreToolsTrigger.listenerCount('click'), 0);
  assert.equal(harness.moreToolsTrigger.listenerCount('keydown'), 0);
  assert.equal(harness.moreToolsMenu.listenerCount('click'), 0);
  assert.equal(harness.moreToolsMenu.listenerCount('keydown'), 0);

  harness.moreToolsTrigger.dispatch('click');
  harness.documentRef.dispatch('keydown', { key: 'Escape' });
  assert.equal(harness.moreToolsMenu.hidden, true);
});
