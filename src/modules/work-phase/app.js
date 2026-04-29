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

export function mountWorkPhase() {
  return {
    refreshLayout() {},
    positionHintOverlay() {},
    setActive() {},
  };
}
