const TIMER_DURATION_RANGE_DEFAULT = 45;
const TIMER_DURATION_RANGE_MAX = 180;

const MIC_UI_STATE = Object.freeze({
  READY: 'ready',
  STARTING: 'starting',
  ACTIVE: 'active',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
});

const TIMER_UI_STATE = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  ALARM: 'alarm',
});

export function resolveWorkPhaseDom(doc = document) {
  return {
    mainPanel: doc.querySelector('.main'),
    monitorShell: doc.getElementById('monitor-shell'),
    monitorAmpel: doc.querySelector('.monitor-ampel'),
    monitorLights: {
      red: doc.querySelector('[data-monitor-light="red"]'),
      yellow: doc.querySelector('[data-monitor-light="yellow"]'),
      green: doc.querySelector('[data-monitor-light="green"]'),
    },
    monitorCountdownDisplay: doc.getElementById('monitor-countdown-display'),
    monitorAssignmentDisplay: doc.getElementById('monitor-assignment-display'),
    monitorControlStatus: doc.getElementById('monitor-control-status'),
    workOrderShell: doc.getElementById('work-order-shell'),
    workOrderPanel: doc.getElementById('work-order-panel'),
    workOrderDisplay: doc.getElementById('work-order-display'),
    workOrderBody: doc.getElementById('work-order-body'),
    workOrderMeta: doc.getElementById('work-order-meta'),
    workOrderRestClock: doc.getElementById('work-order-rest-clock'),
    workOrderCountdown: doc.getElementById('work-order-countdown'),
    workOrderEndtime: doc.getElementById('work-order-endtime'),
    workOrderHintOverlay: doc.getElementById('work-order-hint-overlay'),
    workOrderTextarea: doc.getElementById('work-order-text'),
    workOrderDurationInput: doc.getElementById('work-order-duration'),
    workOrderDurationRange: doc.getElementById('work-order-duration-range'),
    workOrderDurationStepButtons: doc.querySelectorAll('[data-duration-step]'),
    timerPanel: doc.getElementById('timer-panel'),
    timerShell: doc.getElementById('timer-shell'),
    timerWarningBanner: doc.getElementById('timer-warning-banner'),
    timerControlStatus: doc.getElementById('timer-control-status'),
    monitorMicStartButton: doc.getElementById('monitor-mic-start'),
    monitorMicStopButton: doc.getElementById('monitor-mic-stop'),
    workPhaseMonitorStartCollapsed: doc.getElementById('work-phase-monitor-start-collapsed'),
    workPhaseMonitorStopCollapsed: doc.getElementById('work-phase-monitor-stop-collapsed'),
    workPhaseTimerStartCollapsed: doc.getElementById('work-phase-timer-start-collapsed'),
    workPhaseTimerStopCollapsed: doc.getElementById('work-phase-timer-stop-collapsed'),
    monitorThresholdInputs: doc.querySelectorAll('[data-monitor-threshold]'),
    monitorYellowThresholdInput: doc.getElementById('monitor-yellow-threshold'),
    monitorRedThresholdInput: doc.getElementById('monitor-red-threshold'),
    monitorYellowThresholdValue: doc.getElementById('monitor-yellow-threshold-value'),
    monitorRedThresholdValue: doc.getElementById('monitor-red-threshold-value'),
    monitorWarningToneButtons: doc.querySelectorAll('[data-monitor-warning-tone-toggle]'),
    monitorWarningToneLabels: doc.querySelectorAll('[data-monitor-warning-tone-label]'),
    timerWarningToneButtons: doc.querySelectorAll('[data-timer-warning-tone-toggle]'),
    timerWarningToneLabels: doc.querySelectorAll('[data-timer-warning-tone-label]'),
    timerSecondsToggleButtons: doc.querySelectorAll('[data-timer-seconds-toggle]'),
    timerSecondsToggleLabels: doc.querySelectorAll('[data-timer-seconds-label]'),
    timerWorkOrderStart: doc.getElementById('timer-work-order-start'),
    timerWorkOrderStop: doc.getElementById('timer-work-order-stop'),
  };
}

export function mountWorkPhase({
  doc = typeof document !== 'undefined' ? document : null,
  view = doc?.defaultView || globalThis,
  appEl = doc?.getElementById('app') || null,
  dom = doc ? resolveWorkPhaseDom(doc) : {},
  timerStore,
  showMessage = () => {},
  reportError = () => {},
} = {}) {
  if (!timerStore || typeof timerStore.getState !== 'function') {
    throw new TypeError('Work Phase benötigt einen Timer-Store.');
  }

  const removers = [];
  const observers = [];
  let disposed = false;
  let active = false;
  let workOrderTimerId = null;
  let workOrderAlarmIntervalId = null;
  let workOrderAudioCtx = null;
  let timerVisualWarningTimeoutId = null;
  let timerWarningToneEnabled = { end: true, half: true, quarter: true };
  let timerMilestoneTriggered = { half: false, quarter: false };
  let timerLastRemainingRatio = null;
  let timerShowSeconds = true;
  let timerUiState = TIMER_UI_STATE.READY;
  let workPhaseTutorialDemoActive = false;

  const reportAppError = (error, userMessage = '', context = {}) => {
    reportError(error, userMessage, context);
  };

  const bind = (target, type, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    removers.push(() => target.removeEventListener(type, listener, options));
  };

  const parseWorkOrderDuration = (value) => {
    if (value === null || value === undefined) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const getTimerState = () => timerStore.getState();

  const replaceTimerState = (next) => {
    timerStore.replace(next);
  };

  const hasWorkOrderTiming = (timerState = getTimerState()) => {
    const duration = Number(timerState.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const startIso = typeof timerState.startISO === 'string' ? timerState.startISO.trim() : '';
    if (!startIso) return false;
    return Number.isFinite(Date.parse(startIso));
  };

  const syncTimerDurationRange = (durationValue) => {
    const range = dom.workOrderDurationRange;
    if (!range) return;
    const duration = parseWorkOrderDuration(durationValue);
    const rangeValue = duration ?? TIMER_DURATION_RANGE_DEFAULT;
    const nextMax = Math.max(TIMER_DURATION_RANGE_MAX, rangeValue);
    if (range.max !== String(nextMax)) {
      range.max = String(nextMax);
    }
    if (range.value !== String(rangeValue)) {
      range.value = String(rangeValue);
    }
    range.setAttribute('aria-valuetext', `${rangeValue} Minuten`);
  };

  const getTimerPlaceholder = () => timerShowSeconds ? '--:--:--' : '--:--';

  const formatDurationHMS = (minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return getTimerPlaceholder();
    const totalMinutes = Math.floor(minutes);
    const totalSeconds = totalMinutes * 60;
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (timerShowSeconds) {
      const seconds = totalSeconds % 60;
      return [hours, mins, seconds].map(value => String(value).padStart(2, '0')).join(':');
    }
    return [hours, mins].map(value => String(value).padStart(2, '0')).join(':');
  };

  const formatRemainingDuration = (remainingMs) => {
    const safeRemaining = Math.max(0, remainingMs);
    if (timerShowSeconds) {
      const remainingSeconds = Math.ceil(safeRemaining / 1000);
      const hours = Math.floor(remainingSeconds / 3600);
      const mins = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;
      return [hours, mins, seconds].map(value => String(Math.max(0, value)).padStart(2, '0')).join(':');
    }
    const remainingMinutes = Math.ceil(safeRemaining / 60000);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    return [hours, mins].map(value => String(Math.max(0, value)).padStart(2, '0')).join(':');
  };

  const positionHintOverlay = () => {
    const overlay = dom.workOrderHintOverlay;
    const target = dom.workOrderRestClock;
    if (!overlay || !target) return;
    if (!overlay.classList.contains('visible')) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const overlayRect = overlay.getBoundingClientRect();
    const width = overlayRect.width || overlay.offsetWidth || 0;
    const height = overlayRect.height || overlay.offsetHeight || 0;
    const offsetParentRect = overlay.offsetParent && typeof overlay.offsetParent.getBoundingClientRect === 'function'
      ? overlay.offsetParent.getBoundingClientRect()
      : null;
    const containerRect = offsetParentRect
      || (dom.workOrderShell && !dom.workOrderShell.hidden ? dom.workOrderShell.getBoundingClientRect() : null)
      || dom.mainPanel?.getBoundingClientRect();
    const containerWidth = containerRect?.width || view.innerWidth || doc?.documentElement?.clientWidth || width;
    const containerHeight = containerRect?.height || view.innerHeight || doc?.documentElement?.clientHeight || height;
    const containerLeft = containerRect?.left || 0;
    const containerTop = containerRect?.top || 0;
    const inset = 12;
    const horizontalCenter = (rect.left - containerLeft) + (rect.width / 2);
    const maxLeft = Math.max(inset, containerWidth - width - inset);
    const desiredLeft = horizontalCenter - (width / 2);
    const clampedLeft = Math.min(Math.max(desiredLeft, inset), maxLeft);
    let top = (rect.top - containerTop) - height - inset;
    let positionFlag = 'above';
    if (top < inset) {
      top = (rect.bottom - containerTop) + inset;
      positionFlag = 'below';
    }
    const maxTop = Math.max(inset, containerHeight - height - inset);
    const clampedTop = Math.min(Math.max(top, inset), maxTop);
    overlay.style.left = `${clampedLeft}px`;
    overlay.style.top = `${clampedTop}px`;
    overlay.setAttribute('data-position', positionFlag);
  };

  const renderControlStatus = (element, status, text) => {
    if (!element) return;
    const normalized = typeof status === 'string' && status.trim() ? status.trim() : 'ready';
    element.textContent = text || 'Status: bereit';
    element.className = `control-status is-${normalized}`;
  };

  const renderWorkOrderTimerButtonsState = (timerState = getTimerState()) => {
    timerUiState = timerState.alarmState
      ? TIMER_UI_STATE.ALARM
      : (hasWorkOrderTiming(timerState) ? TIMER_UI_STATE.RUNNING : TIMER_UI_STATE.READY);
    const isTimerActive = timerUiState !== TIMER_UI_STATE.READY;
    const hasDuration = Boolean(parseWorkOrderDuration(timerState.durationMinutes));
    appEl?.classList.toggle('work-order-timer-inactive', !hasDuration);
    const startButtons = [dom.timerWorkOrderStart, dom.workPhaseTimerStartCollapsed].filter(Boolean);
    const stopButtons = [dom.timerWorkOrderStop, dom.workPhaseTimerStopCollapsed].filter(Boolean);
    startButtons.forEach((button) => {
      button.disabled = isTimerActive;
      button.textContent = '⏰';
      button.classList.toggle('is-running', false);
      button.classList.toggle('is-off', false);
      button.setAttribute('aria-label', 'Arbeitszeit starten');
      button.setAttribute('title', 'Arbeitszeit starten');
    });
    stopButtons.forEach((button) => {
      button.disabled = !isTimerActive;
      button.textContent = '⏰';
      button.classList.toggle('is-running', isTimerActive);
      button.classList.toggle('is-off', true);
      button.setAttribute('aria-label', 'Arbeitszeit stoppen');
      button.setAttribute('title', 'Arbeitszeit stoppen');
    });
    const timerStatusText = timerUiState === TIMER_UI_STATE.ALARM
      ? 'Status: alarm'
      : (timerUiState === TIMER_UI_STATE.RUNNING ? 'Status: läuft' : 'Status: bereit');
    renderControlStatus(dom.timerControlStatus, timerUiState, timerStatusText);
  };

  const resetWorkOrderTimerDisplay = () => {
    if (dom.workOrderCountdown) {
      dom.workOrderCountdown.textContent = getTimerPlaceholder();
    }
    if (dom.workOrderEndtime) {
      dom.workOrderEndtime.textContent = '--:--';
    }
  };

  const resetTimerWarningMilestones = (lastRatio = null) => {
    timerMilestoneTriggered = { half: false, quarter: false };
    if (Number.isFinite(lastRatio)) {
      timerLastRemainingRatio = Math.max(0, Math.min(1, Number(lastRatio)));
    } else {
      timerLastRemainingRatio = null;
    }
  };

  const isTimerWarningToneEnabled = (toneKey) => {
    if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return false;
    return Boolean(timerWarningToneEnabled[toneKey]);
  };

  const getTimerWarningToneLabel = (toneKey) => {
    if (toneKey === 'half') return 'Warnton nach 50%';
    if (toneKey === 'quarter') return 'Warnton nach 75%';
    return 'Warnton bei Ende';
  };

  const getTimerWarningMessage = (level) => {
    if (level === 'half') return '50 % erreicht';
    if (level === 'quarter') return '75 % erreicht';
    return 'Zeit abgelaufen';
  };

  const clearTimerWarningBanner = () => {
    const banner = dom.timerWarningBanner;
    if (!banner) return;
    banner.hidden = true;
    banner.textContent = '';
    banner.classList.remove('visible', 'level-half', 'level-quarter', 'level-end');
  };

  const showTimerWarningBanner = (level) => {
    const banner = dom.timerWarningBanner;
    if (!banner) return;
    const normalizedLevel = level === 'end' ? 'end' : (level === 'quarter' ? 'quarter' : 'half');
    banner.hidden = false;
    banner.textContent = getTimerWarningMessage(normalizedLevel);
    banner.classList.remove('level-half', 'level-quarter', 'level-end');
    banner.classList.add(`level-${normalizedLevel}`);
    banner.classList.remove('visible');
    void banner.offsetWidth;
    banner.classList.add('visible');
  };

  const clearTimerVisualWarnings = () => {
    if (!dom.timerShell) return;
    dom.timerShell.classList.remove('timer-warning-half', 'timer-warning-quarter', 'timer-warning-end');
    clearTimerWarningBanner();
  };

  const triggerTimerVisualWarning = (level, { persistent = false } = {}) => {
    if (!dom.timerShell) return;
    clearTimerVisualWarnings();
    const tone = level === 'end' ? 'end' : (level === 'quarter' ? 'quarter' : 'half');
    dom.timerShell.classList.add(`timer-warning-${tone}`);
    showTimerWarningBanner(tone);
    if (timerVisualWarningTimeoutId) {
      view.clearTimeout(timerVisualWarningTimeoutId);
      timerVisualWarningTimeoutId = null;
    }
    if (persistent) return;
    const durationMs = tone === 'quarter' ? 2600 : 2000;
    timerVisualWarningTimeoutId = view.setTimeout(() => {
      timerVisualWarningTimeoutId = null;
      if (getTimerState().alarmState) return;
      clearTimerVisualWarnings();
    }, durationMs);
  };

  const ensureWorkOrderAudioContext = ({ resume = false } = {}) => {
    const AudioCtx = view.AudioContext || view.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!workOrderAudioCtx || workOrderAudioCtx.state === 'closed') {
      workOrderAudioCtx = new AudioCtx();
    }
    const context = workOrderAudioCtx;
    if (resume && context.state === 'suspended' && typeof context.resume === 'function') {
      const resumePromise = context.resume();
      if (resumePromise && typeof resumePromise.catch === 'function') {
        resumePromise.catch((error) => {
          reportAppError(error, '', {
            scope: 'timer-audio',
            action: 'resume-audio-context',
          });
        });
      }
    }
    return context;
  };

  const closeWorkOrderAudioContext = () => {
    if (!workOrderAudioCtx || workOrderAudioCtx.state === 'closed' || typeof workOrderAudioCtx.close !== 'function') {
      workOrderAudioCtx = null;
      return;
    }
    const context = workOrderAudioCtx;
    workOrderAudioCtx = null;
    const closePromise = context.close();
    if (closePromise && typeof closePromise.catch === 'function') {
      closePromise.catch((error) => {
        reportAppError(error, '', {
          scope: 'timer-audio',
          action: 'close-audio-context',
        });
      });
    }
  };

  const scheduleTimerMilestoneTone = (context, toneKey) => {
    if (!context || context.state === 'closed') return;
    const pulses = toneKey === 'quarter'
      ? [
        { frequency: 1180, gain: 0.16, durationMs: 150, offsetMs: 0, type: 'triangle' },
        { frequency: 900, gain: 0.14, durationMs: 150, offsetMs: 180, type: 'triangle' },
        { frequency: 1180, gain: 0.16, durationMs: 150, offsetMs: 360, type: 'triangle' },
      ]
      : [
        { frequency: 1040, gain: 0.13, durationMs: 170, offsetMs: 0, type: 'triangle' },
        { frequency: 780, gain: 0.12, durationMs: 160, offsetMs: 180, type: 'triangle' },
      ];
    pulses.forEach(({ frequency, gain, durationMs, offsetMs, type }) => {
      const startTime = context.currentTime + (offsetMs / 1000);
      const endTime = startTime + (durationMs / 1000);
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.015);
    });
  };

  const playTimerMilestoneTone = (toneKey) => {
    try {
      const context = ensureWorkOrderAudioContext();
      if (!context) return;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        const resumePromise = context.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise
            .then(() => scheduleTimerMilestoneTone(context, toneKey))
            .catch((error) => {
              reportAppError(error, '', {
                scope: 'timer-audio',
                action: 'play-milestone-tone',
                toneKey,
              });
            });
          return;
        }
      }
      scheduleTimerMilestoneTone(context, toneKey);
    } catch (error) {
      reportAppError(error, '', {
        scope: 'timer-audio',
        action: 'schedule-milestone-tone',
        toneKey,
      });
    }
  };

  const handleTimerMilestones = (remainingMs, totalDurationMs) => {
    if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));
    if (!Number.isFinite(timerLastRemainingRatio)) {
      timerLastRemainingRatio = ratio;
      return;
    }
    const crossedThreshold = (threshold) => timerLastRemainingRatio > threshold && ratio <= threshold;
    if (!timerMilestoneTriggered.half && crossedThreshold(0.5)) {
      timerMilestoneTriggered.half = true;
      triggerTimerVisualWarning('half');
      if (isTimerWarningToneEnabled('half')) {
        playTimerMilestoneTone('half');
      }
    }
    if (!timerMilestoneTriggered.quarter && crossedThreshold(0.25)) {
      timerMilestoneTriggered.quarter = true;
      triggerTimerVisualWarning('quarter');
      if (isTimerWarningToneEnabled('quarter')) {
        playTimerMilestoneTone('quarter');
      }
    }
    timerLastRemainingRatio = ratio;
  };

  let updateWorkOrderAlert = () => {};

  const stopWorkOrderTimer = () => {
    if (workOrderTimerId !== null) {
      view.clearInterval(workOrderTimerId);
      workOrderTimerId = null;
    }
    updateWorkOrderAlert(false);
  };

  const triggerWorkOrderBell = () => {
    try {
      const context = ensureWorkOrderAudioContext();
      if (!context) return;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        const resumePromise = context.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise
            .then(() => triggerWorkOrderBell())
            .catch((error) => {
              reportAppError(error, '', {
                scope: 'timer-audio',
                action: 'trigger-bell-resume',
              });
            });
          return;
        }
      }
      const duration = 1.5;
      const base = context.createOscillator();
      const overtone = context.createOscillator();
      const gain = context.createGain();
      base.type = 'sine';
      overtone.type = 'sine';
      base.frequency.setValueAtTime(420, context.currentTime);
      overtone.frequency.setValueAtTime(840, context.currentTime);
      gain.gain.setValueAtTime(0.28, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      base.connect(gain);
      overtone.connect(gain);
      gain.connect(context.destination);
      base.start();
      overtone.start();
      base.stop(context.currentTime + duration);
      overtone.stop(context.currentTime + duration);
    } catch (error) {
      reportAppError(error, '', {
        scope: 'timer-audio',
        action: 'trigger-bell',
      });
    }
  };

  const startWorkOrderAlarmSound = () => {
    if (!isTimerWarningToneEnabled('end')) return;
    if (workOrderAlarmIntervalId !== null) return;
    triggerWorkOrderBell();
    workOrderAlarmIntervalId = view.setInterval(triggerWorkOrderBell, 900);
  };

  const stopWorkOrderAlarmSound = () => {
    if (workOrderAlarmIntervalId !== null) {
      view.clearInterval(workOrderAlarmIntervalId);
      workOrderAlarmIntervalId = null;
    }
  };

  updateWorkOrderAlert = (isActive) => {
    if (!dom.workOrderRestClock) return;
    dom.workOrderRestClock.classList.toggle('alert', Boolean(isActive));
    if (dom.workOrderHintOverlay) {
      if (isActive) {
        dom.workOrderHintOverlay.classList.add('visible');
        positionHintOverlay();
      } else {
        dom.workOrderHintOverlay.classList.remove('visible');
      }
    }
    const timerState = getTimerState();
    if (!isActive) {
      if (timerState.alarmState) {
        clearTimerVisualWarnings();
        replaceTimerState({
          ...timerState,
          alarmState: false,
        });
      } else if (!hasWorkOrderTiming(timerState)) {
        clearTimerVisualWarnings();
      }
      stopWorkOrderAlarmSound();
    } else if (timerState.alarmState) {
      triggerTimerVisualWarning('end', { persistent: true });
      startWorkOrderAlarmSound();
    }
    renderWorkOrderTimerButtonsState();
  };

  const getTimerSecondsToggleLabel = () => 'Sekunden anzeigen';

  const renderTimerWarningToneState = () => {
    dom.timerWarningToneButtons?.forEach((button) => {
      const toneKey = button.dataset.timerWarningToneToggle;
      if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
      const label = getTimerWarningToneLabel(toneKey);
      button.setAttribute('aria-checked', String(isTimerWarningToneEnabled(toneKey)));
      button.setAttribute('aria-label', label);
    });
    dom.timerWarningToneLabels?.forEach((labelElement) => {
      const toneKey = labelElement.dataset.timerWarningToneLabel;
      if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
      labelElement.textContent = getTimerWarningToneLabel(toneKey);
    });
  };

  const renderTimerSecondsToggleState = () => {
    const label = getTimerSecondsToggleLabel();
    dom.timerSecondsToggleButtons?.forEach((button) => {
      button.setAttribute('aria-checked', String(timerShowSeconds));
      button.setAttribute('aria-label', label);
    });
    dom.timerSecondsToggleLabels?.forEach((labelElement) => {
      labelElement.textContent = label;
    });
  };

  const updateWorkOrderCountdown = () => {
    const timerState = getTimerState();
    if (!hasWorkOrderTiming(timerState)) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      stopWorkOrderTimer();
      return;
    }
    const startMs = Date.parse(timerState.startISO);
    const durationMinutes = Number(timerState.durationMinutes);
    if (!Number.isFinite(startMs) || !Number.isFinite(durationMinutes)) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      stopWorkOrderTimer();
      return;
    }
    const totalDurationMs = durationMinutes * 60000;
    const endMs = startMs + totalDurationMs;
    const now = Date.now();
    const remaining = Math.max(0, endMs - now);
    handleTimerMilestones(remaining, totalDurationMs);
    if (dom.workOrderCountdown) {
      dom.workOrderCountdown.textContent = formatRemainingDuration(remaining);
    }
    if (dom.workOrderEndtime) {
      const endDate = new Date(endMs);
      dom.workOrderEndtime.textContent = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    if (remaining <= 0) {
      timerLastRemainingRatio = 0;
      stopWorkOrderTimer();
      if (!getTimerState().alarmState) {
        replaceTimerState({
          ...getTimerState(),
          alarmState: true,
        });
        updateWorkOrderAlert(true);
        startWorkOrderAlarmSound();
      }
    } else {
      updateWorkOrderAlert(false);
    }
  };

  const refreshWorkOrderTimer = () => {
    stopWorkOrderTimer();
    if (!hasWorkOrderTiming()) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      return;
    }
    updateWorkOrderCountdown();
    workOrderTimerId = view.setInterval(updateWorkOrderCountdown, 1000);
  };

  const render = () => {
    const container = dom.workOrderDisplay;
    if (!container) return;
    const timerState = getTimerState();
    const text = typeof timerState.workOrderText === 'string' ? timerState.workOrderText : '';
    const hasContent = text.trim().length > 0;
    appEl?.classList.toggle('work-order-empty', !hasContent);
    if (dom.workOrderTextarea && doc?.activeElement !== dom.workOrderTextarea && dom.workOrderTextarea.value !== text) {
      dom.workOrderTextarea.value = text;
    }
    if (dom.workOrderBody) {
      dom.workOrderBody.textContent = hasContent ? text : '';
    }
    container.hidden = false;
    const durationValue = parseWorkOrderDuration(timerState.durationMinutes);
    const durationText = durationValue ? String(durationValue) : '';
    if (dom.workOrderDurationInput && doc?.activeElement !== dom.workOrderDurationInput
      && dom.workOrderDurationInput.value !== durationText) {
      dom.workOrderDurationInput.value = durationText;
    }
    syncTimerDurationRange(durationValue);
    const showTiming = Number.isFinite(durationValue) && durationValue > 0;
    if (dom.workOrderMeta) {
      dom.workOrderMeta.hidden = false;
      dom.workOrderMeta.classList.add('visible');
    }
    if (!showTiming) {
      resetTimerWarningMilestones(null);
      stopWorkOrderTimer();
      resetWorkOrderTimerDisplay();
      updateWorkOrderAlert(false);
      return;
    }
    if (hasWorkOrderTiming(timerState)) {
      refreshWorkOrderTimer();
    } else {
      resetTimerWarningMilestones(null);
      stopWorkOrderTimer();
      if (dom.workOrderCountdown) {
        dom.workOrderCountdown.textContent = formatDurationHMS(durationValue);
      }
      if (dom.workOrderEndtime) {
        dom.workOrderEndtime.textContent = '--:--';
      }
      updateWorkOrderAlert(false);
    }
  };

  const applyTimerDurationFromInput = ({ preserveStart = true } = {}) => {
    const duration = parseWorkOrderDuration(dom.workOrderDurationInput?.value);
    const timerState = getTimerState();
    timerStore.setWorkOrder({
      workOrderText: timerState.workOrderText,
      durationMinutes: duration,
      startISO: preserveStart ? timerState.startISO : null,
    });
    resetTimerWarningMilestones(null);
    render();
    return duration;
  };

  const startWorkOrderTimer = () => {
    const duration = applyTimerDurationFromInput({ preserveStart: false });
    if (!duration) {
      showMessage('Bitte eine Arbeitsdauer festlegen, bevor die Arbeitszeit gestartet wird.', 'warn', { presentation: 'toast' });
      return;
    }
    const timerState = getTimerState();
    timerStore.setWorkOrder({
      workOrderText: timerState.workOrderText,
      durationMinutes: duration,
      startISO: null,
    });
    timerStore.start(new Date().toISOString());
    resetTimerWarningMilestones(1);
    ensureWorkOrderAudioContext({ resume: true });
    updateWorkOrderAlert(false);
    render();
  };

  const stopWorkOrderSession = () => {
    stopWorkOrderTimer();
    closeWorkOrderAudioContext();
    timerStore.stop();
    resetTimerWarningMilestones(null);
    resetWorkOrderTimerDisplay();
    updateWorkOrderAlert(false);
    render();
  };

  const toggleTimerWarningTone = (toneKey) => {
    if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
    timerWarningToneEnabled = {
      ...timerWarningToneEnabled,
      [toneKey]: !isTimerWarningToneEnabled(toneKey),
    };
    renderTimerWarningToneState();
    if (toneKey === 'end' && !isTimerWarningToneEnabled('end')) {
      stopWorkOrderAlarmSound();
      return;
    }
    if (toneKey === 'end' && getTimerState().alarmState) {
      startWorkOrderAlarmSound();
    }
  };

  const toggleTimerSeconds = () => {
    timerShowSeconds = !timerShowSeconds;
    renderTimerSecondsToggleState();
    render();
  };

  const adjustTimerDuration = (stepDelta) => {
    if (!dom.workOrderDurationInput) return;
    const parsedStep = Math.trunc(Number(stepDelta));
    if (!Number.isFinite(parsedStep) || parsedStep === 0) return;
    const inputDuration = parseWorkOrderDuration(dom.workOrderDurationInput.value);
    const stateDuration = parseWorkOrderDuration(getTimerState().durationMinutes);
    const baseDuration = inputDuration ?? stateDuration ?? 1;
    const nextDuration = Math.max(1, baseDuration + parsedStep);
    dom.workOrderDurationInput.value = String(nextDuration);
    applyTimerDurationFromInput({ preserveStart: true });
  };

  const dismissWorkOrderAlarm = () => {
    if (getTimerState().alarmState) {
      updateWorkOrderAlert(false);
    }
  };

  const saveWorkOrderFromTextarea = () => {
    const raw = dom.workOrderTextarea?.value || '';
    const normalized = raw.replace(/\s+$/, '');
    const trimmed = normalized.trim();
    const nextWorkOrder = trimmed ? normalized : '';
    const timerState = getTimerState();
    timerStore.setWorkOrder({
      workOrderText: nextWorkOrder,
      durationMinutes: timerState.durationMinutes,
      startISO: timerState.startISO,
    });
    render();
  };

  const createMonitor = () => {
    const WARNING_TONES = Object.freeze({
      yellow: {
        intervalMs: 1200,
        pulses: [
          { frequency: 1480, gain: 0.085, durationMs: 170, offsetMs: 0, type: 'triangle' },
          { frequency: 1320, gain: 0.075, durationMs: 150, offsetMs: 180, type: 'triangle' },
        ],
      },
      red: {
        intervalMs: 520,
        pulses: [
          { frequency: 900, gain: 0.15, durationMs: 130, offsetMs: 0, type: 'square' },
          { frequency: 700, gain: 0.14, durationMs: 130, offsetMs: 145, type: 'square' },
          { frequency: 900, gain: 0.15, durationMs: 130, offsetMs: 290, type: 'square' },
        ],
      },
    });
    const AVERAGE_WINDOW_MS = 2000;
    const DB_FLOOR = 30;
    const DB_CEILING = 100;
    const DB_OFFSET = 90;
    const DEFAULT_THRESHOLDS = Object.freeze({ yellow: 60, red: 70 });
    const MIN_THRESHOLD_GAP = 1;
    const MONITOR_ASSIGNMENT_PLACEHOLDER = 'Arbeitsauftrag';

    let thresholds = { ...DEFAULT_THRESHOLDS };
    let audioContext;
    let analyser;
    let source;
    let stream;
    let rafId;
    let running = false;
    let starting = false;
    let windowStartMs = 0;
    let windowLevelSum = 0;
    let windowSampleCount = 0;
    let currentLightColor = null;
    let warningToneEnabled = { yellow: true, red: true };
    let warningToneTimerId;
    let warningToneLoopToken = 0;
    let monitorTickId;
    let timerUnsubscribe = () => {};
    let micUiState = MIC_UI_STATE.READY;
    let micUiDetail = '';
    const AudioContextClass = view.AudioContext || view.webkitAudioContext;

    const formatTimerText = (timerState) => {
      const duration = parseWorkOrderDuration(timerState.durationMinutes);
      if (!duration) return getTimerPlaceholder();
      if (!timerState.startISO) return formatDurationHMS(duration);
      const startMs = Date.parse(timerState.startISO);
      if (!Number.isFinite(startMs)) return formatDurationHMS(duration);
      const remaining = Math.max(0, (startMs + duration * 60000) - Date.now());
      return formatRemainingDuration(remaining);
    };

    const updateTimerColor = (timerState) => {
      if (!dom.monitorCountdownDisplay) return;
      const duration = parseWorkOrderDuration(timerState.durationMinutes);
      if (!duration || !timerState.startISO) {
        dom.monitorCountdownDisplay.style.color = 'var(--text)';
        return;
      }
      const startMs = Date.parse(timerState.startISO);
      if (!Number.isFinite(startMs)) {
        dom.monitorCountdownDisplay.style.color = 'var(--text)';
        return;
      }
      const endMs = startMs + duration * 60000;
      const remaining = Math.max(0, endMs - Date.now());
      const progress = Math.max(0, Math.min(1, remaining / (duration * 60000)));
      const hue = Math.round(120 * progress);
      dom.monitorCountdownDisplay.style.color = `hsl(${hue} 85% 58%)`;
    };

    const renderTimer = () => {
      const timerState = getTimerState();
      if (dom.monitorCountdownDisplay) {
        dom.monitorCountdownDisplay.textContent = formatTimerText(timerState);
      }
      updateTimerColor(timerState);
      if (dom.monitorAssignmentDisplay) {
        const text = typeof timerState.workOrderText === 'string' ? timerState.workOrderText : '';
        const hasText = text.trim().length > 0;
        dom.monitorAssignmentDisplay.textContent = hasText ? text : MONITOR_ASSIGNMENT_PLACEHOLDER;
        dom.monitorAssignmentDisplay.classList.toggle('is-placeholder', !hasText);
      }
    };

    const toEstimatedDb = (rms) => {
      if (rms <= 0) return DB_FLOOR;
      const dbFs = 20 * Math.log10(rms);
      const estimatedDb = dbFs + DB_OFFSET;
      return Math.round(Math.max(DB_FLOOR, Math.min(DB_CEILING, estimatedDb)));
    };

    let syncWarningToneLoop = () => {};

    const setActiveLight = (color) => {
      const nextColor = color || null;
      const colorChanged = currentLightColor !== nextColor;
      currentLightColor = nextColor;
      Object.entries(dom.monitorLights || {}).forEach(([key, element]) => {
        if (element) {
          element.classList.toggle('active', key === color);
        }
      });
      if (colorChanged) {
        syncWarningToneLoop();
      }
      if (dom.monitorShell) {
        dom.monitorShell.classList.toggle('monitor-warning-yellow', nextColor === 'yellow');
        dom.monitorShell.classList.toggle('monitor-warning-red', nextColor === 'red');
      }
    };

    const classifyLevel = (level) => {
      if (level >= thresholds.red) return 'red';
      if (level >= thresholds.yellow) return 'yellow';
      return 'green';
    };

    const resetAverageWindow = () => {
      windowStartMs = view.performance.now();
      windowLevelSum = 0;
      windowSampleCount = 0;
    };

    const playTonePulse = ({ frequency, gain, durationMs, offsetMs, type = 'sine' }) => {
      if (!audioContext) return;
      const startTime = audioContext.currentTime + offsetMs / 1000;
      const endTime = startTime + durationMs / 1000;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.015);
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    };

    const playWarningTone = async (color) => {
      if (!audioContext) return;
      const config = WARNING_TONES[color];
      if (!config) return;
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch {
          return;
        }
      }
      config.pulses.forEach(playTonePulse);
    };

    const stopWarningToneLoop = () => {
      warningToneLoopToken += 1;
      if (warningToneTimerId) {
        view.clearTimeout(warningToneTimerId);
        warningToneTimerId = undefined;
      }
    };

    const isWarningToneEnabled = (toneKey) => {
      if (toneKey !== 'yellow' && toneKey !== 'red') return false;
      return Boolean(warningToneEnabled[toneKey]);
    };

    const getWarningToneLabel = (toneKey) => {
      const toneName = toneKey === 'red' ? 'Rot' : 'Gelb';
      return `Warnton ${toneName}`;
    };

    const renderWarningToneState = () => {
      dom.monitorWarningToneButtons?.forEach((button) => {
        const toneKey = button.dataset.monitorWarningToneToggle;
        if (toneKey !== 'yellow' && toneKey !== 'red') return;
        const label = getWarningToneLabel(toneKey);
        button.setAttribute('aria-checked', String(isWarningToneEnabled(toneKey)));
        button.setAttribute('aria-label', label);
      });
      dom.monitorWarningToneLabels?.forEach((labelElement) => {
        const toneKey = labelElement.dataset.monitorWarningToneLabel;
        if (toneKey !== 'yellow' && toneKey !== 'red') return;
        labelElement.textContent = getWarningToneLabel(toneKey);
      });
    };

    const isMicSupported = () => Boolean(
      view.navigator?.mediaDevices
      && view.navigator.mediaDevices.getUserMedia
      && AudioContextClass
    );

    const getEffectiveMicUiState = () => {
      if (!isMicSupported()) return MIC_UI_STATE.UNSUPPORTED;
      if (starting) return MIC_UI_STATE.STARTING;
      if (running) return MIC_UI_STATE.ACTIVE;
      return micUiState === MIC_UI_STATE.ERROR ? MIC_UI_STATE.ERROR : MIC_UI_STATE.READY;
    };

    const getMicStatusText = (stateKey) => {
      if (stateKey === MIC_UI_STATE.STARTING) return 'Status: startet...';
      if (stateKey === MIC_UI_STATE.ACTIVE) return 'Status: aktiv';
      if (stateKey === MIC_UI_STATE.UNSUPPORTED) return 'Status: nicht-unterstützt';
      if (stateKey === MIC_UI_STATE.ERROR) {
        return micUiDetail ? `Status: fehler (${micUiDetail})` : 'Status: fehler';
      }
      return 'Status: bereit';
    };

    const renderMicControlState = () => {
      const effectiveState = getEffectiveMicUiState();
      const activeMic = effectiveState === MIC_UI_STATE.ACTIVE;
      const busyMic = effectiveState === MIC_UI_STATE.STARTING;
      const unsupportedMic = effectiveState === MIC_UI_STATE.UNSUPPORTED;
      const startButtons = [dom.monitorMicStartButton, dom.workPhaseMonitorStartCollapsed].filter(Boolean);
      const stopButtons = [dom.monitorMicStopButton, dom.workPhaseMonitorStopCollapsed].filter(Boolean);
      startButtons.forEach((button) => {
        button.textContent = '🚦';
        button.classList.toggle('is-running', false);
        button.classList.toggle('is-off', false);
        button.disabled = unsupportedMic || busyMic || activeMic;
        button.setAttribute('aria-label', 'Lautstärkeüberwachung starten');
        button.setAttribute('title', 'Lautstärkeüberwachung starten');
      });
      stopButtons.forEach((button) => {
        button.textContent = '🚦';
        button.classList.toggle('is-running', activeMic);
        button.classList.toggle('is-off', true);
        button.disabled = unsupportedMic || busyMic || !activeMic;
        button.setAttribute('aria-label', 'Lautstärkeüberwachung stoppen');
        button.setAttribute('title', 'Lautstärkeüberwachung stoppen');
      });
      renderControlStatus(dom.monitorControlStatus, effectiveState, getMicStatusText(effectiveState));
    };

    const setMicUiState = (nextState, detail = '') => {
      micUiState = nextState;
      micUiDetail = typeof detail === 'string' ? detail.trim() : '';
      renderMicControlState();
    };

    syncWarningToneLoop = () => {
      stopWarningToneLoop();
      if (currentLightColor !== 'yellow' && currentLightColor !== 'red') {
        return;
      }
      if (!isWarningToneEnabled(currentLightColor)) {
        return;
      }
      const loopToken = warningToneLoopToken;
      const loop = async () => {
        if (loopToken !== warningToneLoopToken) return;
        if (currentLightColor !== 'yellow' && currentLightColor !== 'red') return;
        if (!isWarningToneEnabled(currentLightColor)) return;
        const config = WARNING_TONES[currentLightColor];
        if (!config) return;
        await playWarningTone(currentLightColor);
        if (loopToken !== warningToneLoopToken) return;
        if (currentLightColor !== 'yellow' && currentLightColor !== 'red') return;
        if (!isWarningToneEnabled(currentLightColor)) return;
        warningToneTimerId = view.setTimeout(loop, config.intervalMs);
      };
      void loop();
    };

    const clampThresholdValue = (value, min, max, fallback) => {
      const parsed = Math.round(Number(value));
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(Math.max(parsed, min), max);
    };

    const renderThresholdControls = () => {
      if (dom.monitorYellowThresholdInput) {
        dom.monitorYellowThresholdInput.value = String(thresholds.yellow);
      }
      if (dom.monitorRedThresholdInput) {
        dom.monitorRedThresholdInput.value = String(thresholds.red);
      }
      if (dom.monitorYellowThresholdValue) {
        dom.monitorYellowThresholdValue.textContent = `${thresholds.yellow} dB`;
      }
      if (dom.monitorRedThresholdValue) {
        dom.monitorRedThresholdValue.textContent = `${thresholds.red} dB`;
      }
    };

    const setMonitorThreshold = (thresholdKey, value) => {
      if (thresholdKey === 'yellow') {
        const yellow = clampThresholdValue(value, DB_FLOOR, DB_CEILING - MIN_THRESHOLD_GAP, DEFAULT_THRESHOLDS.yellow);
        thresholds = {
          yellow,
          red: Math.max(thresholds.red, yellow + MIN_THRESHOLD_GAP),
        };
      } else if (thresholdKey === 'red') {
        const red = clampThresholdValue(value, DB_FLOOR + MIN_THRESHOLD_GAP, DB_CEILING, DEFAULT_THRESHOLDS.red);
        thresholds = {
          yellow: Math.min(thresholds.yellow, red - MIN_THRESHOLD_GAP),
          red,
        };
      }
      renderThresholdControls();
    };

    const monitorLevel = () => {
      if (!analyser || !running) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const level = toEstimatedDb(rms);
      const now = view.performance.now();
      windowLevelSum += level;
      windowSampleCount += 1;
      if ((now - windowStartMs) >= AVERAGE_WINDOW_MS && windowSampleCount > 0) {
        const average = Math.round(windowLevelSum / windowSampleCount);
        setActiveLight(classifyLevel(average));
        windowStartMs = now;
        windowLevelSum = 0;
        windowSampleCount = 0;
      }
      rafId = view.requestAnimationFrame(monitorLevel);
    };

    const stopMeasurement = async ({ silent = false } = {}) => {
      stopWarningToneLoop();
      if (rafId) {
        view.cancelAnimationFrame(rafId);
        rafId = null;
      }
      try {
        source?.disconnect?.();
      } catch { }
      try {
        analyser?.disconnect?.();
      } catch { }
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch { }
        });
      }
      stream = null;
      source = null;
      analyser = null;
      if (audioContext) {
        try {
          await audioContext.close();
        } catch { }
      }
      audioContext = null;
      running = false;
      starting = false;
      resetAverageWindow();
      setActiveLight(null);
      setMicUiState(MIC_UI_STATE.READY, silent ? '' : 'gestoppt');
    };

    const startMeasurement = async () => {
      if (running || starting) return;
      if (!isMicSupported()) {
        setMicUiState(MIC_UI_STATE.UNSUPPORTED);
        setActiveLight(null);
        return;
      }
      if (typeof view.navigator.mediaDevices.enumerateDevices === 'function') {
        try {
          const devices = await view.navigator.mediaDevices.enumerateDevices();
          const hasAudioInput = Array.isArray(devices) && devices.some((device) => device?.kind === 'audioinput');
          if (!hasAudioInput) {
            setMicUiState(MIC_UI_STATE.ERROR, 'kein Mikrofon gefunden');
            showMessage('Kein Mikrofon angeschlossen. Bitte Mikrofon verbinden und erneut starten.', 'warn', { presentation: 'toast' });
            setActiveLight(null);
            return;
          }
        } catch { }
      }
      starting = true;
      setMicUiState(MIC_UI_STATE.STARTING);
      try {
        stream = await view.navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        audioContext = new AudioContextClass();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        running = true;
        setActiveLight(null);
        resetAverageWindow();
        monitorLevel();
        setMicUiState(MIC_UI_STATE.ACTIVE);
      } catch (error) {
        setActiveLight(null);
        const errorName = typeof error?.name === 'string' ? error.name : '';
        const errorMessage = typeof error?.message === 'string' ? error.message : '';
        const noMicFound = (
          errorName === 'NotFoundError'
          || errorName === 'DevicesNotFoundError'
          || /no\s+audio\s+input|no\s+input\s+device|device.*not\s*found|kein.*mikrofon/i.test(errorMessage)
        );
        if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
          setMicUiState(MIC_UI_STATE.ERROR, 'Zugriff verweigert');
        } else if (noMicFound) {
          setMicUiState(MIC_UI_STATE.ERROR, 'kein Mikrofon gefunden');
          showMessage('Kein Mikrofon angeschlossen. Bitte Mikrofon verbinden und erneut starten.', 'warn', { presentation: 'toast' });
        } else {
          setMicUiState(MIC_UI_STATE.ERROR, 'nicht verfügbar');
        }
      } finally {
        starting = false;
        renderMicControlState();
      }
    };

    const init = () => {
      renderThresholdControls();
      renderWarningToneState();
      renderMicControlState();
      renderTimer();
      setActiveLight(null);
      timerUnsubscribe = timerStore.subscribe(renderTimer);
      monitorTickId = view.setInterval(renderTimer, 250);
      dom.monitorThresholdInputs?.forEach((input) => {
        bind(input, 'input', () => {
          setMonitorThreshold(input.dataset.monitorThreshold, input.value);
        });
      });
      dom.monitorWarningToneButtons?.forEach((button) => {
        bind(button, 'click', () => {
          const toneKey = button.dataset.monitorWarningToneToggle;
          if (toneKey !== 'yellow' && toneKey !== 'red') return;
          warningToneEnabled = {
            ...warningToneEnabled,
            [toneKey]: !isWarningToneEnabled(toneKey),
          };
          renderWarningToneState();
          syncWarningToneLoop();
        });
      });
      [dom.monitorMicStartButton, dom.workPhaseMonitorStartCollapsed].filter(Boolean).forEach((button) => {
        bind(button, 'click', () => {
          void startMeasurement();
        });
      });
      [dom.monitorMicStopButton, dom.workPhaseMonitorStopCollapsed].filter(Boolean).forEach((button) => {
        bind(button, 'click', () => {
          void stopMeasurement();
        });
      });
    };

    const dispose = () => {
      timerUnsubscribe();
      if (monitorTickId) {
        view.clearInterval(monitorTickId);
        monitorTickId = undefined;
      }
      void stopMeasurement({ silent: true });
    };

    return Object.freeze({ init, dispose });
  };

  const monitor = createMonitor();

  const updateMonitorAmpelSizing = () => {
    const ampel = dom.monitorAmpel;
    const monitorLightNodes = Object.values(dom.monitorLights || {}).filter(Boolean);
    if (!ampel || !monitorLightNodes.length) return;
    const rect = ampel.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      ampel.style.removeProperty('--monitor-light-fit-size');
      return;
    }
    const computed = view.getComputedStyle(ampel);
    const paddingInline = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
    const paddingBlock = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    const gap = parseFloat(computed.rowGap || computed.gap) || 0;
    const innerWidth = Math.max(0, rect.width - paddingInline);
    const innerHeight = Math.max(0, rect.height - paddingBlock);
    const lightCount = monitorLightNodes.length;
    if (!innerWidth || !innerHeight || !lightCount) {
      ampel.style.removeProperty('--monitor-light-fit-size');
      return;
    }
    const sizeByWidth = innerWidth;
    const sizeByHeight = (innerHeight - (gap * (lightCount - 1))) / lightCount;
    const fitSize = Math.floor(Math.max(0, Math.min(sizeByWidth, sizeByHeight)));
    if (fitSize > 0) {
      ampel.style.setProperty('--monitor-light-fit-size', `${fitSize}px`);
      return;
    }
    ampel.style.removeProperty('--monitor-light-fit-size');
  };

  const refreshLayout = () => {
    updateMonitorAmpelSizing();
    positionHintOverlay();
  };

  const setActive = (nextActive) => {
    active = Boolean(nextActive);
    if (active) {
      refreshLayout();
    }
    return active;
  };

  const getPlanState = () => {
    const timerState = getTimerState();
    const durationMinutes = parseWorkOrderDuration(timerState.durationMinutes);
    return {
      workOrder: typeof timerState.workOrderText === 'string' ? timerState.workOrderText : '',
      workOrderDurationMinutes: durationMinutes,
      workOrderStartISO: hasWorkOrderTiming(timerState) ? timerState.startISO : null,
    };
  };

  const restorePlanState = (data) => {
    const sourceData = data && typeof data === 'object' ? data : {};
    const importedWorkOrder = typeof sourceData.workOrder === 'string' ? sourceData.workOrder : '';
    const incomingStart = typeof sourceData.workOrderStartISO === 'string'
      ? sourceData.workOrderStartISO
      : (typeof sourceData.workOrderStart === 'string' ? sourceData.workOrderStart : null);
    const incomingDuration = parseWorkOrderDuration(
      sourceData.workOrderDurationMinutes ?? sourceData.workOrderDuration
    );
    const nextStart = importedWorkOrder.trim() && incomingDuration && incomingStart && Number.isFinite(Date.parse(incomingStart))
      ? incomingStart
      : null;
    replaceTimerState({
      ...getTimerState(),
      workOrderText: importedWorkOrder,
      durationMinutes: incomingDuration,
      startISO: nextStart,
      alarmState: false,
    });
    render();
    return getPlanState();
  };

  const reset = () => {
    timerStore.setWorkOrder({
      workOrderText: '',
      durationMinutes: null,
      startISO: null,
    });
    timerStore.stop();
    resetTimerWarningMilestones(null);
    clearTimerVisualWarnings();
    stopWorkOrderAlarmSound();
    render();
  };

  const activateTutorialDemo = () => {
    if (workPhaseTutorialDemoActive) return () => {};
    const previousTimerState = getTimerState();
    workPhaseTutorialDemoActive = true;
    stopWorkOrderAlarmSound();
    replaceTimerState({
      workOrderText: 'Bearbeitet die Beispielaufgabe zu zweit und haltet eure Ergebnisse fest.',
      durationMinutes: 20,
      startISO: null,
      alarmState: false,
    });
    render();
    return () => {
      if (!workPhaseTutorialDemoActive) return;
      workPhaseTutorialDemoActive = false;
      stopWorkOrderAlarmSound();
      clearTimerVisualWarnings();
      replaceTimerState(previousTimerState);
      render();
      if (previousTimerState.alarmState) {
        updateWorkOrderAlert(true);
      }
    };
  };

  [dom.timerWorkOrderStart, dom.workPhaseTimerStartCollapsed].filter(Boolean).forEach((button) => {
    bind(button, 'click', startWorkOrderTimer);
  });
  [dom.timerWorkOrderStop, dom.workPhaseTimerStopCollapsed].filter(Boolean).forEach((button) => {
    bind(button, 'click', stopWorkOrderSession);
  });
  dom.timerWarningToneButtons?.forEach((button) => {
    bind(button, 'click', () => {
      toggleTimerWarningTone(button.dataset.timerWarningToneToggle);
    });
  });
  dom.timerSecondsToggleButtons?.forEach((button) => {
    bind(button, 'click', toggleTimerSeconds);
  });
  bind(dom.workOrderDurationInput, 'input', () => {
    applyTimerDurationFromInput({ preserveStart: true });
  });
  bind(dom.workOrderDurationInput, 'change', () => {
    applyTimerDurationFromInput({ preserveStart: true });
  });
  bind(dom.workOrderDurationRange, 'input', () => {
    if (!dom.workOrderDurationInput || !dom.workOrderDurationRange) return;
    dom.workOrderDurationInput.value = dom.workOrderDurationRange.value;
    applyTimerDurationFromInput({ preserveStart: true });
  });
  dom.workOrderDurationStepButtons?.forEach((button) => {
    bind(button, 'click', () => {
      adjustTimerDuration(button.dataset.durationStep);
    });
  });
  bind(dom.workOrderRestClock, 'click', dismissWorkOrderAlarm);
  bind(dom.workOrderMeta, 'click', dismissWorkOrderAlarm);
  bind(dom.workOrderHintOverlay, 'click', dismissWorkOrderAlarm);
  bind(dom.workOrderTextarea, 'input', saveWorkOrderFromTextarea);
  bind(dom.workOrderTextarea, 'change', saveWorkOrderFromTextarea);
  bind(view, 'resize', positionHintOverlay);
  bind(view, 'scroll', positionHintOverlay, true);

  const timerUnsubscribe = timerStore.subscribe((timerState) => {
    renderWorkOrderTimerButtonsState(timerState);
  });
  removers.push(timerUnsubscribe);

  renderWorkOrderTimerButtonsState();
  renderTimerWarningToneState();
  renderTimerSecondsToggleState();
  try {
    monitor.init();
  } catch (error) {
    reportAppError(error, 'Lautstärke-Feedback konnte nicht initialisiert werden.', {
      scope: 'app-init',
      action: 'init-monitor-module',
    });
  }
  render();
  updateMonitorAmpelSizing();

  if (typeof view.ResizeObserver === 'function' && dom.monitorAmpel) {
    const observer = new view.ResizeObserver(updateMonitorAmpelSizing);
    observer.observe(dom.monitorAmpel);
    if (dom.monitorAmpel.parentElement) {
      observer.observe(dom.monitorAmpel.parentElement);
    }
    observers.push(observer);
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopWorkOrderTimer();
    stopWorkOrderAlarmSound();
    closeWorkOrderAudioContext();
    if (timerVisualWarningTimeoutId) {
      view.clearTimeout(timerVisualWarningTimeoutId);
      timerVisualWarningTimeoutId = null;
    }
    monitor.dispose();
    observers.forEach(observer => observer.disconnect());
    removers.splice(0).forEach(remove => remove());
  };

  return Object.freeze({
    render,
    refreshLayout,
    positionHintOverlay,
    setActive,
    getPlanState,
    restorePlanState,
    reset,
    activateTutorialDemo,
    dispose,
  });
}
