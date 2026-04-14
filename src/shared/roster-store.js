import {
  STUDENTS_UPDATED_EVENT,
  normalizeStudentsSyncDetail,
} from './student-sync-bus.js';

export function createSharedRosterStore({
  documentBus = typeof document !== 'undefined' ? document : null,
  initialDetail = null,
} = {}) {
  let rosterState = normalizeStudentsSyncDetail(initialDetail);
  const listeners = new Set();

  const snapshot = () => normalizeStudentsSyncDetail(rosterState);

  const emit = () => {
    const next = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(next);
      } catch (error) {
        console.error(error);
      }
    });
  };

  const apply = (detail) => {
    rosterState = normalizeStudentsSyncDetail(detail, rosterState);
    emit();
    return snapshot();
  };

  const onStudentsUpdated = (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    apply(detail);
  };

  if (documentBus?.addEventListener) {
    documentBus.addEventListener(STUDENTS_UPDATED_EVENT, onStudentsUpdated);
  }

  return {
    getState() {
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(detail) {
      const normalized = normalizeStudentsSyncDetail(detail, rosterState);
      if (documentBus?.dispatchEvent) {
        documentBus.dispatchEvent(new CustomEvent(STUDENTS_UPDATED_EVENT, {
          detail: normalized,
        }));
        return normalized;
      }
      return apply(normalized);
    },
    replace(detail) {
      return apply(detail);
    },
    dispose() {
      if (documentBus?.removeEventListener) {
        documentBus.removeEventListener(STUDENTS_UPDATED_EVENT, onStudentsUpdated);
      }
      listeners.clear();
    },
  };
}
