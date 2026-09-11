import { createSharedRosterStore } from '../shared/roster-store.js';
import { STUDENTS_SYNC_SOURCE_GROUPS } from '../shared/student-sync-bus.js';

export function createClassroomState({
  documentBus = typeof document !== 'undefined' ? document : null,
  initialState = {},
  now = () => Date.now(),
  normalizePerformanceFlair = value => String(value || '').trim().toUpperCase(),
  normalizeRandomPickerWeight = value => Number(value) || 0,
  clampPerformanceFlairCount = value => Number(value) || 4,
  sanitizeCsvName = value => String(value || '').trim(),
  onRosterObserved = () => {},
  onRosterApplied = () => {},
} = {}) {
  let state = {
    students: Array.isArray(initialState.students) ? initialState.students : [],
    headers: Array.isArray(initialState.headers) ? initialState.headers : [],
    delim: typeof initialState.delim === 'string' && initialState.delim
      ? initialState.delim
      : ',',
    csvName: typeof initialState.csvName === 'string' ? initialState.csvName : '',
    performanceFlairCount: initialState.performanceFlairCount ?? 4,
  };
  let demoActive = false;
  let lastRosterImportedAt = 0;
  let disposed = false;

  const cloneStudentsForSync = (students) => {
    if (!Array.isArray(students)) return [];
    return students
      .map((student, index) => {
        if (!student || typeof student !== 'object') return null;
        const rawId = typeof student.id === 'string'
          ? student.id.trim()
          : String(student.id ?? '').trim();
        const id = rawId || String(index + 1).padStart(2, '0');
        return {
          id,
          first: typeof student.first === 'string' ? student.first : '',
          last: typeof student.last === 'string' ? student.last : '',
          performanceFlair: normalizePerformanceFlair(student.performanceFlair),
          buddies: Array.isArray(student.buddies)
            ? student.buddies.map(value => String(value)).filter(Boolean)
            : [],
          foes: Array.isArray(student.foes)
            ? student.foes.map(value => String(value)).filter(Boolean)
            : [],
          randomWeight: normalizeRandomPickerWeight(student.randomWeight),
        };
      })
      .filter(Boolean);
  };

  const rosterStore = createSharedRosterStore({
    documentBus,
    initialDetail: {
      source: STUDENTS_SYNC_SOURCE_GROUPS,
      students: cloneStudentsForSync(state.students),
      performanceFlairCount: state.performanceFlairCount,
      csvName: state.csvName,
      headers: state.headers,
      delim: state.delim,
      importedAt: now(),
    },
  });

  const unsubscribe = rosterStore.subscribe((detail) => {
    if (demoActive || !detail || typeof detail !== 'object') return;
    onRosterObserved(detail);
    const importedAt = Number(detail.importedAt);
    if (Number.isFinite(importedAt) && importedAt <= lastRosterImportedAt) return;
    lastRosterImportedAt = Number.isFinite(importedAt) ? importedAt : now();
    state.students = cloneStudentsForSync(detail.students);
    state.performanceFlairCount = clampPerformanceFlairCount(
      detail.performanceFlairCount,
      state.performanceFlairCount
    );
    state.headers = Array.isArray(detail.headers) ? detail.headers.slice() : [];
    if (typeof detail.delim === 'string' && detail.delim) {
      state.delim = detail.delim;
    }
    if (typeof detail.csvName === 'string') {
      const rawLabel = detail.csvName.trim();
      state.csvName = rawLabel ? sanitizeCsvName(rawLabel) : '';
    }
    onRosterApplied(detail, state);
  });

  const getState = () => state;

  const updateState = (patch) => {
    if (patch && typeof patch === 'object') {
      Object.assign(state, patch);
    }
    return state;
  };

  const sync = ({
    source = STUDENTS_SYNC_SOURCE_GROUPS,
    importedAt = now(),
  } = {}) => {
    if (demoActive) return rosterStore.getState();
    return rosterStore.dispatch({
      ...rosterStore.getState(),
      source,
      students: cloneStudentsForSync(state.students),
      performanceFlairCount: state.performanceFlairCount,
      csvName: state.csvName || '',
      headers: Array.isArray(state.headers) ? state.headers.slice() : [],
      delim: state.delim,
      importedAt,
    });
  };

  const activateDemoState = (patch = {}) => {
    if (demoActive) return () => {};
    const realState = state;
    const previousRosterState = rosterStore.getState();
    let restored = false;
    demoActive = true;
    state = {
      ...realState,
      ...(patch && typeof patch === 'object' ? patch : {}),
    };
    return () => {
      if (restored) return;
      restored = true;
      if (!demoActive) return;
      rosterStore.replace(previousRosterState);
      state = realState;
      demoActive = false;
    };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    rosterStore.dispose();
  };

  return {
    rosterStore,
    getState,
    updateState,
    sync,
    activateDemoState,
    isDemoActive: () => demoActive,
    dispose,
  };
}
