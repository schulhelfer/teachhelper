import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('tutorial demo frames replace live frame getters, ignore stale loads and restore the original UI', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createAppTutorialController } = await import('/src/app/app-tutorial-controller.js');
    const { createModuleFrame } = await import('/src/shared/module-frame-bridge.js');
    const { TAB_PLANNING, TAB_GRADES, TAB_SEATPLAN } = await import('/src/shell/tabs.js');
    const button = document.createElement('button');
    button.title = 'Original';
    const els = { sidebarManualSaveBtn: button };
    const configurations = [
      [TAB_PLANNING, 'planningHost', 'getPlanningFrame', 'planning'],
      [TAB_GRADES, 'gradesHost', 'getGradesFrame', 'grades'],
      [TAB_SEATPLAN, 'seatplanMainHost', 'getSeatplanFrame', 'seatplan'],
    ];
    configurations.forEach(([, hostKey]) => {
      const host = document.createElement('div');
      const realFrame = createModuleFrame({ src: '/?real-module' });
      realFrame.style.display = 'block';
      host.append(realFrame);
      document.body.append(host);
      els[hostKey] = host;
    });
    const listeners = [];
    let bridge = null;
    const ensuredTabs = [];
    const controller = createAppTutorialController({
      view: window,
      els,
      getBridgeController: () => bridge,
      bindRuntime(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        listeners.push(() => target.removeEventListener(type, listener, options));
      },
    });
    controller.initializeCatalog();
    bridge = { ensureTabInitialized: (tab) => ensuredTabs.push(tab) };
    const outcomes = configurations.map(([tab, hostKey, getter, module]) => {
      const realFrame = controller.frames[getter]();
      button.disabled = tab === TAB_GRADES;
      const initialDisabled = button.disabled;
      const first = controller.getDefinition({ activeTab: tab }).demo.activate();
      const staleFrame = controller.frames[getter]();
      const staleMessages = [];
      staleFrame.contentWindow.postMessage = (message) => staleMessages.push(message);
      first.steps.find((step) => step.beforeRender)?.beforeRender();
      first.cleanup();
      const second = controller.getDefinition({ activeTab: tab }).demo.activate();
      const demoFrame = controller.frames[getter]();
      const messages = [];
      demoFrame.contentWindow.postMessage = (message) => messages.push(message);
      const replaced = demoFrame !== realFrame && realFrame.hidden && realFrame.style.display === 'none';
      second.steps.find((step) => step.beforeRender)?.beforeRender();
      const beforeLoad = messages.length;
      staleFrame.dispatchEvent(new Event('load'));
      demoFrame.dispatchEvent(new Event('load'));
      const afterLoad = messages.filter((message) => message.detail?.command === 'showSurface').length;
      const demoUrl = new URL(demoFrame.src);
      second.cleanup();
      return {
        replaced,
        path: demoUrl.pathname,
        module: demoUrl.searchParams.get('tutorial-demo'),
        expectedModule: module,
        beforeLoad,
        afterLoad,
        staleShowCommands: staleMessages.filter((message) => message.detail?.command === 'showSurface').length,
        restored: controller.frames[getter]() === realFrame && !realFrame.hidden && realFrame.style.display === 'block',
        demoCount: els[hostKey].querySelectorAll('.tutorial-demo-frame').length,
        saveRestored: button.disabled === initialDisabled && button.title === 'Original',
      };
    });
    listeners.reverse().forEach((remove) => remove());
    return { outcomes, ensuredTabs, seatplanTab: TAB_SEATPLAN };
  });
  for (const outcome of result.outcomes) {
    assert.equal(outcome.replaced, true);
    assert.equal(outcome.path, `/src/modules/${outcome.expectedModule}/app.html`);
    assert.equal(outcome.module, outcome.expectedModule);
    assert.equal(outcome.beforeLoad, 0);
    assert.equal(outcome.afterLoad, outcome.expectedModule === 'seatplan' ? 0 : 1);
    assert.equal(outcome.staleShowCommands, 0);
    assert.equal(outcome.restored, true);
    assert.equal(outcome.demoCount, 0);
    assert.equal(outcome.saveRestored, true);
  }
  assert.deepEqual(result.ensuredTabs, [result.seatplanTab, result.seatplanTab]);
});

test('classroom tutorial cleanup waits for the live picker and restores the shared roster', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createAppTutorialController } = await import('/src/app/app-tutorial-controller.js');
    const { createClassroomState } = await import('/src/app/classroom-state.js');
    const { TAB_GROUPS } = await import('/src/shell/tabs.js');
    let classroom = null;
    let groups = null;
    let picker = null;
    const pending = [];
    const file = document.createElement('input');
    const controller = createAppTutorialController({
      view: window,
      els: { file },
      getClassroomState: () => classroom,
      getGroupsController: () => groups,
      getRandomPickerController: () => picker,
      setRuntimeTimeout: (callback) => pending.push(callback),
      updateCsvStatusDisplay() {},
      renderRandomPicker() {},
    });
    controller.initializeCatalog();
    classroom = createClassroomState({
      documentBus: new EventTarget(),
      initialState: { students: [{ id: '01', first: 'Original', last: 'Name' }], csvName: 'Original' },
    });
    const previousClassroom = structuredClone(classroom.getState());
    const previousRoster = structuredClone(classroom.rosterStore.getState());
    const previousGroups = { seats: { '1-1': ['01'] } };
    let groupState = previousGroups;
    let spinning = true;
    groups = {
      getStateSnapshot: () => groupState,
      replaceState: (state) => { groupState = state; },
      render() {},
      isSuggesting: () => false,
    };
    picker = { isSpinning: () => spinning };
    const demo = controller.getDefinition({ activeTab: TAB_GROUPS }).demo.activate();
    demo.cleanup();
    const waiting = classroom.isDemoActive() && file.disabled && pending.length === 1;
    spinning = false;
    pending.shift()();
    const outcome = {
      waiting,
      demoActive: classroom.isDemoActive(),
      fileDisabled: file.disabled,
      groupsRestored: groupState === previousGroups,
      classroomRestored: JSON.stringify(classroom.getState()) === JSON.stringify(previousClassroom),
      rosterRestored: JSON.stringify(classroom.rosterStore.getState()) === JSON.stringify(previousRoster),
    };
    classroom.dispose();
    return outcome;
  });
  assert.deepEqual(result, {
    waiting: true, demoActive: false, fileDisabled: false,
    groupsRestored: true, classroomRestored: true, rosterRestored: true,
  });
});

test('real runtime preserves BFCache listeners and cancels its pending update hint on disposal', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await fetch('/index.html').then((response) => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    sessionStorage.setItem('teachhelper:update-applied-hint', '1');
    const scheduledHints = [];
    const cleared = [];
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    window.setTimeout = (callback, delay, ...args) => {
      const id = originalSetTimeout.call(window, callback, delay, ...args);
      if (delay === 8000) scheduledHints.push(id);
      return id;
    };
    window.clearTimeout = (id) => {
      cleared.push(id);
      originalClearTimeout.call(window, id);
    };
    const { createAppRuntime } = await import('/src/app/app-runtime.js');
    const runtime = createAppRuntime({ appVersion: 'regression' });
    const started = runtime.start();
    const secondStart = runtime.start();
    const hint = document.getElementById('app-header-version').dataset.updateHint;
    const contextMenuPrevented = () => {
      const event = new Event('contextmenu', { cancelable: true, bubbles: true });
      document.getElementById('app').dispatchEvent(event);
      return event.defaultPrevented;
    };
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const preserved = contextMenuPrevented() && !scheduledHints.some((id) => cleared.includes(id));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    const removed = !contextMenuPrevented();
    runtime.dispose();
    const outcome = {
      started, secondStart, hint, preserved, removed,
      hintTimerCount: scheduledHints.length,
      hintTimersCleared: scheduledHints.every((id) => cleared.includes(id)),
      restart: runtime.start(),
      frozen: Object.isFrozen(runtime),
    };
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    return outcome;
  });
  assert.deepEqual(result, {
    started: true, secondStart: false, hint: 'Aktualisiert', preserved: true, removed: true,
    hintTimerCount: 1, hintTimersCleared: true, restart: false, frozen: true,
  });
});
