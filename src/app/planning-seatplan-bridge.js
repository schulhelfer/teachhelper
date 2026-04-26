import {
  STUDENTS_UPDATED_EVENT,
  STUDENTS_SYNC_SOURCE_SEATPLAN,
  normalizeStudentsSyncDetail,
} from '../shared/student-sync-bus.js';
import {
  PLANNING_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT,
  PLANNING_COURSE_GRADE_SAVE_REQUEST_EVENT,
  PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT,
  PLANNING_COURSE_SEATPLAN_SAVE_REQUEST_EVENT,
  PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT,
  SEATPLAN_COURSE_SAVE_REQUEST_EVENT,
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
  getChromeCollapsed,
  rosterStore,
  documentBus = document,
} = {}) {
  let mergerController = null;
  let planningController = null;
  let seatplanController = null;
  const tabInitState = {
    [TAB_MERGER]: false,
    [TAB_PLANNING]: false,
    [TAB_SEATPLAN]: false,
  };

  const seatplanBus = documentBus;

  const buildStudentsSyncDetail = (source, importedAt = Date.now()) => normalizeStudentsSyncDetail({
    ...rosterStore?.getState?.(),
    source,
    importedAt,
  });

  const dispatchStudentsUpdateToSeatplan = (detail) => {
    seatplanController?.send(detail);
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
    mergerController = mountMerger({ host });
    mergerController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
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
    const rosterState = rosterStore?.getState?.();
    if (Array.isArray(rosterState?.students) && rosterState.students.length > 0) {
      dispatchStudentsUpdateToSeatplan(buildStudentsSyncDetail(rosterState.source, Date.now()));
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
    mergerController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
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
    rosterStore?.dispatch?.(detail);
  }

  function sendCourseSeatplanContext(detail) {
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_SEATPLAN);
    seatplanController?.sendCourseContext?.(detail);
  }

  seatplanBus.addEventListener(STUDENTS_UPDATED_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (detail.source === STUDENTS_SYNC_SOURCE_SEATPLAN) return;
    dispatchStudentsUpdateToSeatplan(detail);
  });

  seatplanBus.addEventListener(SEATPLAN_COURSE_SAVE_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_PLANNING);
    planningController?.post?.(PLANNING_COURSE_SEATPLAN_SAVE_REQUEST_EVENT, detail);
  });

  seatplanBus.addEventListener(SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_PLANNING);
    planningController?.post?.(PLANNING_COURSE_GRADE_CONFIG_REQUEST_EVENT, detail);
  });

  seatplanBus.addEventListener(SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_PLANNING);
    planningController?.post?.(PLANNING_COURSE_GRADE_SAVE_REQUEST_EVENT, detail);
  });

  const saveResultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
    ? window
    : documentBus;
  saveResultTarget.addEventListener(PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseSaveResult?.(detail);
  });

  saveResultTarget.addEventListener(PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseGradeConfigResult?.(detail);
  });

  saveResultTarget.addEventListener(PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseGradeSaveResult?.(detail);
  });

  return {
    ensureTabInitialized,
    dispatchPlanningViewRequest,
    emitStudentsUpdated,
    refreshModuleLayouts,
    sendCourseSeatplanContext,
  };
}
