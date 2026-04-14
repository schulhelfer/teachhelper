export function resolveWorkPhaseDom(doc = document) {
  return {
    monitorShell: doc.getElementById('monitor-shell'),
    monitorAmpel: doc.querySelector('.monitor-ampel'),
    workOrderShell: doc.getElementById('work-order-shell'),
    workOrderPanel: doc.getElementById('work-order-panel'),
    workOrderDisplay: doc.getElementById('work-order-display'),
    workOrderMeta: doc.getElementById('work-order-meta'),
    workOrderRestClock: doc.getElementById('work-order-rest-clock'),
    workOrderCountdown: doc.getElementById('work-order-countdown'),
    workOrderEndtime: doc.getElementById('work-order-endtime'),
    workOrderHintOverlay: doc.getElementById('work-order-hint-overlay'),
    workOrderTextarea: doc.getElementById('work-order-text'),
    workOrderDurationInput: doc.getElementById('work-order-duration'),
    workOrderDurationStepButtons: doc.querySelectorAll('[data-duration-step]'),
    timerPanel: doc.getElementById('timer-panel'),
    timerShell: doc.getElementById('timer-shell'),
    timerWarningBanner: doc.getElementById('timer-warning-banner'),
    monitorMicToggleButton: doc.getElementById('monitor-mic-toggle'),
    workPhaseMonitorCollapsed: doc.getElementById('work-phase-monitor-collapsed'),
    workPhaseTimerCollapsed: doc.getElementById('work-phase-timer-collapsed'),
    monitorWarningToneButtons: doc.querySelectorAll('[data-monitor-warning-tone-toggle]'),
    monitorWarningToneLabels: doc.querySelectorAll('[data-monitor-warning-tone-label]'),
    timerWarningToneButtons: doc.querySelectorAll('[data-timer-warning-tone-toggle]'),
    timerWarningToneLabels: doc.querySelectorAll('[data-timer-warning-tone-label]'),
    timerSecondsToggleButtons: doc.querySelectorAll('[data-timer-seconds-toggle]'),
    timerSecondsToggleLabels: doc.querySelectorAll('[data-timer-seconds-label]'),
    timerWorkOrderToggle: doc.getElementById('timer-work-order-toggle'),
  };
}

export function mountWorkPhase() {
  return {
    refreshLayout() {},
    positionHintOverlay() {},
    setActive() {},
  };
}
