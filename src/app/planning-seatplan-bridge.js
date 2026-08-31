import {
  STUDENTS_UPDATED_EVENT,
  STUDENTS_SYNC_SOURCE_GRADES,
  STUDENTS_SYNC_SOURCE_SEATPLAN,
  normalizeStudentsSyncDetail,
} from '../shared/student-sync-bus.js';
import {
  GRADES_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT,
  GRADES_COURSE_GRADE_SAVE_REQUEST_EVENT,
  GRADES_COURSE_GRADE_SAVE_RESULT_EVENT,
  GRADES_COURSE_SEATPLAN_SAVE_REQUEST_EVENT,
  GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT,
  GRADES_GRADE_ROSTER_COURSES_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  GRADES_GRADE_VAULT_STATE_EVENT,
  GRADES_GRADE_VAULT_REQUEST_EVENT,
  GRADES_NAME_LEARNING_DATA_REQUEST_EVENT,
  GRADES_NAME_LEARNING_DATA_RESULT_EVENT,
  GRADES_NAME_LEARNING_REVIEW_REQUEST_EVENT,
  GRADES_NAME_LEARNING_REVIEW_RESULT_EVENT,
  GRADES_MANUAL_SAVE_REQUEST_EVENT,
  GRADES_READY_EVENT,
  GRADES_TAB_LEAVE_REQUEST_EVENT,
  GRADES_TAB_LEAVE_RESULT_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_TAB_LEAVE_REQUEST_EVENT,
  PLANNING_TAB_LEAVE_RESULT_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT,
  SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT,
  SEATPLAN_COURSE_SAVE_REQUEST_EVENT,
  SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT,
  SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT,
  TAB_DUPLICATE_CHECK,
  TAB_GRADES,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_SEATPLAN,
} from '../shell/tabs.js';
import { mountDuplicateCheck } from '../modules/duplicate-check/index.js';
import { mountGrades } from '../modules/grades/index.js';
import { mountMerger } from '../modules/merger/index.js';
import { mountNameLearning } from '../modules/name-learning/index.js';
import { mountPlanning } from '../modules/planning/index.js';
import { mountQr } from '../modules/qr/index.js';
import { mountSeatplan } from '../modules/seatplan/index.js';
import {
  WORKSPACE_ERROR_NOT_READY,
  WORKSPACE_OWNER_READY_EVENT,
} from '../shared/school-data/messages.js';

const DEFERRED_GRADES_MOUNT_TIMEOUT_MS = 4000;

export function createPlanningSeatplanBridge({
  els,
  getChromeCollapsed,
  rosterStore,
  documentBus = document,
  onCourseGradeSaveSuccess = null,
} = {}) {
  let mergerController = null;
  let duplicateCheckController = null;
  let qrController = null;
  let gradesController = null;
  let planningController = null;
  let planningInitPending = false;
  let pendingPlanningViewRequest = null;
  let pendingGradesNavigation = null;
  let pendingCourseGradeSaveRequest = null;
  let gradesTabLeaveRequestSequence = 0;
  let planningTabLeaveRequestSequence = 0;
  let seatplanController = null;
  let nameLearningController = null;
  let nameLearningGradeVaultState = null;
  let cancelDeferredGradesMount = null;
  const tabInitState = {
    [TAB_MERGER]: false,
    [TAB_DUPLICATE_CHECK]: false,
    [TAB_QR]: false,
    [TAB_PLANNING]: false,
    [TAB_GRADES]: false,
    [TAB_SEATPLAN]: false,
    [TAB_NAME_LEARNING]: false,
  };

  const seatplanBus = documentBus;

  const getWorkspaceController = () => (
    typeof window !== 'undefined' ? window.__teachhelperWorkspaceController || null : null
  );

  const setNameLearningGradeVaultState = (detail = null, host = els.nameLearningHost) => {
    const nextState = detail && typeof detail === 'object' ? { locked: detail.locked === true } : null;
    nameLearningGradeVaultState = nextState;
    if (host) {
      if (nextState?.locked) {
        host.dataset.gradeVaultLocked = 'true';
      } else {
        delete host.dataset.gradeVaultLocked;
      }
    }
    nameLearningController?.post?.({
      type: 'classroom:name-learning-access-state',
      detail: nextState || { locked: false },
    });
  };

  const refreshWorkspaceLifecycle = () => {
    const controller = getWorkspaceController();
    const owner = controller?.getOwner?.() || null;
    if (owner) controller?.refreshOwnerStatus?.(owner);
    return controller?.getLifecycle?.() || {
      owner: Boolean(owner),
      hydrated: Boolean(controller?.isHydrated?.()),
      ready: Boolean(controller?.isReady?.()),
      revision: Number(controller?.getRevision?.()) || 0,
    };
  };

  const isWorkspaceReady = () => Boolean(refreshWorkspaceLifecycle().ready);

  const withWorkspaceRevision = (detail = null) => {
    const source = detail && typeof detail === 'object' ? detail : {};
    const lifecycle = refreshWorkspaceLifecycle();
    return {
      ...source,
      baseRevision: source.baseRevision ?? lifecycle.revision,
      workspaceRevision: lifecycle.revision,
    };
  };

  const dispatchBlockedResult = (type, detail = null) => {
    const source = detail && typeof detail === 'object' ? detail : {};
    const lifecycle = refreshWorkspaceLifecycle();
    const result = {
      requestId: String(source.requestId || ''),
      courseId: Number(source.courseId || 0) || null,
      returnTab: String(source.returnTab || ''),
      ok: false,
      code: WORKSPACE_ERROR_NOT_READY,
      message: 'Der gemeinsame Datenstand wird noch geladen. Bitte danach erneut versuchen.',
      revision: lifecycle.revision,
      hydrated: lifecycle.hydrated,
    };
    const target = typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
      ? window
      : documentBus;
    target?.dispatchEvent?.(new CustomEvent(type, { detail: result }));
    return false;
  };

  const buildStudentsSyncDetail = (source, importedAt = Date.now(), overrides = null) => normalizeStudentsSyncDetail({
    ...rosterStore?.getState?.(),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
    source,
    importedAt,
  });

  const dispatchStudentsUpdateToSeatplan = (detail) => {
    seatplanController?.send(detail);
  };

  const initPlanningTab = (root = els.planningHost) => {
    const host = root;
    if (!host) return false;
    if (host.dataset.initialized === '1') return true;
    if (!isWorkspaceReady()) {
      planningInitPending = true;
      return false;
    }
    planningController = mountPlanning({ host });
    planningController?.applyShellLayout({ collapsed: getChromeCollapsed() });
    planningInitPending = false;
    if (planningController && pendingPlanningViewRequest) {
      planningController.post?.(
        PLANNING_VIEW_REQUEST_EVENT,
        withWorkspaceRevision(pendingPlanningViewRequest),
      );
      pendingPlanningViewRequest = null;
    }
    return Boolean(planningController);
  };

  const initGradesTab = (root = els.gradesHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    gradesController = mountGrades({ host });
    gradesController?.applyShellLayout({ collapsed: getChromeCollapsed() });
  };

  const mountGradesTabNow = () => {
    cancelDeferredGradesMount?.();
    cancelDeferredGradesMount = null;
    if (tabInitState[TAB_GRADES]) return;
    initGradesTab(els.gradesHost);
    tabInitState[TAB_GRADES] = true;
  };

  const scheduleGradesTabMount = () => {
    if (tabInitState[TAB_GRADES] || cancelDeferredGradesMount) return;
    const view = typeof window !== 'undefined' ? window : null;
    if (!view) {
      mountGradesTabNow();
      return;
    }
    const run = () => {
      const cancel = cancelDeferredGradesMount;
      cancelDeferredGradesMount = null;
      cancel?.();
      mountGradesTabNow();
    };
    const timer = view.setTimeout(run, DEFERRED_GRADES_MOUNT_TIMEOUT_MS);
    view.addEventListener(PLANNING_READY_EVENT, run, { once: true });
    cancelDeferredGradesMount = () => {
      view.clearTimeout(timer);
      view.removeEventListener(PLANNING_READY_EVENT, run);
    };
  };

  const initMergerTab = (root = els.mergerHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    mergerController = mountMerger({ host });
    mergerController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
  };

  const initDuplicateCheckTab = (root = els.duplicateCheckHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    duplicateCheckController = mountDuplicateCheck({ host });
    duplicateCheckController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
  };

  const initQrTab = (root = els.qrHost) => {
    const host = root;
    if (!host || host.dataset.initialized === '1') return;
    qrController = mountQr({ host });
    qrController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
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

  const initNameLearningTab = (host = els.nameLearningHost) => {
    if (!host || host.dataset.initialized === '1') return;
    if (!nameLearningGradeVaultState) {
      const vault = getWorkspaceController()?.getSnapshot?.('shell')?.vault;
      if (vault) {
        setNameLearningGradeVaultState({
          locked: vault.encryptionEnabled === true && vault.unlocked !== true,
        }, host);
      }
    }
    nameLearningController = mountNameLearning({ host });
    nameLearningController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
    if (nameLearningGradeVaultState) {
      setNameLearningGradeVaultState(nameLearningGradeVaultState, host);
    }
  };

  function dispatchPlanningViewRequest(view) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    const detail = view && typeof view === 'object'
      ? {
        ...view,
        view: view.view === 'settings' ? 'settings' : (view.view === 'course' ? 'course' : 'week'),
      }
      : {
        view: view === 'course' ? 'course' : 'week',
      };
    if (!isWorkspaceReady()) {
      pendingPlanningViewRequest = detail;
      planningInitPending = true;
      ensureTabInitialized(TAB_PLANNING);
      return false;
    }
    ensureTabInitialized(TAB_PLANNING);
    if (!planningController) {
      pendingPlanningViewRequest = detail;
      return false;
    }
    window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, {
      detail: withWorkspaceRevision(detail),
    }));
    return true;
  }

  function dispatchGradesNavigation(detail = null) {
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    const navigation = detail && typeof detail === 'object' ? detail : {};
    if (!isWorkspaceReady()) {
      pendingGradesNavigation = navigation;
      return false;
    }
    pendingGradesNavigation = null;
    gradesController?.navigate?.(withWorkspaceRevision(navigation));
    return true;
  }

  function dispatchMergerToolRequest(tool) {
    const normalizedTool = ['layout', 'merge', 'rotate', 'split'].includes(tool) ? tool : '';
    if (!normalizedTool) return;
    ensureTabInitialized(TAB_MERGER);
    mergerController?.selectTool?.(normalizedTool);
  }

  function scheduleModuleLayoutRefresh(activeTab, isIOSDevice = false) {
    if (typeof window === 'undefined') return;

    const trigger = () => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {
        
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
    duplicateCheckController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
    qrController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
    nameLearningController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
    gradesController?.applyShellLayout?.({ collapsed: getChromeCollapsed() });
    planningController?.applyShellLayout({ collapsed: getChromeCollapsed() });
    seatplanController?.applyShellLayout({ collapsed: getChromeCollapsed(), activeTab });
    scheduleModuleLayoutRefresh(activeTab, isIOSDevice);
  }

  function ensureTabInitialized(tab) {
    if (tab === TAB_MERGER) {
      if (tabInitState[TAB_MERGER]) return;
      initMergerTab(els.mergerHost);
      tabInitState[TAB_MERGER] = true;
      return;
    }
    if (tab === TAB_DUPLICATE_CHECK) {
      if (tabInitState[TAB_DUPLICATE_CHECK]) return;
      initDuplicateCheckTab(els.duplicateCheckHost);
      tabInitState[TAB_DUPLICATE_CHECK] = true;
      return;
    }
    if (tab === TAB_QR) {
      if (tabInitState[TAB_QR]) return;
      initQrTab(els.qrHost);
      tabInitState[TAB_QR] = true;
      return;
    }
    if (tab === TAB_PLANNING) {
      if (tabInitState[TAB_PLANNING]) return;
      if (initPlanningTab(els.planningHost)) {
        tabInitState[TAB_PLANNING] = true;
        scheduleGradesTabMount();
        return;
      }
      mountGradesTabNow();
      return;
    }
    if (tab === TAB_GRADES) {
      mountGradesTabNow();
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
      return;
    }
    if (tab === TAB_NAME_LEARNING) {
      if (tabInitState[TAB_NAME_LEARNING]) return;
      initNameLearningTab(els.nameLearningHost);
      tabInitState[TAB_NAME_LEARNING] = true;
    }
  }

  const initializePendingPlanning = () => {
    if (!planningInitPending || tabInitState[TAB_PLANNING]) return;
    if (initPlanningTab(els.planningHost)) {
      tabInitState[TAB_PLANNING] = true;
      scheduleModuleLayoutRefresh(TAB_PLANNING);
    }
  };

  window.addEventListener(GRADES_READY_EVENT, () => {
    const lifecycle = refreshWorkspaceLifecycle();
    if (lifecycle.ready && pendingGradesNavigation) {
      const navigation = pendingGradesNavigation;
      pendingGradesNavigation = null;
      gradesController?.navigate?.(withWorkspaceRevision(navigation));
    }
    initializePendingPlanning();
  });

  window.addEventListener(WORKSPACE_OWNER_READY_EVENT, initializePendingPlanning);

  function emitStudentsUpdated(source) {
    const detail = buildStudentsSyncDetail(source);
    rosterStore?.dispatch?.(detail);
  }

  function sendCourseSeatplanContext(detail) {
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_SEATPLAN);
    seatplanController?.sendCourseContext?.(detail);
  }

  function dispatchPublicLockedGradeRosterCourses(detail = null) {
    const source = detail && typeof detail === 'object' ? detail : {};
    const owner = getWorkspaceController()?.getOwner?.();
    const store = owner?.store;
    if (
      source.unlock === true
      || !owner?.isGradeVaultEncryptionEnabled?.()
      || owner?.canAccessGradeVault?.()
      || !store?.getActiveSchoolYear
      || !store?.listCourses
    ) {
      return false;
    }
    const year = store.getActiveSchoolYear();
    const studentCounts = store.getSetting?.('gradeCourseStudentCounts', {}) || {};
    const hasCompleteStudentCounts = store.getSetting?.('gradeCourseStudentCountsComplete', false) === true;
    const courses = year
      ? store.listCourses(year.id)
        .filter((course) => !course?.noLesson && !course?.noGrades && !course?.hiddenInSidebar)
        .filter((course) => (
          !hasCompleteStudentCounts
          || Number(studentCounts[String(Number(course.id) || 0)]) > 0
        ))
        .map((course) => ({
          id: Number(course.id) || 0,
          name: String(course.name || 'Kurs'),
          color: String(course.color || '#475569'),
        }))
        .filter((course) => course.id > 0)
      : [];
    const result = {
      requestId: String(source.requestId || ''),
      returnTab: String(source.returnTab || ''),
      restoreTabAfterUnlock: source.restoreTabAfterUnlock === true,
      ok: true,
      locked: true,
      hasCourses: courses.length > 0,
      courses,
    };
    const target = typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
      ? window
      : documentBus;
    target?.dispatchEvent?.(new CustomEvent(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, { detail: result }));
    return true;
  }

  function requestGradeRosterCourses(detail = null) {
    if (!isWorkspaceReady()) {
      return dispatchBlockedResult(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, detail);
    }
    if (dispatchPublicLockedGradeRosterCourses(detail)) {
      return true;
    }
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    gradesController?.post?.(GRADES_GRADE_ROSTER_COURSES_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestGradeRosterImport(detail = null) {
    if (!isWorkspaceReady()) {
      return dispatchBlockedResult(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, detail);
    }
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    gradesController?.post?.(GRADES_GRADE_ROSTER_IMPORT_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestNameLearningData(detail = null) {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    gradesController?.post?.(GRADES_NAME_LEARNING_DATA_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestNameLearningReview(detail = null) {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    gradesController?.post?.(GRADES_NAME_LEARNING_REVIEW_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestManualSave() {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_MANUAL_SAVE_REQUEST_EVENT, null);
    return true;
  }

  function requestGradeVault(detail = null) {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    if (String(detail?.action || '').trim().toLowerCase() === 'unlock') {
      try {
        window.focus?.();
        gradesController?.frame?.focus?.({ preventScroll: true });
      } catch (_error) {
      }
    }
    gradesController?.post?.(GRADES_GRADE_VAULT_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestGradesTabLeaveConfirmation() {
    ensureTabInitialized(TAB_GRADES);
    if (!gradesController?.requestTabLeave) {
      return Promise.resolve(false);
    }
    const requestId = `grades-tab-leave-${Date.now()}-${++gradesTabLeaveRequestSequence}`;
    const resultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
      ? window
      : documentBus;
    return new Promise((resolve) => {
      const onResult = (event) => {
        const detail = event?.detail;
        if (!detail || String(detail.requestId || '') !== requestId) {
          return;
        }
        resultTarget.removeEventListener(GRADES_TAB_LEAVE_RESULT_EVENT, onResult);
        resolve(detail.allowed === true);
      };
      resultTarget.addEventListener(GRADES_TAB_LEAVE_RESULT_EVENT, onResult);
      if (!gradesController.requestTabLeave({ requestId })) {
        resultTarget.removeEventListener(GRADES_TAB_LEAVE_RESULT_EVENT, onResult);
        resolve(false);
      }
    });
  }

  function requestPlanningTabLeaveConfirmation() {
    ensureTabInitialized(TAB_PLANNING);
    if (!planningController?.requestTabLeave) {
      return Promise.resolve(false);
    }
    const requestId = `planning-tab-leave-${Date.now()}-${++planningTabLeaveRequestSequence}`;
    const resultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
      ? window
      : documentBus;
    return new Promise((resolve) => {
      const onResult = (event) => {
        const detail = event?.detail;
        if (!detail || String(detail.requestId || '') !== requestId) {
          return;
        }
        resultTarget.removeEventListener(PLANNING_TAB_LEAVE_RESULT_EVENT, onResult);
        resolve(detail.allowed === true);
      };
      resultTarget.addEventListener(PLANNING_TAB_LEAVE_RESULT_EVENT, onResult);
      if (!planningController.requestTabLeave({ requestId })) {
        resultTarget.removeEventListener(PLANNING_TAB_LEAVE_RESULT_EVENT, onResult);
        resolve(false);
      }
    });
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
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT, detail);
      return;
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_SEATPLAN_SAVE_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  seatplanBus.addEventListener(SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT, (event) => {
    requestGradeRosterCourses(event.detail);
  });

  seatplanBus.addEventListener(SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT, (event) => {
    requestGradeRosterImport(event.detail);
  });

  documentBus.addEventListener('classroom:name-learning-data-request', (event) => {
    requestNameLearningData(event.detail);
  });

  documentBus.addEventListener('classroom:name-learning-review-request', (event) => {
    requestNameLearningReview(event.detail);
  });

  seatplanBus.addEventListener(SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT, detail);
      return;
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_GRADE_CONFIG_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  seatplanBus.addEventListener(SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_GRADE_SAVE_RESULT_EVENT, detail);
      return;
    }
    pendingCourseGradeSaveRequest = {
      requestId: String(detail.requestId || ''),
      courseId: Number(detail.courseId || 0),
      contextToken: String(detail.contextToken || ''),
      rosterToken: String(detail.rosterToken || ''),
    };
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_GRADE_SAVE_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  const saveResultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
    ? window
    : documentBus;
  saveResultTarget.addEventListener(GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseSaveResult?.(detail);
  });

  saveResultTarget.addEventListener(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendGradeRosterCoursesResult?.(detail);
    documentBus.dispatchEvent(new CustomEvent(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, { detail }));
  });

  saveResultTarget.addEventListener(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendGradeRosterImportResult?.(detail);
    documentBus.dispatchEvent(new CustomEvent(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, { detail }));
    if (!detail.ok || !Array.isArray(detail.students)) return;
    rosterStore?.dispatch?.(buildStudentsSyncDetail(STUDENTS_SYNC_SOURCE_GRADES, Date.now(), detail));
  });

  saveResultTarget.addEventListener(GRADES_NAME_LEARNING_DATA_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    nameLearningController?.post?.({ type: 'classroom:name-learning-data-result', detail });
  });

  saveResultTarget.addEventListener(GRADES_NAME_LEARNING_REVIEW_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    nameLearningController?.post?.({ type: 'classroom:name-learning-review-result', detail });
  });

  saveResultTarget.addEventListener(GRADES_GRADE_VAULT_STATE_EVENT, (event) => {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    setNameLearningGradeVaultState({
      locked: detail.encryptionEnabled === true && detail.unlocked !== true,
    });
    if (detail.encryptionEnabled && !detail.unlocked) {
      seatplanController?.sendGradeRosterImportResult?.({ clearGradeStudentPortraits: true });
      return;
    }
    seatplanController?.sendGradeRosterImportResult?.({
      ok: false,
      showGradeStudentPortraits: detail.showGradeStudentPortraits === true,
    });
  });

  saveResultTarget.addEventListener(GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseGradeConfigResult?.(detail);
  });

  saveResultTarget.addEventListener(GRADES_COURSE_GRADE_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    const pending = pendingCourseGradeSaveRequest;
    const matchesPendingRequest = Boolean(
      pending
      && pending.requestId
      && pending.requestId === String(detail.requestId || '')
      && pending.courseId === Number(detail.courseId || 0)
      && pending.contextToken === String(detail.contextToken || '')
      && pending.rosterToken === String(detail.rosterToken || '')
    );
    if (matchesPendingRequest) {
      pendingCourseGradeSaveRequest = null;
    }
    seatplanController?.sendCourseGradeSaveResult?.(detail);
    if (
      matchesPendingRequest
      && detail.ok === true
      && typeof onCourseGradeSaveSuccess === 'function'
    ) {
      onCourseGradeSaveSuccess(detail);
    }
  });

  return {
    ensureTabInitialized,
    dispatchPlanningViewRequest,
    dispatchGradesNavigation,
    dispatchMergerToolRequest,
    emitStudentsUpdated,
    refreshModuleLayouts,
    sendCourseSeatplanContext,
    requestGradeRosterCourses,
    requestGradeRosterImport,
    requestNameLearningData,
    requestNameLearningReview,
    requestManualSave,
    requestGradeVault,
    requestGradesTabLeaveConfirmation,
    requestPlanningTabLeaveConfirmation,
  };
}
