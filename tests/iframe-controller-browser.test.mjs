import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('name learning preloads its hidden unlock provider without opening a password dialog', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { installWorkspaceController } = await import('/src/modules/workspace/index.js');
    const { createPlanningSeatplanBridge } = await import('/src/app/planning-seatplan-bridge.js');
    const owner = installWorkspaceController(window, { ephemeral: true });
    const store = owner.getStore();
    const runtime = owner.getOwner();
    store.setSetting('showGradeStudentPortraits', true);
    store.setSetting('showNameLearningModule', true);
    await runtime.setupGradeVault('sicheres-test-passwort');
    runtime.persistence.commitPersistedVaultContainer((await runtime.buildContainer('seed')).bytes);
    runtime.courseRepository.completeSave();
    await runtime.lockGradeVaultSession();
    runtime.manualLoaded = true;
    runtime.fileHandle = { name: 'test.json' };
    runtime.backupDirectoryHandle = { name: 'backup' };
    const els = { gradesHost: document.createElement('div'), nameLearningHost: document.createElement('div') };
    els.gradesHost.hidden = true;
    document.body.append(...Object.values(els));
    const overlays = [];
    const onOverlay = (event) => {
      overlays.push(event.detail);
      els.gradesHost.hidden = !event.detail.open;
    };
    window.addEventListener('classroom:grades-grade-vault-overlay', onOverlay);
    const bridge = createPlanningSeatplanBridge({ els, getChromeCollapsed: () => false });
    const frame = els.gradesHost.querySelector('iframe');
    await new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
    const app = frame.contentWindow.__teachhelperGradesApp?.frame;
    if (!app) throw new Error(frame.contentDocument.body.dataset.initializationError || 'Grades app did not start');
    const before = {
      loading: frame.loading,
      hidden: els.gradesHost.hidden,
      locked: !runtime.isGradeVaultUnlocked(),
      dialogOpen: app.refs.gradeVaultDialog.open,
      overlays: overlays.length,
      nameLearningMounted: Boolean(els.nameLearningHost.querySelector('iframe')),
    };
    const opened = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Name learning unlock prompt did not open')), 5000);
      window.addEventListener('classroom:grades-grade-vault-overlay', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    bridge.ensureTabInitialized('name-learning');
    document.dispatchEvent(new CustomEvent('classroom:name-learning-data-request', {
      detail: { requestId: 'name-learning-open' },
    }));
    await opened;
    const after = {
      sameFrame: frame === els.gradesHost.querySelector('iframe'),
      visible: !els.gradesHost.hidden,
      dialogOpen: app.refs.gradeVaultDialog.open,
      mode: app.pendingGradeVaultDialogMode,
      continuation: app.pendingGradeVaultContinuation.type,
      nameLearningLoading: els.nameLearningHost.querySelector('iframe').loading,
    };
    bridge.dispose();
    bridge.disposeModule('name-learning');
    bridge.disposeModule('grades');
    window.removeEventListener('classroom:grades-grade-vault-overlay', onOverlay);
    owner.dispose();
    return { before, after };
  });
  assert.deepEqual(result.before, { loading: 'eager', hidden: true, locked: true,
    dialogOpen: false, overlays: 0, nameLearningMounted: false });
  assert.deepEqual(result.after, { sameFrame: true, visible: true, dialogOpen: true,
    mode: 'unlock', continuation: 'name-learning-data', nameLearningLoading: 'eager' });
});

test('iframe controllers preserve pending messages, layouts and disposal across load', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const modules = await Promise.all(['planning', 'grades', 'duplicate-check', 'qr', 'seatplan', 'name-learning']
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
        : index === 4
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
    assert.equal(outcome.firstReturn, [0, 4].includes(index) ? 'undefined' : true);
    const layouts = outcome.loadedMessages.filter(({ type }) => type.endsWith('shell-layout'));
    assert.deepEqual(layouts.map(({ detail }) => detail), [{ collapsed: true }]);
    const pending = outcome.loadedMessages.filter(({ type }) => !type.endsWith('shell-layout'));
    assert.deepEqual(pending.map(({ detail }) => detail), index === 4
      ? [{ value: 2 }] : [{ value: 1 }, { value: 2 }]);
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
    for (const name of ['planningHost', 'gradesHost', 'duplicateCheckHost', 'qrHost',
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
    mounted: 6, registered: 2, removed: true, cleared: true,
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

test('the seatplan controller forwards an outdated course list once after load', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { mountSeatplan } = await import('/src/modules/seatplan/index.js');
    const {
      GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
      SEATPLAN_GRADE_ROSTER_COURSES_OUTDATED_EVENT,
    } = await import('/src/shell/tabs.js');
    const host = document.createElement('div');
    document.body.append(host);
    let manualLoad = false;
    host.addEventListener('load', (event) => {
      if (!manualLoad) event.stopImmediatePropagation();
    }, true);
    const append = (frame) => {
      frame.src = 'about:blank';
      return Element.prototype.appendChild.call(host, frame);
    };
    host.appendChild = append;
    host.append = append;
    const controller = mountSeatplan({ mainHost: host, bus: document });
    const messages = [];
    controller.frame.contentWindow.postMessage = (payload) => messages.push(payload.type);
    controller.sendGradeRosterCoursesOutdated();
    controller.sendGradeRosterCoursesResult({ requestId: 'seatplan-courses' });
    controller.sendGradeRosterCoursesOutdated();
    const beforeLoad = messages.length;
    manualLoad = true;
    controller.frame.dispatchEvent(new Event('load'));
    const afterLoad = [...messages];
    controller.sendGradeRosterCoursesOutdated();
    const afterDirectSend = [...messages];
    controller.dispose();
    controller.sendGradeRosterCoursesOutdated();
    host.remove();
    return {
      beforeLoad,
      afterLoad,
      afterDirectSend,
      afterDispose: messages.length,
      expectedAfterLoad: [GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, SEATPLAN_GRADE_ROSTER_COURSES_OUTDATED_EVENT],
      outdatedType: SEATPLAN_GRADE_ROSTER_COURSES_OUTDATED_EVENT,
    };
  });
  assert.equal(result.beforeLoad, 0);
  assert.deepEqual(result.afterLoad, result.expectedAfterLoad);
  assert.deepEqual(result.afterDirectSend, [...result.expectedAfterLoad, result.outdatedType]);
  assert.equal(result.afterDispose, result.afterDirectSend.length);
});
