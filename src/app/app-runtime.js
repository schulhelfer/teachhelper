import { getWorkspaceClient } from '../modules/workspace/client.js';
import { createAppDom } from './dom.js';
import { createClassroomState } from './classroom-state.js';
import { createCourseContext } from './course-context.js';
import { createShellActionDialog } from './shell-action-dialog.js';
import { createFirstRunTutorial } from './first-run-tutorial.js';
import { createGradeRosterCoordinator } from './grade-roster-coordinator.js';
import { createHelpCenter } from './help-center.js';
import { createModuleShellCoordinator } from './module-shell-coordinator.js';
import { createModuleRegistry } from './module-registry.js';
import { createIframeModuleAdapters } from './iframe-module-adapters.js';
import { createIframeModuleShellBindings } from './iframe-module-shell-bindings.js';
import { createAppTutorialController } from './app-tutorial-controller.js';
import { readHelpPreviewRequest } from './help-preview.js';
import { createPlanningSeatplanBridge } from './planning-seatplan-bridge.js';
import { createClassroomFileActions } from './classroom-file-actions.js';
import { createAppUpdateController } from './app-update-controller.js';
import { createPwaInstallPrompt } from './pwa-install-prompt.js';
import {
  isTearOffTab,
  openModuleWindow,
  readModuleWindowRequest,
} from './module-window.js';
import { createTabTearOff } from './tab-tear-off.js';
import { createShellController } from './shell.js';
import { reportError } from '../shared/error-reporting.js';
import { createMessageApi } from '../shared/messages.js';
import { WORKSPACE_STATE_EVENT } from '../shared/school-data/messages.js';
import { installAppTooltips } from '../shared/app-tooltips.js';
import {
  createThemeController,
  THEME_APPLY_EVENT,
} from '../shared/theme.js';
import { postToModule } from '../shared/module-frame-bridge.js';
import { sanitizeExportFileName } from '../shared/file-io.js';
import { createSharedTimerStore } from '../shared/timer-store.js';
import {
  mountRandomPicker,
  normalizeRandomPickerWeight,
} from '../modules/random-picker/index.js';
import {
  clampPerformanceFlairCount,
  mountGroups,
  normalizePerformanceFlair,
  sanitizeSharedPerformanceFlair,
} from '../modules/groups/index.js';
import { mountWorkPhase } from '../modules/work-phase/index.js';
import {
  MODULE_CONTEXT_MENU_DISMISS_EVENT,
  TAB_DUPLICATE_CHECK,
  TAB_GRADES,
  TAB_GROUPS,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
  TAB_WORK_PHASE,
} from '../shell/tabs.js';

function initializeApplication({ documentRef, view, appVersion, registerCleanup, disposeRuntime }) {
  const document = documentRef;
  const window = view;
  const bindRuntime = (target, type, listener, options) => {
    if (!target?.addEventListener) return listener;
    target.addEventListener(type, listener, options);
    registerCleanup(() => target.removeEventListener?.(type, listener, options));
    return listener;
  };
  const runtimeTimeouts = new Set();
  const runtimeFrames = new Set();
  const setRuntimeTimeout = (callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      runtimeTimeouts.delete(timeoutId);
      callback();
    }, delay);
    runtimeTimeouts.add(timeoutId);
    return timeoutId;
  };
  const clearRuntimeTimeout = (timeoutId) => {
    if (!timeoutId) return;
    runtimeTimeouts.delete(timeoutId);
    window.clearTimeout(timeoutId);
  };
  const requestRuntimeFrame = (callback) => {
    if (typeof window.requestAnimationFrame !== 'function') return 0;
    const frameId = window.requestAnimationFrame((timestamp) => {
      runtimeFrames.delete(frameId);
      callback(timestamp);
    });
    runtimeFrames.add(frameId);
    return frameId;
  };
  const cancelRuntimeFrame = (frameId) => {
    if (!frameId) return;
    runtimeFrames.delete(frameId);
    window.cancelAnimationFrame?.(frameId);
  };
  const cancelRuntimeSchedule = (scheduleId) => {
    if (runtimeFrames.has(scheduleId)) cancelRuntimeFrame(scheduleId);
    if (runtimeTimeouts.has(scheduleId)) clearRuntimeTimeout(scheduleId);
  };
  registerCleanup(() => {
    runtimeFrames.forEach((frameId) => window.cancelAnimationFrame?.(frameId));
    runtimeFrames.clear();
    runtimeTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    runtimeTimeouts.clear();
  });
  const { appEl, els } = createAppDom(document);
  if (!appEl) {
    return false;
  }
  const helpPreviewRequest = readHelpPreviewRequest(window.location);
  if (helpPreviewRequest) appEl.dataset.helpPreview = 'true';
  const shellActionDialog = createShellActionDialog(document);
  const themeController = createThemeController({ windowRef: window, documentRef: document });
  registerCleanup(() => themeController.dispose());
  const applyThemeToFrame = (frame, detail) => {
    if (!frame?.isConnected) return false;
    return postToModule(frame, { type: THEME_APPLY_EVENT, detail });
  };
  const unsubscribeThemeFrames = themeController.subscribe((detail) => {
    document.querySelectorAll('iframe').forEach((frame) => applyThemeToFrame(frame, detail));
  });
  registerCleanup(unsubscribeThemeFrames);
  bindRuntime(document, 'load', (event) => {
    const frame = event.target;
    if (frame instanceof HTMLIFrameElement) {
      applyThemeToFrame(frame, {
        preference: themeController.getPreference(),
        theme: themeController.getTheme(),
      });
    }
  }, true);
  const pwaInstallPrompt = createPwaInstallPrompt({
    dialog: els.pwaInstallDialog,
    copy: els.pwaInstallDialogCopy,
    status: els.pwaInstallDialogStatus,
    installButton: els.pwaInstallDialogInstall,
    laterButton: els.pwaInstallDialogLater,
  });
  if (els.preferencesDialog && !els.preferencesDialog.hasAttribute('tabindex')) {
    els.preferencesDialog.setAttribute('tabindex', '-1');
  }
  const appTooltips = installAppTooltips(document);
  registerCleanup(() => appTooltips?.dispose?.());
  bindRuntime(appEl, 'contextmenu', (event) => {
    event.preventDefault();
  }, true);
  const updateController = createAppUpdateController({
    view: window,
    els,
    appVersion,
    registerCleanup,
    bindRuntime,
    setRuntimeTimeout,
    clearRuntimeTimeout,
    runGuardBackup,
    describeBackupStatus,
    showMessage: (...args) => showMessage(...args),
  });
  const isIOSDevice = (() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    const nav = navigator;
    const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
    const platform = typeof nav.platform === 'string' ? nav.platform : '';
    const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
    if (/\b(iPad|iPhone|iPod)\b/i.test(ua) || /\b(iPad|iPhone|iPod)\b/i.test(platform)) {
      return true;
    }
    return /\bMac\b/i.test(platform) && touchPoints > 1;
  })();
  if (isIOSDevice) {
    appEl.classList.add('app-ios-optimized');
  }
  const { showMessage } = createMessageApi(document);
  let displayedGradeVaultAutoLockWarningId = '';
  bindRuntime(window, WORKSPACE_STATE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || detail.scope !== 'shell' || !detail.snapshot) return;
    const warning = detail.snapshot?.vault?.autoLockWarning;
    if (warning?.active !== true) {
      displayedGradeVaultAutoLockWarningId = '';
      return;
    }
    const warningId = String(Number(warning.blockedAt) || 'active');
    if (warningId === displayedGradeVaultAutoLockWarningId) return;
    displayedGradeVaultAutoLockWarningId = warningId;
    const retryAt = Number(warning.retryAt) || 0;
    const retryLabel = retryAt
      ? new Date(retryAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : 'in zehn Minuten';
    showMessage(
      `Der Notenbereich konnte nicht automatisch gesperrt werden. ${String(warning.message || 'Bitte speichere die Noten.')} Nächster Sperrversuch: ${retryLabel}.`,
      'warn',
      { enqueue: true }
    );
  });
  const reportAppError = (error, userMessage = '', context = {}) => (
    reportError(error, userMessage, context, { showMessage })
  );
  const shellSupportsExternalFileSync = typeof window !== 'undefined'
    && typeof window.showOpenFilePicker === 'function'
    && typeof window.showSaveFilePicker === 'function';
  const shellState = {
    activeTab: TAB_PLANNING,
  };
  let bridgeController = null;
  let shellController = null;
  let groupsController = null;
  let workPhaseController = null;
  let classroomState = null;
  let courseContext = null;
  const positionWorkOrderHintOverlay = () => workPhaseController?.positionHintOverlay();
  const getActiveTab = () => (shellController ? shellController.getActiveTab() : shellState.activeTab);
  const isChromeCollapsed = () => (shellController ? shellController.isChromeCollapsed() : false);
  const getChromeTransitionState = () => (
    shellController ? shellController.getChromeTransitionState() : 'idle'
  );
  const setChromeCollapsed = (collapsed, options) => shellController?.setChromeCollapsed(collapsed, options);
  const setActiveTab = (tab, options = {}) => {
    firstRunTutorial?.clearContextHelpPrompt?.();
    shellController?.setActiveTab(tab, options);
  };
  const setActiveTabForTutorial = (tab) => shellController?.setActiveTab(tab, {
    skipUnsavedPrompt: true,
    skipAnimation: true,
  });
  const setActiveTabImmediate = (tab, options = {}) => {
    firstRunTutorial?.clearContextHelpPrompt?.();
    shellController?.setActiveTabImmediate(tab, options);
  };
  const syncChromeState = () => shellController?.syncChromeState();
  let tabNavigationBound = false;
  let firstRunTutorial = null;
  let helpCenter = null;
  const tutorialController = createAppTutorialController({
    view: window,
    els,
    helpPreviewRequest,
    shellSupportsExternalFileSync,
    bindRuntime,
    setRuntimeTimeout,
    getBridgeController: () => bridgeController,
    getClassroomState: () => classroomState,
    getGroupsController: () => groupsController,
    getRandomPickerController: () => randomPickerController,
    getWorkPhaseController: () => workPhaseController,
    getFirstRunTutorial: () => firstRunTutorial,
    updateCsvStatusDisplay,
    renderRandomPicker,
    setActiveTabForTutorial,
  });
  const moduleRegistry = createModuleRegistry(createIframeModuleAdapters({
    frames: tutorialController.frames,
    getBridgeController: () => bridgeController,
    els,
  }));
  registerCleanup(() => moduleRegistry.dispose());
  const { syncTutorialEntryHintToModules } = tutorialController;
  const dismissModuleContextMenus = () => {
    moduleRegistry.broadcast({ type: MODULE_CONTEXT_MENU_DISMISS_EVENT });
  };
  bindRuntime(document, 'pointerdown', dismissModuleContextMenus, true);
  bindRuntime(document, 'keydown', (event) => {
    if (event.key === 'Escape') dismissModuleContextMenus();
  }, true);
  tutorialController.initializeCatalog();
  function applyModuleWindowChrome() {
    if (els.app) els.app.dataset.moduleWindow = 'true';
    if (els.sidebarManualSaveBtn) {
      els.sidebarManualSaveBtn.disabled = true;
      els.sidebarManualSaveBtn.title = 'Im eigenen Fenster nicht verfügbar';
    }
  }

  function tearOffTabToWindow(tabKey, placement) {
    if (!isTearOffTab(tabKey)) return false;
    return Boolean(openModuleWindow(tabKey, placement));
  }

  function bindTabNavigation() {
    if (tabNavigationBound) return;
    tabNavigationBound = true;
    createTabTearOff({
      els,
      onTearOff: tearOffTabToWindow,
    });
    [
      [els.tabMerger, TAB_MERGER],
      [els.tabPlanning, TAB_PLANNING],
      [els.tabGrades, TAB_GRADES],
      [els.tabSeatplan, TAB_SEATPLAN],
      [els.tabNameLearning, TAB_NAME_LEARNING],
      [els.tabGroups, TAB_GROUPS],
      [els.tabRandomPicker, TAB_RANDOM_PICKER],
      [els.tabDuplicateCheck, TAB_DUPLICATE_CHECK],
      [els.tabWorkPhase, TAB_WORK_PHASE],
      [els.tabQr, TAB_QR],
    ].forEach(([button, tabKey]) => {
      bindRuntime(button, 'click', (event) => {
        if (event.altKey && tearOffTabToWindow(tabKey, {
          screenX: event.screenX,
          screenY: event.screenY,
        })) {
          return;
        }
        if (firstRunTutorial?.isActive?.() && getActiveTab() !== tabKey) {
          firstRunTutorial.finish();
        }
        setActiveTab(tabKey, { showTutorialHint: true });
        firstRunTutorial?.showContextHelp?.();
      });
    });
  }

  async function startTutorialFromEntry() {
    const started = await firstRunTutorial?.startFromEntry?.();
    if (started) syncTutorialEntryHintToModules();
    return started;
  }

  function openHelpEntry() {
    helpCenter?.openEntry({ module: getActiveTab() });
  }

  function isGuardBackupPossible() {
    const workspaceOwner = getWorkspaceClient(window)?.operations;
    const databaseConnected = Boolean(workspaceOwner?.hasShellDatabaseConnection?.());
    const backupDirectoryConnected = Boolean(workspaceOwner?.getPersistenceView().backup.connected);
    return databaseConnected && backupDirectoryConnected;
  }

  function describeBackupStatus() {
    return isGuardBackupPossible()
      ? ''
      : 'Kein Backup-Ordner verbunden – das Update läuft ohne Sicherung.';
  }

  async function runGuardBackup(mode) {
    const workspaceOwner = getWorkspaceClient(window)?.operations;
    if (!isGuardBackupPossible()) {
      return { ok: true, skipped: true, reason: '' };
    }
    try {
      const created = await workspaceOwner.createLatestWebBackup?.(mode, false);
      if (created) return { ok: true, skipped: false, reason: '' };
      return { ok: false, skipped: false, reason: '' };
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        reason: error instanceof Error && error.message ? error.message : '',
      };
    }
  }

  async function createBackupBeforeTutorialStart() {
    const result = await runGuardBackup('tutorial');
    if (result.ok) return true;
    const detail = result.reason ? ` ${result.reason}` : '';
    showMessage(`Vor dem Tutorial konnte kein Backup erstellt werden.${detail}`, 'error');
    return false;
  }

  const moduleShellBindings = createIframeModuleShellBindings({
    documentRef: document,
    view: window,
    appEl,
    moduleRegistry,
    bindRuntime,
    registerCleanup,
    setRuntimeTimeout,
    clearRuntimeTimeout,
    requestRuntimeFrame,
    cancelRuntimeSchedule,
    getActiveTab,
    setActiveTab,
    getChromeTransitionState,
    setChromeCollapsed,
    getBridgeController: () => bridgeController,
    getCourseContext: () => courseContext,
    openHelpEntry,
    showMessage,
  });
  const moduleShellCoordinator = createModuleShellCoordinator({
    view: window,
    moduleRegistry,
    moduleBindings: moduleShellBindings,
    themeController,
    registerCleanup,
    getActiveTab,
    setChromeCollapsed,
    getShellController: () => shellController,
    getFirstRunTutorial: () => firstRunTutorial,
    syncTutorialEntryHintToModules,
    openHelpEntry,
    showMessage,
  });

  courseContext = createCourseContext({
    eventTarget: window,
    view: window,
    getActiveTab,
    setActiveTab,
    dispatchGradesNavigation: detail => bridgeController?.dispatchGradesNavigation?.(detail),
    dispatchPlanningViewRequest: detail => bridgeController?.dispatchPlanningViewRequest?.(detail),
    ensureSeatplanInitialized: () => moduleRegistry.get(TAB_SEATPLAN)?.ensureInitialized(),
    sendCourseSeatplanContext: detail => bridgeController?.sendCourseSeatplanContext(detail),
  });
  registerCleanup(() => courseContext?.dispose?.());

  moduleShellCoordinator.bindMessages();

  const state = {
    randomPickerAutoDisableSelected: false,
  };
  let randomPickerController = null;
  let gradeRosterCoordinator = null;
  const fileActions = createClassroomFileActions({
    documentRef: document,
    els,
    isIOSDevice,
    shellActionDialog,
    bindRuntime,
    showMessage,
    reportAppError,
    getActiveTab,
    isRandomPickerTabActive,
    getClassroomState: () => classroomState,
    getGroupsController: () => groupsController,
    getWorkPhaseController: () => workPhaseController,
    getGradeRosterCoordinator: () => gradeRosterCoordinator,
    getAutoDisableSelected: () => state.randomPickerAutoDisableSelected,
    setAutoDisableSelected: (value) => { state.randomPickerAutoDisableSelected = value; },
    sanitizeRandomPickerStudent,
    renderRandomPicker,
  });
  function updateCsvStatusDisplay() {
    fileActions.updateCsvStatusDisplay();
  }
  classroomState = createClassroomState({
    documentBus: document,
    initialState: {
      students: [],
      headers: [],
      delim: ',',
      csvName: '',
      performanceFlairCount: 4,
    },
    normalizePerformanceFlair,
    normalizeRandomPickerWeight,
    clampPerformanceFlairCount,
    sanitizeCsvName: sanitizeExportFileName,
    onRosterObserved: detail => gradeRosterCoordinator?.updateSharedRosterSelection(detail),
    onRosterApplied: () => {
      updateCsvStatusDisplay();
      workPhaseController?.reset();
      groupsController?.handleRosterReplacement();
      els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
      renderRandomPicker();
      gradeRosterCoordinator?.refreshLayout();
    },
  });
  registerCleanup(() => classroomState?.dispose?.());
  const rosterStore = classroomState.rosterStore;

  const SharedTimerStore = createSharedTimerStore();
  bridgeController = createPlanningSeatplanBridge({
    els,
    getChromeCollapsed: isChromeCollapsed,
    rosterStore,
    documentBus: document,
  });
  registerCleanup(() => bridgeController.dispose());
  shellController = createShellController({
    els,
    state: shellState,
    isIOSDevice,
    shellSupportsExternalFileSync,
    onEnsureTabInitialized: (tab) => {
      const adapter = moduleRegistry.get(tab);
      try {
        adapter?.ensureInitialized();
      } catch (error) {
        reportAppError(error, adapter.initError, { scope: 'tab-init', tab });
        adapter.showInitializationError();
      }
    },
    onDispatchPlanningViewRequest: (view) => bridgeController?.dispatchPlanningViewRequest(view),
    onRenderRandomPicker: () => renderRandomPicker(),
    onPositionWorkOrderHintOverlay: () => positionWorkOrderHintOverlay(),
    onRefreshLayouts: () => refreshChromeDependentLayouts(),
    onRequestGradeVault: (detail) => bridgeController?.requestGradeVault?.(detail),
    onRequestManualSave: () => bridgeController?.requestManualSave?.(),
    onResolveGradesTabLeave: () => bridgeController?.requestGradesTabLeaveConfirmation?.() || Promise.resolve(false),
    onResolvePlanningTabLeave: () => bridgeController?.requestPlanningTabLeaveConfirmation?.() || Promise.resolve(false),
    onSidebarWidthChange: (scope, width) => moduleShellCoordinator.syncSidebarWidthToModules(scope, width),
    onActiveTabChange: () => firstRunTutorial?.showContextHelp?.({ prompt: true }),
    onTabActivating: (tab) => {
      courseContext.handleTabActivating(tab);
    },
    onRegisterCleanup: registerCleanup,
  });
  const initialWorkspaceSnapshot = getWorkspaceClient(window)?.getSnapshot('shell');
  if (initialWorkspaceSnapshot?.vault) {
    shellController.setPlanningGradeVaultState({
      ...initialWorkspaceSnapshot.vault,
      ready: Boolean(initialWorkspaceSnapshot.ready),
    });
  }
  bindTabNavigation();
  function displayName(s) { return `${s.first || ''} ${s.last || ''}`.trim(); }
  function formatStudentLabel(student) {
    if (!student) return '';
    const name = displayName(student);
    return name || `ID ${student.id || ''}`.trim();
  }
  function sanitizeRandomPickerStudent(student) {
    if (!student || typeof student !== 'object') return student;
    student.randomWeight = normalizeRandomPickerWeight(student.randomWeight);
    student.performanceFlair = sanitizeSharedPerformanceFlair(
      student.performanceFlair,
      classroomState.getState().performanceFlairCount
    );
    return student;
  }
  function renderRandomPicker() {
    randomPickerController?.render();
  }
  function isRandomPickerTabActive() {
    return getActiveTab() === TAB_RANDOM_PICKER;
  }
  moduleShellBindings.bindVaultOverlay();

  gradeRosterCoordinator = createGradeRosterCoordinator({
    documentBus: document,
    view: window,
    elements: {
      gradeRosterImportMenu: els.gradeRosterImportMenu,
      gradeRosterImportTrigger: els.gradeRosterImportTrigger,
      gradeRosterPills: els.gradeRosterPills,
      randomPickerCourseReset: els.randomPickerCourseReset,
      resizeTarget: els.csvDropZone,
    },
    bridge: bridgeController,
    getActiveTab,
    setActiveTab,
    getRosterLabel: () => classroomState.getState().csvName,
    isRandomPickerActive: isRandomPickerTabActive,
    isTutorialDemoActive: () => classroomState.isDemoActive(),
    normalizePickerWeight: normalizeRandomPickerWeight,
    showMessage,
    onPickerBindingChange: renderRandomPicker,
    onBeforePickerBindingReplace: fileActions.confirmPickerBindingReplacement,
  });
  registerCleanup(() => gradeRosterCoordinator?.dispose?.());
  gradeRosterCoordinator.requestCourses();

  fileActions.bindInputs();

  groupsController = mountGroups({
    doc: document,
    view: window,
    getStudents: () => classroomState.getState().students,
    getPerformanceFlairCount: () => classroomState.getState().performanceFlairCount,
    setPerformanceFlairCount: (value) => {
      classroomState.updateState({ performanceFlairCount: value });
    },
    displayStudentName: displayName,
    formatStudentLabel,
    isGroupsActive: () => getActiveTab() === TAB_GROUPS,
    isRandomPickerActive: isRandomPickerTabActive,
    isTutorialDemoActive: () => classroomState.isDemoActive(),
    showMessage,
    reportError: reportAppError,
    getSuggestedPlanFileName: fileActions.getSuggestedPlanFileName,
    onPlanImportRequest: () => {
      void fileActions.handlePlanImportAction();
    },
    onPlanFileSelected: (file) => fileActions.importPlanFromFile(file),
    onPlanExportRequest: () => {
      void fileActions.downloadSeatPlan();
    },
  });
  registerCleanup(() => groupsController?.dispose?.());

  randomPickerController = mountRandomPicker({
    doc: document,
    getStudents: () => gradeRosterCoordinator.getPickerStudents(classroomState.getState().students),
    formatStudentLabel,
    getAutoDisableSelected: () => gradeRosterCoordinator.getPickerAutoDisableSelected(
      state.randomPickerAutoDisableSelected
    ),
    setAutoDisableSelected: (value) => {
      if (!gradeRosterCoordinator.setPickerAutoDisableSelected(value)) {
        state.randomPickerAutoDisableSelected = value;
      }
    },
    setStudentWeight: (student, weight) => {
      student.randomWeight = weight;
    },
    sanitizeStudent: sanitizeRandomPickerStudent,
    showMessage,
    onImport: () => {
      void fileActions.handlePlanImportAction();
    },
    onExport: () => {
      void fileActions.handlePickerSaveClick();
    },
  });
  registerCleanup(() => randomPickerController?.dispose?.());

  [els.groupSeatPreferences].filter(Boolean).forEach((button) => {
    bindRuntime(button, 'click', () => {
      const preferenceStudents = isRandomPickerTabActive()
        ? gradeRosterCoordinator.getPickerStudents(classroomState.getState().students)
        : classroomState.getState().students;
      if (!preferenceStudents.length) {
        showMessage('Importiere zuerst die Namensliste!', 'warn', { presentation: 'toast' });
        return;
      }
      if (isRandomPickerTabActive()) {
        randomPickerController?.renderConditions();
      } else {
        groupsController?.renderPreferences();
      }
      if (els.preferencesDialog) {
        if (typeof els.preferencesDialog.showModal === 'function') {
          els.preferencesDialog.showModal();
        } else {
          els.preferencesDialog.setAttribute('open', 'open');
        }
        const focusDialog = () => { els.preferencesDialog?.focus({ preventScroll: true }); };
        if (typeof queueMicrotask === 'function') { queueMicrotask(focusDialog); }
        else { setRuntimeTimeout(focusDialog, 0); }
      }
    });
  });
  bindRuntime(els.preferencesForm, 'submit', e => {
    e.preventDefault();
    if (isRandomPickerTabActive()) {
      randomPickerController?.saveConditions();
    } else {
      groupsController?.savePreferences();
    }
    if (els.preferencesDialog) {
      if (typeof els.preferencesDialog.close === 'function' && els.preferencesDialog.open) {
        els.preferencesDialog.close();
      }
      els.preferencesDialog.removeAttribute('open');
    }
  });
  bindRuntime(els.preferencesReset, 'click', () => {
    if (!isRandomPickerTabActive()) return;
    randomPickerController?.resetConditions();
  });
  bindRuntime(els.preferencesTableBody, 'change', e => {
    if (randomPickerController?.handleConditionsChange(e)) return;
    groupsController?.handlePreferencesChange(e);
  });
  bindRuntime(els.preferencesPerformanceSummary, 'change', (event) => {
    if (isRandomPickerTabActive()) return;
    groupsController?.handlePerformanceFlairCountChange(event);
  });
  bindRuntime(els.preferencesCancel, 'click', () => {
    if (els.preferencesDialog) {
      if (typeof els.preferencesDialog.close === 'function' && els.preferencesDialog.open) {
        els.preferencesDialog.close();
      }
      els.preferencesDialog.removeAttribute('open');
    }
  });
  bindRuntime(els.preferencesDialog, 'cancel', e => {
    e.preventDefault();
    if (typeof els.preferencesDialog?.close === 'function' && els.preferencesDialog.open) {
      els.preferencesDialog.close();
    }
    els.preferencesDialog?.removeAttribute('open');
  });

  workPhaseController = mountWorkPhase({
    doc: document,
    view: window,
    appEl,
    timerStore: SharedTimerStore,
    showMessage,
    reportError: reportAppError,
  });
  registerCleanup(() => workPhaseController?.dispose?.());

  const handleViewportChange = (options = {}) => {
    if (!options?.skipImmediateGroupRefresh && getActiveTab() === TAB_GROUPS) {
      groupsController?.refreshLayout();
    }
    workPhaseController?.refreshLayout();
    if (typeof window.requestAnimationFrame === 'function') {
      if (isIOSDevice) {
        requestRuntimeFrame(() => {
          if (getActiveTab() === TAB_GROUPS) {
            groupsController?.refreshLayout();
          }
          workPhaseController?.refreshLayout();
        });
        return;
      }
      requestRuntimeFrame(() => {
        requestRuntimeFrame(() => {
          if (getActiveTab() === TAB_GROUPS) {
            groupsController?.refreshLayout();
          }
          workPhaseController?.refreshLayout();
        });
      });
    }
  };
  function refreshChromeDependentLayouts() {
    handleViewportChange({ skipImmediateGroupRefresh: true });
    const activeTab = getActiveTab();
    moduleRegistry.list().forEach((adapter) => adapter.applyShellLayout({ activeTab }));
    bridgeController?.scheduleModuleLayoutRefresh(activeTab, isIOSDevice);
    if (getActiveTab() === TAB_RANDOM_PICKER) {
      randomPickerController?.refreshLayout?.();
    }
    if (getActiveTab() === TAB_GROUPS || getActiveTab() === TAB_RANDOM_PICKER) {
      requestRuntimeFrame(() => {
        requestRuntimeFrame(() => {
          if (getActiveTab() === TAB_GROUPS || getActiveTab() === TAB_RANDOM_PICKER) {
            gradeRosterCoordinator?.refreshLayout();
          }
        });
      });
    }
    if (getActiveTab() === TAB_GROUPS) {
      groupsController?.refreshLayout({ resetViewport: true });
    }
  }
  bindRuntime(window, 'resize', handleViewportChange);
  if (window.visualViewport) {
    bindRuntime(window.visualViewport, 'resize', handleViewportChange);
  }

  const moduleWindowRequest = readModuleWindowRequest(window.location);
  try {
    if (helpPreviewRequest) {
      setActiveTabImmediate(helpPreviewRequest.config.tab, { skipUnsavedPrompt: true });
    } else if (moduleWindowRequest.tab) {
      setActiveTabImmediate(moduleWindowRequest.tab);
    } else {
      setActiveTab(TAB_PLANNING);
    }
    if (moduleWindowRequest.isModuleWindow) {
      applyModuleWindowChrome();
    }
  } catch (error) {
    reportAppError(error, 'Planung konnte beim Start nicht geladen werden. Gruppenansicht als Fallback geöffnet.', {
      scope: 'app-init',
      action: 'set-initial-tab',
      tab: TAB_PLANNING,
    });
    setActiveTabImmediate(TAB_GROUPS);
  }
  try {
    groupsController?.render({ resetViewport: true });
  } catch (error) {
    reportAppError(error, 'Die Hauptansicht konnte nicht vollständig initialisiert werden.', {
      scope: 'app-init',
      action: 'init-main-view',
    });
  }
  syncChromeState();
  workPhaseController?.refreshLayout();
  els.app?.classList.add('app-js-ready');
  if (!moduleWindowRequest.isModuleWindow && !helpPreviewRequest) {
    pwaInstallPrompt.showIfNeeded();
  }
  firstRunTutorial = createFirstRunTutorial({
    els,
    getContextualSteps: tutorialController.getDefinition,
    getActiveTab,
    setActiveTab: setActiveTabForTutorial,
    isChromeCollapsed,
    setChromeCollapsed,
    tooltipController: appTooltips,
    beforeStart: createBackupBeforeTutorialStart,
    onEntryRequest: openHelpEntry,
    onEntrySeen: syncTutorialEntryHintToModules,
  });
  registerCleanup(() => firstRunTutorial?.finish?.());
  helpCenter = createHelpCenter({
    els,
    onStartTutorial: startTutorialFromEntry,
  });
  if (helpPreviewRequest) tutorialController.startHelpPreview();
  else firstRunTutorial.showContextHelp({ prompt: true });
  updateController.start({ helpPreviewRequest });
  bindRuntime(window, 'pagehide', (event) => {
    if (event.persisted !== true) disposeRuntime();
  });
  bindRuntime(window, 'beforeunload', (event) => {
    if (!gradeRosterCoordinator?.hasUnsavedPickerConfig?.()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  return true;
}

export function createAppRuntime({
  documentRef = globalThis.document,
  view = globalThis.window,
  appVersion = String(globalThis.TEACHHELPER_APP_VERSION || 'dev'),
} = {}) {
  let started = false;
  let disposed = false;
  const cleanups = [];
  const registerCleanup = (cleanup) => {
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanups.splice(0).reverse().forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        console.error(error);
      }
    });
  };
  const start = () => {
    if (started || disposed) return false;
    started = true;
    return initializeApplication({
      documentRef,
      view,
      appVersion,
      registerCleanup,
      disposeRuntime: dispose,
    });
  };
  return Object.freeze({ start, dispose });
}
