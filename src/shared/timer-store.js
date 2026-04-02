export function createSharedTimerStore(initialState = {}) {
  let timerState = sanitizeState(initialState);
  const listeners = new Set();

  function sanitizeDuration(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return Math.max(1, Math.round(numeric));
  }

  function sanitizeStartISO(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || !Number.isFinite(Date.parse(trimmed))) return null;
    return trimmed;
  }

  function sanitizeText(value) {
    return typeof value === 'string' ? value : '';
  }

  function sanitizeAlarm(value) {
    return Boolean(value);
  }

  function sanitizeState(input) {
    return {
      workOrderText: sanitizeText(input?.workOrderText),
      durationMinutes: sanitizeDuration(input?.durationMinutes),
      startISO: sanitizeStartISO(input?.startISO),
      alarmState: sanitizeAlarm(input?.alarmState),
    };
  }

  function snapshot() {
    return { ...timerState };
  }

  function emit() {
    const next = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        console.error(error);
      }
    });
  }

  return {
    getState() {
      return snapshot();
    },
    replace(next) {
      timerState = sanitizeState(next);
      emit();
    },
    setWorkOrder({ workOrderText, durationMinutes, startISO = null }) {
      timerState = sanitizeState({
        ...timerState,
        workOrderText,
        durationMinutes,
        startISO,
        alarmState: false,
      });
      emit();
    },
    start(startISO = new Date().toISOString()) {
      timerState = sanitizeState({
        ...timerState,
        startISO,
        alarmState: false,
      });
      emit();
    },
    stop() {
      timerState = sanitizeState({
        ...timerState,
        startISO: null,
        alarmState: false,
      });
      emit();
    },
    setAlarmState(alarmState) {
      timerState = sanitizeState({
        ...timerState,
        alarmState,
      });
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
