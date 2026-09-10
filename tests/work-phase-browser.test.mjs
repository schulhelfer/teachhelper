import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('the Work Phase preserves timer controls, warnings, persistence, tutorial state, and layout', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    const { createSharedTimerStore } = await import('/src/shared/timer-store.js');
    const { mountWorkPhase } = await import('/src/modules/work-phase/app.js');
    let oscillatorStarts = 0;
    let closedContexts = 0;
    class FakeAudioParam {
      setValueAtTime() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class FakeOscillator {
      constructor() {
        this.frequency = new FakeAudioParam();
        this.type = 'sine';
        this.onended = null;
      }
      connect() {}
      disconnect() {}
      start() {
        oscillatorStarts += 1;
      }
      stop() {}
    }
    class FakeGain {
      constructor() {
        this.gain = new FakeAudioParam();
      }
      connect() {}
      disconnect() {}
    }
    class FakeAudioContext {
      constructor() {
        this.currentTime = 0;
        this.destination = {};
        this.state = 'running';
      }
      createOscillator() {
        return new FakeOscillator();
      }
      createGain() {
        return new FakeGain();
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        closedContexts += 1;
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
    const store = createSharedTimerStore();
    const messages = [];
    const errors = [];
    const controller = mountWorkPhase({
      doc: document,
      view: window,
      appEl: document.getElementById('app'),
      timerStore: store,
      showMessage: (...args) => messages.push(args),
      reportError: (...args) => errors.push(args),
    });
    const textarea = document.getElementById('work-order-text');
    const duration = document.getElementById('work-order-duration');
    const range = document.getElementById('work-order-duration-range');
    const countdown = document.getElementById('work-order-countdown');
    const start = document.getElementById('timer-work-order-start');
    const stop = document.getElementById('timer-work-order-stop');
    const collapsedStart = document.getElementById('work-phase-timer-start-collapsed');
    const collapsedStop = document.getElementById('work-phase-timer-stop-collapsed');
    const secondsToggle = document.querySelector('[data-timer-seconds-toggle]');
    textarea.value = 'Partnerarbeit  \n  ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const normalizedWorkOrder = store.getState().workOrderText;
    duration.value = '12';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    const numberState = {
      duration: store.getState().durationMinutes,
      range: range.value,
      countdown: countdown.textContent,
    };
    range.value = '18';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-duration-step="1"]').click();
    const adjustedState = {
      duration: store.getState().durationMinutes,
      input: duration.value,
      range: range.value,
    };
    secondsToggle.click();
    const minuteDisplay = {
      countdown: countdown.textContent,
      checked: secondsToggle.getAttribute('aria-checked'),
    };
    start.click();
    const runningState = {
      hasStart: Number.isFinite(Date.parse(store.getState().startISO)),
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      collapsedStartDisabled: collapsedStart.disabled,
      collapsedStopDisabled: collapsedStop.disabled,
      countdown: countdown.textContent,
    };
    collapsedStop.click();
    const stoppedState = {
      startISO: store.getState().startISO,
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      countdown: countdown.textContent,
    };
    const startedAtRatio = (ratio) => new Date(Date.now() - ((1 - ratio) * 100 * 60000)).toISOString();
    controller.reset();
    controller.restorePlanState({
      workOrder: 'Warnungen prüfen',
      workOrderDurationMinutes: 100,
      workOrderStartISO: startedAtRatio(0.51),
    });
    store.replace({
      ...store.getState(),
      startISO: startedAtRatio(0.49),
    });
    controller.render();
    const halfWarning = {
      banner: document.getElementById('timer-warning-banner').textContent,
      className: document.getElementById('timer-shell').className,
      oscillatorStarts,
    };
    store.replace({
      ...store.getState(),
      startISO: startedAtRatio(0.26),
    });
    controller.render();
    store.replace({
      ...store.getState(),
      startISO: startedAtRatio(0.24),
    });
    controller.render();
    const quarterWarning = {
      banner: document.getElementById('timer-warning-banner').textContent,
      className: document.getElementById('timer-shell').className,
      oscillatorStarts,
    };
    document.querySelector('[data-timer-warning-tone-toggle="half"]').click();
    const startsBeforeMutedWarning = oscillatorStarts;
    controller.reset();
    controller.restorePlanState({
      workOrder: 'Stumme Warnung',
      workOrderDurationMinutes: 100,
      workOrderStartISO: startedAtRatio(0.51),
    });
    store.replace({
      ...store.getState(),
      startISO: startedAtRatio(0.49),
    });
    controller.render();
    const mutedWarning = {
      banner: document.getElementById('timer-warning-banner').textContent,
      oscillatorStarts,
      checked: document.querySelector('[data-timer-warning-tone-toggle="half"]').getAttribute('aria-checked'),
      startsBeforeMutedWarning,
    };
    controller.reset();
    controller.restorePlanState({
      workOrder: 'Alarm prüfen',
      workOrderDurationMinutes: 1,
      workOrderStartISO: new Date(Date.now() - 61000).toISOString(),
    });
    const alarmState = {
      alarm: store.getState().alarmState,
      clockAlert: document.getElementById('work-order-rest-clock').classList.contains('alert'),
      overlayVisible: document.getElementById('work-order-hint-overlay').classList.contains('visible'),
      banner: document.getElementById('timer-warning-banner').textContent,
      endClass: document.getElementById('timer-shell').classList.contains('timer-warning-end'),
      oscillatorStarts,
    };
    document.getElementById('work-order-hint-overlay').click();
    const dismissedAlarm = {
      alarm: store.getState().alarmState,
      clockAlert: document.getElementById('work-order-rest-clock').classList.contains('alert'),
      overlayVisible: document.getElementById('work-order-hint-overlay').classList.contains('visible'),
      bannerHidden: document.getElementById('timer-warning-banner').hidden,
      endClass: document.getElementById('timer-shell').classList.contains('timer-warning-end'),
    };
    const legacyStart = new Date(Date.now() - 1000).toISOString();
    const restoredLegacy = controller.restorePlanState({
      workOrder: 'Legacy-Auftrag',
      workOrderDuration: 9,
      workOrderStart: legacyStart,
    });
    const tutorialSnapshot = store.getState();
    const restoreTutorial = controller.activateTutorialDemo();
    const tutorialState = controller.getPlanState();
    restoreTutorial();
    const restoredTutorialState = store.getState();
    const invalidRestore = controller.restorePlanState({
      workOrder: '   ',
      workOrderDurationMinutes: 7,
      workOrderStartISO: legacyStart,
    });
    const ampel = document.querySelector('.monitor-ampel');
    ampel.getBoundingClientRect = () => ({ width: 120, height: 360, left: 0, top: 0, right: 120, bottom: 360 });
    const overlay = document.getElementById('work-order-hint-overlay');
    const clock = document.getElementById('work-order-rest-clock');
    const main = document.querySelector('.main');
    Object.defineProperty(overlay, 'offsetParent', { configurable: true, value: null });
    overlay.getBoundingClientRect = () => ({ width: 100, height: 40, left: 0, top: 0, right: 100, bottom: 40 });
    clock.getBoundingClientRect = () => ({ width: 50, height: 50, left: 200, top: 100, right: 250, bottom: 150 });
    main.getBoundingClientRect = () => ({ width: 500, height: 400, left: 0, top: 0, right: 500, bottom: 400 });
    overlay.classList.add('visible');
    controller.refreshLayout();
    const layoutState = {
      lightSize: ampel.style.getPropertyValue('--monitor-light-fit-size'),
      overlayLeft: overlay.style.left,
      overlayTop: overlay.style.top,
      overlayPosition: overlay.dataset.position,
    };
    const beforeDispose = store.getState();
    controller.dispose();
    textarea.value = 'Nach dispose';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      normalizedWorkOrder,
      numberState,
      adjustedState,
      minuteDisplay,
      runningState,
      stoppedState,
      halfWarning,
      quarterWarning,
      mutedWarning,
      alarmState,
      dismissedAlarm,
      restoredLegacy,
      tutorialSnapshot,
      tutorialState,
      restoredTutorialState,
      invalidRestore,
      layoutState,
      disposePreservedState: JSON.stringify(beforeDispose) === JSON.stringify(store.getState()),
      messages,
      errorCount: errors.length,
      closedContexts,
    };
  });
  assert.equal(result.normalizedWorkOrder, 'Partnerarbeit');
  assert.deepEqual(result.numberState, { duration: 12, range: '12', countdown: '00:12:00' });
  assert.deepEqual(result.adjustedState, { duration: 19, input: '19', range: '19' });
  assert.deepEqual(result.minuteDisplay, { countdown: '00:19', checked: 'false' });
  assert.deepEqual(result.runningState, {
    hasStart: true,
    startDisabled: true,
    stopDisabled: false,
    collapsedStartDisabled: true,
    collapsedStopDisabled: false,
    countdown: '00:19',
  });
  assert.deepEqual(result.stoppedState, {
    startISO: null,
    startDisabled: false,
    stopDisabled: true,
    countdown: '00:19',
  });
  assert.deepEqual(result.halfWarning, {
    banner: '50 % erreicht',
    className: 'timer-shell timer-warning-half',
    oscillatorStarts: 2,
  });
  assert.deepEqual(result.quarterWarning, {
    banner: '75 % erreicht',
    className: 'timer-shell timer-warning-quarter',
    oscillatorStarts: 5,
  });
  assert.deepEqual(result.mutedWarning, {
    banner: '50 % erreicht',
    oscillatorStarts: 5,
    checked: 'false',
    startsBeforeMutedWarning: 5,
  });
  assert.equal(result.alarmState.alarm, true);
  assert.equal(result.alarmState.clockAlert, true);
  assert.equal(result.alarmState.overlayVisible, true);
  assert.equal(result.alarmState.banner, 'Zeit abgelaufen');
  assert.equal(result.alarmState.endClass, true);
  assert.equal(result.alarmState.oscillatorStarts, 7);
  assert.deepEqual(result.dismissedAlarm, {
    alarm: false,
    clockAlert: false,
    overlayVisible: false,
    bannerHidden: true,
    endClass: false,
  });
  assert.deepEqual(result.restoredLegacy, {
    workOrder: 'Legacy-Auftrag',
    workOrderDurationMinutes: 9,
    workOrderStartISO: result.restoredLegacy.workOrderStartISO,
  });
  assert.equal(result.restoredLegacy.workOrderStartISO, result.tutorialSnapshot.startISO);
  assert.deepEqual(result.tutorialState, {
    workOrder: 'Bearbeitet die Beispielaufgabe zu zweit und haltet eure Ergebnisse fest.',
    workOrderDurationMinutes: 20,
    workOrderStartISO: null,
  });
  assert.deepEqual(result.restoredTutorialState, result.tutorialSnapshot);
  assert.deepEqual(result.invalidRestore, {
    workOrder: '   ',
    workOrderDurationMinutes: 7,
    workOrderStartISO: null,
  });
  assert.deepEqual(result.layoutState, {
    lightSize: '120px',
    overlayLeft: '175px',
    overlayTop: '48px',
    overlayPosition: 'above',
  });
  assert.equal(result.disposePreservedState, true);
  assert.deepEqual(result.messages, []);
  assert.equal(result.errorCount, 0);
  assert.ok(result.closedContexts >= 2);
});

test('the Work Phase preserves microphone states, thresholds, warning tones, and track cleanup', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    const monitorShell = document.getElementById('monitor-shell');
    const monitorStatus = document.createElement('div');
    monitorStatus.id = 'monitor-control-status';
    const monitorCountdown = document.createElement('div');
    monitorCountdown.id = 'monitor-countdown-display';
    const monitorAssignment = document.createElement('div');
    monitorAssignment.id = 'monitor-assignment-display';
    monitorShell.append(monitorStatus, monitorCountdown, monitorAssignment);
    const { createSharedTimerStore } = await import('/src/shared/timer-store.js');
    const { mountWorkPhase } = await import('/src/modules/work-phase/app.js');
    let oscillatorStarts = 0;
    let trackStops = 0;
    let contextCloses = 0;
    let fakeNow = 0;
    class FakeAudioParam {
      setValueAtTime() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class FakeOscillator {
      constructor() {
        this.frequency = new FakeAudioParam();
        this.onended = null;
      }
      connect() {}
      disconnect() {}
      start() {
        oscillatorStarts += 1;
      }
      stop() {}
    }
    class FakeGain {
      constructor() {
        this.gain = new FakeAudioParam();
      }
      connect() {}
      disconnect() {}
    }
    class FakeAudioContext {
      constructor() {
        this.currentTime = 0;
        this.destination = {};
        this.state = 'running';
      }
      createOscillator() {
        return new FakeOscillator();
      }
      createGain() {
        return new FakeGain();
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          smoothingTimeConstant: 0,
          getByteTimeDomainData(data) {
            data.fill(255);
          },
          disconnect() {},
        };
      }
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        contextCloses += 1;
        return Promise.resolve();
      }
    }
    const baseView = {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      requestAnimationFrame: callback => window.setTimeout(callback, 10),
      cancelAnimationFrame: id => window.clearTimeout(id),
      getComputedStyle: window.getComputedStyle.bind(window),
      performance: { now: () => { fakeNow += 2101; return fakeNow; } },
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      AudioContext: FakeAudioContext,
    };
    const mediaDevices = {
      enumerateDevices: async () => [{ kind: 'audioinput' }],
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => { trackStops += 1; } }],
      }),
    };
    const view = { ...baseView, navigator: { mediaDevices } };
    const store = createSharedTimerStore({ workOrderText: 'Leise arbeiten', durationMinutes: 5 });
    const messages = [];
    const controller = mountWorkPhase({
      doc: document,
      view,
      appEl: document.getElementById('app'),
      timerStore: store,
      showMessage: (...args) => messages.push(args),
    });
    const yellowThreshold = document.getElementById('monitor-yellow-threshold');
    const redThreshold = document.getElementById('monitor-red-threshold');
    yellowThreshold.value = '80';
    yellowThreshold.dispatchEvent(new Event('input', { bubbles: true }));
    const afterYellow = {
      yellow: yellowThreshold.value,
      red: redThreshold.value,
      yellowLabel: document.getElementById('monitor-yellow-threshold-value').textContent,
      redLabel: document.getElementById('monitor-red-threshold-value').textContent,
    };
    redThreshold.value = '50';
    redThreshold.dispatchEvent(new Event('input', { bubbles: true }));
    const afterRed = {
      yellow: yellowThreshold.value,
      red: redThreshold.value,
      yellowLabel: document.getElementById('monitor-yellow-threshold-value').textContent,
      redLabel: document.getElementById('monitor-red-threshold-value').textContent,
    };
    const redTone = document.querySelector('[data-monitor-warning-tone-toggle="red"]');
    redTone.click();
    const mutedToneState = redTone.getAttribute('aria-checked');
    const start = document.getElementById('monitor-mic-start');
    const stop = document.getElementById('monitor-mic-stop');
    const collapsedStart = document.getElementById('work-phase-monitor-start-collapsed');
    const collapsedStop = document.getElementById('work-phase-monitor-stop-collapsed');
    start.click();
    await new Promise(done => window.setTimeout(done, 20));
    const activeState = {
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      collapsedStartDisabled: collapsedStart.disabled,
      collapsedStopDisabled: collapsedStop.disabled,
      redActive: document.querySelector('[data-monitor-light="red"]').classList.contains('active'),
      redClass: monitorShell.classList.contains('monitor-warning-red'),
      status: monitorStatus.textContent,
      oscillatorStarts,
      countdown: monitorCountdown.textContent,
      assignment: monitorAssignment.textContent,
    };
    redTone.click();
    await Promise.resolve();
    const enabledToneState = {
      checked: redTone.getAttribute('aria-checked'),
      oscillatorStarts,
    };
    collapsedStop.click();
    await new Promise(done => window.setTimeout(done, 20));
    const stoppedState = {
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      collapsedStartDisabled: collapsedStart.disabled,
      collapsedStopDisabled: collapsedStop.disabled,
      redActive: document.querySelector('[data-monitor-light="red"]').classList.contains('active'),
      redClass: monitorShell.classList.contains('monitor-warning-red'),
      status: monitorStatus.textContent,
      trackStops,
      contextCloses,
    };
    controller.dispose();
    const noDeviceMessages = [];
    const noDeviceController = mountWorkPhase({
      doc: document,
      view: {
        ...baseView,
        navigator: {
          mediaDevices: {
            enumerateDevices: async () => [],
            getUserMedia: async () => { throw new Error('unexpected'); },
          },
        },
      },
      appEl: document.getElementById('app'),
      timerStore: createSharedTimerStore(),
      showMessage: (...args) => noDeviceMessages.push(args),
    });
    start.click();
    await Promise.resolve();
    await Promise.resolve();
    const noDeviceState = {
      status: monitorStatus.textContent,
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      messages: noDeviceMessages,
    };
    noDeviceController.dispose();
    const unsupportedController = mountWorkPhase({
      doc: document,
      view: { ...baseView, AudioContext: undefined, navigator: {} },
      appEl: document.getElementById('app'),
      timerStore: createSharedTimerStore(),
    });
    const unsupportedState = {
      status: monitorStatus.textContent,
      startDisabled: start.disabled,
      stopDisabled: stop.disabled,
      collapsedStartDisabled: collapsedStart.disabled,
      collapsedStopDisabled: collapsedStop.disabled,
    };
    unsupportedController.dispose();
    return {
      afterYellow,
      afterRed,
      mutedToneState,
      activeState,
      enabledToneState,
      stoppedState,
      noDeviceState,
      unsupportedState,
      messages,
    };
  });
  assert.deepEqual(result.afterYellow, {
    yellow: '80',
    red: '81',
    yellowLabel: '80 dB',
    redLabel: '81 dB',
  });
  assert.deepEqual(result.afterRed, {
    yellow: '49',
    red: '50',
    yellowLabel: '49 dB',
    redLabel: '50 dB',
  });
  assert.equal(result.mutedToneState, 'false');
  assert.deepEqual(result.activeState, {
    startDisabled: true,
    stopDisabled: false,
    collapsedStartDisabled: true,
    collapsedStopDisabled: false,
    redActive: true,
    redClass: true,
    status: 'Status: aktiv',
    oscillatorStarts: 0,
    countdown: '00:05:00',
    assignment: 'Leise arbeiten',
  });
  assert.deepEqual(result.enabledToneState, { checked: 'true', oscillatorStarts: 3 });
  assert.deepEqual(result.stoppedState, {
    startDisabled: false,
    stopDisabled: true,
    collapsedStartDisabled: false,
    collapsedStopDisabled: true,
    redActive: false,
    redClass: false,
    status: 'Status: bereit',
    trackStops: 1,
    contextCloses: 1,
  });
  assert.deepEqual(result.noDeviceState, {
    status: 'Status: fehler (kein Mikrofon gefunden)',
    startDisabled: false,
    stopDisabled: true,
    messages: [[
      'Kein Mikrofon angeschlossen. Bitte Mikrofon verbinden und erneut starten.',
      'warn',
      { presentation: 'toast' },
    ]],
  });
  assert.deepEqual(result.unsupportedState, {
    status: 'Status: nicht-unterstützt',
    startDisabled: true,
    stopDisabled: true,
    collapsedStartDisabled: true,
    collapsedStopDisabled: true,
  });
  assert.deepEqual(result.messages, []);
});

test('main mounts the Work Phase controller into the existing shell', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    await import(`/src/main.js?work-phase-browser=${Date.now()}`);
    document.getElementById('tab-work-phase').click();
    await new Promise(done => window.setTimeout(done, 450));
    const textarea = document.getElementById('work-order-text');
    const duration = document.getElementById('work-order-duration');
    textarea.value = 'Integrationstest';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    duration.value = '8';
    duration.dispatchEvent(new Event('input', { bubbles: true }));
    const beforeStart = {
      ready: document.getElementById('app').classList.contains('app-js-ready'),
      activeTab: document.getElementById('app').classList.contains('app-tab-work-phase'),
      monitorHidden: document.getElementById('monitor-shell').hidden,
      assignmentHidden: document.getElementById('work-order-shell').hidden,
      timerHidden: document.getElementById('timer-shell').hidden,
      text: textarea.value,
      duration: duration.value,
      countdown: document.getElementById('work-order-countdown').textContent,
    };
    document.getElementById('timer-work-order-start').click();
    const running = {
      startDisabled: document.getElementById('timer-work-order-start').disabled,
      stopDisabled: document.getElementById('timer-work-order-stop').disabled,
      countdown: document.getElementById('work-order-countdown').textContent,
    };
    document.getElementById('timer-work-order-stop').click();
    return {
      beforeStart,
      running,
      stopped: {
        startDisabled: document.getElementById('timer-work-order-start').disabled,
        stopDisabled: document.getElementById('timer-work-order-stop').disabled,
        countdown: document.getElementById('work-order-countdown').textContent,
      },
    };
  });
  assert.deepEqual(result.beforeStart, {
    ready: true,
    activeTab: true,
    monitorHidden: false,
    assignmentHidden: false,
    timerHidden: false,
    text: 'Integrationstest',
    duration: '8',
    countdown: '00:08:00',
  });
  assert.deepEqual(result.running, {
    startDisabled: true,
    stopDisabled: false,
    countdown: '00:08:00',
  });
  assert.deepEqual(result.stopped, {
    startDisabled: false,
    stopDisabled: true,
    countdown: '00:08:00',
  });
});
