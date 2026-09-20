import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('iframe controllers preserve pending messages, layouts and disposal across load', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const modules = await Promise.all(['planning', 'grades', 'merger', 'duplicate-check', 'qr', 'seatplan', 'name-learning']
      .map((id) => import(`/src/modules/${id}/index.js`)));
    const outcomes = [];
    for (const [index, module] of modules.entries()) {
      const host = document.createElement('div');
      const sideHost = document.createElement('div');
      const dialogHost = document.createElement('div');
      document.body.append(host, sideHost, dialogHost);
      let manualLoad = false;
      host.addEventListener('load', (event) => {
        if (!manualLoad) event.stopImmediatePropagation();
      }, true);
      const append = (frame) => {
        frame.removeAttribute('sandbox');
        frame.src = 'about:blank';
        return Element.prototype.appendChild.call(host, frame);
      };
      host.appendChild = append;
      host.append = append;
      const mount = Object.values(module)[0];
      const options = { host, mainHost: host, sideHost, dialogHost, bus: document };
      const controller = mount(options);
      const frame = controller.frame;
      const messages = [];
      frame.contentWindow.postMessage = (payload) => messages.push(payload);
      const repeatedMount = mount(options) === controller;
      const post = index < 2
        ? (value) => controller.post('test:pending', { value })
        : index === 2
          ? (value) => controller.selectTool(value === 1 ? 'merge' : 'split')
          : index === 5
            ? (value) => controller.sendCourseContext({ value })
            : (value) => controller.post({ type: 'test:pending', detail: { value } });
      const firstReturn = post(1);
      post(2);
      controller.applyShellLayout({ collapsed: false });
      controller.applyShellLayout({ collapsed: true });
      const beforeLoad = messages.length;
      manualLoad = true;
      frame.dispatchEvent(new Event('load'));
      const loadedMessages = messages.map(({ type, detail }) => ({ type, detail }));
      post(3);
      const afterPost = messages.length;
      controller.dispose();
      controller.dispose();
      frame.dispatchEvent(new Event('load'));
      post(4);
      controller.applyShellLayout({ collapsed: false });
      outcomes.push({
        repeatedMount,
        firstReturn: firstReturn === undefined ? 'undefined' : firstReturn,
        beforeLoad,
        loadedMessages,
        afterPost,
        afterDispose: messages.length,
        removed: !frame.isConnected && !host.dataset.initialized,
      });
      host.remove();
      sideHost.remove();
      dialogHost.remove();
    }
    return outcomes;
  });
  for (const [index, outcome] of result.entries()) {
    assert.equal(outcome.repeatedMount, true);
    assert.equal(outcome.beforeLoad, 0);
    assert.equal(outcome.removed, true);
    assert.equal(outcome.afterPost, outcome.loadedMessages.length + 1);
    assert.equal(outcome.afterDispose, outcome.afterPost);
    assert.equal(outcome.firstReturn, [0, 2, 5].includes(index) ? 'undefined' : true);
    const layouts = outcome.loadedMessages.filter(({ type }) => type.endsWith('shell-layout'));
    assert.deepEqual(layouts.map(({ detail }) => detail), [{ collapsed: true }]);
    const pending = outcome.loadedMessages.filter(({ type }) => !type.endsWith('shell-layout'));
    assert.deepEqual(pending.map(({ detail }) => detail), index === 2
      ? [{ tool: 'split' }]
      : index === 5 ? [{ value: 2 }] : [{ value: 1 }, { value: 2 }]);
  }
});

test('registry teardown releases all real controllers and workspace message sources', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createPlanningSeatplanBridge } = await import('/src/app/planning-seatplan-bridge.js');
    const { createModuleRegistry } = await import('/src/app/module-registry.js');
    const { createIframeModuleAdapters } = await import('/src/app/iframe-module-adapters.js');
    const { createAppTutorialController } = await import('/src/app/app-tutorial-controller.js');
    const { installWorkspaceController } = await import('/src/modules/workspace/index.js');
    const owner = installWorkspaceController(window, { ephemeral: true });
    const sources = new Set();
    const register = owner.registerMessageSource.bind(owner);
    owner.registerMessageSource = (source, scope) => {
      sources.add(source);
      const unregister = register(source, scope);
      return () => { sources.delete(source); unregister(); };
    };
    const els = {};
    for (const name of ['planningHost', 'gradesHost', 'mergerHost', 'duplicateCheckHost', 'qrHost',
      'seatplanMainHost', 'seatplanSideHost', 'seatplanDialogHost', 'nameLearningHost']) {
      els[name] = document.createElement('div');
      document.body.append(els[name]);
    }
    const bridge = createPlanningSeatplanBridge({ els, getChromeCollapsed: () => false, documentBus: document });
    const tutorials = createAppTutorialController({ view: window, els, getBridgeController: () => bridge });
    const registry = createModuleRegistry(createIframeModuleAdapters({ frames: tutorials.frames, els,
      getBridgeController: () => bridge }));
    for (const adapter of registry.list()) {
      adapter.ensureInitialized();
      adapter.ensureInitialized();
    }
    const frames = registry.list().map((adapter) => adapter.getFrame());
    const mounted = frames.filter(Boolean).length;
    const registered = sources.size;
    const leave = bridge.requestGradesTabLeaveConfirmation();
    bridge.dispose();
    registry.dispose();
    registry.dispose();
    const removed = frames.every((frame) => !frame.isConnected);
    const cleared = Object.values(els).every((host) => !host.dataset.initialized);
    for (const frame of frames) frame.dispatchEvent(new Event('load'));
    window.dispatchEvent(new CustomEvent('classroom:planning-ready'));
    window.dispatchEvent(new CustomEvent('classroom:grades-ready'));
    for (const adapter of registry.list()) adapter.ensureInitialized();
    const outcome = {
      mounted, registered, removed, cleared,
      sourcesRemaining: sources.size,
      framesRemaining: document.querySelectorAll('iframe').length,
      leaveAllowed: await leave,
    };
    owner.dispose();
    return outcome;
  });
  assert.deepEqual(result, {
    mounted: 7, registered: 2, removed: true, cleared: true,
    sourcesRemaining: 0, framesRemaining: 0, leaveAllowed: false,
  });
});

test('iframe shell bindings stop camera tracks on tab departure and runtime cleanup', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createIframeModuleShellBindings } = await import('/src/app/iframe-module-shell-bindings.js');
    const appEl = document.createElement('div');
    appEl.className = 'app-tab-qr';
    document.body.append(appEl);
    const cleanups = [];
    const states = [];
    let stopped = 0;
    let opened = 0;
    window.jsQR = () => null;
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      opened += 1;
      const stream = new MediaStream();
      stream.getTracks = () => [{ stop: () => { stopped += 1; } }];
      return stream;
    } });
    const bindings = createIframeModuleShellBindings({
      documentRef: document,
      view: window,
      appEl,
      moduleRegistry: { get: () => ({
        getFrame: () => ({ parentElement: appEl }),
        postMessage: (payload) => states.push(payload.detail),
      }) },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
      bindRuntime(target, type, listener) {
        target.addEventListener(type, listener);
        cleanups.push(() => target.removeEventListener(type, listener));
      },
    });
    bindings.bindMessages();
    const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
    bindings.handlers.onQrCameraRequest({ action: 'start' });
    await settle();
    const active = states.some((state) => state.active === true);
    appEl.className = 'app-tab-planning';
    await settle();
    const stoppedOnDeparture = stopped;
    const inactive = states.at(-1).active === false;
    const overlayRemoved = !appEl.querySelector('.qr-camera-overlay');
    bindings.handlers.onQrCameraRequest({ action: 'start' });
    await settle();
    const ignoredWhileInactive = opened === 1;
    appEl.className = 'app-tab-qr';
    bindings.handlers.onQrCameraRequest({ action: 'start' });
    await settle();
    cleanups.reverse().forEach((cleanup) => cleanup());
    return { active, stoppedOnDeparture, inactive, overlayRemoved, ignoredWhileInactive,
      opened, stopped, finalOverlayRemoved: !appEl.querySelector('.qr-camera-overlay') };
  });
  assert.deepEqual(result, { active: true, stoppedOnDeparture: 1, inactive: true,
    overlayRemoved: true, ignoredWhileInactive: true, opened: 2, stopped: 2, finalOverlayRemoved: true });
});
