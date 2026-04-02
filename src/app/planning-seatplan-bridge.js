import {
  STUDENTS_UPDATED_EVENT,
  STUDENTS_SYNC_SOURCE_GROUPS,
  STUDENTS_SYNC_SOURCE_SEATPLAN,
} from '../shared/student-sync-bus.js';
import {
  PLANNING_VIEW_REQUEST_EVENT,
  TAB_GRADES,
  TAB_MERGER,
  TAB_PLANNING,
  TAB_SEATPLAN,
} from '../shell/tabs.js';
import { mountMerger } from '../modules/merger/index.js';
import { mountPlanning } from '../modules/planning/index.js';
import { mountSeatplan } from '../modules/seatplan/index.js';

export function createPlanningSeatplanBridge({
  els,
  state,
  SharedTimerStore,
  getChromeCollapsed,
  cloneStudentsForSync,
  sanitizeExportFileName,
  updateCsvStatusDisplay,
  syncStateFromTimerStore,
  syncGroupSizeInputs,
  refreshUnseated,
  renderRandomPicker,
  renderSeats,
  renderWorkOrder,
  updateScrollHint,
  documentBus = document,
} = {}) {
  let planningController = null;
  let seatplanController = null;
  let lastStudentsSyncTimestamp = 0;
  const tabInitState = {
    [TAB_MERGER]: false,
    [TAB_PLANNING]: false,
    [TAB_SEATPLAN]: false,
  };

  const seatplanBus = documentBus;

  const buildStudentsSyncDetail = (source, importedAt = Date.now()) => ({
    source,
    students: cloneStudentsForSync(state.students),
    csvName: state.csvName || '',
    headers: Array.isArray(state.headers) ? state.headers.slice() : [],
    delim: typeof state.delim === 'string' ? state.delim : ',',
    importedAt,
  });

  const dispatchStudentsUpdateToSeatplan = (detail) => {
    seatplanController?.send(detail);
  };

  const applySyncedStudentsToGroups = (detail) => {
    if (!detail || typeof detail !== 'object') return;
    const importedAt = Number(detail.importedAt);
    if (Number.isFinite(importedAt) && importedAt <= lastStudentsSyncTimestamp) return;
    lastStudentsSyncTimestamp = Number.isFinite(importedAt) ? importedAt : Date.now();
    state.students = cloneStudentsForSync(detail.students);
    state.seats = {};
    state.seatTopics = {};
    state.headers = Array.isArray(detail.headers) ? detail.headers.slice() : [];
    if (typeof detail.delim === 'string' && detail.delim) {
      state.delim = detail.delim;
    }
    if (typeof detail.csvName === 'string') {
      const label = sanitizeExportFileName(detail.csvName);
      state.csvName = label || '';
      updateCsvStatusDisplay();
    }
    SharedTimerStore.setWorkOrder({
      workOrderText: '',
      durationMinutes: null,
      startISO: null,
    });
    SharedTimerStore.stop();
    syncStateFromTimerStore();
    state.lockedSeats.clear();
    syncGroupSizeInputs();
    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    refreshUnseated();
    renderRandomPicker();
    renderSeats();
    renderWorkOrder();
    state.scrollHintDismissed = false;
    state._lastImport = true;
    updateScrollHint();
  };

  const initPlanningTab = (root = els.planningHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    planningController = mountPlanning({ host });
    planningController?.applyShellLayout({ collapsed: getChromeCollapsed() });
  };

  const initMergerTab = (root = els.mergerHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    mountMerger({ host });
  };

  const initSeatplanTabNative = (
    roots = {
      sideHost: els.seatplanSideHost,
      mainHost: els.seatplanMainHost,
      dialogHost: els.seatplanDialogHost,
    },
    bus = documentBus
  ) => {
    const sideHost = roots?.sideHost || els.seatplanSideHost;
    const mainHost = roots?.mainHost || els.seatplanMainHost;
    const dialogHost = roots?.dialogHost || els.seatplanDialogHost;
    if (!sideHost || !mainHost || !dialogHost || mainHost.dataset.initialized === '1') return;
    seatplanController = mountSeatplan({ sideHost, mainHost, dialogHost, bus });
    seatplanController?.applyShellLayout({ collapsed: getChromeCollapsed() });
    if (Array.isArray(state.students) && state.students.length > 0) {
      dispatchStudentsUpdateToSeatplan(buildStudentsSyncDetail(STUDENTS_SYNC_SOURCE_GROUPS, Date.now()));
    }
  };

  function dispatchPlanningViewRequest(view) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, {
      detail: {
        view: view === 'grades' ? 'grades' : 'week',
      },
    }));
  }

  function scheduleModuleLayoutRefresh(activeTab, isIOSDevice = false) {
    if (typeof window === 'undefined') return;

    const trigger = () => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {
        // ignore
      }
    };

    if (activeTab === TAB_SEATPLAN) {
      if (isIOSDevice) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(trigger);
        } else {
          setTimeout(trigger, 0);
        }
        setTimeout(trigger, 120);
      } else {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            trigger();
            requestAnimationFrame(trigger);
          });
        } else {
          setTimeout(trigger, 0);
          setTimeout(trigger, 40);
        }
        setTimeout(trigger, 140);
        setTimeout(trigger, 320);
        setTimeout(trigger, 520);
      }
      return;
    }

    if (activeTab !== TAB_PLANNING && activeTab !== TAB_GRADES) {
      return;
    }

    if (isIOSDevice) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(trigger);
      } else {
        setTimeout(trigger, 0);
      }
      return;
    }

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        trigger();
        requestAnimationFrame(trigger);
      });
    } else {
      setTimeout(trigger, 0);
      setTimeout(trigger, 40);
    }
  }

  function refreshModuleLayouts({ activeTab, isIOSDevice = false } = {}) {
    planningController?.applyShellLayout({ collapsed: getChromeCollapsed() });
    seatplanController?.applyShellLayout({ collapsed: getChromeCollapsed() });
    scheduleModuleLayoutRefresh(activeTab, isIOSDevice);
  }

  function ensureTabInitialized(tab) {
    if (tab === TAB_MERGER) {
      if (tabInitState[TAB_MERGER]) return;
      initMergerTab(els.mergerHost);
      tabInitState[TAB_MERGER] = true;
      return;
    }
    if (tab === TAB_PLANNING || tab === TAB_GRADES) {
      if (tabInitState[TAB_PLANNING]) return;
      initPlanningTab(els.planningHost);
      tabInitState[TAB_PLANNING] = true;
      return;
    }
    if (tab === TAB_SEATPLAN) {
      if (tabInitState[TAB_SEATPLAN]) return;
      initSeatplanTabNative({
        sideHost: els.seatplanSideHost,
        mainHost: els.seatplanMainHost,
        dialogHost: els.seatplanDialogHost,
      }, documentBus);
      tabInitState[TAB_SEATPLAN] = true;
    }
  }

  function emitStudentsUpdated(source) {
    const detail = buildStudentsSyncDetail(source);
    lastStudentsSyncTimestamp = Math.max(lastStudentsSyncTimestamp, Number(detail.importedAt) || Date.now());
    documentBus.dispatchEvent(new CustomEvent(STUDENTS_UPDATED_EVENT, { detail }));
  }

  seatplanBus.addEventListener(STUDENTS_UPDATED_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (detail.source !== STUDENTS_SYNC_SOURCE_SEATPLAN) return;
    applySyncedStudentsToGroups(detail);
  });

  seatplanBus.addEventListener(STUDENTS_UPDATED_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (detail.source === STUDENTS_SYNC_SOURCE_SEATPLAN) return;
    dispatchStudentsUpdateToSeatplan(detail);
  });

  return {
    ensureTabInitialized,
    dispatchPlanningViewRequest,
    emitStudentsUpdated,
    refreshModuleLayouts,
  };
}
