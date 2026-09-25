import { getWorkspaceClient } from '../modules/workspace/client.js';
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
  GRADES_COURSE_PICKER_CONFIG_SAVE_REQUEST_EVENT,
  GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT,
  GRADES_GRADE_ROSTER_COURSES_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  GRADES_GRADE_VAULT_STATE_EVENT,
  GRADES_GRADE_VAULT_REQUEST_EVENT,
  GRADES_NAME_LEARNING_DATA_REQUEST_EVENT,
  GRADES_NAME_LEARNING_DATA_RESULT_EVENT,
  GRADES_NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT,
  GRADES_NAME_LEARNING_REVIEW_REQUEST_EVENT,
  GRADES_NAME_LEARNING_REVIEW_RESULT_EVENT,
  GRADES_NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT,
  GRADES_NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT,
  GRADES_MANUAL_SAVE_REQUEST_EVENT,
  GRADES_READY_EVENT,
  GRADES_TAB_LEAVE_RESULT_EVENT,
  PLANNING_READY_EVENT,
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
  WORKSPACE_STATE_EVENT,
} from '../shared/school-data/messages.js';

const DEFERRED_GRADES_MOUNT_TIMEOUT_MS = 4000;

export function createPlanningSeatplanBridge({
  els,
  getChromeCollapsed,
  rosterStore,
  documentBus = document,
} = {}) {
  let mergerController = null;
  let duplicateCheckController = null;
  let qrController = null;
  let gradesController = null;
  let planningController = null;
  let planningInitPending = false;
  let pendingPlanningViewRequest = null;
  let pendingGradesNavigation = null;
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

  let disposed = false;
  const disposedModules = new Set();
  const listenerCleanups = new Set();
  const pendingTabLeaves = new Set();
  const timers = new Set();
  const animationFrames = new Set();
  const listen = (target, type, handler, options) => {
    const listener = (event) => {
      if (!disposed) handler(event);
    };
    target.addEventListener(type, listener, options);
    const remove = () => {
      target.removeEventListener(type, listener, options);
      listenerCleanups.delete(remove);
    };
    listenerCleanups.add(remove);
    return remove;
  };
  const scheduleTimeout = (callback, delay) => {
    if (disposed) return 0;
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) callback();
    }, delay);
    timers.add(id);
    return id;
  };
  const scheduleFrame = (callback) => {
    if (disposed) return 0;
    const id = requestAnimationFrame(() => {
      animationFrames.delete(id);
      if (!disposed) callback();
    });
    animationFrames.add(id);
    return id;
  };
  const moduleControllers = {
    [TAB_MERGER]: () => mergerController,
    [TAB_DUPLICATE_CHECK]: () => duplicateCheckController,
    [TAB_QR]: () => qrController,
    [TAB_NAME_LEARNING]: () => nameLearningController,
    [TAB_GRADES]: () => gradesController,
    [TAB_PLANNING]: () => planningController,
    [TAB_SEATPLAN]: () => seatplanController,
  };

  const disposeModule = (id) => {
    if (disposedModules.has(id)) return;
    disposedModules.add(id);
    if (id === TAB_GRADES) {
      cancelDeferredGradesMount?.();
      cancelDeferredGradesMount = null;
    }
    if (id === TAB_PLANNING) planningInitPending = false;
    moduleControllers[id]?.()?.dispose();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelDeferredGradesMount?.();
    cancelDeferredGradesMount = null;
    listenerCleanups.forEach((remove) => remove());
    pendingTabLeaves.forEach((finish) => finish(false));
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    animationFrames.forEach((id) => cancelAnimationFrame(id));
    animationFrames.clear();
    planningInitPending = false;
    pendingPlanningViewRequest = null;
    pendingGradesNavigation = null;
  };

  const seatplanBus = documentBus;

  const getShellWorkspaceClient = () => (
    typeof window !== 'undefined' ? getWorkspaceClient(window) : null
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
    const controller = getShellWorkspaceClient();
    return controller?.getLifecycle() || { owner: false, hydrated: false, ready: false, revision: 0 };
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
    if (disposed || disposedModules.has(TAB_GRADES)) return;
    cancelDeferredGradesMount?.();
    cancelDeferredGradesMount = null;
    if (tabInitState[TAB_GRADES]) return;
    initGradesTab(els.gradesHost);
    tabInitState[TAB_GRADES] = true;
  };

  const scheduleGradesTabMount = () => {
    if (disposed || disposedModules.has(TAB_GRADES)) return;
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
      const vault = getShellWorkspaceClient()?.getSnapshot?.('shell')?.vault;
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
    if (disposed) return false;
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
    if (disposed) return false;
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
    if (disposed) return false;
    const normalizedTool = ['layout', 'merge', 'rotate', 'split'].includes(tool) ? tool : '';
    if (!normalizedTool) return;
    ensureTabInitialized(TAB_MERGER);
    mergerController?.selectTool?.(normalizedTool);
  }

  function scheduleModuleLayoutRefresh(activeTab, isIOSDevice = false) {
    if (disposed || typeof window === 'undefined') return;

    const trigger = () => {
      try {
        window.dispatchEvent(new Event('resize'));
      } catch {
        
      }
    };

    if (activeTab === TAB_SEATPLAN) {
      if (isIOSDevice) {
        if (typeof requestAnimationFrame === 'function') {
          scheduleFrame(trigger);
        } else {
          scheduleTimeout(trigger, 0);
        }
        scheduleTimeout(trigger, 120);
      } else {
        if (typeof requestAnimationFrame === 'function') {
          scheduleFrame(() => {
            trigger();
            scheduleFrame(trigger);
          });
        } else {
          scheduleTimeout(trigger, 0);
          scheduleTimeout(trigger, 40);
        }
        scheduleTimeout(trigger, 140);
        scheduleTimeout(trigger, 320);
        scheduleTimeout(trigger, 520);
      }
      return;
    }

    if (activeTab !== TAB_PLANNING && activeTab !== TAB_GRADES) {
      return;
    }

    if (isIOSDevice) {
      if (typeof requestAnimationFrame === 'function') {
        scheduleFrame(trigger);
      } else {
        scheduleTimeout(trigger, 0);
      }
      return;
    }

    if (typeof requestAnimationFrame === 'function') {
      scheduleFrame(() => {
        trigger();
        scheduleFrame(trigger);
      });
    } else {
      scheduleTimeout(trigger, 0);
      scheduleTimeout(trigger, 40);
    }
  }

  function applyModuleShellLayout(id, { activeTab } = {}) {
    if (disposed || disposedModules.has(id)) return;
    const controller = moduleControllers[id]?.();
    if (!controller) return;
    const detail = { collapsed: getChromeCollapsed() };
    if (id === TAB_GRADES || id === TAB_SEATPLAN) detail.activeTab = activeTab;
    controller.applyShellLayout?.(detail);
  }

  function ensureTabInitialized(tab) {
    if (disposed || disposedModules.has(tab)) return;
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
    if (disposed || disposedModules.has(TAB_PLANNING) || !planningInitPending || tabInitState[TAB_PLANNING]) return;
    if (initPlanningTab(els.planningHost)) {
      tabInitState[TAB_PLANNING] = true;
      scheduleModuleLayoutRefresh(TAB_PLANNING);
    }
  };

  listen(window, GRADES_READY_EVENT, () => {
    const lifecycle = refreshWorkspaceLifecycle();
    if (lifecycle.ready && pendingGradesNavigation) {
      const navigation = pendingGradesNavigation;
      pendingGradesNavigation = null;
      gradesController?.navigate?.(withWorkspaceRevision(navigation));
    }
    initializePendingPlanning();
  });

  listen(window, WORKSPACE_OWNER_READY_EVENT, initializePendingPlanning);

  function sendCourseSeatplanContext(detail) {
    if (disposed) return false;
    if (!detail || typeof detail !== 'object') return;
    ensureTabInitialized(TAB_SEATPLAN);
    seatplanController?.sendCourseContext?.(detail);
  }

  function dispatchPublicLockedGradeRosterCourses(detail = null) {
    const source = detail && typeof detail === 'object' ? detail : {};
    const client = getShellWorkspaceClient();
    const owner = client?.operations;
    const store = client?.data;
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
    if (disposed) return false;
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
    if (disposed) return false;
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

  function requestGradePickerConfigSave(detail = null) {
    if (disposed) return false;
    if (!isWorkspaceReady()) {
      return dispatchBlockedResult(GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, detail);
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_PICKER_CONFIG_SAVE_REQUEST_EVENT, withWorkspaceRevision(detail));
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

  function requestNameLearningCourseVisibility(detail = null) {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') {
      gradesController.frame.loading = 'eager';
    }
    gradesController?.post?.(GRADES_NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestNameLearningStudentSearch(detail = null) {
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    if (gradesController?.frame?.loading === 'lazy') gradesController.frame.loading = 'eager';
    gradesController?.post?.(GRADES_NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT, withWorkspaceRevision(detail));
    return true;
  }

  function requestManualSave() {
    if (disposed) return false;
    if (!isWorkspaceReady()) return false;
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_MANUAL_SAVE_REQUEST_EVENT, null);
    return true;
  }

  function requestGradeVault(detail = null) {
    if (disposed) return false;
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
    if (disposed) return Promise.resolve(false);
    ensureTabInitialized(TAB_GRADES);
    if (!gradesController?.requestTabLeave) {
      return Promise.resolve(false);
    }
    const requestId = `grades-tab-leave-${Date.now()}-${++gradesTabLeaveRequestSequence}`;
    const resultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
      ? window
      : documentBus;
    return new Promise((resolve) => {
      const finish = (allowed) => {
        resultTarget.removeEventListener(GRADES_TAB_LEAVE_RESULT_EVENT, onResult);
        pendingTabLeaves.delete(finish);
        resolve(allowed);
      };
      const onResult = (event) => {
        const detail = event?.detail;
        if (!detail || String(detail.requestId || '') !== requestId) {
          return;
        }
        finish(detail.allowed === true);
      };
      pendingTabLeaves.add(finish);
      resultTarget.addEventListener(GRADES_TAB_LEAVE_RESULT_EVENT, onResult);
      if (!gradesController.requestTabLeave({ requestId })) {
        finish(false);
      }
    });
  }

  function requestPlanningTabLeaveConfirmation() {
    if (disposed) return Promise.resolve(false);
    ensureTabInitialized(TAB_PLANNING);
    if (!planningController?.requestTabLeave) {
      return Promise.resolve(false);
    }
    const requestId = `planning-tab-leave-${Date.now()}-${++planningTabLeaveRequestSequence}`;
    const resultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
      ? window
      : documentBus;
    return new Promise((resolve) => {
      const finish = (allowed) => {
        resultTarget.removeEventListener(PLANNING_TAB_LEAVE_RESULT_EVENT, onResult);
        pendingTabLeaves.delete(finish);
        resolve(allowed);
      };
      const onResult = (event) => {
        const detail = event?.detail;
        if (!detail || String(detail.requestId || '') !== requestId) {
          return;
        }
        finish(detail.allowed === true);
      };
      pendingTabLeaves.add(finish);
      resultTarget.addEventListener(PLANNING_TAB_LEAVE_RESULT_EVENT, onResult);
      if (!planningController.requestTabLeave({ requestId })) {
        finish(false);
      }
    });
  }

  listen(seatplanBus, STUDENTS_UPDATED_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (detail.source === STUDENTS_SYNC_SOURCE_SEATPLAN) return;
    dispatchStudentsUpdateToSeatplan(detail);
  });

  listen(seatplanBus, SEATPLAN_COURSE_SAVE_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT, detail);
      return;
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_SEATPLAN_SAVE_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  listen(seatplanBus, SEATPLAN_GRADE_ROSTER_COURSES_REQUEST_EVENT, (event) => {
    requestGradeRosterCourses(event.detail);
  });

  listen(seatplanBus, SEATPLAN_GRADE_ROSTER_IMPORT_REQUEST_EVENT, (event) => {
    requestGradeRosterImport(event.detail);
  });

  listen(documentBus, 'classroom:name-learning-data-request', (event) => {
    requestNameLearningData(event.detail);
  });

  listen(documentBus, 'classroom:name-learning-review-request', (event) => {
    requestNameLearningReview(event.detail);
  });

  listen(documentBus, 'classroom:name-learning-course-visibility-request', (event) => {
    requestNameLearningCourseVisibility(event.detail);
  });

  listen(documentBus, 'classroom:name-learning-student-search-request', (event) => {
    requestNameLearningStudentSearch(event.detail);
  });

  listen(seatplanBus, SEATPLAN_COURSE_GRADE_CONFIG_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT, detail);
      return;
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_GRADE_CONFIG_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  listen(seatplanBus, SEATPLAN_COURSE_GRADE_SAVE_REQUEST_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (!isWorkspaceReady()) {
      dispatchBlockedResult(GRADES_COURSE_GRADE_SAVE_RESULT_EVENT, detail);
      return;
    }
    ensureTabInitialized(TAB_GRADES);
    gradesController?.post?.(GRADES_COURSE_GRADE_SAVE_REQUEST_EVENT, withWorkspaceRevision(detail));
  });

  const saveResultTarget = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
    ? window
    : documentBus;
  listen(saveResultTarget, GRADES_COURSE_SEATPLAN_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseSaveResult?.(detail);
  });

  listen(saveResultTarget, GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    documentBus.dispatchEvent(new CustomEvent(GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, { detail }));
  });

  listen(saveResultTarget, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendGradeRosterCoursesResult?.(detail);
    documentBus.dispatchEvent(new CustomEvent(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, { detail }));
  });

  listen(window, WORKSPACE_STATE_EVENT, (event) => {
    if (event.detail?.scope !== 'shell') return;
    seatplanController?.sendGradeRosterCoursesOutdated?.();
  });

  listen(saveResultTarget, GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendGradeRosterImportResult?.(detail);
    documentBus.dispatchEvent(new CustomEvent(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, { detail }));
    if (!detail.ok || detail.mode === 'picker' || !Array.isArray(detail.students)) return;
    rosterStore?.dispatch?.(buildStudentsSyncDetail(STUDENTS_SYNC_SOURCE_GRADES, Date.now(), detail));
  });

  listen(saveResultTarget, GRADES_NAME_LEARNING_DATA_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    nameLearningController?.post?.({ type: 'classroom:name-learning-data-result', detail });
  });

  listen(saveResultTarget, GRADES_NAME_LEARNING_REVIEW_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    nameLearningController?.post?.({ type: 'classroom:name-learning-review-result', detail });
  });

  listen(saveResultTarget, GRADES_NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    nameLearningController?.post?.({ type: 'classroom:name-learning-student-search-result', detail });
  });

  listen(saveResultTarget, GRADES_GRADE_VAULT_STATE_EVENT, (event) => {
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

  listen(saveResultTarget, GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseGradeConfigResult?.(detail);
  });

  listen(saveResultTarget, GRADES_COURSE_GRADE_SAVE_RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail || typeof detail !== 'object') return;
    seatplanController?.sendCourseGradeSaveResult?.(detail);
  });

  return {
    ensureTabInitialized,
    dispatchPlanningViewRequest,
    dispatchGradesNavigation,
    dispatchMergerToolRequest,
    applyModuleShellLayout,
    scheduleModuleLayoutRefresh,
    disposeModule,
    dispose,
    sendCourseSeatplanContext,
    requestGradeRosterCourses,
    requestGradeRosterImport,
    requestGradePickerConfigSave,
    requestManualSave,
    requestGradeVault,
    requestGradesTabLeaveConfirmation,
    requestPlanningTabLeaveConfirmation,
  };
}
