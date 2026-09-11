import { createAppDom } from './dom.js';
import { createClassroomState } from './classroom-state.js';
import { createCourseContext } from './course-context.js';
import { createShellActionDialog } from './shell-action-dialog.js';
import { createFirstRunTutorial } from './first-run-tutorial.js';
import { createGradeRosterCoordinator } from './grade-roster-coordinator.js';
import { createHelpCenter } from './help-center.js';
import {
  createModuleMessageRouter,
  SIDEBAR_WIDTH_SCOPE_OTHER,
  SIDEBAR_WIDTH_SCOPE_PLANNING,
  SIDEBAR_WIDTH_SYNC_EVENT,
} from './module-message-router.js';
import { createTutorialCatalog } from './tutorials/catalog.js';
import {
  HELP_PREVIEW_COMMAND_EVENT,
  HELP_PREVIEW_STATE_EVENT,
  getHelpPreviewFrameNonce,
  readHelpPreviewRequest,
} from './help-preview.js';
import { createPlanningSeatplanBridge } from './planning-seatplan-bridge.js';
import { createPlanSnapshot } from './plan-format.js';
import {
  loadPlan,
  pickPlanFile,
  savePlan,
} from './plan-persistence.js';
import { registerServiceWorkerUpdates } from './pwa-updates.js';
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
import {
  createModuleFrame,
  postToModule,
} from '../shared/module-frame-bridge.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from '../shared/tutorial-entry-state.js';
import {
  assertFileSizeAtMost,
  FILE_LIMITS,
  formatFileSize,
} from '../shared/file-guards.js';
import {
  normalizeCsvCell,
  normalizeCsvHeader,
  parseCSV,
} from '../shared/csv.js';
import {
  dataTransferHasFiles,
  isCsvFile,
  isJsonFile,
  sanitizeExportFileName,
  stripFileExtension,
  triggerBlobDownload,
} from '../shared/file-io.js';
import { createSharedTimerStore } from '../shared/timer-store.js';
import {
  RANDOM_PICKER_DEFAULT_WEIGHT,
  mountRandomPicker,
  normalizeRandomPickerAutoDisableSelected,
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
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  MODULE_CONTEXT_MENU_DISMISS_EVENT,
  PLANNING_TUTORIAL_START_REQUEST_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
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
  const TEMPLATE_CSV_NAME = 'Namensliste Vorlage.csv';
  const TEMPLATE_CSV_CONTENT = [';Nachname;Vorname', ';Wurst;Hans'].join('\n');
  const UPDATE_APPLIED_HINT_SESSION_KEY = 'teachhelper:update-applied-hint';
  const getSafeSessionStorage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  let versionUpdateHintTimer = 0;
  let versionUpdateAvailable = false;
  let versionUpdateAppliedVisible = false;
  registerCleanup(() => {
    clearRuntimeTimeout(versionUpdateHintTimer);
    versionUpdateHintTimer = 0;
  });

  const renderVersionUpdateHint = () => {
    if (!els.headerVersion) {
      return;
    }
    const hintText = versionUpdateAppliedVisible
      ? 'Aktualisiert'
      : (versionUpdateAvailable ? 'Update verfügbar' : '');
    els.headerVersion.classList.toggle('has-update-hint', Boolean(hintText));
    if (hintText) {
      els.headerVersion.dataset.updateHint = hintText;
    } else {
      delete els.headerVersion.dataset.updateHint;
    }
  };

  const clearVersionUpdateHintTimer = () => {
    if (versionUpdateHintTimer) {
      clearRuntimeTimeout(versionUpdateHintTimer);
      versionUpdateHintTimer = 0;
    }
  };

  const dismissVersionUpdateHint = () => {
    versionUpdateAppliedVisible = false;
    clearVersionUpdateHintTimer();
    renderVersionUpdateHint();
  };

  const showVersionUpdateHint = () => {
    if (!els.headerVersion) {
      return;
    }
    versionUpdateAppliedVisible = true;
    clearVersionUpdateHintTimer();
    renderVersionUpdateHint();
    versionUpdateHintTimer = setRuntimeTimeout(() => {
      dismissVersionUpdateHint();
    }, 8000);
  };

  const setVersionUpdateAvailability = (isAvailable) => {
    versionUpdateAvailable = Boolean(isAvailable);
    renderVersionUpdateHint();
  };

  const markVersionUpdateHintPending = () => {
    try {
      getSafeSessionStorage()?.setItem(UPDATE_APPLIED_HINT_SESSION_KEY, '1');
    } catch {

    }
  };

  const consumePendingVersionUpdateHint = () => {
    try {
      const storage = getSafeSessionStorage();
      if (storage?.getItem(UPDATE_APPLIED_HINT_SESSION_KEY) !== '1') {
        return;
      }
      storage.removeItem(UPDATE_APPLIED_HINT_SESSION_KEY);
      showVersionUpdateHint();
    } catch {

    }
  };

  const setDisplayedAppVersion = (version) => {
    if (els.headerVersion) {
      const safeVersion = String(version || '').trim();
      els.headerVersion.textContent = safeVersion ? `(v${safeVersion})` : '';
      els.headerVersion.hidden = !safeVersion;
      if (safeVersion) {
        els.headerVersion.setAttribute('title', 'Auf Updates prüfen');
        els.headerVersion.setAttribute('aria-label', `Version v${safeVersion}. Auf Updates prüfen`);
      } else {
        els.headerVersion.removeAttribute('title');
        els.headerVersion.removeAttribute('aria-label');
      }
    }
  };
  setDisplayedAppVersion(String(appVersion || 'dev'));
  consumePendingVersionUpdateHint();
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
    planningInitialPaintPending: true,
    gradesInitialPaintPending: true,
    planningManualSaveState: {
      isManualMode: false,
      dirty: false,
      title: 'Datenbank speichern',
      ariaLabel: 'Datenbank speichern',
    },
    planningGradeVaultState: {
      ready: false,
      mode: 'setup',
      dbConnected: false,
      backupConnected: false,
      hasGradeCourse: false,
      hasGradeStudents: false,
      planningAccessReady: false,
      hasPlanningCourse: false,
      hasPlanningSlot: false,
      configured: false,
      unlocked: false,
      showGradeStudentPortraits: false,
      showNameLearningModule: false,
      nameLearningDueCount: null,
      setupRequired: false,
    },
    planningUnsavedState: {
      dirty: false,
      planningDirty: false,
      gradesDirty: false,
      dirtyGradeCourseIds: [],
    },
    chromeCollapsed: false,
    chromeTransitionState: 'idle',
    chromeTransitionTimer: 0,
    tabTransitionState: 'idle',
    tabTransitionTimer: 0,
    pendingTabTransitionTarget: null,
  };
  let bridgeController = null;
  let shellController = null;
  let groupsController = null;
  let workPhaseController = null;
  let classroomState = null;
  let courseContext = null;
  let moduleMessageRouter = null;
  const positionWorkOrderHintOverlay = () => workPhaseController?.positionHintOverlay();
  const getActiveTab = () => (shellController ? shellController.getActiveTab() : shellState.activeTab);
  const isChromeCollapsed = () => (shellController ? shellController.isChromeCollapsed() : shellState.chromeCollapsed);
  const getChromeTransitionState = () => (
    shellController ? shellController.getChromeTransitionState() : shellState.chromeTransitionState
  );
  const setChromeCollapsed = (collapsed, options) => shellController?.setChromeCollapsed(collapsed, options);
  const toggleChromeCollapsed = () => shellController?.toggleChromeCollapsed();
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
  let planningTutorialDemoFrame = null;
  let planningTutorialDemoActive = false;
  let planningTutorialDemoFrameReady = false;
  let pendingPlanningTutorialDemoView = null;
  let gradesTutorialDemoFrame = null;
  let gradesTutorialDemoActive = false;
  let gradesTutorialDemoFrameReady = false;
  let pendingGradesTutorialDemoView = null;
  let seatplanTutorialDemoFrame = null;
  let seatplanTutorialDemoActive = false;
  const PLANNING_TUTORIAL_COMMAND_EVENT = 'classroom:planning-tutorial-command';
  const GRADES_TUTORIAL_COMMAND_EVENT = 'classroom:grades-tutorial-command';
  const QR_TUTORIAL_COMMAND_EVENT = 'classroom:qr-tutorial-command';
  const DUPLICATE_CHECK_TUTORIAL_COMMAND_EVENT = 'classroom:duplicate-check-tutorial-command';
  const getPlanningFrame = () => planningTutorialDemoFrame || els.planningHost?.querySelector('iframe:not(.tutorial-demo-frame)') || null;
  const getGradesFrame = () => gradesTutorialDemoFrame || els.gradesHost?.querySelector('iframe:not(.tutorial-demo-frame)') || null;
  const getMergerFrame = () => els.mergerHost?.querySelector('iframe') || null;
  const getDuplicateCheckFrame = () => els.duplicateCheckHost?.querySelector('iframe') || null;
  const getQrFrame = () => els.qrHost?.querySelector('iframe') || null;
  const getSeatplanFrame = () => (
    seatplanTutorialDemoFrame
    || els.seatplanMainHost?.querySelector('iframe:not(.tutorial-demo-frame)')
    || null
  );
  const getNameLearningFrame = () => els.nameLearningHost?.querySelector('iframe') || null;
  const getModuleFrames = () => [
    getPlanningFrame(),
    getGradesFrame(),
    getMergerFrame(),
    getDuplicateCheckFrame(),
    getQrFrame(),
    getSeatplanFrame(),
    getNameLearningFrame(),
  ].filter(Boolean);
  const dismissModuleContextMenus = () => {
    getModuleFrames().forEach((frame) => postToModule(frame, {
      type: MODULE_CONTEXT_MENU_DISMISS_EVENT,
    }));
  };
  bindRuntime(document, 'pointerdown', dismissModuleContextMenus, true);
  bindRuntime(document, 'keydown', (event) => {
    if (event.key === 'Escape') dismissModuleContextMenus();
  }, true);
  const getDuplicateCheckController = () => els.duplicateCheckHost?._duplicateCheckController || null;
  const getQrController = () => els.qrHost?._qrController || null;
  const openExternalUrlForModule = (value) => {
    let url;
    try {
      url = new URL(String(value || ''));
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  };
  const openModuleResultPdf = (detail) => {
    const buffer = detail?.bytes;
    if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength) return;
    if (buffer.byteLength > FILE_LIMITS.PDF_RESULT_OPEN_BYTES) {
      showMessage(
        `Das Ergebnis ist zu groß für die Vorschau (max. ${formatFileSize(FILE_LIMITS.PDF_RESULT_OPEN_BYTES)}). Bitte die Datei herunterladen.`,
        'warn',
        { presentation: 'toast' }
      );
      return;
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    registerCleanup(() => URL.revokeObjectURL(url));
    setRuntimeTimeout(() => URL.revokeObjectURL(url), 120_000);
  };
  const syncTutorialEntryHintToModules = () => {
    if (!hasTutorialEntryHintBeenSeen()) return;
    [
      getPlanningFrame(),
      getGradesFrame(),
      getMergerFrame(),
      getDuplicateCheckFrame(),
      getQrFrame(),
      getSeatplanFrame(),
      getNameLearningFrame(),
    ].forEach((frame) => {
      postToModule(frame, {
        type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
        detail: { seen: true },
      });
    });
  };
  const getSidebarWidthScopeForTab = (tab) => (
    tab === TAB_PLANNING || tab === TAB_GRADES
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER
  );
  const getFramesForSidebarWidthScope = (scope) => (
    scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? [getPlanningFrame(), getGradesFrame()]
      : [getMergerFrame(), getDuplicateCheckFrame(), getQrFrame(), getSeatplanFrame(), getNameLearningFrame()]
  );
  const syncSidebarWidthToModules = (scope, width) => {
    const normalizedScope = scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER;
    getFramesForSidebarWidthScope(normalizedScope).forEach((frame) => {
      postToModule(frame, {
        type: SIDEBAR_WIDTH_SYNC_EVENT,
        detail: { scope: normalizedScope, width },
      });
    });
  };
  const openMergerToolForTutorial = (tool = 'layout') => {
    bridgeController?.ensureTabInitialized(TAB_MERGER);
    bridgeController?.dispatchMergerToolRequest?.(tool);
  };
  const dispatchPlanningTutorialDemoView = (detail) => {
    const frame = planningTutorialDemoFrame;
    pendingPlanningTutorialDemoView = detail;
    if (!planningTutorialDemoFrameReady || !frame?.contentWindow) return false;
    postToModule(frame, {
      type: 'classroom:planning-view-request',
      detail,
    });
    return true;
  };
  const dispatchGradesTutorialDemoView = (detail) => {
    const frame = gradesTutorialDemoFrame;
    pendingGradesTutorialDemoView = detail;
    if (!gradesTutorialDemoFrameReady || !frame?.contentWindow) return false;
    postToModule(frame, {
      type: GRADES_VIEW_REQUEST_EVENT,
      detail,
    });
    return true;
  };
  const postPlanningTutorialCommand = (command, detail = null, frame = getPlanningFrame()) => {
    if (!frame) return false;
    const payload = {
      type: PLANNING_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    };
    if (planningTutorialDemoActive && frame === planningTutorialDemoFrame && !planningTutorialDemoFrameReady) {
      bindRuntime(frame, 'load', () => {
        if (planningTutorialDemoFrame === frame) postToModule(frame, payload);
      }, { once: true });
      return true;
    }
    return postToModule(frame, payload);
  };
  const postGradesTutorialCommand = (command, detail = null, frame = getGradesFrame()) => {
    if (!frame) return false;
    const payload = {
      type: GRADES_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    };
    if (gradesTutorialDemoActive && frame === gradesTutorialDemoFrame && !gradesTutorialDemoFrameReady) {
      bindRuntime(frame, 'load', () => {
        if (gradesTutorialDemoFrame === frame) postToModule(frame, payload);
      }, { once: true });
      return true;
    }
    return postToModule(frame, payload);
  };
  const preparePlanningTutorialSurface = (surface) => {
    postPlanningTutorialCommand('showSurface', { surface });
  };
  const prepareGradesTutorialSurface = (surface) => {
    postGradesTutorialCommand('showSurface', { surface });
  };
  const openPlanningSettingsForTutorial = (settingsTab = 'dayoff') => {
    if (planningTutorialDemoActive) {
      dispatchPlanningTutorialDemoView({
        view: 'settings',
        settingsTab,
        settingsContext: 'planning',
        source: 'tutorial',
      });
      return;
    }
    bridgeController?.ensureTabInitialized(TAB_PLANNING);
    bridgeController?.dispatchPlanningViewRequest({
      view: 'settings',
      settingsTab,
      settingsContext: 'planning',
      source: 'tutorial',
    });
  };
  const NAME_LEARNING_TUTORIAL_COMMAND_EVENT = 'classroom:name-learning-tutorial-command';
  const postNameLearningTutorialCommand = (command, detail = null) => postToModule(getNameLearningFrame(), {
    type: NAME_LEARNING_TUTORIAL_COMMAND_EVENT,
    detail: { command, detail },
  });
  const prepareNameLearningTutorialSurface = (surface) => {
    bridgeController?.ensureTabInitialized(TAB_NAME_LEARNING);
    postNameLearningTutorialCommand('showSurface', { surface });
  };
  function activateNameLearningTutorialDemo() {
    bridgeController?.ensureTabInitialized(TAB_NAME_LEARNING);
    const frame = getNameLearningFrame();
    const activate = () => postNameLearningTutorialCommand('activateDemo');
    if (!activate() && frame) {
      bindRuntime(frame, 'load', activate, { once: true });
    }
    const cleanup = () => postNameLearningTutorialCommand('cleanupDemo');
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_NAME_LEARNING });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  let requestedQrTutorialTool = 'generator';
  let requestedQrTutorialSurface = '';
  let qrTutorialLoadFrame = null;
  const postQrTutorialCommand = (command, detail = null) => {
    const controller = getQrController();
    if (controller?.post?.({
      type: QR_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    })) {
      return true;
    }
    const frame = getQrFrame();
    return postToModule(frame, {
      type: QR_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    });
  };
  const applyRequestedQrTutorialTool = () => {
    const frame = getQrFrame();
    if (!frame) return false;
    return postQrTutorialCommand('selectTool', {
      tool: requestedQrTutorialTool,
      surface: requestedQrTutorialSurface,
    });
  };
  const openQrToolForTutorial = (tool = 'generator', surface = '') => {
    requestedQrTutorialTool = tool === 'decoder' ? 'decoder' : 'generator';
    requestedQrTutorialSurface = surface;
    bridgeController?.ensureTabInitialized(TAB_QR);
    const frame = getQrFrame();
    if (!frame || applyRequestedQrTutorialTool()) return;
    if (qrTutorialLoadFrame === frame) return;
    qrTutorialLoadFrame = frame;
    bindRuntime(frame, 'load', () => {
      if (qrTutorialLoadFrame === frame) {
        qrTutorialLoadFrame = null;
      }
      applyRequestedQrTutorialTool();
    }, { once: true });
  };
  function activateQrTutorialDemo() {
    bridgeController?.ensureTabInitialized(TAB_QR);
    postQrTutorialCommand('activateDemo');
    const cleanup = () => postQrTutorialCommand('cleanupDemo');
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_QR });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  function activatePlanningTutorialDemo() {
    const host = els.planningHost;
    if (!host) return { steps: [] };
    const realFrame = host.querySelector('iframe:not(.tutorial-demo-frame)');
    const realFrameWasHidden = Boolean(realFrame?.hidden);
    const realFrameDisplay = realFrame?.style.display || '';
    const manualSaveWasDisabled = Boolean(els.sidebarManualSaveBtn?.disabled);
    const manualSaveTitle = els.sidebarManualSaveBtn?.title || '';
    planningTutorialDemoActive = true;
    if (realFrame) {
      realFrame.hidden = true;
      realFrame.style.display = 'none';
    }
    if (els.sidebarManualSaveBtn) {
      els.sidebarManualSaveBtn.disabled = true;
      els.sidebarManualSaveBtn.title = 'Im Demomodus nicht verfügbar';
    }
    const demoUrl = new URL('./modules/planning/app.html', import.meta.url);
    demoUrl.searchParams.set('tutorial-demo', 'planning');
    const frame = createModuleFrame({
      className: 'planning-frame tutorial-demo-frame',
      title: 'Interaktive Tutorial-Beispieldaten',
      loading: 'eager',
      src: demoUrl,
    });
    host.appendChild(frame);
    planningTutorialDemoFrame = frame;
    planningTutorialDemoFrameReady = false;
    bindRuntime(frame, 'load', () => {
      if (planningTutorialDemoFrame !== frame) return;
      planningTutorialDemoFrameReady = true;
      if (pendingPlanningTutorialDemoView) {
        dispatchPlanningTutorialDemoView(pendingPlanningTutorialDemoView);
      }
    }, { once: true });
    const cleanup = () => {
      postToModule(frame, {
        type: PLANNING_TUTORIAL_COMMAND_EVENT,
        detail: { command: 'cleanup', detail: null },
      });
      planningTutorialDemoActive = false;
      planningTutorialDemoFrame?.remove();
      planningTutorialDemoFrame = null;
      planningTutorialDemoFrameReady = false;
      pendingPlanningTutorialDemoView = null;
      if (realFrame) {
        realFrame.hidden = realFrameWasHidden;
        realFrame.style.display = realFrameDisplay;
      }
      if (els.sidebarManualSaveBtn) {
        els.sidebarManualSaveBtn.disabled = manualSaveWasDisabled;
        els.sidebarManualSaveBtn.title = manualSaveTitle;
      }
    };
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_PLANNING });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  function activateGradesTutorialDemo() {
    const host = els.gradesHost;
    if (!host) return { steps: [] };
    const realFrame = host.querySelector('iframe:not(.tutorial-demo-frame)');
    const realFrameWasHidden = Boolean(realFrame?.hidden);
    const realFrameDisplay = realFrame?.style.display || '';
    const manualSaveWasDisabled = Boolean(els.sidebarManualSaveBtn?.disabled);
    const manualSaveTitle = els.sidebarManualSaveBtn?.title || '';
    gradesTutorialDemoActive = true;
    if (realFrame) {
      realFrame.hidden = true;
      realFrame.style.display = 'none';
    }
    if (els.sidebarManualSaveBtn) {
      els.sidebarManualSaveBtn.disabled = true;
      els.sidebarManualSaveBtn.title = 'Im Demomodus nicht verfügbar';
    }
    const demoUrl = new URL('./modules/grades/app.html', import.meta.url);
    demoUrl.searchParams.set('tutorial-demo', 'grades');
    const frame = createModuleFrame({
      className: 'grades-frame tutorial-demo-frame',
      title: 'Interaktive Tutorial-Beispieldaten',
      loading: 'eager',
      src: demoUrl,
    });
    host.appendChild(frame);
    gradesTutorialDemoFrame = frame;
    gradesTutorialDemoFrameReady = false;
    bindRuntime(frame, 'load', () => {
      if (gradesTutorialDemoFrame !== frame) return;
      gradesTutorialDemoFrameReady = true;
      if (pendingGradesTutorialDemoView) {
        dispatchGradesTutorialDemoView(pendingGradesTutorialDemoView);
      }
    }, { once: true });
    const cleanup = () => {
      postToModule(frame, {
        type: GRADES_TUTORIAL_COMMAND_EVENT,
        detail: { command: 'cleanup', detail: null },
      });
      gradesTutorialDemoActive = false;
      gradesTutorialDemoFrame?.remove();
      gradesTutorialDemoFrame = null;
      gradesTutorialDemoFrameReady = false;
      pendingGradesTutorialDemoView = null;
      if (realFrame) {
        realFrame.hidden = realFrameWasHidden;
        realFrame.style.display = realFrameDisplay;
      }
      if (els.sidebarManualSaveBtn) {
        els.sidebarManualSaveBtn.disabled = manualSaveWasDisabled;
        els.sidebarManualSaveBtn.title = manualSaveTitle;
      }
    };
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_GRADES });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  function activateSeatplanTutorialDemo() {
    bridgeController?.ensureTabInitialized(TAB_SEATPLAN);
    const host = els.seatplanMainHost;
    if (!host) return { steps: [] };
    const realFrame = host.querySelector('iframe:not(.tutorial-demo-frame)');
    const realFrameWasHidden = Boolean(realFrame?.hidden);
    const realFrameDisplay = realFrame?.style.display || '';
    seatplanTutorialDemoActive = true;
    if (realFrame) {
      realFrame.hidden = true;
      realFrame.style.display = 'none';
    }
    const demoUrl = new URL('./modules/seatplan/app.html', import.meta.url);
    demoUrl.searchParams.set('tutorial-demo', 'seatplan');
    const frame = createModuleFrame({
      className: 'seatplan-frame tutorial-demo-frame',
      title: 'Interaktive Tutorial-Beispieldaten',
      loading: 'eager',
      src: demoUrl,
    });
    host.appendChild(frame);
    seatplanTutorialDemoFrame = frame;
    const cleanup = () => {
      if (!seatplanTutorialDemoActive) return;
      seatplanTutorialDemoActive = false;
      seatplanTutorialDemoFrame?.remove();
      seatplanTutorialDemoFrame = null;
      if (realFrame) {
        realFrame.hidden = realFrameWasHidden;
        realFrame.style.display = realFrameDisplay;
      }
    };
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_SEATPLAN });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  function activateDuplicateCheckTutorialDemo() {
    bridgeController?.ensureTabInitialized(TAB_DUPLICATE_CHECK);
    const postDuplicateCheckTutorialCommand = (command) => {
      const payload = {
        type: DUPLICATE_CHECK_TUTORIAL_COMMAND_EVENT,
        detail: { command },
      };
      if (getDuplicateCheckController()?.post?.(payload)) return true;
      return postToModule(getDuplicateCheckFrame(), payload);
    };
    postDuplicateCheckTutorialCommand('activateDemo');
    const cleanup = () => postDuplicateCheckTutorialCommand('cleanupDemo');
    try {
      const definition = getCurrentModuleTutorialSteps({ activeTab: TAB_DUPLICATE_CHECK });
      return { steps: Array.isArray(definition) ? definition : definition.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  const tutorialCatalog = createTutorialCatalog({
    shellSupportsExternalFileSync,
    getComputedStyle: (node) => (
      (node.ownerDocument?.defaultView || window).getComputedStyle(node)
    ),
    frames: {
      getPlanningFrame,
      getGradesFrame,
      getMergerFrame,
      getDuplicateCheckFrame,
      getQrFrame,
      getSeatplanFrame,
      getNameLearningFrame,
    },
    actions: {
      preparePlanningTutorialSurface,
      prepareGradesTutorialSurface,
      openMergerToolForTutorial,
      openQrToolForTutorial,
      prepareNameLearningTutorialSurface,
    },
    demos: {
      activateGradesTutorialDemo,
      activatePlanningTutorialDemo,
      activateSeatplanTutorialDemo,
      activateClassroomTutorialDemo,
      activateDuplicateCheckTutorialDemo,
      activateWorkPhaseTutorialDemo,
      activateQrTutorialDemo,
      activateNameLearningTutorialDemo,
      isSeatplanTutorialDemoActive: () => seatplanTutorialDemoActive,
    },
  });
  const getCurrentModuleTutorialSteps = tutorialCatalog.getDefinition;
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

  function startHelpPreview() {
    if (!helpPreviewRequest || !firstRunTutorial) return;
    const { articleId, config } = helpPreviewRequest;
    const frameNonce = getHelpPreviewFrameNonce(window.location);
    const trustedParentOrigin = (window.origin === 'null' || window.location.origin === 'null') ? '*' : window.location.origin;
    const postState = (state, detail = {}) => {
      if (window.parent === window) return;
      window.parent.postMessage({
        type: HELP_PREVIEW_STATE_EVENT,
        ...(frameNonce ? { frameNonce } : {}),
        detail: { articleId, state, ...detail },
      }, trustedParentOrigin);
    };
    let previewFrameSequence = 0;
    const publishTarget = (stepTitle, sequence, attempts = 0) => {
      if (sequence !== previewFrameSequence) return;
      const rect = firstRunTutorial.getPreviewTargetRect(stepTitle);
      if (!rect) {
        if (attempts < 420) {
          setRuntimeTimeout(() => publishTarget(stepTitle, sequence, attempts + 1), 50);
          return;
        }
        postState('target-missing', { stepTitle });
        return;
      }
      postState('frame', {
        stepTitle,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    };
    const showFrame = (stepTitle) => {
      const sequence = ++previewFrameSequence;
      if (!firstRunTutorial.showPreviewStep(stepTitle)) {
        postState('target-missing', { stepTitle });
        return;
      }
      [320, 900, 1800, 3200].forEach((delay) => setRuntimeTimeout(() => {
        if (sequence === previewFrameSequence) firstRunTutorial.showPreviewStep(stepTitle);
      }, delay));
      publishTarget(stepTitle, sequence);
    };
    const onPreviewCommand = (event) => {
      const message = event.data;
      if (
        event.source !== window.parent
        || !message
        || message.type !== HELP_PREVIEW_COMMAND_EVENT
        || (frameNonce
          ? message.frameNonce !== frameNonce
          : event.origin !== trustedParentOrigin)
      ) return;
      const stepTitle = String(message.detail?.stepTitle || '');
      if (message.detail?.action === 'show-frame' && stepTitle) showFrame(stepTitle);
    };
    bindRuntime(window, 'message', onPreviewCommand);
    bindRuntime(window, 'pagehide', () => window.removeEventListener('message', onPreviewCommand), { once: true });

    setActiveTabForTutorial(config.tab);
    const availableSteps = firstRunTutorial.startPreview();
    if (!availableSteps.length) {
      postState('error');
      return;
    }
    postState('ready', { availableSteps });
    setRuntimeTimeout(() => showFrame(config.frames[0]?.stepTitle), 0);
  }

  function isGuardBackupPossible() {
    const workspaceOwner = window.__teachhelperWorkspaceController?.getOwner?.();
    const databaseConnected = Boolean(workspaceOwner?.hasShellDatabaseConnection?.());
    const backupDirectoryConnected = Boolean(workspaceOwner?.backupState?.directoryHandle);
    return databaseConnected && backupDirectoryConnected;
  }

  function describeBackupStatus() {
    return isGuardBackupPossible()
      ? ''
      : 'Kein Backup-Ordner verbunden – das Update läuft ohne Sicherung.';
  }

  async function runGuardBackup(mode) {
    const workspaceOwner = window.__teachhelperWorkspaceController?.getOwner?.();
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

  async function beforeReloadForUpdate() {
    const result = await runGuardBackup('update');
    if (result.ok) markVersionUpdateHintPending();
    return result;
  }

  let pendingSeatplanChromeCollapsed = null;
  let pendingSeatplanChromeFrame = 0;
  registerCleanup(() => {
    pendingSeatplanChromeCollapsed = null;
    if (!pendingSeatplanChromeFrame) return;
    cancelRuntimeSchedule(pendingSeatplanChromeFrame);
    pendingSeatplanChromeFrame = 0;
  });

  const applyPendingSeatplanChrome = (attempt = 0) => {
    pendingSeatplanChromeFrame = 0;
    if (pendingSeatplanChromeCollapsed === null) return;
    if (getChromeTransitionState() === 'idle') {
      const collapsed = pendingSeatplanChromeCollapsed;
      pendingSeatplanChromeCollapsed = null;
      setChromeCollapsed(collapsed, { resetSidebarWidth: false });
      return;
    }
    if (attempt >= 60) {
      pendingSeatplanChromeCollapsed = null;
      return;
    }
    if (typeof window.requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestRuntimeFrame(() => applyPendingSeatplanChrome(attempt + 1));
      return;
    }
    if (typeof window.setTimeout === 'function') {
      pendingSeatplanChromeFrame = setRuntimeTimeout(() => applyPendingSeatplanChrome(attempt + 1), 16);
    }
  };

  const requestSeatplanChromeCollapsed = (collapsed) => {
    pendingSeatplanChromeCollapsed = Boolean(collapsed);
    if (pendingSeatplanChromeFrame) return;
    if (typeof window.requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestRuntimeFrame(() => applyPendingSeatplanChrome());
      return;
    }
    if (typeof window.setTimeout === 'function') {
      pendingSeatplanChromeFrame = setRuntimeTimeout(() => applyPendingSeatplanChrome(), 16);
    }
  };

  courseContext = createCourseContext({
    eventTarget: window,
    view: window,
    getActiveTab,
    setActiveTab,
    dispatchGradesNavigation: detail => bridgeController?.dispatchGradesNavigation?.(detail),
    dispatchPlanningViewRequest: detail => bridgeController?.dispatchPlanningViewRequest?.(detail),
    ensureSeatplanInitialized: () => bridgeController?.ensureTabInitialized(TAB_SEATPLAN),
    sendCourseSeatplanContext: detail => bridgeController?.sendCourseSeatplanContext(detail),
  });
  registerCleanup(() => courseContext?.dispose?.());

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    moduleMessageRouter = createModuleMessageRouter({
      messageTarget: window,
      frames: {
        getPlanningFrame,
        getGradesFrame,
        getMergerFrame,
        getDuplicateCheckFrame,
        getQrFrame,
        getSeatplanFrame,
        getNameLearningFrame,
      },
      handlers: {
        onPlanningViewRequest: (detail) => {
          window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, { detail }));
        },
        onNameLearningRequest: (type, detail) => {
          window.__teachhelperWorkspaceController?.getOwner?.().recordGradeVaultActivity?.();
          document.dispatchEvent(new CustomEvent(type, { detail }));
        },
        onNameLearningManageStudentsRequest: (detail) => {
          const courseId = Number(detail?.courseId || 0);
          const studentId = Number(detail?.studentId || 0);
          if (!courseId) return;
          courseContext.suppressGradesAutoSelect();
          bridgeController?.dispatchGradesNavigation?.({
            courseId,
            action: 'manage-students',
            ...(studentId ? { studentId } : {}),
            subview: 'overview',
            source: 'name-learning',
          });
          setActiveTab(TAB_GRADES);
        },
        onThemePreferenceChange: (detail) => {
          themeController.setPreference(detail?.preference);
        },
        onToastRequest: (detail) => {
          const message = String(detail.message || '').trim();
          if (!message) return;
          const variant = detail.variant === 'error' ? 'error' : 'success';
          showMessage(message, variant, { presentation: 'toast' });
        },
        onMoreToolsDismiss: () => {
          shellController?.closeMoreToolsMenu();
        },
        onOpenExternalRequest: (detail) => {
          openExternalUrlForModule(detail?.url);
        },
        onMergerOpenResultRequest: (detail) => {
          openModuleResultPdf(detail);
        },
        onGradesNavigate: (detail) => {
          courseContext.suppressGradesAutoSelect();
          bridgeController?.dispatchGradesNavigation?.(detail);
        },
        onGradeVaultActivity: () => {
          window.__teachhelperWorkspaceController?.getOwner?.().recordGradeVaultActivity?.();
        },
        onGradeVaultRequest: (detail) => {
          bridgeController?.requestGradeVault?.(detail);
        },
        onSidebarWidthRequest: (detail, { frame, scope }) => {
          postToModule(frame, {
            type: SIDEBAR_WIDTH_SYNC_EVENT,
            detail: {
              scope,
              width: shellController?.getSidebarWidth(scope)
                ?? (scope === SIDEBAR_WIDTH_SCOPE_PLANNING ? 220 : 360),
            },
          });
        },
        onSidebarWidthCommit: (detail, { scope }) => {
          shellController?.setSidebarWidth(scope, detail?.width);
        },
        onSidebarCollapseRequest: (detail, { scope }) => {
          if (scope !== getSidebarWidthScopeForTab(getActiveTab())) return;
          setChromeCollapsed(true);
        },
        onSeatplanChromeRequest: (detail) => {
          const collapsed = detail.collapsed === true;
          if (collapsed && getActiveTab() !== TAB_SEATPLAN) return;
          requestSeatplanChromeCollapsed(collapsed);
        },
        onTutorialEntryHint: (detail, { frame }) => {
          if (detail.action === 'seen') {
            markTutorialEntryHintSeen();
            firstRunTutorial?.clearContextHelpPrompt?.();
            syncTutorialEntryHintToModules();
            return;
          }
          postToModule(frame, {
            type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
            detail: { seen: hasTutorialEntryHintBeenSeen() },
          });
        },
        onHelpEntryRequest: () => {
          openHelpEntry();
        },
      },
    });
    registerCleanup(() => moduleMessageRouter?.dispose?.());
    bindRuntime(window, PLANNING_VIEW_REQUEST_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object' || detail.source !== 'iframe') {
        return;
      }
      if (detail.view === 'grades') {
        courseContext.suppressGradesAutoSelect();
        bridgeController?.dispatchGradesNavigation?.(detail);
        setActiveTab(TAB_GRADES);
        return;
      }
      setActiveTab(TAB_PLANNING);
      if (detail.returnNotice) {
        showMessage(String(detail.returnNotice), 'success', { presentation: 'toast' });
      }
    });
    bindRuntime(window, GRADES_VIEW_REQUEST_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object' || detail.source !== 'iframe') {
        return;
      }
      if (
        detail.view !== 'planning'
        && gradeVaultOverlayNavigationReturnTab
        && Date.now() < gradeVaultOverlayNavigationSuppressedUntil
      ) {
        if (getActiveTab() !== gradeVaultOverlayNavigationReturnTab) {
          setActiveTab(gradeVaultOverlayNavigationReturnTab);
        }
        return;
      }
      if (detail.view !== 'planning') {
        courseContext.suppressGradesAutoSelect();
      }
      setActiveTab(detail.view === 'planning' ? TAB_PLANNING : TAB_GRADES);
    });
    bindRuntime(window, PLANNING_TUTORIAL_START_REQUEST_EVENT, openHelpEntry);
  }

  const state = {
    lastDirectoryHandle: null,
    randomPickerAutoDisableSelected: false,
  };
  let randomPickerController = null;
  let gradeRosterCoordinator = null;
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

  function activateClassroomTutorialDemo(tab) {
    if (classroomState.isDemoActive()) {
      const current = getCurrentModuleTutorialSteps({ activeTab: tab });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup: () => { } };
    }
    const demoStudents = [
      ['01', 'Alex', 'Beispiel', 'A', 1], ['02', 'Sam', 'Muster', 'A', 2],
      ['03', 'Kim', 'Demo', 'B', 1], ['04', 'Robin', 'Test', 'B', 3],
      ['05', 'Mika', 'Probe', 'C', 1], ['06', 'Toni', 'Beispiel', 'C', 1],
      ['07', 'Jona', 'Muster', 'D', 1], ['08', 'Noa', 'Demo', 'D', 1],
    ].map(([id, first, last, performanceFlair, randomWeight]) => ({
      id, first, last, performanceFlair, randomWeight,
      buddies: id === '01' ? ['02'] : [],
      foes: id === '03' ? ['04'] : [],
    }));
    const previousGroupsState = groupsController?.getStateSnapshot();
    const fileInputWasDisabled = Boolean(els.file?.disabled);
    if (els.file) els.file.disabled = true;
    const restoreClassroomState = classroomState.activateDemoState({
      students: demoStudents,
      headers: ['Nachname', 'Vorname'],
      csvName: 'Beispielklasse',
      performanceFlairCount: 4,
    });
    groupsController?.replaceState({
      seats: { '1-1': ['01', '02'], '1-2': ['03', '05'], '2-1': ['04'], '2-2': ['06'] },
      gridRows: 2,
      gridCols: 2,
      activeSeats: new Set(['1-1', '1-2', '2-1', '2-2']),
      activeSeatOrder: ['1-1', '1-2', '2-1', '2-2'],
      lockedSeats: new Set(['1-1']),
      seatTopics: { '1-1': 'Recherche', '1-2': 'Auswertung', '2-1': '', '2-2': '' },
      minGroupSize: 2,
      maxGroupSize: 3,
    });
    updateCsvStatusDisplay();
    groupsController?.render({ resetViewport: true });
    renderRandomPicker();
    const cleanup = () => {
      if (!classroomState.isDemoActive()) return;
      if (groupsController?.isSuggesting() || randomPickerController?.isSpinning()) {
        setRuntimeTimeout(cleanup, 120);
        return;
      }
      restoreClassroomState();
      groupsController?.replaceState(previousGroupsState);
      if (els.file) els.file.disabled = fileInputWasDisabled;
      if (els.preferencesDialog?.open && typeof els.preferencesDialog.close === 'function') {
        els.preferencesDialog.close();
      }
      els.preferencesDialog?.removeAttribute('open');
      updateCsvStatusDisplay();
      groupsController?.render({ resetViewport: true });
      renderRandomPicker();
    };
    try {
      const current = getCurrentModuleTutorialSteps({ activeTab: tab });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  const SharedTimerStore = createSharedTimerStore();
  function activateWorkPhaseTutorialDemo() {
    const cleanup = workPhaseController?.activateTutorialDemo() || (() => {});
    try {
      const current = getCurrentModuleTutorialSteps({ activeTab: TAB_WORK_PHASE });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  bridgeController = createPlanningSeatplanBridge({
    els,
    getChromeCollapsed: isChromeCollapsed,
    rosterStore,
    documentBus: document,
  });
  shellController = createShellController({
    els,
    state: shellState,
    isIOSDevice,
    shellSupportsExternalFileSync,
    onEnsureTabInitialized: (tab) => {
      try {
        bridgeController?.ensureTabInitialized(tab);
      } catch (error) {
        const userMessage = tab === TAB_MERGER
          ? 'PDF-Tools konnten nicht initialisiert werden.'
          : (
            tab === TAB_DUPLICATE_CHECK
              ? 'DuplikatCheck konnte nicht initialisiert werden.'
              : (
                tab === TAB_QR
                  ? 'QR-Tools konnten nicht initialisiert werden.'
                  : tab === TAB_SEATPLAN
                    ? 'Sitzplan-Modul konnte nicht initialisiert werden.'
                    : tab === TAB_GRADES
                      ? 'Noten-Modul konnte nicht initialisiert werden.'
                      : 'Planungs-Modul konnte nicht initialisiert werden.'
              )
          );
        reportAppError(error, userMessage, {
          scope: 'tab-init',
          tab,
        });
        if (tab === TAB_PLANNING && els.planningHost) {
          els.planningHost.textContent = 'Planung konnte nicht geladen werden.';
        }
        if (tab === TAB_GRADES && els.gradesHost) {
          els.gradesHost.textContent = 'Noten konnten nicht geladen werden.';
        }
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
    onSidebarWidthChange: (scope, width) => syncSidebarWidthToModules(scope, width),
    onActiveTabChange: () => firstRunTutorial?.showContextHelp?.({ prompt: true }),
    onTabActivating: (tab) => {
      courseContext.handleTabActivating(tab);
    },
  });
  const initialWorkspaceSnapshot = window.__teachhelperWorkspaceController?.getSnapshot?.('shell');
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
  function getDefaultPlanModeLabel() {
    return getActiveTab() === TAB_RANDOM_PICKER ? 'Picker' : 'Gruppen';
  }

  function getDefaultPlanBaseName() {
    const modeLabel = getDefaultPlanModeLabel();
    const { csvName } = classroomState.getState();
    return csvName ? `${csvName} (${modeLabel})` : modeLabel;
  }

  function getSuggestedPlanFileName() {
    return sanitizeExportFileName(getDefaultPlanBaseName());
  }

  function downloadCsvTemplate() {
    if (classroomState.isDemoActive()) {
      showMessage('Demo: Downloads sind für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const blob = new Blob([TEMPLATE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, TEMPLATE_CSV_NAME, {
      defaultName: TEMPLATE_CSV_NAME,
      cleanupDelay: isIOSDevice ? 6000 : 2500,
      onErrorMessage: 'CSV-Download konnte nicht gestartet werden:',
    });
  }

  async function downloadSeatPlan() {
    if (classroomState.isDemoActive()) {
      showMessage('Demo: Speichern und Exportieren ist für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const groupsPlanState = groupsController?.getPlanState();
    if (!groupsPlanState) return;
    const classroom = classroomState.getState();
    const snapshot = createPlanSnapshot({
      generatedAt: new Date().toISOString(),
      roster: {
        students: classroom.students,
        headers: classroom.headers,
        delimiter: classroom.delim,
        csvName: classroom.csvName || '',
      },
      groups: groupsPlanState,
      randomPicker: {
        autoDisableSelected: state.randomPickerAutoDisableSelected,
      },
      workPhase: workPhaseController?.getPlanState(),
    });
    if (!snapshot) return;
    const defaultName = getSuggestedPlanFileName();
    let nameInput = defaultName;
    if (!isIOSDevice) {
      if (!shellActionDialog) return;
      const promptLabel = getActiveTab() === TAB_RANDOM_PICKER
        ? 'Bitte gib einen Dateinamen für den Pickerstand ein:'
        : 'Bitte gib einen Dateinamen ein:';
      const desiredName = await shellActionDialog.prompt({
        title: 'Dateiname festlegen',
        message: promptLabel,
        inputLabel: 'Dateiname',
        defaultValue: defaultName,
        confirmText: 'Speichern',
      });
      if (desiredName === null) return;
      nameInput = desiredName || '';
    }
    const safeName = sanitizeExportFileName(nameInput) || defaultName;
    const saveResult = await savePlan(snapshot, {
      filename: safeName,
      fallbackName: getDefaultPlanModeLabel(),
      directoryHandle: state.lastDirectoryHandle,
      pickerDescription: `${getDefaultPlanModeLabel()} JSON`,
      cleanupDelay: isIOSDevice ? 4000 : 1200,
    });
    if (saveResult.status === 'aborted') {
      return;
    }
    if (saveResult.handle) {
      state.lastDirectoryHandle = saveResult.handle;
    }
    showMessage('Man kann die Gruppen NICHT durch Anklicken der eben erstellten Datenbankdatei öffnen.\n\nStattdessen muss man die Datenbankdatei hier in TeachHelper über „Gruppen laden“ auswählen oder sie irgendwo in TeachHelper ziehen.', 'info');
  }

  function applyPlan(plan, options = {}) {
    const restoreSeatAssignments = options.restoreSeatAssignments !== false;
    if (!plan || typeof plan !== 'object') throw new Error('Ungültiges Plan-Format.');
    const rosterPlanState = plan.roster && typeof plan.roster === 'object' ? plan.roster : {};
    const groupsPlanState = plan.groups && typeof plan.groups === 'object' ? plan.groups : {};
    const randomPickerPlanState = plan.randomPicker && typeof plan.randomPicker === 'object'
      ? plan.randomPicker
      : {};
    const workPhasePlanState = plan.workPhase && typeof plan.workPhase === 'object'
      ? plan.workPhase
      : {};
    const incomingStudents = Array.isArray(rosterPlanState.students) ? rosterPlanState.students : [];
    const incomingCsvName = typeof rosterPlanState.csvName === 'string' ? rosterPlanState.csvName : '';
    classroomState.updateState({
      performanceFlairCount: clampPerformanceFlairCount(groupsPlanState.performanceFlairCount, 4),
    });
    state.randomPickerAutoDisableSelected = normalizeRandomPickerAutoDisableSelected(
      randomPickerPlanState.autoDisableSelected
    );
    const normalizedCsvName = sanitizeExportFileName(incomingCsvName);
    classroomState.updateState({
      students: incomingStudents.map(student => sanitizeRandomPickerStudent(student)),
      headers: Array.isArray(rosterPlanState.headers) ? rosterPlanState.headers : [],
      delim: typeof rosterPlanState.delimiter === 'string' ? rosterPlanState.delimiter : ',',
      csvName: normalizedCsvName || classroomState.getState().csvName || '',
    });
    groupsController?.restorePlanState(groupsPlanState, { restoreSeatAssignments });
    workPhaseController?.restorePlanState(workPhasePlanState);
    if (!restoreSeatAssignments) {
      els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    }
    renderRandomPicker();
  }

  async function importPlanFromFile(file, handle) {
    if (classroomState.isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    const planLabelFromFile = sanitizeExportFileName(stripFileExtension(file.name || ''));
    const plan = await loadPlan(file);
    if (handle) {
      state.lastDirectoryHandle = handle;
    }
    applyPlan(plan, { restoreSeatAssignments: true });
    const importedLabel = typeof plan?.roster?.csvName === 'string' ? plan.roster.csvName.trim() : '';
    if (!importedLabel) {
      classroomState.updateState({
        csvName: planLabelFromFile || classroomState.getState().csvName,
      });
    }
  }

  function splitCombinedStudentName(value) {
    const combined = normalizeCsvCell(value);
    if (!combined) return { first: '', last: '' };
    if (combined.includes(',')) {
      const [last, first] = combined.split(',');
      return {
        first: normalizeCsvCell(first),
        last: normalizeCsvCell(last),
      };
    }
    const parts = combined.split(/\s+/).filter(Boolean);
    return {
      first: normalizeCsvCell(parts.shift() || ''),
      last: normalizeCsvCell(parts.join(' ')),
    };
  }

  function resolveStudentColumnIndexes(headers, rows) {
    const normalizedHeaders = Array.isArray(headers) ? headers.map(normalizeCsvHeader) : [];
    const findIndex = aliases => normalizedHeaders.findIndex(cell => aliases.includes(cell));
    const lastIndex = findIndex(['nachname', 'name', 'surname', 'last', 'lastname', 'familienname']);
    const firstIndex = findIndex(['vorname', 'firstname', 'first', 'givenname', 'rufname']);
    const combinedIndex = findIndex(['schüler', 'schueler', 'schülername', 'schuelername', 'student', 'lernende', 'lernender']);
    if (lastIndex >= 0 || firstIndex >= 0 || combinedIndex >= 0) {
      return { lastIndex, firstIndex, combinedIndex };
    }
    const sampleRow = Array.isArray(rows)
      ? rows.find(row => Array.isArray(row) && row.some(cell => normalizeCsvCell(cell)))
      : null;
    const fallbackOffset = normalizedHeaders[0] === '' && normalizedHeaders.length >= 3 ? 1 : 0;
    if (sampleRow && sampleRow.length >= fallbackOffset + 2) {
      return { lastIndex: fallbackOffset, firstIndex: fallbackOffset + 1, combinedIndex: -1 };
    }
    if (sampleRow && sampleRow.length >= 3) {
      return { lastIndex: 1, firstIndex: 2, combinedIndex: -1 };
    }
    return { lastIndex: 0, firstIndex: 1, combinedIndex: -1 };
  }

  function readStudents(rows, headers = []) {
    const { lastIndex, firstIndex, combinedIndex } = resolveStudentColumnIndexes(headers, rows);
    const students = [];
    for (const r of rows) {
      let first = '';
      let last = '';
      if (lastIndex >= 0 || firstIndex >= 0) {
        last = normalizeCsvCell(r?.[lastIndex] || '');
        first = normalizeCsvCell(r?.[firstIndex] || '');
      }
      if ((!last && !first) && combinedIndex >= 0) {
        const parsed = splitCombinedStudentName(r?.[combinedIndex] || '');
        first = parsed.first;
        last = parsed.last;
      }
      if (last || first) {
        const id = String(students.length + 1).padStart(2, '0');
        students.push({
          id,
          first,
          last,
          performanceFlair: '',
          buddies: [],
          foes: [],
          randomWeight: RANDOM_PICKER_DEFAULT_WEIGHT
        });
      }
    }
    return students;
  }

  function updateCsvStatusDisplay() {
    if (!els.csvStatus) return;
    const label = String(classroomState.getState().csvName || '').trim();
    renderCsvStatus(label);
  }

  function renderCsvStatus(label = '') {
    if (!els.csvStatus) return;
    const normalizedLabel = String(label || '').trim();
    els.csvStatus.replaceChildren();
    els.csvStatus.classList.toggle('empty-state-box', !normalizedLabel);
    if (normalizedLabel) {
      els.csvStatus.textContent = normalizedLabel;
      return;
    }
    const title = document.createElement('span');
    title.className = 'empty-state-title';
    title.textContent = 'Noch keine Datei';
    const copy = document.createElement('span');
    copy.className = 'empty-state-copy';
    copy.textContent = 'Importiere eine Namensliste, um loszulegen.';
    els.csvStatus.append(title, copy);
  }
  let gradeVaultOverlayRevealedGradesShell = false;
  let gradeVaultOverlayReturnTab = '';
  let gradeVaultOverlayRestoreTimer = 0;
  let gradeVaultOverlayNavigationReturnTab = '';
  let gradeVaultOverlayNavigationSuppressedUntil = 0;
  let gradeVaultOverlayPreservesSourceTab = false;
  registerCleanup(() => {
    clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
    gradeVaultOverlayRestoreTimer = 0;
  });
  bindRuntime(window, GRADES_GRADE_VAULT_OVERLAY_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    const isOpen = Boolean(detail?.open);
    const preserveSourceTab = detail?.preserveSourceTab !== false;
    const gradesTabIsActive = appEl.classList.contains('app-tab-grades');

    if (isOpen) {
      gradeVaultOverlayPreservesSourceTab = preserveSourceTab;
      if (preserveSourceTab && !gradesTabIsActive) {
        gradeVaultOverlayReturnTab = getActiveTab();
        gradeVaultOverlayNavigationReturnTab = gradeVaultOverlayReturnTab;
        gradeVaultOverlayNavigationSuppressedUntil = Date.now() + 1500;
      } else if (!preserveSourceTab) {
        gradeVaultOverlayReturnTab = '';
        gradeVaultOverlayNavigationReturnTab = '';
        gradeVaultOverlayNavigationSuppressedUntil = 0;
        if (gradeVaultOverlayRestoreTimer) {
          clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
          gradeVaultOverlayRestoreTimer = 0;
        }
      }
    }
    gradeVaultOverlayRevealedGradesShell = isOpen && !gradesTabIsActive;

    appEl.classList.toggle('grade-vault-overlay', isOpen);
    appEl.classList.toggle(
      'grade-vault-overlay-revealed-grades',
      isOpen && gradeVaultOverlayRevealedGradesShell
    );
    if (!isOpen && gradeVaultOverlayPreservesSourceTab && gradeVaultOverlayReturnTab) {
      const returnTab = gradeVaultOverlayReturnTab;
      gradeVaultOverlayReturnTab = '';
      gradeVaultOverlayNavigationReturnTab = returnTab;
      gradeVaultOverlayNavigationSuppressedUntil = Date.now() + 1500;
      const restoreSourceTab = () => {
        if (getActiveTab() === TAB_GRADES && returnTab !== TAB_GRADES) {
          setActiveTab(returnTab);
        }
      };
      restoreSourceTab();
      if (gradeVaultOverlayRestoreTimer) {
        clearRuntimeTimeout(gradeVaultOverlayRestoreTimer);
      }
      gradeVaultOverlayRestoreTimer = setRuntimeTimeout(() => {
        gradeVaultOverlayRestoreTimer = 0;
        restoreSourceTab();
      }, 360);
    }
    if (!isOpen) {
      gradeVaultOverlayPreservesSourceTab = false;
    }
  });

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
  });
  registerCleanup(() => gradeRosterCoordinator?.dispose?.());
  gradeRosterCoordinator.requestCourses();

  async function importCsvFromFile(file) {
    if (classroomState.isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    assertFileSizeAtMost(file, FILE_LIMITS.CSV_BYTES, 'CSV-Datei');
    const guessedLabel = sanitizeExportFileName(stripFileExtension(file.name));
    classroomState.updateState({
      csvName: guessedLabel || classroomState.getState().csvName,
    });
    updateCsvStatusDisplay();
    const text = await file.text();
    const parsedCsv = parseCSV(text);
    classroomState.updateState({ delim: parsedCsv.delimiter });
    let rows = parsedCsv.rows;
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn', { presentation: 'toast' }); return; }
    const isSeparatorRow = (row) => {
      if (!Array.isArray(row)) return false;
      const normalized = row
        .map(val => String(val ?? '').trim())
        .join('')
        .toLowerCase();
      return /^sep\s*=/.test(normalized);
    };
    rows = rows.filter(row => !isSeparatorRow(row));
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn', { presentation: 'toast' }); return; }
    const firstNonEmptyIdx = rows.findIndex(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
    if (firstNonEmptyIdx === -1) { showMessage('Nur leere Zeilen gefunden.', 'warn', { presentation: 'toast' }); return; }

    const headers = rows[firstNonEmptyIdx] || [];
    const dataStartIdx = firstNonEmptyIdx + 1;
    const dataRows = rows.slice(dataStartIdx);
    const students = readStudents(dataRows, headers);
    classroomState.updateState({
      headers,
      performanceFlairCount: 4,
      students,
    });
    workPhaseController?.reset();
    groupsController?.handleRosterReplacement({ rebuildCapacity: true });

    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    renderRandomPicker();
    classroomState.sync();
    const importedCount = students.length;
    const importedLabel = importedCount === 1 ? 'Name' : 'Namen';
    showMessage(`${importedCount} ${importedLabel} importiert.`, 'success', { presentation: 'toast' });
  }

  async function handlePlanImportAction() {
    if (classroomState.isDemoActive()) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    const picked = await pickPlanFile({ directoryHandle: state.lastDirectoryHandle });
    if (picked && picked.file) {
      try {
        await importPlanFromFile(picked.file, picked.handle);
        return;
      } catch (err) {
        reportAppError(err, err?.message || 'Gruppen konnten nicht geladen werden.', {
          scope: 'plan-import',
          source: 'file-picker',
        });
        return;
      }
    }
    if (picked?.aborted) {
      return;
    }
    if (!picked || picked.supported === false) {
      els.importPlanFile?.click();
    }
  }

  bindRuntime(els.templateLink, 'click', (e) => {
    e.preventDefault();
    downloadCsvTemplate();
  });

  bindRuntime(els.file, 'change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      classroomState.updateState({ csvName: '' });
      updateCsvStatusDisplay();
      return;
    }
    try {
      await importCsvFromFile(f);
    } catch (err) {
      reportAppError(err, err?.message || 'Namensliste konnte nicht geladen werden.', {
        scope: 'csv-import',
        source: 'file-input',
      });
    }
  });

  const isEventInsideCsvDropZone = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('#csv-drop-zone'));
  };
  const isEventInsideMergerDropZone = (event) => {
    const target = event?.target;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('#merger-host'));
  };

  if (els.csvDropZone) {
    let csvDragDepth = 0;
    const clearCsvDragState = () => {
      csvDragDepth = 0;
      els.csvDropZone.classList.remove('drag-over-file');
    };
    bindRuntime(els.csvDropZone, 'dragenter', (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      csvDragDepth += 1;
      els.csvDropZone.classList.add('drag-over-file');
    });
    bindRuntime(els.csvDropZone, 'dragover', (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      els.csvDropZone.classList.add('drag-over-file');
    });
    bindRuntime(els.csvDropZone, 'dragleave', (e) => {
      e.preventDefault();
      csvDragDepth = Math.max(0, csvDragDepth - 1);
      if (csvDragDepth === 0) {
        els.csvDropZone.classList.remove('drag-over-file');
      }
    });
    bindRuntime(els.csvDropZone, 'drop', async (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      clearCsvDragState();
      const droppedFiles = Array.from(e.dataTransfer?.files || []);
      const csvFile = droppedFiles.find(isCsvFile);
      if (!csvFile) {
        showMessage('Bitte hier eine CSV-Datei ablegen.', 'warn', { presentation: 'toast' });
        return;
      }
      try {
        await importCsvFromFile(csvFile);
      } catch (err) {
        reportAppError(err, err?.message || 'Namensliste konnte nicht geladen werden.', {
          scope: 'csv-import',
          source: 'drop-zone',
        });
      }
    });
    bindRuntime(document, 'drop', clearCsvDragState);
    bindRuntime(document, 'dragend', clearCsvDragState);
  }

  bindRuntime(document, 'dragover', (e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    if (isEventInsideCsvDropZone(e)) return;
    if (isEventInsideMergerDropZone(e)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  bindRuntime(document, 'drop', async (e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    if (isEventInsideCsvDropZone(e)) return;
    if (isEventInsideMergerDropZone(e)) return;
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    const jsonFile = droppedFiles.find(isJsonFile);
    if (!jsonFile) {
      const csvFile = droppedFiles.find(isCsvFile);
      if (csvFile) {
        showMessage('CSV bitte im Feld „Namensliste auswählen“ ablegen.', 'warn', { presentation: 'toast' });
      } else {
        showMessage('Hier können nur Gruppen als JSON geladen werden.', 'warn', { presentation: 'toast' });
      }
      return;
    }
    try {
      await importPlanFromFile(jsonFile);
    } catch (err) {
      reportAppError(err, err?.message || 'Gruppen konnten nicht geladen werden.', {
        scope: 'plan-import',
        source: 'document-drop',
      });
    }
  });

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
    getSuggestedPlanFileName,
    onPlanImportRequest: () => {
      void handlePlanImportAction();
    },
    onPlanFileSelected: (file) => importPlanFromFile(file),
    onPlanExportRequest: () => {
      void downloadSeatPlan();
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
    setAutoDisableSelected: (value, { deferSave = false } = {}) => {
      if (!gradeRosterCoordinator.setPickerAutoDisableSelected(value, { deferSave })) {
        state.randomPickerAutoDisableSelected = value;
      }
    },
    setStudentWeight: (student, weight, { deferSave = false } = {}) => {
      student.randomWeight = weight;
      gradeRosterCoordinator.savePickerConfig({ deferSave });
    },
    onConditionsSaved: () => gradeRosterCoordinator.savePickerConfig(),
    sanitizeStudent: sanitizeRandomPickerStudent,
    showMessage,
    onImport: () => {
      void handlePlanImportAction();
    },
    onExport: () => {
      void downloadSeatPlan();
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
    bridgeController?.refreshModuleLayouts({
      activeTab: getActiveTab(),
      isIOSDevice,
    });
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
    getContextualSteps: getCurrentModuleTutorialSteps,
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
  if (helpPreviewRequest) startHelpPreview();
  else firstRunTutorial.showContextHelp({ prompt: true });
  const serviceWorkerUpdates = helpPreviewRequest ? null : registerServiceWorkerUpdates({
    updateDialog: els.updateDialog,
    updateDialogLater: els.updateDialogLater,
    updateDialogReload: els.updateDialogReload,
    updateDialogForce: els.updateDialogForce,
    updateDialogStatus: els.updateDialogStatus,
    beforeReloadForUpdate,
    describeBackupStatus,
    onUpdateAvailabilityChange: setVersionUpdateAvailability,
    serviceWorkerUrl: './sw.js',
  });
  if (els.headerVersion && serviceWorkerUpdates?.checkForUpdates) {
    const runManualUpdateCheck = async () => {
      if (els.headerVersion.dataset.updateCheckPending === '1') {
        return;
      }
      els.headerVersion.dataset.updateCheckPending = '1';
      els.headerVersion.classList.add('is-checking-update');
      try {
        const result = await serviceWorkerUpdates.checkForUpdates({ force: true });
        switch (result?.status) {
          case 'update-available':
            break;
          case 'update-installing':
            showMessage('Update wird geladen. Der Neu-laden-Hinweis erscheint automatisch.', 'info', { presentation: 'toast' });
            break;
          case 'up-to-date':
            showMessage('TeachHelper ist aktuell.', 'info', { presentation: 'toast' });
            break;
          case 'disabled':
            showMessage('Update-Check ist auf localhost deaktiviert.', 'warn', { presentation: 'toast' });
            break;
          case 'unsupported':
            showMessage('Update-Check wird von diesem Browser nicht unterstützt.', 'warn', { presentation: 'toast' });
            break;
          default:
            showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn', { presentation: 'toast' });
            break;
        }
      } catch {
        showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn', { presentation: 'toast' });
      } finally {
        delete els.headerVersion.dataset.updateCheckPending;
        els.headerVersion.classList.remove('is-checking-update');
      }
    };
    bindRuntime(els.headerVersion, 'click', () => {
      void runManualUpdateCheck();
    });
    bindRuntime(els.headerVersion, 'keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
        return;
      }
      event.preventDefault();
      void runManualUpdateCheck();
    });
  }
  bindRuntime(window, 'pagehide', (event) => {
    if (event.persisted !== true) disposeRuntime();
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
