import { createAppDom } from './app/dom.js';
import { createShellActionDialog } from './app/shell-action-dialog.js';
import { createFirstRunTutorial } from './app/first-run-tutorial.js';
import { createHelpCenter } from './app/help-center.js';
import {
  HELP_PREVIEW_COMMAND_EVENT,
  HELP_PREVIEW_STATE_EVENT,
  getHelpPreviewFrameNonce,
  readHelpPreviewRequest,
} from './app/help-preview.js';
import { createPlanningSeatplanBridge } from './app/planning-seatplan-bridge.js';
import { registerServiceWorkerUpdates } from './app/pwa-updates.js';
import { createPwaInstallPrompt } from './app/pwa-install-prompt.js';
import {
  isTearOffTab,
  openModuleWindow,
  readModuleWindowRequest,
} from './app/module-window.js';
import { createTabTearOff } from './app/tab-tear-off.js';
import { createShellController } from './app/shell.js';
import { reportError } from './shared/error-reporting.js';
import { createMessageApi } from './shared/messages.js';
import { WORKSPACE_STATE_EVENT } from './shared/school-data/messages.js';
import { installAppTooltips } from './shared/app-tooltips.js';
import {
  createThemeController,
  THEME_APPLY_EVENT,
  THEME_PREFERENCE_CHANGE_EVENT,
} from './shared/theme.js';
import {
  createModuleFrame,
  isTrustedModuleMessage,
  postToModule,
} from './shared/module-frame-bridge.js';
import {
  hasTutorialEntryHintBeenSeen,
  markTutorialEntryHintSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from './shared/tutorial-entry-state.js';
import {
  assertFileSizeAtMost,
  assertJsonNestingAtMost,
  FILE_LIMITS,
  formatFileSize,
} from './shared/file-guards.js';
import { createSharedRosterStore } from './shared/roster-store.js';
import {
  STUDENTS_SYNC_SOURCE_GRADES,
  STUDENTS_SYNC_SOURCE_GROUPS,
} from './shared/student-sync-bus.js';
import { createSharedTimerStore } from './shared/timer-store.js';
import {
  RANDOM_PICKER_DEFAULT_WEIGHT,
  mountRandomPicker,
  normalizeRandomPickerAutoDisableSelected,
  normalizeRandomPickerWeight,
} from './modules/random-picker/index.js';
import {
  clampPerformanceFlairCount,
  mountGroups,
  normalizePerformanceFlair,
  sanitizeSharedPerformanceFlair,
} from './modules/groups/index.js';
import { mountWorkPhase } from './modules/work-phase/index.js';
import {
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_GRADE_VAULT_ACTIVITY_EVENT,
  GRADES_GRADE_VAULT_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT,
  NAME_LEARNING_DATA_REQUEST_EVENT,
  NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT,
  NAME_LEARNING_MANAGE_STUDENTS_REQUEST_EVENT,
  NAME_LEARNING_REVIEW_REQUEST_EVENT,
  NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT,
  GRADES_COURSE_CONTEXT_EVENT,
  GRADES_COURSE_SEATPLAN_OPEN_EVENT,
  GRADES_NAVIGATE_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  MERGER_OPEN_RESULT_REQUEST_EVENT,
  MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
  MODULE_CONTEXT_MENU_DISMISS_EVENT,
  PLANNING_COURSE_CONTEXT_EVENT,
  PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
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
} from './shell/tabs.js';

(function () {
  const { appEl, els } = createAppDom(document);
  if (!appEl) {
    return;
  }
  const helpPreviewRequest = readHelpPreviewRequest(window.location);
  if (helpPreviewRequest) appEl.dataset.helpPreview = 'true';
  const shellActionDialog = createShellActionDialog(document);
  const themeController = createThemeController();
  const applyThemeToFrame = (frame, detail) => {
    if (!frame?.isConnected) return false;
    return postToModule(frame, { type: THEME_APPLY_EVENT, detail });
  };
  themeController.subscribe((detail) => {
    document.querySelectorAll('iframe').forEach((frame) => applyThemeToFrame(frame, detail));
  });
  document.addEventListener('load', (event) => {
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
  appEl.addEventListener('contextmenu', (event) => {
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
      window.clearTimeout(versionUpdateHintTimer);
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
    versionUpdateHintTimer = window.setTimeout(() => {
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
  setDisplayedAppVersion(String(globalThis.TEACHHELPER_APP_VERSION || 'dev'));
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
  window.addEventListener(WORKSPACE_STATE_EVENT, (event) => {
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
  const SIDEBAR_WIDTH_SCOPE_PLANNING = 'planning';
  const SIDEBAR_WIDTH_SCOPE_OTHER = 'other';
  const SIDEBAR_WIDTH_REQUEST_EVENT = 'classroom:sidebar-width-request';
  const SIDEBAR_WIDTH_SYNC_EVENT = 'classroom:sidebar-width-sync';
  const SIDEBAR_WIDTH_COMMIT_EVENT = 'classroom:sidebar-width-commit';
  const SIDEBAR_COLLAPSE_REQUEST_EVENT = 'classroom:sidebar-collapse-request';
  const SEATPLAN_CHROME_REQUEST_EVENT = 'classroom:seatplan-chrome-request';
  const MORE_TOOLS_DISMISS_EVENT = 'classroom:more-tools-dismiss';
  const TOAST_REQUEST_EVENT = 'classroom:toast-request';
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
  document.addEventListener('pointerdown', dismissModuleContextMenus, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissModuleContextMenus();
  }, true);
  const getDuplicateCheckController = () => els.duplicateCheckHost?._duplicateCheckController || null;
  const getQrController = () => els.qrHost?._qrController || null;
  const getModuleFrameForMessage = (event) => (
    getModuleFrames().find((frame) => isTrustedModuleMessage(event, frame)) || null
  );
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
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
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
      frame.addEventListener('load', () => {
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
      frame.addEventListener('load', () => {
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
  const planningFrameTarget = (selector, resolveFallback = () => null) => (
    (nodes) => ({
      frame: getPlanningFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const gradesFrameTarget = (selector, resolveFallback = () => null) => (
    (nodes) => ({
      frame: getGradesFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const mergerFrameTarget = (selector, resolveFallback = () => null) => (
    (nodes) => ({
      frame: getMergerFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const duplicateCheckFrameTarget = (
    selector,
    resolveFallback = () => null
  ) => (
    (nodes) => ({
      frame: getDuplicateCheckFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const qrFrameTarget = (selector, resolveFallback = () => null) => (
    (nodes) => ({
      frame: getQrFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const seatplanFrameTarget = (
    selector,
    resolveFallback = () => null
  ) => (
    (nodes) => ({
      frame: getSeatplanFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const nameLearningFrameTarget = (
    selector,
    resolveFallback = () => null
  ) => (
    (nodes) => ({
      frame: getNameLearningFrame,
      selector,
      fallback: resolveFallback(nodes),
    })
  );
  const createModuleTutorialStep = ({
    tab,
    title,
    copy,
    target,
    section = '',
    placement = 'bottom',
    anchor = 'center',
    offsetX = 0,
    offsetY = 0,
    highlightPadding = 7,
    beforeRender = null,
    skipIfMissing = true,
  }) => {
    const step = {
      title,
      copy,
      target,
      tab,
      section,
      placement,
      anchor,
      offsetX,
      offsetY,
      highlightPadding,
      expandChrome: true,
      skipIfMissing,
    };
    if (typeof beforeRender === 'function') {
      step.beforeRender = beforeRender;
    }
    return step;
  };
  const visibleTutorialNode = (node) => {
    if (!node || node.hidden || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const style = (node.ownerDocument?.defaultView || window).getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' ? node : null;
  };
  const withSection = (section, steps) => {
    steps.forEach((step) => {
      if (step && typeof step === 'object') step.section = section;
    });
    return steps;
  };
  const TUTORIAL_OPAQUE_FRAME_TABS = new Set([
    TAB_MERGER,
    TAB_DUPLICATE_CHECK,
    TAB_QR,
    TAB_NAME_LEARNING,
  ]);
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
      frame.addEventListener('load', activate, { once: true });
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
    frame.addEventListener('load', () => {
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
    frame.addEventListener('load', () => {
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
    frame.addEventListener('load', () => {
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
  const getModuleTutorialDefinition = ({ activeTab } = {}) => {
    switch (activeTab) {
      case TAB_GRADES:
        {
          const gradesTarget = (selector) => gradesFrameTarget(selector, () => null);
          const gradesStep = (title, copy, selector, surface, placement = 'bottom', options = {}) => (
            createModuleTutorialStep({
              tab: TAB_GRADES,
              title,
              copy,
              target: gradesTarget(selector),
              placement,
              skipIfMissing: false,
              ...options,
              beforeRender: () => prepareGradesTutorialSurface(surface),
            })
          );
          const withGradesLifecycle = (steps) => ({
            steps,
            demo: {
              activate: activateGradesTutorialDemo,
              auto: true,
            },
          });
          const steps = [
            ...withSection('Einrichten', [
              gradesStep(
                'Datenbank verbinden',
                'Wähle eine vorhandene Datenbank aus oder lege eine neue an. Planung und Noten schreiben in dieselbe Datei – ohne Verbindung wird nichts gespeichert.',
                [
                  '[data-tutorial-anchor="database-actions"]:not([hidden])',
                  '#db-auto-actions:not([hidden])',
                  '#db-manual-actions:not([hidden])',
                ],
                'gradesDatabase',
                'right'
              ),
              gradesStep(
                'Noten verschlüsseln',
                'Schütze Notendaten und zugehörige Daten im Notenmodul mit einem Passwort. Andere Inhalte der Datenbank werden nicht verschlüsselt. Ohne Passwort lassen sich die geschützten Daten nicht wiederherstellen.',
                '[data-tutorial-anchor="grades-encryption"]',
                'gradesEncryption',
                'right'
              ),
              gradesStep(
                'Automatisch sperren',
                'Bei aktiver Verschlüsselung sperrt sich der Notenbereich nach dieser Zeit von selbst. Das schützt die Anzeige, wenn das Gerät im Unterricht offen liegen bleibt.',
                [
                  '#grade-vault-auto-lock-settings:not([hidden])',
                  '#grade-vault-settings-action-btn:not([hidden])',
                  '#grade-vault-encryption-enabled',
                ],
                'gradesEncryption',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Daten sichern',
                shellSupportsExternalFileSync
                  ? 'Lege Backup-Ordner und Intervall fest. Manuelle Sicherungen bleiben jederzeit möglich.'
                  : 'Speichere die Datenbank regelmäßig als Datei und lade sie nach einem Neustart wieder ein.',
                shellSupportsExternalFileSync
                  ? ['[data-tutorial-anchor="workspace-backup"]', '#backup-dir-change-btn', '#db-auto-actions:not([hidden])']
                  : '#db-manual-actions:not([hidden])',
                'gradesDatabase',
                'right'
              ),
              ...(shellSupportsExternalFileSync ? [] : [createModuleTutorialStep({
                tab: TAB_GRADES,
                title: 'Manuell speichern',
                copy: 'Ohne dauerhaften Dateizugriff sicherst du über dieses Symbol in der Kopfzeile. Es hebt sich hervor, sobald ungesicherte Änderungen vorliegen.',
                target: (nodes) => visibleTutorialNode(nodes.sidebarManualSaveBtn),
                placement: 'bottom',
              })]),
            ]),
            ...withSection('Kurs aufbauen', [
              gradesStep(
                'Kurs anlegen',
                'Mit dem Plus erstellst du einen Notenkurs. Danach erscheint er in der Kursliste darüber und lässt sich per Klick öffnen.',
                '[data-tutorial-anchor="grades-course-add"]',
                'gradesOverview',
                'bottom',
                { highlightPadding: 4 }
              ),
              gradesStep(
                'Kurs per Rechtsklick verwalten',
                'Ein Rechtsklick auf einen Kurs öffnet sein Menü. Von hier erreichst du Kursdaten, Notenstruktur und Teilnehmende – ohne das Menü sind sie nicht zugänglich.',
                '[data-tutorial-anchor="grades-course-menu"]',
                'gradesCourseMenu',
                'right',
                { highlightPadding: 4 }
              ),
              gradesStep(
                'Notenstruktur festlegen',
                'Kategorien, Unterkategorien und Gewichtungen bestimmen, wie aus einzelnen Leistungen die Gesamtnote entsteht. Diese Struktur gilt nur für diesen Kurs.',
                '[data-tutorial-anchor="grades-structure-dialog"]',
                'gradesStructure',
                'right'
              ),
              gradesStep(
                'Struktur für neue Kurse',
                'In den Einstellungen legst du die Voreinstellung fest, die jeder neu angelegte Kurs übernimmt. Bestehende Kurse bleiben unverändert.',
                ['#settings-grade-structure-periods', '#settings-tab-grade-structure'],
                'gradesDefaultStructure',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Prozentgrenzen festlegen',
                'Hier bestimmst du, ab wie viel Prozent welche Note gilt. Diese Skala wandelt später erreichte Punkte automatisch in Noten um.',
                '#grade-test-scale-settings-content',
                'gradesTestScales',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Teilnehmende verwalten',
                'Importiere eine CSV-Liste oder füge Personen einzeln hinzu. Hier hinterlegst du auch Fotos, aus denen später das Modul „Namen lernen“ seine Karten bildet.',
                '[data-tutorial-anchor="grades-students-dialog"]',
                'gradesStudents',
                'right'
              ),
            ]),
            ...withSection('Leistungen eingeben', [
              gradesStep(
                'Eingabe öffnen',
                'Der Stift wechselt zwischen Notenübersicht und Eingabe. In der Eingabe legst du neue Leistungen an und bearbeitest vorhandene.',
                '[data-tutorial-anchor="grades-entry-nav"]',
                'gradesOverview',
                'bottom',
                { highlightPadding: 4 }
              ),
              gradesStep(
                'Angaben zur Leistung',
                'In dieser Spalte stehen alle Angaben zur Leistung. Über das Kursfeld ganz oben ordnest du sie bei Bedarf einem anderen Kurs zu.',
                '[data-tutorial-anchor="grades-entry-config"]',
                'gradesEntry',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Leistung benennen',
                'Vergib einen eindeutigen Titel. Er erscheint später als Spaltenkopf in der Übersicht und im Ausdruck.',
                '[data-tutorial-anchor="grades-entry-title"]',
                'gradesEntry'
              ),
              gradesStep(
                'Modus wählen',
                'Note, BE und HA passen die Eingabefelder an den Leistungs-Typ an: eine fertige Note, erreichte Bewertungseinheiten oder eine Hausaufgabenkontrolle.',
                '[data-tutorial-anchor="grades-entry-mode"]',
                'gradesEntry'
              ),
              gradesStep(
                'Leistung einordnen',
                'Halbjahr, Kategorie und Gewichtung entscheiden, wo die Leistung in der Struktur landet und wie stark sie zählt.',
                '[data-tutorial-anchor="grades-entry-assignment"]',
                'gradesEntry'
              ),
              gradesStep(
                'Vorkommnisse vorbereiten',
                'Vorkommnisse sind kurze Notizen wie fehlende Hausaufgaben. Ihre Kategorien pflegst du zentral in den Einstellungen; sie gelten für alle Kurse.',
                ['#settings-grade-occurrences-list', '#settings-tab-occurrences'],
                'gradesOccurrences',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Ergebnisse erfassen',
                'Trage die Werte direkt bei den Teilnehmenden ein. Mit Tab springst du zur nächsten Person, ohne die Maus zu benutzen.',
                '[data-tutorial-anchor="grades-entry-results"]',
                'gradesEntry',
                'top'
              ),
              gradesStep(
                'Verteilung prüfen',
                'Häufigkeiten, Durchschnitt und Defizitanteil zeigen dir noch vor dem Speichern, ob die Bewertung insgesamt plausibel ist.',
                '[data-tutorial-anchor="grades-entry-distribution"]',
                'gradesEntry',
                'left'
              ),
              gradesStep(
                'Erwartungshorizont erstellen',
                'Bei BE-Leistungen erzeugt dieser Knopf aus Aufgaben und Punkten ein fertiges Dokument – wahlweise für einzelne Personen.',
                '[data-tutorial-anchor="grades-expectation"]',
                'gradesEntryBe',
                'right'
              ),
              gradesStep(
                'Kompetenzerwartung erzeugen',
                'Dieser Knopf erstellt das Gegenstück zum Erwartungshorizont mit den erreichten Kompetenzen. Wie dieser steht er nur im BE-Modus zur Verfügung.',
                '[data-tutorial-anchor="grades-competence-expectations"]',
                'gradesEntryBe',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Vorlagen hinterlegen',
                'Ort, Kommentartext und eigene Word-Vorlagen für beide Dokumente hinterlegst du einmalig in den Einstellungen unter „Vorlagen“.',
                ['#expectation-horizon-location', '#settings-tab-expectation-horizon'],
                'gradesTemplates',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Leistung speichern',
                'Die Diskette übernimmt die Leistung in die Übersicht. Ohne Speichern geht der Entwurf beim Kurswechsel verloren.',
                '[data-tutorial-anchor="grades-entry-save"]',
                'gradesEntry',
                'top'
              ),
            ]),
            ...withSection('Auswerten', [
              gradesStep(
                'Notenübersicht lesen',
                'Jede Zeile ist eine Person, jede Spalte eine Leistung. Ganz rechts stehen die berechneten Zwischen- und Gesamtergebnisse.',
                '[data-tutorial-anchor="grades-overview-table"]',
                'gradesOverviewTable',
                'top'
              ),
              gradesStep(
                'Gruppen ein- und ausklappen',
                'Halbjahre und Kategorien lassen sich zusammenklappen. Eingeklappte Spalten werden auch nicht mitgedruckt – so steuerst du den Ausdruck.',
                '[data-tutorial-anchor="grades-group-toggle"]',
                'gradesOverviewTable',
                'top'
              ),
              gradesStep(
                'Spalten per Rechtsklick verwalten',
                'Ein Rechtsklick auf eine Leistungsspalte öffnet Aktionen zum Bearbeiten und Übertragen. Diese Aktionen gibt es nur über das Kontextmenü.',
                'th[data-grade-transfer-column-key]',
                'gradesOverviewTable',
                'top'
              ),
              gradesStep(
                'Gesamtnote festsetzen',
                'Klicke einen berechneten Gesamtwert an, um ihn pädagogisch festzusetzen. Der ursprüngliche Rechenwert bleibt erhalten und sichtbar.',
                '[data-tutorial-anchor="grades-total-override"]',
                'gradesOverviewTable',
                'top'
              ),
              gradesStep(
                'Nachteilsausgleich hinterlegen',
                'Hier vermerkst du gewährte Nachteilsausgleiche pro Person. Der Vermerk erscheint bei der Person und im Ausdruck.',
                '#sidebar-grade-accommodation-section',
                'gradesOverviewActions',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Warnungen simulieren',
                'Teste, welche Gesamtnote sich bei einer angenommenen weiteren Leistung ergäbe. Gespeicherte Daten verändert die Simulation nicht.',
                '[data-tutorial-anchor="grades-simulation"]',
                'gradesOverviewActions',
                'right'
              ),
              gradesStep(
                'Datenschutzmodus',
                'Für Elterngespräche bleibt genau eine Person sichtbar, alle anderen Zeilen werden verdeckt. Die verdeckte Fläche lässt sich verschieben.',
                '[data-tutorial-anchor="grades-privacy"]',
                'gradesOverviewActions',
                'right'
              ),
            ]),
            ...withSection('Anzeige und Abschluss', [
              gradesStep(
                'Namen sortieren',
                'Wechsle zwischen Sortierung nach Vorname und nach Nachname. Die Reihenfolge gilt auch für Ausdruck und Sitzplan.',
                '[data-tutorial-anchor="grades-sort"]',
                'gradesOverviewActions',
                'right'
              ),
              gradesStep(
                'Notensystem wählen',
                'Schalte die Anzeige zwischen Punkten (15–0) und Schulnoten (1–6) um. Die gespeicherten Werte bleiben dabei unverändert.',
                '[data-tutorial-anchor="grades-display-system"]',
                'gradesOverviewActions',
                'right'
              ),
              gradesStep(
                'Plus und Minus',
                'Bei Schulnoten blendest du hier die Prädikatsanhängsel wie 2+ oder 3− ein und aus.',
                '[data-tutorial-anchor="grades-predicate"]',
                'gradesOverviewActions',
                'right'
              ),
              gradesStep(
                'Fotos und Namen lernen',
                'Diese beiden Schalter zeigen Fotos in den Listen und schalten das Modul „Namen lernen“ frei. Ohne sie bleibt der Reiter „Namen lernen“ ausgeblendet.',
                ['#show-grade-student-portraits', '#settings-tab-display'],
                'gradesPortraits',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Ausgeblendete Kurse zeigen',
                'Kurse, die du über das Kursmenü ausgeblendet hast, holst du mit diesem Schalter wieder in die Randleiste zurück.',
                '[data-tutorial-anchor="grades-sidebar-visibility"]',
                'gradesDisplay',
                'right',
                { skipIfMissing: true }
              ),
              gradesStep(
                'Übersicht drucken',
                'Der Ausdruck übernimmt genau die Spalten, die gerade sichtbar sind. Klappe vorher alles ein, was nicht aufs Blatt soll.',
                '[data-tutorial-anchor="grades-print"]',
                'gradesOverviewActions',
                'right'
              ),
              gradesStep(
                'Schuljahr archivieren',
                'Erstelle zum Abschluss ein PDF-Archiv mit Noten- und Planungsdaten. Danach kannst du das Schuljahr abschließen, ohne Daten zu verlieren.',
                '[data-tutorial-anchor="grades-archive"]',
                'gradesOverviewActions',
                'right'
              ),
            ]),
          ];
          return withGradesLifecycle(steps);
        }
      case TAB_PLANNING:
        {
          const planningFallback = () => null;
          const planningStep = (title, copy, selector, surface, fallback = planningFallback, options = {}) => (
            createModuleTutorialStep({
              tab: TAB_PLANNING,
              title,
              copy,
              target: planningFrameTarget(selector, fallback),
              skipIfMissing: false,
              ...options,
              beforeRender: () => preparePlanningTutorialSurface(surface),
            })
          );
          const withPlanningLifecycle = (steps) => ({
            steps,
            demo: {
              activate: activatePlanningTutorialDemo,
              auto: true,
            },
          });
          const steps = [
            ...withSection('Einrichten', [
              planningStep(
                'Einstellungen öffnen',
                'Das Zahnrad führt zu Ferien, Uhrzeiten, Anzeige und Datenbank. Alles, was du hier einstellst, gilt für die gesamte Planung.',
                '#view-settings-btn',
                'week',
                planningFallback,
                { placement: 'right', highlightPadding: 4 }
              ),
              planningStep(
                'Datenbank',
                'Wähle eine Datenbank aus oder lege eine neue an. Planung und Noten teilen sich diese Datei – ohne Verbindung wird nichts gespeichert.',
                ['[data-tutorial-anchor="database-actions"]:not([hidden])', '#db-auto-actions:not([hidden])', '#db-manual-actions:not([hidden])'],
                'database',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Backup',
                shellSupportsExternalFileSync
                  ? 'Lege Backup-Ordner und Intervall fest; manuelle Sicherungen bleiben möglich.'
                  : 'Speichere die Datenbank als Datei und lade sie nach einem Neustart wieder ein.',
                shellSupportsExternalFileSync ? '#backup-dir-change-btn' : '#db-manual-actions',
                'database',
                planningFallback,
                { placement: 'right' }
              ),
              ...(shellSupportsExternalFileSync ? [] : [createModuleTutorialStep({
                tab: TAB_PLANNING,
                title: 'Manuell speichern',
                copy: 'Ohne dauerhaften Dateizugriff sicherst du über dieses Symbol in der Kopfzeile. Es hebt sich hervor, sobald ungesicherte Änderungen vorliegen.',
                target: (nodes) => visibleTutorialNode(nodes.sidebarManualSaveBtn),
                placement: 'bottom',
              })]),
              planningStep(
                'Ferien eintragen',
                'Ferien begrenzen den Planungszeitraum und verhindern Unterricht an diesen Tagen. Serien überspringen diese Zeiträume automatisch.',
                '[data-tutorial-anchor="planning-holidays"]',
                'dayoff',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Unterrichtsfreie Tage',
                'Einzelne freie Tage wie bewegliche Ferientage trägst du getrennt von den längeren Ferienzeiträumen ein.',
                '[data-tutorial-anchor="planning-special-days"]',
                'dayoff',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Stunden pro Tag anzeigen',
                'Lege fest, wie viele Unterrichtsstunden die Wochenansicht untereinander zeigt. Ein zu kleiner Wert blendet späte Stunden aus.',
                '[data-tutorial-anchor="planning-display-hours"]',
                'display',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Erscheinungsbild wählen',
                'Hell, dunkel oder nach Systemeinstellung – die Wahl gilt für ganz TeachHelper, nicht nur für die Planung.',
                ['.settings-theme-row', '#theme-preference-label'],
                'display',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
              planningStep(
                'Ausgeblendete Kurse zeigen',
                'Kurse, die du über das Kursmenü ausgeblendet hast, holst du mit diesem Schalter wieder in die Randleiste zurück.',
                '[data-tutorial-anchor="planning-sidebar-visibility"]',
                'display',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Unterrichtszeiten pflegen',
                'Die Uhrzeiten der Stunden helfen TeachHelper, dir beim Start den gerade laufenden Kurs anzuzeigen.',
                ['#lesson-times-list', '#settings-tab-lesson-times'],
                'lessonTimes',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Einstellungen übernehmen',
                'Änderungen in den Einstellungen sind zunächst nur ein Entwurf. Erst „Speichern“ übernimmt sie, „Abbrechen“ verwirft sie.',
                '#settings-save-all',
                'dayoff',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Standardwerte herstellen',
                'Der Pfeil setzt den aktuellen Einstellungsbereich auf die Voreinstellung zurück. Deine Kurse und Stunden bleiben davon unberührt.',
                '#settings-reset-all',
                'dayoff',
                planningFallback,
                { placement: 'bottom', skipIfMissing: true }
              ),
            ]),
            ...withSection('Kurse anlegen', [
              planningStep(
                'Kurs hinzufügen',
                'Mit dem Plus legst du einen neuen Planungskurs an. Er erscheint danach in der Kursliste darüber.',
                "#sidebar-course-list button[data-add-course='1']",
                'week',
                planningFallback,
                { placement: 'right', highlightPadding: 4 }
              ),
              planningStep(
                'Kursdaten',
                'Fach und Kursname erscheinen später in jeder Stunde des Wochenrasters. Der Kursname muss ausgefüllt sein.',
                ["#course-dialog [data-panel='general']", '#course-dialog-form'],
                'courseCreate',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Farbe wählen',
                'Die Farbe macht den Kurs im Wochenraster auf einen Blick erkennbar und wird auch im Notenmodul und im Sitzplan verwendet.',
                ['#course-dialog-color-palette', '#course-dialog-color-panel'],
                'courseCreate',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
              planningStep(
                'Termin ohne Unterricht',
                'Dieses Häkchen macht aus dem Kurs einen reinen Termin, etwa eine Konferenz oder Aufsicht. Solche Einträge tauchen im Notenmodul nicht auf.',
                '#course-dialog-no-lesson',
                'courseCreate',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
              planningStep(
                'Kurse bedienen',
                'Linksklick öffnet den Kursverlauf, Ziehen sortiert die Liste, Rechtsklick öffnet die Aktionen.',
                '#sidebar-course-list li[data-course-id] button[data-course-id]',
                'week',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Kurs per Rechtsklick ändern',
                'Im Kontextmenü bearbeitest du Kursdaten, blendest den Kurs aus oder löschst ihn. Ohne das Menü sind diese Aktionen nicht erreichbar.',
                ['#app-context-menu:not([hidden])', '#sidebar-course-list li[data-course-id]'],
                'courseMenu',
                planningFallback,
                { placement: 'right', highlightPadding: 4 }
              ),
            ]),
            ...withSection('Woche planen', [
              planningStep(
                'Wochenraster',
                'Unterricht, Ferien, Entfall, Arbeiten und Themen liegen gemeinsam in dieser Wochenansicht.',
                '#week-table',
                'lesson',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Woche wechseln',
                'Die Pfeile links und rechts blättern eine Woche vor oder zurück.',
                ['#week-prev', '#week-next'],
                'lesson',
                planningFallback,
                { placement: 'bottom' }
              ),
              planningStep(
                'Gezielt zu einer Woche springen',
                'Ein Klick auf die Kalenderwoche öffnet einen Minikalender, über den du direkt zu einem beliebigen Datum springst.',
                '#kw-label',
                'lesson',
                planningFallback,
                { placement: 'bottom' }
              ),
              planningStep(
                'Zurück zur aktuellen Woche',
                'Das Kalendersymbol bringt dich aus jeder Woche sofort zurück zur laufenden Woche.',
                '#week-picker-btn',
                'lesson',
                planningFallback,
                { placement: 'bottom', skipIfMissing: true }
              ),
              planningStep(
                'Serie per Doppelklick anlegen',
                'Doppelklicke eine freie Zelle im Raster. Daraus entsteht keine einzelne Stunde, sondern eine wiederkehrende Unterrichtsserie.',
                ['#week-table td.day-cell.empty[data-day][data-hour]', '#week-table'],
                'week',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Serie konfigurieren',
                'Kurs, Wochentag und Stunde bestimmen, wo die Serie liegt. Aus diesen Angaben erzeugt TeachHelper alle einzelnen Unterrichtsstunden.',
                ['#slot-dialog-form', '#slot-dialog'],
                'slotCreate',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Doppelstunden festlegen',
                'Über die Endstunde ziehst du eine Serie über mehrere Stunden. Liegt eine Pause dazwischen, wählst du sie darunter aus.',
                ['#slot-dialog-end-hour-row', '#slot-dialog-end-hour'],
                'slotCreate',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
              planningStep(
                'Wochenrhythmus',
                'Für A- und B-Wochen stellst du hier ein, dass die Serie nur in geraden oder nur in ungeraden Kalenderwochen stattfindet.',
                '#slot-dialog-parity',
                'slotCreate',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
              planningStep(
                'Gültigkeitszeitraum',
                'Start- und Enddatum begrenzen die Serie, etwa für ein Halbjahr. Ferien innerhalb des Zeitraums werden automatisch übersprungen.',
                ['#slot-dialog-start', '#slot-dialog-end'],
                'slotCreate',
                planningFallback,
                { placement: 'right', skipIfMissing: true }
              ),
            ]),
            ...withSection('Stunde ausarbeiten', [
              planningStep(
                'Thema direkt eintragen',
                'Klicke die Themenfläche in einer Stunde an und tippe los. Enter oder Tab speichert, Escape verwirft.',
                ['.lesson-block[data-lesson-id] .topic-zone', '.lesson-block[data-lesson-id]'],
                'lesson',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Detailplanung',
                'Im Stundendialog ergänzt du Ablauf, Material, Lernziele und Notizen zur Stunde.',
                ['#topic-dialog-notes', '#topic-dialog-form'],
                'topicDialog',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Notizen formatieren',
                'Die Leiste über dem Notizfeld bietet Fett, Listen, Farben und Links. Verlinkte Stunden lassen sich später direkt anspringen.',
                '#topic-dialog-rich-text-toolbar',
                'topicDialog',
                planningFallback,
                { placement: 'top', skipIfMissing: true }
              ),
              planningStep(
                'Sitzplan öffnen',
                'Das Stuhlsymbol öffnet den Sitzplan dieses Kurses. Änderungen dort gelten für den ganzen Kurs, nicht nur für diese Stunde.',
                ['.lesson-block-seatplan-trigger', '.lesson-block[data-lesson-id]'],
                'lesson',
                planningFallback,
                { placement: 'top', highlightPadding: 4 }
              ),
              planningStep(
                'Noteneingabe verknüpfen',
                'Fragezeichen oder Haken führen zur passenden Leistung im Notenmodul. So planst du eine Arbeit hier und trägst sie später dort ein.',
                ['.lesson-block-grade-entry', '.lesson-block[data-lesson-id]'],
                'lesson',
                planningFallback,
                { placement: 'top', highlightPadding: 4 }
              ),
              planningStep(
                'Stunde per Rechtsklick steuern',
                'Das Menü bietet Kopieren, Entfall, Schriftliche Arbeit und das Verschieben der weiteren Planung. Diese Aktionen gibt es nur hier.',
                ['#app-context-menu:not([hidden])', '.lesson-block[data-lesson-id]'],
                'lessonMenu',
                planningFallback,
                { placement: 'right', highlightPadding: 4 }
              ),
              planningStep(
                'Serie anpassen',
                'Beim Bearbeiten einer Serie entscheidest du, ob die Änderung für alle Termine gilt oder erst ab einem Datum. Löschen funktioniert genauso.',
                ['#slot-dialog-form', '#slot-dialog'],
                'slotEdit',
                planningFallback,
                { placement: 'right' }
              ),
            ]),
            ...withSection('Auswerten und Abschluss', [
              planningStep(
                'Kursverlauf öffnen',
                'Ein Klick auf den Kursnamen in einer Stunde zeigt den chronologischen Verlauf des ganzen Kurses.',
                ['.lesson-block .title.course-link[data-course-id]', '.lesson-block[data-lesson-id]'],
                'lesson',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Unterrichtsverlauf',
                'Jede Zeile bündelt Datum, Noteneingabe, Thema und Detailplanung einer Stunde. Hier planst du eine ganze Reihe am Stück.',
                ['#course-table tbody tr[data-lesson-id]', '#course-table'],
                'course',
                planningFallback,
                { placement: 'top' }
              ),
              planningStep(
                'Zurück zur Wochenansicht',
                'Dieser Knopf bringt dich aus dem Kursverlauf zurück in das Wochenraster.',
                '#view-week-btn',
                'course',
                planningFallback,
                { placement: 'right', highlightPadding: 4, skipIfMissing: true }
              ),
              planningStep(
                'Archiv vorbereiten',
                'Erstelle zum Schuljahresabschluss ein PDF-Archiv. Es hält Planung und Noten fest, auch wenn du danach ein neues Schuljahr beginnst.',
                ['[data-tutorial-anchor="planning-archive"]', '#sidebar-archive-btn'],
                'course',
                planningFallback,
                { placement: 'right', highlightPadding: 4 }
              ),
              planningStep(
                'Archivumfang wählen',
                'Wähle aus, ob Kursverläufe, Wochenansichten und die verfügbaren Noten in das PDF sollen.',
                [
                  '#archive-planning-options',
                  '#archive-dialog-form',
                  '[data-tutorial-anchor="planning-archive"]',
                  '#sidebar-archive-btn',
                ],
                'archive',
                planningFallback,
                { placement: 'right' }
              ),
              planningStep(
                'Speichern und weiterarbeiten',
                shellSupportsExternalFileSync
                  ? 'Änderungen landen in der Datenbank; Backups sichern zusätzlich.'
                  : 'Speichere regelmäßig über die Datenbank-Schaltfläche als Datei.',
                ['[data-tutorial-anchor="database-actions"]:not([hidden])', '#db-auto-actions:not([hidden])', '#db-manual-actions:not([hidden])'],
                'database',
                planningFallback,
                { placement: 'right' }
              ),
            ]),
          ];
          return withPlanningLifecycle(steps);
        }
      case TAB_MERGER:
        return [
          ...withSection('Werkzeuge', [
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Werkzeugauswahl',
              copy: 'Wechsle zwischen Layout, Zusammenführen, Drehen und Aufteilen. Jedes Werkzeug arbeitet für sich; deine Originaldateien bleiben unverändert.',
              target: mergerFrameTarget('.tool-tab-bar'),
              placement: 'bottom',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
          ]),
          ...withSection('Seiten aufs Blatt', [
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Seiten auf ein Blatt',
              copy: 'Dieses Werkzeug ordnet mehrere PDF-Seiten verkleinert auf einem gemeinsamen Blatt an – gut geeignet, um Kopierkosten zu sparen.',
              target: mergerFrameTarget(['#tool-panel-layout .panel-head', '#tool-panel-layout']),
              placement: 'bottom',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'PDF auswählen',
              copy: 'Ziehe eine PDF hierher oder klicke zur Dateiauswahl. Die Datei wird nur im Browser verarbeitet und nicht hochgeladen.',
              target: mergerFrameTarget('#layoutDropZone'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Seiten pro Blatt',
              copy: 'Lege fest, ob zwei, vier, sechs oder acht Ausgangsseiten auf einem Blatt landen. Je mehr Seiten, desto kleiner die Darstellung.',
              target: mergerFrameTarget('#pagesButtons'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Spezialmodus für drei Seiten',
              copy: 'Bei drei Seiten entsteht eine doppelte Startseite plus ein Blatt für Seite zwei und drei. So passt ein dreiseitiges Arbeitsblatt auf zwei beidseitig bedruckte Blätter.',
              target: mergerFrameTarget('#specialThreeModeButton'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Ausrichtung optimieren',
              copy: 'Diese Option wählt automatisch Hoch- oder Querformat, damit die Seiten möglichst groß auf das Blatt passen.',
              target: mergerFrameTarget('#autoOrientationToggle'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Kopien passend zur Lerngruppe',
              copy: 'Trage die Anzahl der Lernenden ein. Restseiten werden dann so gefüllt, dass genau genug Kopien für die Gruppe entstehen.',
              target: mergerFrameTarget('#studentCount'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Restseiten',
              copy: 'Entscheide, ob freie Plätze auf dem letzten Blatt leer bleiben oder mit vorhandenen Seiten aufgefüllt werden.',
              target: mergerFrameTarget('#layoutPaddingModeGroup'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Layout erstellen',
              copy: 'Dieser Button erzeugt die neue PDF. Sobald sie fertig ist, meldet sich ein Hinweisfenster, aus dem du sie öffnen kannst.',
              target: mergerFrameTarget('#layoutStartButton'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('layout'),
            }),
          ]),
          ...withSection('Zusammenführen', [
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Dateien verbinden',
              copy: 'Lade mehrere PDFs gleichzeitig oder nacheinander. Sie werden zu einer einzigen Datei verbunden.',
              target: mergerFrameTarget('#mergeDropZone'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('merge'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Dateireihenfolge',
              copy: 'Nach dem Laden erscheint hier die Dateiliste. Per Drag-and-drop legst du die Reihenfolge fest; weitere PDFs lassen sich ergänzen oder entfernen.',
              target: mergerFrameTarget(['#mergeFileListShell:not(.hidden)', '#mergeAppendFileList:not(:empty)', '#mergeDropZone']),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('merge'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Gesamtseitenanzahl prüfen',
              copy: 'Unter der Liste steht, wie viele Seiten das Ergebnis haben wird. Eine gerade Zahl ist praktisch für beidseitigen Druck.',
              target: mergerFrameTarget(['#mergeTotalPages', '#mergeDropZone']),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('merge'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Dateien zusammenführen',
              copy: 'Dieser Button verbindet alle geladenen PDFs in der angezeigten Reihenfolge zu einer neuen Datei.',
              target: mergerFrameTarget('#mergeStartButton'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('merge'),
            }),
          ]),
          ...withSection('Drehen', [
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'PDF drehen',
              copy: 'Wähle hier die PDF aus, deren Seiten falsch herum liegen – etwa nach einem Scan im Querformat.',
              target: mergerFrameTarget('#rotateDropZone'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('rotate'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Ganzes Dokument drehen',
              copy: 'Wende eine Drehung von 90, 180 oder 270 Grad einheitlich auf alle Seiten an.',
              target: mergerFrameTarget('#rotateDocumentDegreesGroup'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('rotate'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Einzelne Seiten drehen',
              copy: 'Nach dem Laden erscheinen hier die Seitenvorschauen. Die Drehschaltflächen gelten jeweils nur für die ausgewählte Seite.',
              target: mergerFrameTarget(['.rotate-page-card', '#rotatePagesList:not(:empty)', '#rotateDropZone']),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('rotate'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Gedrehte PDF erstellen',
              copy: 'Dieser Button erzeugt eine neue PDF mit den festgelegten Drehungen. Die Ausgangsdatei bleibt unverändert.',
              target: mergerFrameTarget('#rotateStartButton'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('rotate'),
            }),
          ]),
          ...withSection('Aufteilen', [
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'PDF aufteilen',
              copy: 'Lade die PDF, aus der du einzelne Seiten oder Seitengruppen herauslösen möchtest.',
              target: mergerFrameTarget('#splitDropZone'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Seitenauswahl',
              copy: 'Nach dem Laden erscheinen hier alle Seiten. Ein Klick auf eine Seite nimmt sie in die Ausgabe auf oder schließt sie aus.',
              target: mergerFrameTarget([
                '.split-page-card',
                '#splitPagesList:not(:empty)',
                '.split-toolbar-group-selection',
                '#splitDropZone',
              ]),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Alle Seiten auf einmal',
              copy: 'Mit diesen beiden Knöpfen wählst du alle Seiten gleichzeitig aus oder ab – praktisch, wenn du nur wenige Seiten brauchst.',
              target: mergerFrameTarget(['#splitActivateAllButton', '.split-toolbar-group-selection']),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Ausgabeformat',
              copy: 'Lege fest, ob die ausgewählten Seiten gemeinsam in einer PDF landen oder als einzelne Dateien ausgegeben werden.',
              target: mergerFrameTarget('#splitOutputModeGroup'),
              placement: 'right',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Seitengruppen',
              copy: 'Im Gruppenmodus bildest du Seitenbereiche. Geladene Seiten lassen sich per Drag-and-drop einer anderen Gruppe zuordnen.',
              target: mergerFrameTarget(['#splitGroupRowsList:not(:empty)', '.split-toolbar-group-config', '#splitOutputModeGroup']),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
            createModuleTutorialStep({
              tab: TAB_MERGER,
              title: 'Aufteilung starten',
              copy: 'Dieser Button erstellt die gewählte gemeinsame oder einzelne Ausgabe. Mehrere Dateien kommen dabei als ZIP.',
              target: mergerFrameTarget('#splitStartButton'),
              placement: 'top',
              beforeRender: () => openMergerToolForTutorial('split'),
            }),
          ]),
        ];
      case TAB_SEATPLAN:
        {
          const seatplanFallback = () => null;
          let seatplanApp = null;
          try {
            seatplanApp = getSeatplanFrame()?.contentDocument?.getElementById('app') || null;
          } catch {
            seatplanApp = null;
          }
          const isCourseSeatplan = !seatplanTutorialDemoActive && seatplanApp?.dataset.courseSeatplan === '1';
          const isCourseGradeMode = !seatplanTutorialDemoActive && seatplanApp?.dataset.courseGradeMode === '1';
          const steps = [
            ...withSection('Namen laden', [
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: isCourseSeatplan ? 'Kursliste aus dem Notenmodul' : 'Namensliste importieren',
                copy: isCourseSeatplan
                  ? 'Die Teilnehmenden kommen aus dem verknüpften Notenkurs. Der Dateiimport ist deshalb gesperrt, damit beide Listen nicht auseinanderlaufen.'
                  : 'Importiere eine CSV per Auswahl oder Drag-and-drop. Die Datei bleibt auf deinem Gerät und wird nicht hochgeladen.',
                target: seatplanFrameTarget('#csv-drop-zone', seatplanFallback),
                placement: 'right',
              }),
              ...(!isCourseSeatplan ? [createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Aus dem Notenmodul übernehmen',
                copy: 'Statt einer CSV kannst du die Teilnehmenden eines Notenkurses übernehmen. Der Knopf erscheint, sobald im Notenmodul Kurse mit Teilnehmenden vorhanden sind.',
                target: seatplanFrameTarget([
                  '#grade-roster-import-trigger:not([hidden])',
                  '#grade-roster-pills:not([hidden])',
                  '#csv-drop-zone',
                ], seatplanFallback),
                placement: 'right',
                skipIfMissing: true,
              })] : []),
              ...(isCourseSeatplan ? [createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Kursbindung lösen',
                copy: 'Dieser Knopf löst die Verbindung zum Notenkurs wieder, damit du einen anderen Kurs oder eine eigene Liste verwenden kannst.',
                target: seatplanFrameTarget('#course-roster-reset-button', seatplanFallback),
                placement: 'right',
                skipIfMissing: true,
              })] : []),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Vorlage für die Namensliste',
                copy: 'Über diesen Link lädst du eine leere CSV-Vorlage herunter. Sie zeigt, welche Spalten die Liste haben muss.',
                target: seatplanFrameTarget('#template-link', seatplanFallback),
                placement: 'right',
                skipIfMissing: true,
              }),
            ]),
            ...withSection('Raum bauen', [
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Rastergröße anpassen',
                copy: 'Lege Zeilen und Spalten deines Raums fest oder verkleinere das Raster auf die tatsächlich aktiven Plätze.',
                target: seatplanFrameTarget('#adjust-grid', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Raumform auswählen',
                copy: 'Die Vorlagen erzeugen U-Form, Reihen oder Reihen mit Mittelgang als Startpunkt. Danach lässt sich jeder Platz einzeln verändern.',
                target: seatplanFrameTarget('#tutorial-seat-patterns', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzplätze festlegen',
                copy: 'Ein Klick auf ein Feld aktiviert oder deaktiviert den Platz. Nur aktive Plätze dürfen später belegt werden.',
                target: seatplanFrameTarget(['#grid .seat.active', '#grid'], seatplanFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Zweiertische festlegen',
                copy: 'Hier bestimmst du, ob nebeneinanderliegende Plätze als Zweiertisch gelten. Der Vorschlag beachtet das bei Sitzwünschen und Einzelplätzen.',
                target: seatplanFrameTarget('#tutorial-two-seat-options', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Lehrkraft platzieren',
                copy: 'Ziehe die Lehrkraft auf einen Platz. Ihre Position zählt für das Kriterium „weit vorne“.',
                target: seatplanFrameTarget(['#teacher-card', '#grid .seat-content.teacher'], seatplanFallback),
                placement: 'right',
              }),
            ]),
            ...withSection('Verteilen', [
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzkriterien eingeben',
                copy: 'Lege pro Person Wünsche, Ausschlüsse, Einzelplätze und Plätze weit vorne fest. Diese Angaben steuern den späteren Vorschlag.',
                target: seatplanFrameTarget('#seat-preferences', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Vorschlag oder Zufall',
                copy: '„Vorschlag“ sucht eine Verteilung, die deine Kriterien möglichst gut erfüllt. „Zufall“ verteilt ohne jede Optimierung.',
                target: seatplanFrameTarget('#tutorial-distribution-actions', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Kriterien auswerten',
                copy: 'Der Score fasst zusammen, wie viele deiner Kriterien erfüllt sind. Ein niedriger Wert heißt meist, dass sich Wünsche und Ausschlüsse widersprechen.',
                target: seatplanFrameTarget(['#sidebar-score', '.seat-score', '#grid'], seatplanFallback),
                placement: 'bottom',
              }),
            ]),
            ...withSection('Nachbearbeiten', [
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzplan nachbearbeiten',
                copy: 'Ziehe Lernende auf freie Plätze. Legst du eine Person auf einer anderen ab, tauschen die beiden ihre Plätze.',
                target: seatplanFrameTarget(['#unseated .student', '#grid .seat-content:not(.teacher)', '#roster-panel', '#grid'], seatplanFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Perspektive umdrehen',
                copy: 'Die Spiegelung wechselt zwischen der Sicht der Lehrkraft und der Sicht der Lernenden – wichtig, damit der Ausdruck zur Blickrichtung passt.',
                target: seatplanFrameTarget('#toggle-perspective', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Belegung zurücksetzen',
                copy: 'Diese Aktion löst nur die Lernenden von den Plätzen. Raumform und aktive Plätze bleiben erhalten.',
                target: seatplanFrameTarget('#reset-learners', seatplanFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Platzraster zurücksetzen',
                copy: 'Diese Aktion entfernt Raumform und alle aktiven Plätze, damit du das Raster von Grund auf neu aufbauen kannst.',
                target: seatplanFrameTarget('#reset-raster', seatplanFallback),
                placement: 'right',
              }),
            ]),
          ];

          if (isCourseGradeMode) {
            steps.push(createModuleTutorialStep({
              tab: TAB_SEATPLAN,
              section: 'Nachbearbeiten',
              title: 'Noten am Sitzplatz eingeben',
              copy: 'Wähle Noten direkt am Sitzplatz aus. Gespeichert werden sie gesammelt im Notenmodul, nicht im Sitzplan.',
              target: seatplanFrameTarget([
                "button[data-course-grade-trigger='1']",
                "input[data-course-grade-input='1']",
                '.course-grade-seat-content',
              ], seatplanFallback),
              placement: 'top',
            }));
          }

          steps.push(
            ...withSection('Sichern und Drucken', [
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzplan laden',
                copy: 'Lade einen gespeicherten Sitzplan aus einer JSON-Datei. Der aktuelle Plan wird dabei ersetzt.',
                target: seatplanFrameTarget('#import-plan', seatplanFallback),
                placement: 'right',
              }),
              ...(!isCourseSeatplan ? [createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzplan speichern',
                copy: 'Speichere Raster, Belegung und Kriterien als Datei, um später daran weiterzuarbeiten.',
                target: seatplanFrameTarget('#export-plan', seatplanFallback),
                placement: 'right',
              })] : []),
              ...(isCourseSeatplan ? [createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Im Notenmodul speichern',
                copy: 'Bei verknüpften Kursen speicherst du den Plan direkt beim Notenkurs. Er steht dann in Planung und Noten zur Verfügung.',
                target: seatplanFrameTarget('#export-plan', seatplanFallback),
                placement: 'right',
              })] : []),
              createModuleTutorialStep({
                tab: TAB_SEATPLAN,
                title: 'Sitzplan drucken',
                copy: 'Erstelle eine druckbare Ansicht des aktuellen Plans – in der gerade gewählten Perspektive.',
                target: seatplanFrameTarget('#print-plan', seatplanFallback),
                placement: 'right',
              }),
            ])
          );

          return {
            steps,
            demo: {
              activate: activateSeatplanTutorialDemo,
              auto: true,
            },
          };
        }
      case TAB_GROUPS:
        {
          const steps = [
            ...withSection('Namen laden', [
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Namensliste importieren',
                copy: 'Wähle eine CSV oder ziehe sie hierher. Gruppen-Modul und Picker arbeiten anschließend mit derselben Liste.',
                target: (nodes) => nodes.csvDropZone,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Aus dem Notenmodul übernehmen',
                copy: 'Statt einer CSV kannst du die Teilnehmenden eines Notenkurses übernehmen. Der Knopf erscheint, sobald im Notenmodul Kurse mit Teilnehmenden vorhanden sind.',
                target: (nodes) => (
                  visibleTutorialNode(nodes.gradeRosterImportTrigger)
                  || visibleTutorialNode(nodes.gradeRosterPills)
                  || nodes.csvDropZone
                ),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Vorlage für die Namensliste',
                copy: 'Über diesen Link lädst du eine leere CSV-Vorlage herunter. Sie zeigt, welche Spalten die Liste haben muss.',
                target: (nodes) => nodes.templateLink,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Freie Lernende',
                copy: 'Alle noch nicht eingeteilten Personen sammeln sich hier. Von dort ziehst du sie per Drag-and-drop in eine Gruppe.',
                target: (nodes) => nodes.unseated?.querySelector('.student') || nodes.unseated,
                placement: 'right',
              }),
            ]),
            ...withSection('Gruppen bilden', [
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Minimale Gruppengröße',
                copy: 'Die Mindestgröße legt fest, wie viele Personen eine Gruppe mindestens hat. Zu kleine Reste werden auf die übrigen Gruppen verteilt.',
                target: (nodes) => nodes.minGroupSize || nodes.groupSizeControls,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Maximale Gruppengröße',
                copy: 'Die Maximalgröße begrenzt, wie voll eine Gruppe werden darf. Aus beiden Werten ergibt sich, wie viele Gruppen entstehen.',
                target: (nodes) => nodes.maxGroupSize || nodes.groupSizeControls,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppenraster',
                copy: 'Aus Namensliste und Gruppengröße entstehen automatisch passende Gruppenfelder. Jedes Feld ist eine Gruppe.',
                target: (nodes) => nodes.groupsGrid?.querySelector('.seat') || nodes.groupsGrid,
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppenkriterien öffnen',
                copy: 'Hier pflegst du Sitzwünsche, Ausschlüsse und Leistungsklassen. Nur der Vorschlag wertet diese Angaben aus.',
                target: (nodes) => nodes.groupSeatPreferences,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Vorschlag erzeugen',
                copy: 'Der Vorschlag berücksichtigt Größe, Wünsche, Ausschlüsse und gesperrte Gruppen. Jeder Aufruf erzeugt eine neue Einteilung.',
                target: (nodes) => nodes.groupSuggest,
                placement: 'right',
              }),
            ]),
            ...withSection('Anpassen', [
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Einteilung manuell anpassen',
                copy: 'Ziehe Personen in eine andere Gruppe. Legst du eine Person auf einer anderen ab, tauschen die beiden ihre Gruppen.',
                target: (nodes) => (
                  nodes.unseated?.querySelector('.student')
                  || nodes.groupsGrid?.querySelector('.seat-chip')
                  || nodes.groupsGrid?.querySelector('.seat')
                  || null
                ),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppen sperren',
                copy: 'Doppelklick sperrt eine Gruppe. Ein neuer Vorschlag lässt gesperrte Gruppen unverändert.',
                target: (nodes) => nodes.groupsGrid?.querySelector('.seat'),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppenthemen eintragen',
                copy: 'Klicke die Themenzeile einer Gruppe an, um Thema oder Station einzutragen. Sie wird mitgespeichert und mitgedruckt.',
                target: (nodes) => nodes.groupsGrid?.querySelector('.seat-topic'),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Weitere Gruppe hinzufügen',
                copy: 'Klicke den gestrichelten Platzhalter oder ziehe eine Person darauf, um eine zusätzliche Gruppe anzulegen.',
                target: (nodes) => nodes.groupsGrid?.querySelector('.seat-placeholder'),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppe löschen',
                copy: 'Über den Papierkorb entfernst du eine Gruppe. Ihre Lernenden wechseln dabei zurück in die Liste der freien Lernenden.',
                target: (nodes) => nodes.groupsGrid?.querySelector('.seat-delete-button'),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Belegung zurücksetzen',
                copy: 'Löst Gruppen, Sperren und Themen auf einmal. Die Namensliste selbst bleibt erhalten.',
                target: (nodes) => nodes.groupResetLearners,
                placement: 'right',
              }),
            ]),
            ...withSection('Sichern und Drucken', [
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppeneinteilung laden',
                copy: 'Lade eine gespeicherte Einteilung, wenn du später daran weiterarbeitest. Die aktuelle Einteilung wird dabei ersetzt.',
                target: (nodes) => nodes.groupImportPlan || nodes.groupPlanActions,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppeneinteilung speichern',
                copy: 'Speichere Namen, Gruppen, Themen und Sperren als Datei. Ohne Speichern geht die Einteilung beim Schließen verloren.',
                target: (nodes) => nodes.groupExportPlan || nodes.groupPlanActions,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_GROUPS,
                title: 'Gruppen drucken',
                copy: 'Drucke die aktuelle Einteilung samt eingetragener Themen als Übersicht für die Lerngruppe.',
                target: (nodes) => nodes.groupPrintPlan || nodes.groupPlanActions,
                placement: 'right',
              }),
            ]),
          ];
          return {
            steps,
            demo: {
              activate: () => activateClassroomTutorialDemo(TAB_GROUPS),
              auto: true,
            },
          };
        }
      case TAB_RANDOM_PICKER:
        {
          const pickerFallback = () => null;
          const steps = [
            ...withSection('Vorbereiten', [
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Gemeinsame Namensliste',
                copy: 'Gruppen-Modul und Picker nutzen dieselbe Namensliste. Eine CSV importierst du über die Dropzone im Gruppen-Modul.',
                target: (nodes) => nodes.csvDropZone || nodes.randomPickerImport,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Auswahlbedingungen öffnen',
                copy: 'Hier stellst du pro Person „normal“, „sicher“ oder „unmöglich“ ein. „Speichern“ übernimmt die Bedingungen für die nächste Ziehung.',
                target: (nodes) => nodes.groupSeatPreferences,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Nach der Ziehung deaktivieren',
                copy: 'In denselben Bedingungen legst du fest, dass gezogene Personen automatisch auf „unmöglich“ wechseln. So kommt in einer Runde jede Person nur einmal dran.',
                target: (nodes) => (
                  visibleTutorialNode(nodes.preferencesRandomPickerAutoDisable)
                  || visibleTutorialNode(nodes.randomPickerAutoDisableSelected)
                  || nodes.groupSeatPreferences
                ),
                placement: 'right',
              }),
            ]),
            ...withSection('Ziehen', [
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Picker-Rad',
                copy: 'Das Rad zeigt die Namen der Liste. Personen auf „unmöglich“ tauchen dort nicht auf und können nicht gewinnen.',
                target: (nodes) => nodes.randomPickerWheel || pickerFallback(nodes),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Auswahl starten',
                copy: 'Mit „Start“ beginnt eine gewichtete Zufallsauswahl. Während das Rad läuft, ist der Button vorübergehend gesperrt.',
                target: (nodes) => nodes.randomPickerStart || nodes.randomPickerStartRow || pickerFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Ergebnis erkennen',
                copy: 'Das Rad bremst langsam ab. Die Person in der mittleren, hervorgehobenen Karte ist das Ergebnis der Ziehung.',
                target: (nodes) => nodes.randomPickerCards?.[3] || nodes.randomPickerWheel || pickerFallback(nodes),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Erneut auswählen',
                copy: 'Jede Ziehung ist unabhängig von der vorigen. Ohne die automatische Deaktivierung bleibt jede Person im Topf und kann erneut drankommen.',
                target: (nodes) => nodes.randomPickerStart || nodes.randomPickerStartRow || pickerFallback(nodes),
                placement: 'right',
              }),
            ]),
            ...withSection('Sichern', [
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Pickerstand speichern',
                copy: 'Speichere Liste und Gewichtungen als Datei. So bleibt erhalten, wer in dieser Runde schon dran war.',
                target: (nodes) => nodes.randomPickerExport || nodes.randomPickerPlanActions,
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_RANDOM_PICKER,
                title: 'Pickerstand laden',
                copy: 'Über „Picker laden“ lädst du einen gespeicherten Pickerstand wieder ein und setzt die Runde genau dort fort.',
                target: (nodes) => nodes.randomPickerImport || nodes.randomPickerPlanActions,
                placement: 'right',
              }),
            ]),
          ];
          return {
            steps,
            demo: {
              activate: () => activateClassroomTutorialDemo(TAB_RANDOM_PICKER),
              auto: true,
            },
          };
        }
      case TAB_DUPLICATE_CHECK:
        {
          const duplicateFallback = (nodes) => nodes.tabDuplicateCheck;
          const steps = [
            ...withSection('Regeln wählen', [
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Prüfkriterien auswählen',
                copy: 'Jede aktive Regel wird unabhängig geprüft. Ein einziger Treffer genügt, damit zwei Dateien in einer Gruppe landen.',
                target: duplicateCheckFrameTarget('.rule-toggle-list', duplicateFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Gleicher Dateiname',
                copy: 'Findet Dateien mit gleichem Namen. Endung und Großschreibung werden dabei ignoriert.',
                target: duplicateCheckFrameTarget('[data-duplicate-rule="name"]', duplicateFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Gleiche Dateigröße',
                copy: 'Exakt gleiche Byte-Größe ist ein starker Hinweis auf eine Kopie – aber kein Beweis, etwa bei sehr kleinen Dateien.',
                target: duplicateCheckFrameTarget('[data-duplicate-rule="size"]', duplicateFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Ähnlicher Bildinhalt',
                copy: 'Vergleicht Bilder inhaltlich und erkennt auch zugeschnittene oder neu gespeicherte Fotos. Das Ergebnis ist eine Einschätzung, die du selbst prüfen musst.',
                target: duplicateCheckFrameTarget('[data-duplicate-rule="visual"]', duplicateFallback),
                placement: 'right',
              }),
            ]),
            ...withSection('Abgaben prüfen', [
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Abgaben als ZIP prüfen',
                copy: 'Ziehe die aus IServ heruntergeladene ZIP hierher oder klicke zur Auswahl. Sie wird nur im Browser gelesen und nicht hochgeladen.',
                target: duplicateCheckFrameTarget('#zipDropZone', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Geprüfte Datei',
                copy: 'Hier steht, welche ZIP gerade ausgewertet wird und wie viele Dateien sie enthält.',
                target: duplicateCheckFrameTarget(['#fileSummary:not(.hidden)', '#zipDropZone'], duplicateFallback),
                placement: 'top',
                skipIfMissing: true,
              }),
            ]),
            ...withSection('Ergebnis lesen', [
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Zusammenfassung',
                copy: 'Die Zusammenfassung zeigt, wie viele Dateien geprüft wurden und wie viele Treffergruppen jede Regel gefunden hat.',
                target: duplicateCheckFrameTarget('#resultPanel .summary-grid', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Duplikatgruppen',
                copy: 'Jede Gruppe bündelt Dateien, die sich nach mindestens einer Regel gleichen. Eine Datei kann in mehreren Gruppen auftauchen.',
                target: duplicateCheckFrameTarget('#resultPanel .duplicate-group', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Treffergründe',
                copy: 'Die farbigen Marken nennen den Grund: Name, Größe oder Bildähnlichkeit. So siehst du sofort, wie belastbar ein Treffer ist.',
                target: duplicateCheckFrameTarget('#resultPanel .badge-row', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Einzelne Dateien öffnen',
                copy: 'Klicke einen Dateipfad an, um die Abgabe direkt aus der ZIP anzusehen und den Treffer selbst zu beurteilen.',
                target: duplicateCheckFrameTarget('#resultPanel .file-link', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Bilder vergleichen',
                copy: '„Vergleichen“ zeigt zwei Bilder nebeneinander. Erst dieser Blick entscheidet, ob wirklich abgeschrieben wurde.',
                target: duplicateCheckFrameTarget('#resultPanel .compare-button', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Ergebnis neu auswerten',
                copy: 'Du kannst Regeln auch nach der Analyse ändern. Die bereits gelesenen Dateien werden dann sofort neu bewertet, ohne die ZIP erneut zu laden.',
                target: duplicateCheckFrameTarget('.rule-toggle-list', duplicateFallback),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Neue ZIP-Datei prüfen',
                copy: 'Eine neue ZIP ersetzt die bisherige Analyse vollständig. Notiere dir Treffer vorher, wenn du sie noch brauchst.',
                target: duplicateCheckFrameTarget('#zipDropZone', duplicateFallback),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_DUPLICATE_CHECK,
                title: 'Originale bleiben unverändert',
                copy: 'Dateilinks öffnen nur Kopien aus der ZIP; deine Abgaben werden nicht verändert.',
                target: duplicateCheckFrameTarget(['#resultPanel .file-link', '#resultPanel .summary-grid'], duplicateFallback),
                placement: 'top',
              }),
            ]),
          ];

          return {
            steps,
            demo: {
              activate: activateDuplicateCheckTutorialDemo,
              auto: true,
            },
          };
        }
      case TAB_WORK_PHASE:
        {
          const workPhaseFallback = (nodes) => nodes.workOrderPanel || nodes.monitorShell || nodes.tabWorkPhase;
          const isVisibleTarget = (node) => {
            if (!node || node.hidden) return false;
            const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
            return Boolean(rect && rect.width > 0 && rect.height > 0);
          };
          const activeTimerButton = (nodes) => (
            isVisibleTarget(nodes.timerWorkOrderStop) && !nodes.timerWorkOrderStop.disabled
              ? nodes.timerWorkOrderStop
              : nodes.timerWorkOrderStart
          );
          const activeMonitorButton = (nodes) => (
            isVisibleTarget(nodes.monitorMicStopButton) && !nodes.monitorMicStopButton.disabled
              ? nodes.monitorMicStopButton
              : nodes.monitorMicStartButton
          );
          const steps = [
            ...withSection('Arbeitsauftrag', [
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Arbeitsphase im Überblick',
                copy: 'Arbeitsauftrag, Timer und Lautstärkeampel lassen sich gemeinsam oder einzeln nutzen. Nichts davon muss eingeschaltet sein.',
                target: (nodes) => nodes.workOrderPanel || nodes.monitorShell || nodes.tabWorkPhase,
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Arbeitsauftrag eingeben',
                copy: 'Der Text wird sofort übernommen und bleibt auch beim Wechsel in ein anderes Modul erhalten.',
                target: (nodes) => nodes.workOrderTextarea || nodes.workOrderPanel || nodes.tabWorkPhase,
                placement: 'top',
              }),
            ]),
            ...withSection('Timer', [
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Arbeitsdauer festlegen',
                copy: 'Trage die Minuten direkt ein oder ändere sie mit Plus und Minus.',
                target: (nodes) => nodes.timerDurationField || nodes.workOrderDurationInput || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Dauer per Schieberegler',
                copy: 'Der Regler darunter stellt dieselbe Dauer grob ein – schneller, wenn es nicht auf die Minute ankommt.',
                target: (nodes) => nodes.workOrderDurationRange || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Zwischenwarnungen konfigurieren',
                copy: 'Schalte Töne bei der Hälfte und bei drei Vierteln der Zeit ein, damit die Lerngruppe ihr Tempo einschätzen kann.',
                target: (nodes) => nodes.timerHalfToneButton || nodes.timerQuarterToneButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Zeitliche Warnungen',
                copy: 'Zu denselben Zeitpunkten – 50 %, 75 % und Ende – wird der Timer auch sichtbar hervorgehoben. Das wirkt auch ohne Ton.',
                target: (nodes) => nodes.timerPanel || nodes.timerWarningBanner || workPhaseFallback(nodes),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Endsignal konfigurieren',
                copy: 'Der Endton lässt sich unabhängig von den Zwischentönen abschalten. Der sichtbare Endalarm bleibt in jedem Fall aktiv.',
                target: (nodes) => nodes.timerEndToneButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Sekunden ein- oder ausblenden',
                copy: 'Ohne Sekunden wirkt die Restzeit ruhiger, mit Sekunden ist sie genauer.',
                target: (nodes) => nodes.timerSecondsToggleButton || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Arbeitszeit starten',
                copy: 'Das Uhrsymbol startet den Countdown mit der eingestellten Dauer.',
                target: (nodes) => nodes.timerWorkOrderStart || nodes.timerWorkOrderActions || nodes.workPhaseTimerSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Restzeit und Endzeit',
                copy: 'Während der Timer läuft, siehst du hier die verbleibende Zeit und die Uhrzeit, zu der die Phase endet.',
                target: (nodes) => nodes.workOrderMeta || nodes.timerPanel || workPhaseFallback(nodes),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Timer stoppen',
                copy: 'Wenn der Timer läuft, erscheint hier das aktive Uhrsymbol zum Stoppen. Ein Neustart beginnt wieder bei der vollen Dauer.',
                target: (nodes) => activeTimerButton(nodes) || nodes.workOrderRestClock || nodes.timerPanel || workPhaseFallback(nodes),
                placement: 'right',
              }),
            ]),
            ...withSection('Lautstärkeampel', [
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Ampelschwellen festlegen',
                copy: 'Ab welcher Lautstärke Gelb und Rot gelten, hängt von Mikrofon, Gerät und Raum ab. Probiere die Werte einmal im echten Raum aus.',
                target: (nodes) => nodes.monitorThresholdControls || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Ampel-Warntöne',
                copy: 'Gelb und Rot haben getrennte Warntöne, die sich bei anhaltender Lautstärke wiederholen.',
                target: (nodes) => nodes.monitorToneControls || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Lautstärkeüberwachung starten',
                copy: 'Das Ampelsymbol startet die Messung und fragt nach Mikrofonfreigabe. Es wird nur die Lautstärke gemessen, nichts aufgezeichnet.',
                target: (nodes) => nodes.monitorMicStartButton || nodes.monitorMicActions || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Ampelfarben verstehen',
                copy: 'Grün, Gelb und Rot folgen deinen Schwellen. Die Anzeige ist geglättet, damit ein einzelnes lautes Geräusch nicht sofort auf Rot springt.',
                target: (nodes) => nodes.monitorAmpel || nodes.monitorShell || workPhaseFallback(nodes),
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Überwachung stoppen',
                copy: 'Während der Messung erscheint hier das aktive Ampelsymbol. Es beendet die Messung und gibt das Mikrofon wieder frei.',
                target: (nodes) => activeMonitorButton(nodes) || nodes.monitorMicActions || nodes.workPhaseMonitorSettings || workPhaseFallback(nodes),
                placement: 'right',
              }),
            ]),
            ...withSection('Präsentieren', [
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Präsentationsansicht',
                copy: 'Das Vollbild blendet die Bedienung aus und zeigt Auftrag, Ampel und Timer groß – gedacht für den Beamer.',
                target: (nodes) => nodes.chromeToggle || nodes.appHeader || nodes.tabWorkPhase,
                placement: 'bottom',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Automatisches Vollbildlayout',
                copy: 'Das Layout passt sich an: Ohne Timer wird der Auftrag größer, ohne Auftrag rücken Ampel und Timer in den Mittelpunkt.',
                target: (nodes) => nodes.monitorShell || nodes.workOrderShell || nodes.timerShell || nodes.tabWorkPhase,
                placement: 'top',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Schnellaktionen im Vollbild',
                copy: 'Auch im Vollbild bleiben Timer und Mikrofon über kleine Knöpfe erreichbar, ohne die Ansicht zu verlassen.',
                target: (nodes) => (
                  visibleTutorialNode(nodes.workPhaseTimerStartCollapsed)
                  || visibleTutorialNode(nodes.workPhaseMonitorStartCollapsed)
                  || nodes.chromeToggle
                  || nodes.appHeader
                  || nodes.tabWorkPhase
                ),
                placement: 'bottom',
              }),
              createModuleTutorialStep({
                tab: TAB_WORK_PHASE,
                title: 'Vollbild verlassen',
                copy: 'Escape oder dieser Knopf holen die Bedienung zurück. Timer und Messung laufen dabei ungestört weiter.',
                target: (nodes) => (
                  visibleTutorialNode(nodes.chromeOverlayToggle)
                  || nodes.chromeToggle
                  || nodes.appHeader
                  || nodes.tabWorkPhase
                ),
                placement: 'bottom',
              }),
            ]),
          ];
          return {
            steps,
            demo: {
              activate: activateWorkPhaseTutorialDemo,
              auto: true,
            },
          };
        }
      case TAB_QR:
        {
          const qrFallback = (nodes) => nodes.tabQr;
          const openGenerator = () => openQrToolForTutorial('generator');
          const openDecoder = () => openQrToolForTutorial('decoder');
          const openDecoderCamera = () => openQrToolForTutorial('decoder', 'camera');
          const steps = [
            ...withSection('Erstellen', [
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Werkzeuge auswählen',
                copy: 'Der Generator erstellt Codes, der Decoder liest sie aus Bild, Zwischenablage oder Kamera.',
                target: qrFrameTarget('.tool-tab-bar', qrFallback),
                placement: 'bottom',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Link eingeben',
                copy: 'Gib die Adresse ein, auf die der Code zeigen soll. Fehlt „https://“, ergänzt TeachHelper es automatisch.',
                target: qrFrameTarget('#generatorLinkInput', qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Code erstellen',
                copy: 'Der Button prüft den Link und erzeugt den QR-Code. Alles passiert im Browser, ohne Internetdienst.',
                target: qrFrameTarget('#generateButton', qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Code kontrollieren',
                copy: 'Die Vorschau zeigt den fertigen Code. Scanne ihn einmal selbst, bevor du ihn an die Lerngruppe gibst.',
                target: qrFrameTarget(['#qrPreviewShell:not(.hidden)', '#generatorResult'], qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Ziel-Link prüfen',
                copy: 'Unter der Vorschau steht das tatsächliche Ziel als anklickbarer Link. So erkennst du Tippfehler, bevor der Code im Umlauf ist.',
                target: qrFrameTarget(['#qrEncodedLink', '#generatorResult'], qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Code herunterladen',
                copy: '„Download“ speichert den Code als PNG – geeignet für Arbeitsblätter und Präsentationen.',
                target: qrFrameTarget('#downloadQrButton', qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Bild kopieren',
                copy: 'Kopiere das Bild direkt in die Zwischenablage, um es ohne Umweg einzufügen. Nicht jeder Browser unterstützt das.',
                target: qrFrameTarget('#copyQrImageButton', qrFallback),
                placement: 'top',
                beforeRender: openGenerator,
              }),
            ]),
            ...withSection('Lesen', [
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'QR-Code aus Bild lesen',
                copy: 'Ziehe ein Bild mit QR-Code hierher oder klicke zur Auswahl – etwa einen Screenshot oder ein Foto.',
                target: qrFrameTarget('#decoderDropZone', qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Gelesene Bilddatei',
                copy: 'Hier steht, welches Bild gerade ausgewertet wurde. Ein neues Bild ersetzt das vorige Ergebnis.',
                target: qrFrameTarget(['#decoderFileSummary:not(.hidden)', '#decoderDropZone'], qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
                skipIfMissing: true,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Bild aus der Zwischenablage',
                copy: 'Liest ein kopiertes Bild direkt aus der Zwischenablage. Der Browser fragt dabei um Erlaubnis.',
                target: qrFrameTarget('#pasteImageButton', qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Kamera verwenden',
                copy: '„Kamera“ startet den Live-Scan und fragt nach Kamerafreigabe. Das Bild verlässt dein Gerät nicht.',
                target: qrFrameTarget('#cameraButton', qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Kamerabild ausrichten',
                copy: 'Halte den Code vollständig und ruhig ins Bild. Sobald er erkannt wird, stoppt der Scan von selbst.',
                target: qrFrameTarget(['#cameraPanel:not(.hidden)', '#decoderDropZone'], qrFallback),
                placement: 'top',
                beforeRender: openDecoderCamera,
                skipIfMissing: true,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Kamerascan beenden',
                copy: 'Stoppe den Scan auch manuell, um die Kamera wieder freizugeben.',
                target: qrFrameTarget('#stopCameraButton', qrFallback),
                placement: 'top',
                beforeRender: openDecoderCamera,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Gelesenes Ergebnis',
                copy: 'Links werden anklickbar dargestellt, andere Inhalte als reiner Text. Prüfe fremde Links, bevor du sie öffnest.',
                target: qrFrameTarget(['#decodedLink:not(.hidden)', '#decodedText:not(.hidden)', '#decoderResult'], qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Ergebnis kopieren',
                copy: 'Kopiert den gelesenen Link oder Text in die Zwischenablage.',
                target: qrFrameTarget('#copyDecodedButton', qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
              createModuleTutorialStep({
                tab: TAB_QR,
                title: 'Wenn das Lesen nicht klappt',
                copy: 'Ein scharfes Bild, gutes Licht und etwas Rand um den Code verbessern die Erkennung deutlich.',
                target: qrFrameTarget(['#decoderResult', '#cameraPanel:not(.hidden)', '#decoderDropZone'], qrFallback),
                placement: 'top',
                beforeRender: openDecoder,
              }),
            ]),
          ];
          return {
            steps,
            demo: {
              activate: activateQrTutorialDemo,
              auto: true,
            },
          };
        }
      case TAB_NAME_LEARNING:
        {
          const nameLearningFallback = (nodes) => nodes.tabNameLearning;
          const nameLearningStep = (title, copy, selector, surface, placement = 'right', options = {}) => (
            createModuleTutorialStep({
              tab: TAB_NAME_LEARNING,
              title,
              copy,
              target: nameLearningFrameTarget(selector, nameLearningFallback),
              placement,
              ...options,
              beforeRender: () => prepareNameLearningTutorialSurface(surface),
            })
          );
          const steps = [
            ...withSection('Voraussetzungen', [
              nameLearningStep(
                'Karten aus dem Notenmodul',
                'Jede Lernkarte entsteht aus einem Foto, das im Notenmodul bei einer Person hinterlegt ist. Ohne Foto gibt es keine Karte, und der Notenbereich muss entsperrt sein.',
                ['#courses', '#setup'],
                'setup'
              ),
              nameLearningStep(
                'Kurse auswählen',
                'Die Häkchen bestimmen, aus welchen Kursen abgefragt wird. So übst du gezielt die Lerngruppe, die als Nächstes dran ist.',
                '#courses',
                'setup'
              ),
            ]),
            ...withSection('Lernmodus', [
              nameLearningStep(
                'Fällige Karten abfragen',
                'Die Zahl zeigt, wie viele Karten heute zur Wiederholung anstehen. Dieser Modus merkt sich, was du kannst, und plant die nächste Abfrage.',
                '#start-due',
                'setup'
              ),
              nameLearningStep(
                'Zufällig üben',
                'Zufälliges Üben geht alle Karten der gewählten Kurse durch – ohne den Lernstand zu verändern. Gut zum kurzen Auffrischen vor der Stunde.',
                '#start-random',
                'setup'
              ),
            ]),
            ...withSection('Abfragen', [
              nameLearningStep(
                'Foto ansehen',
                'Zuerst siehst du nur das Foto. Überlege dir den Namen, bevor du die Karte umdrehst.',
                ['#portrait', '#flip-card'],
                'practice',
                'left'
              ),
              nameLearningStep(
                'Namen aufdecken',
                'Ein Klick irgendwo auf die Karte dreht sie um – nicht nur das Foto selbst ist anklickbar.',
                '#flashcard',
                'practice',
                'left'
              ),
              nameLearningStep(
                'Name und Kurs',
                'Auf der Rückseite stehen der Name und der Kurs, aus dem die Person stammt.',
                ['#answer', '#flashcard-back'],
                'revealed',
                'left'
              ),
              nameLearningStep(
                'Gewusst oder nicht',
                'Deine ehrliche Einschätzung steuert den Wiederholungsabstand: „Gewusst“ verlängert ihn, „Nicht gewusst“ setzt die Karte auf sofort zurück.',
                ['#known', '#unknown'],
                'revealed',
                'left'
              ),
            ]),
            ...withSection('Wiederholung', [
              nameLearningStep(
                'Nächste Abfrage',
                'Nach der Antwort erscheint kurz der nächste Wiederholungstermin. Ein Klick auf die Karte springt sofort weiter, statt zu warten.',
                ['#review-feedback', '#flashcard'],
                'feedback',
                'left'
              ),
              nameLearningStep(
                'Keine Karten fällig',
                'Sind alle Karten wiederholt, meldet sich dieser Hinweis. Das ist der normale Abschluss einer Lernrunde.',
                '#empty',
                'empty',
                'left'
              ),
              nameLearningStep(
                'Trotzdem weiterüben',
                'Über diesen Knopf übst du zufällig weiter, ohne den geplanten Wiederholungsrhythmus zu stören.',
                '#empty-random',
                'empty',
                'left'
              ),
            ]),
          ];
          return {
            steps,
            demo: {
              activate: activateNameLearningTutorialDemo,
              auto: true,
            },
          };
        }
      default:
        return [
          createModuleTutorialStep({
            tab: TAB_GROUPS,
            title: 'Detailtour wählen',
            copy: 'Über 🛟 startet die Einführung für das jeweils geöffnete Modul.',
            target: (nodes) => nodes.firstRunTutorialStart || nodes.appHeader,
            placement: 'top',
          }),
        ];
    }
  };
  const MODULE_TUTORIAL_INTRO = {
    [TAB_GRADES]: {
      title: 'Noten',
      copy: 'Hier werden Kurse, Leistungen und geschützte Notendaten verwaltet.',
      target: (nodes) => nodes.tabGrades,
    },
    [TAB_PLANNING]: {
      title: 'Planung',
      copy: 'Hier werden Wochen, Serien und Unterrichtsverläufe geplant.',
      target: (nodes) => nodes.tabPlanning,
    },
    [TAB_SEATPLAN]: {
      title: 'Sitzplan',
      copy: 'Hier werden Sitzpläne erstellt und Kriterien für Vorschläge genutzt.',
      target: (nodes) => nodes.tabSeatplan,
    },
    [TAB_MERGER]: {
      title: 'PDF-Tools',
      copy: 'Hier werden PDFs neu angeordnet, verbunden, gedreht oder aufgeteilt.',
      target: (nodes) => nodes.tabMerger,
    },
    [TAB_GROUPS]: {
      title: 'Gruppen',
      copy: 'Hier werden Lernende eingeteilt und Gruppen optimiert.',
      target: (nodes) => nodes.tabGroups,
    },
    [TAB_RANDOM_PICKER]: {
      title: 'Picker',
      copy: 'Hier wird eine Person zufällig und bei Bedarf gewichtet ausgewählt.',
      target: (nodes) => nodes.tabRandomPicker,
    },
    [TAB_DUPLICATE_CHECK]: {
      title: 'DuplikatCheck',
      copy: 'Hier werden ZIP-Abgaben auf mögliche Duplikate geprüft.',
      target: (nodes) => nodes.tabDuplicateCheck,
    },
    [TAB_WORK_PHASE]: {
      title: 'Arbeitsphase',
      copy: 'Hier werden Arbeitsauftrag, Timer und Lautstärkeampel angezeigt.',
      target: (nodes) => nodes.tabWorkPhase,
    },
    [TAB_QR]: {
      title: 'QR',
      copy: 'Hier werden QR-Codes erstellt oder vorhandene Codes ausgelesen.',
      target: (nodes) => nodes.tabQr,
    },
    [TAB_NAME_LEARNING]: {
      title: 'Namen lernen',
      copy: 'Hier werden Namen mit Karteikarten aus den Fotos des Notenmoduls geübt.',
      target: (nodes) => nodes.tabNameLearning,
    },
  };

  const getCurrentModuleTutorialSteps = ({ activeTab } = {}) => {
    const definition = getModuleTutorialDefinition({ activeTab });
    const steps = Array.isArray(definition) ? definition : definition?.steps;
    const intro = MODULE_TUTORIAL_INTRO[activeTab];
    if (!intro) return definition;
    const introStep = createModuleTutorialStep({
      tab: activeTab,
      section: 'Überblick',
      ...intro,
      placement: 'bottom',
      anchor: 'center',
      skipIfMissing: !TUTORIAL_OPAQUE_FRAME_TABS.has(activeTab),
    });
    if (Array.isArray(definition)) {
      return [introStep, ...definition];
    }
    return {
      ...definition,
      steps: [introStep, ...(Array.isArray(steps) ? steps : [])],
    };
  };

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
      button?.addEventListener('click', (event) => {
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
          window.setTimeout(() => publishTarget(stepTitle, sequence, attempts + 1), 50);
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
      [320, 900, 1800, 3200].forEach((delay) => window.setTimeout(() => {
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
    window.addEventListener('message', onPreviewCommand);
    window.addEventListener('pagehide', () => window.removeEventListener('message', onPreviewCommand), { once: true });

    setActiveTabForTutorial(config.tab);
    const availableSteps = firstRunTutorial.startPreview();
    if (!availableSteps.length) {
      postState('error');
      return;
    }
    postState('ready', { availableSteps });
    window.setTimeout(() => showFrame(config.frames[0]?.stepTitle), 0);
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

  let sharedCourseContextId = 0;
  let planningCourseViewCourseId = 0;
  let gradesCourseAutoSelectSuppressedUntil = 0;
  let pendingCourseSeatplanContext = null;
  let pendingCourseSeatplanContextFrame = 0;

  const deliverPendingCourseSeatplanContext = () => {
    pendingCourseSeatplanContextFrame = 0;
    if (!pendingCourseSeatplanContext || getActiveTab() !== TAB_SEATPLAN) {
      return;
    }
    const detail = pendingCourseSeatplanContext;
    pendingCourseSeatplanContext = null;
    bridgeController?.ensureTabInitialized(TAB_SEATPLAN);
    bridgeController?.sendCourseSeatplanContext(detail);
  };

  const schedulePendingCourseSeatplanContext = (attempt = 0) => {
    if (!pendingCourseSeatplanContext || pendingCourseSeatplanContextFrame) return;
    if (getActiveTab() === TAB_SEATPLAN) {
      deliverPendingCourseSeatplanContext();
      return;
    }
    if (attempt >= 120) return;
    if (typeof requestAnimationFrame === 'function') {
      pendingCourseSeatplanContextFrame = requestAnimationFrame(() => {
        pendingCourseSeatplanContextFrame = 0;
        schedulePendingCourseSeatplanContext(attempt + 1);
      });
      return;
    }
    if (typeof setTimeout === 'function') {
      pendingCourseSeatplanContextFrame = setTimeout(() => {
        pendingCourseSeatplanContextFrame = 0;
        schedulePendingCourseSeatplanContext(attempt + 1);
      }, 16);
    }
  };

  let pendingSeatplanChromeCollapsed = null;
  let pendingSeatplanChromeFrame = 0;

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
    if (typeof requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestAnimationFrame(() => applyPendingSeatplanChrome(attempt + 1));
      return;
    }
    if (typeof setTimeout === 'function') {
      pendingSeatplanChromeFrame = setTimeout(() => applyPendingSeatplanChrome(attempt + 1), 16);
    }
  };

  const requestSeatplanChromeCollapsed = (collapsed) => {
    pendingSeatplanChromeCollapsed = Boolean(collapsed);
    if (pendingSeatplanChromeFrame) return;
    if (typeof requestAnimationFrame === 'function') {
      pendingSeatplanChromeFrame = requestAnimationFrame(() => applyPendingSeatplanChrome());
      return;
    }
    if (typeof setTimeout === 'function') {
      pendingSeatplanChromeFrame = setTimeout(() => applyPendingSeatplanChrome(), 16);
    }
  };

  function suppressGradesCourseAutoSelect() {
    gradesCourseAutoSelectSuppressedUntil = Date.now() + 2000;
  }

  function rememberSharedCourseContext(event) {
    const courseId = Number(event?.detail?.courseId || 0);
    if (courseId) sharedCourseContextId = courseId;
    if (event?.type === PLANNING_COURSE_CONTEXT_EVENT) {
      planningCourseViewCourseId = event?.detail?.courseViewOpen && courseId ? courseId : 0;
    }
  }

  function applySharedCourseContext(nextTab) {
    if (nextTab === TAB_GRADES) {
      if (planningCourseViewCourseId) {
        bridgeController?.dispatchGradesNavigation?.({
          courseId: planningCourseViewCourseId,
          source: 'course-context',
        });
        return;
      }
      if (Date.now() >= gradesCourseAutoSelectSuppressedUntil) {
        bridgeController?.dispatchGradesNavigation?.({
          autoSelectCourse: true,
          source: 'course-context',
        });
      }
      return;
    }
    if (nextTab === TAB_PLANNING && sharedCourseContextId) {
      bridgeController?.dispatchPlanningViewRequest?.({
        view: 'course',
        courseId: sharedCourseContextId,
        source: 'course-context',
      });
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', (event) => {
      const frame = getModuleFrameForMessage(event);
      if (!frame) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === PLANNING_VIEW_REQUEST_EVENT) {
        if (frame !== getSeatplanFrame()) return;
        const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
        if (!detail || detail.source !== 'iframe') return;
        window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, { detail }));
        return;
      }
      if (
        data.type === NAME_LEARNING_DATA_REQUEST_EVENT
        || data.type === NAME_LEARNING_REVIEW_REQUEST_EVENT
        || data.type === NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT
        || data.type === NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT
      ) {
        if (frame !== getNameLearningFrame()) return;
        window.__teachhelperWorkspaceController?.getOwner?.().recordGradeVaultActivity?.();
        document.dispatchEvent(new CustomEvent(data.type, {
          detail: data.detail && typeof data.detail === 'object' ? data.detail : {},
        }));
        return;
      }
      if (data.type === NAME_LEARNING_MANAGE_STUDENTS_REQUEST_EVENT) {
        if (frame !== getNameLearningFrame()) return;
        const courseId = Number(data.detail?.courseId || 0);
        const studentId = Number(data.detail?.studentId || 0);
        if (!courseId) return;
        suppressGradesCourseAutoSelect();
        bridgeController?.dispatchGradesNavigation?.({
          courseId,
          action: 'manage-students',
          ...(studentId ? { studentId } : {}),
          subview: 'overview',
          source: 'name-learning',
        });
        setActiveTab(TAB_GRADES);
        return;
      }
      if (data.type === THEME_PREFERENCE_CHANGE_EVENT) {
        if (frame !== getPlanningFrame() && frame !== getGradesFrame()) return;
        themeController.setPreference(data.detail?.preference);
        return;
      }
      if (data.type === TOAST_REQUEST_EVENT) {
        if (frame !== getPlanningFrame() && frame !== getGradesFrame()) return;
        const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
        if (!detail || detail.source !== 'iframe') return;
        const message = String(detail.message || '').trim();
        if (!message) return;
        const variant = detail.variant === 'error' ? 'error' : 'success';
        showMessage(message, variant, { presentation: 'toast' });
        return;
      }
      if (data.type === MORE_TOOLS_DISMISS_EVENT) {
        shellController?.closeMoreToolsMenu();
        return;
      }
      if (data.type === MODULE_OPEN_EXTERNAL_REQUEST_EVENT) {
        if (frame !== getQrFrame()) return;
        openExternalUrlForModule(data.detail?.url);
        return;
      }
      if (data.type === MERGER_OPEN_RESULT_REQUEST_EVENT) {
        if (frame !== getMergerFrame()) return;
        openModuleResultPdf(data.detail);
        return;
      }
      if (data.type === GRADES_NAVIGATE_EVENT) {
        if (frame !== getPlanningFrame()) return;
        const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
        suppressGradesCourseAutoSelect();
        bridgeController?.dispatchGradesNavigation?.(detail);
        return;
      }
      if (data.type === GRADES_GRADE_VAULT_ACTIVITY_EVENT) {
        if (frame !== getGradesFrame()) return;
        window.__teachhelperWorkspaceController?.getOwner?.().recordGradeVaultActivity?.();
        return;
      }
      if (data.type === GRADES_GRADE_VAULT_REQUEST_EVENT) {
        if (frame !== getGradesFrame()) return;
        bridgeController?.requestGradeVault?.(
          data.detail && typeof data.detail === 'object' ? data.detail : {}
        );
        return;
      }
      if (data.type === SIDEBAR_WIDTH_REQUEST_EVENT) {
        const requestedScope = data.detail?.scope === SIDEBAR_WIDTH_SCOPE_PLANNING
          ? SIDEBAR_WIDTH_SCOPE_PLANNING
          : SIDEBAR_WIDTH_SCOPE_OTHER;
        const expectedScope = frame === getPlanningFrame() || frame === getGradesFrame()
          ? SIDEBAR_WIDTH_SCOPE_PLANNING
          : SIDEBAR_WIDTH_SCOPE_OTHER;
        if (requestedScope !== expectedScope) return;
        postToModule(frame, {
          type: SIDEBAR_WIDTH_SYNC_EVENT,
          detail: {
            scope: requestedScope,
            width: shellController?.getSidebarWidth(requestedScope)
              ?? (requestedScope === SIDEBAR_WIDTH_SCOPE_PLANNING ? 220 : 360),
          },
        });
        return;
      }
      if (data.type === SIDEBAR_WIDTH_COMMIT_EVENT) {
        const requestedScope = data.detail?.scope === SIDEBAR_WIDTH_SCOPE_PLANNING
          ? SIDEBAR_WIDTH_SCOPE_PLANNING
          : SIDEBAR_WIDTH_SCOPE_OTHER;
        const expectedScope = frame === getPlanningFrame() || frame === getGradesFrame()
          ? SIDEBAR_WIDTH_SCOPE_PLANNING
          : SIDEBAR_WIDTH_SCOPE_OTHER;
        if (requestedScope !== expectedScope) return;
        shellController?.setSidebarWidth(requestedScope, data.detail?.width);
        return;
      }
      if (data.type === SIDEBAR_COLLAPSE_REQUEST_EVENT) {
        const requestedScope = data.detail?.scope === SIDEBAR_WIDTH_SCOPE_PLANNING
          ? SIDEBAR_WIDTH_SCOPE_PLANNING
          : SIDEBAR_WIDTH_SCOPE_OTHER;
        if (requestedScope !== getSidebarWidthScopeForTab(getActiveTab())) return;
        setChromeCollapsed(true);
        return;
      }
      if (data.type === SEATPLAN_CHROME_REQUEST_EVENT) {
        if (frame !== getSeatplanFrame()) return;
        const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
        if (!detail || detail.source !== 'iframe') return;
        const collapsed = detail.collapsed === true;
        if (collapsed && getActiveTab() !== TAB_SEATPLAN) return;
        requestSeatplanChromeCollapsed(collapsed);
        return;
      }
      if (data.type === TUTORIAL_ENTRY_HINT_SYNC_EVENT) {
        if (data.detail?.action === 'seen') {
          markTutorialEntryHintSeen();
          firstRunTutorial?.clearContextHelpPrompt?.();
          syncTutorialEntryHintToModules();
          return;
        }
        if (data.detail?.action === 'request') {
          postToModule(frame, {
            type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
            detail: { seen: hasTutorialEntryHintBeenSeen() },
          });
        }
        return;
      }
      if (data.type !== 'classroom:help-entry-request') return;
      openHelpEntry();
    });
    window.addEventListener(PLANNING_VIEW_REQUEST_EVENT, (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object' || detail.source !== 'iframe') {
        return;
      }
      if (detail.view === 'grades') {
        suppressGradesCourseAutoSelect();
        bridgeController?.dispatchGradesNavigation?.(detail);
        setActiveTab(TAB_GRADES);
        return;
      }
      setActiveTab(TAB_PLANNING);
      if (detail.returnNotice) {
        showMessage(String(detail.returnNotice), 'success', { presentation: 'toast' });
      }
    });
    window.addEventListener(GRADES_VIEW_REQUEST_EVENT, (event) => {
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
        suppressGradesCourseAutoSelect();
      }
      setActiveTab(detail.view === 'planning' ? TAB_PLANNING : TAB_GRADES);
    });
    window.addEventListener(PLANNING_TUTORIAL_START_REQUEST_EVENT, openHelpEntry);
    const openCourseSeatplan = (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object') {
        return;
      }
      pendingCourseSeatplanContext = detail;
      bridgeController?.ensureTabInitialized(TAB_SEATPLAN);
      if (getActiveTab() === TAB_SEATPLAN) {
        schedulePendingCourseSeatplanContext();
        return;
      }
      setActiveTab(TAB_SEATPLAN);
    };
    window.addEventListener(PLANNING_COURSE_SEATPLAN_OPEN_EVENT, openCourseSeatplan);
    window.addEventListener(GRADES_COURSE_SEATPLAN_OPEN_EVENT, openCourseSeatplan);
    window.addEventListener(PLANNING_COURSE_CONTEXT_EVENT, rememberSharedCourseContext);
    window.addEventListener(GRADES_COURSE_CONTEXT_EVENT, rememberSharedCourseContext);
  }

  function stripJsonWarning(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trimStart();
  }

  let state = {
    students: [],
    headers: [],
    delim: ',',
    csvName: '',
    lastDirectoryHandle: null,
    performanceFlairCount: 4,
    randomPickerAutoDisableSelected: false,
  };
  const realClassroomState = state;
  let classroomTutorialDemoActive = false;
  function activateClassroomTutorialDemo(tab) {
    if (classroomTutorialDemoActive) {
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
    const previousRosterState = SharedRosterStore.getState();
    const previousGroupsState = groupsController?.getStateSnapshot();
    const fileInputWasDisabled = Boolean(els.file?.disabled);
    classroomTutorialDemoActive = true;
    if (els.file) els.file.disabled = true;
    state = {
      ...realClassroomState,
      students: demoStudents,
      headers: ['Nachname', 'Vorname'],
      csvName: 'Beispielklasse',
      performanceFlairCount: 4,
    };
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
      if (!classroomTutorialDemoActive) return;
      if (groupsController?.isSuggesting() || randomPickerController?.isSpinning()) {
        window.setTimeout(cleanup, 120);
        return;
      }
      SharedRosterStore.replace(previousRosterState);
      classroomTutorialDemoActive = false;
      state = realClassroomState;
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
  let randomPickerController = null;
  let lastRosterImportedAt = 0;

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
            ? student.buddies.map(v => String(v)).filter(Boolean)
            : [],
          foes: Array.isArray(student.foes)
            ? student.foes.map(v => String(v)).filter(Boolean)
            : [],
          randomWeight: normalizeRandomPickerWeight(student.randomWeight),
        };
      })
      .filter(Boolean);
  };

  const SharedTimerStore = createSharedTimerStore();
  const SharedRosterStore = createSharedRosterStore({
    documentBus: document,
    initialDetail: {
      source: STUDENTS_SYNC_SOURCE_GROUPS,
      students: cloneStudentsForSync(state.students),
      performanceFlairCount: state.performanceFlairCount,
      csvName: state.csvName,
      headers: state.headers,
      delim: state.delim,
      importedAt: Date.now(),
    },
  });
  const syncSharedRosterState = (source = STUDENTS_SYNC_SOURCE_GROUPS, importedAt = Date.now()) => {
    if (classroomTutorialDemoActive) return SharedRosterStore.getState();
    const detail = {
      ...SharedRosterStore.getState(),
      source,
      students: cloneStudentsForSync(state.students),
      performanceFlairCount: state.performanceFlairCount,
      csvName: state.csvName || '',
      headers: Array.isArray(state.headers) ? state.headers.slice() : [],
      delim: state.delim,
      importedAt,
    };
    return SharedRosterStore.dispatch(detail);
  };
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
    rosterStore: SharedRosterStore,
    documentBus: document,
  });
  SharedRosterStore.subscribe((detail) => {
    if (classroomTutorialDemoActive) return;
    if (!detail || typeof detail !== 'object') return;
    gradeRosterSelectedCourseId = detail.source === STUDENTS_SYNC_SOURCE_GRADES
      ? Number(detail.gradeCourseId || 0)
      : 0;
    gradeRosterSelectedCourseName = detail.source === STUDENTS_SYNC_SOURCE_GRADES
      ? String(detail.gradeCourseName || '').trim()
      : '';
    const importedAt = Number(detail.importedAt);
    if (Number.isFinite(importedAt) && importedAt <= lastRosterImportedAt) return;
    lastRosterImportedAt = Number.isFinite(importedAt) ? importedAt : Date.now();
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
      state.csvName = rawLabel ? sanitizeExportFileName(rawLabel) : '';
      updateCsvStatusDisplay();
    }
    workPhaseController?.reset();
    groupsController?.handleRosterReplacement();
    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    renderRandomPicker();
    renderGradeRosterPills();
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
      applySharedCourseContext(tab);
      if (tab === TAB_SEATPLAN) {
        schedulePendingCourseSeatplanContext();
      }
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
      state.performanceFlairCount
    );
    return student;
  }
  function renderRandomPicker() {
    randomPickerController?.render();
  }
  function isRandomPickerTabActive() {
    return getActiveTab() === TAB_RANDOM_PICKER;
  }
  function createPlanSnapshot() {
    const groupsPlanState = groupsController?.getPlanState();
    if (!groupsPlanState) return null;
    const workPhasePlanState = workPhaseController?.getPlanState() || {
      workOrder: '',
      workOrderDurationMinutes: null,
      workOrderStartISO: null,
    };
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      grid: groupsPlanState.grid,
      activeSeats: groupsPlanState.activeSeats,
      lockedSeats: groupsPlanState.lockedSeats,
      seats: groupsPlanState.seats,
      seatTopics: groupsPlanState.seatTopics,
      ...workPhasePlanState,
      students: state.students,
      performanceFlairCount: groupsPlanState.performanceFlairCount,
      randomPickerAutoDisableSelected: normalizeRandomPickerAutoDisableSelected(
        state.randomPickerAutoDisableSelected
      ),
      headers: state.headers,
      delim: state.delim,
      csvName: state.csvName || '',
      minGroupSize: groupsPlanState.minGroupSize,
      maxGroupSize: groupsPlanState.maxGroupSize,
    };
  }

  function getDefaultPlanModeLabel() {
    return getActiveTab() === TAB_RANDOM_PICKER ? 'Picker' : 'Gruppen';
  }

  function sanitizeExportFileName(name) {
    const raw = typeof name === 'string' ? name : '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    return trimmed.replace(/[\\/:*?"<>|]/g, '-');
  }

  function getDefaultPlanBaseName() {
    const modeLabel = getDefaultPlanModeLabel();
    return state.csvName ? `${state.csvName} (${modeLabel})` : modeLabel;
  }

  function getSuggestedPlanFileName() {
    return sanitizeExportFileName(getDefaultPlanBaseName());
  }

  function ensureJsonFilename(name) {
    const normalized = (typeof name === 'string' ? name : '').trim() || getDefaultPlanModeLabel();
    return normalized.toLowerCase().endsWith('.json') ? normalized : `${normalized}.json`;
  }

  async function savePlanWithPicker(blob, filename) {
    const finalName = ensureJsonFilename(filename);
    const canUsePicker = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
    if (!canUsePicker) return 'fallback';
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: finalName,
        startIn: state.lastDirectoryHandle || 'downloads',
        types: [{
          description: `${getDefaultPlanModeLabel()} JSON`,
          accept: { 'application/json': ['.json'] }
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      state.lastDirectoryHandle = handle || state.lastDirectoryHandle;
      return 'saved';
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return 'aborted';
      }
      console.warn('Fallback auf Download, Speichern via Picker fehlgeschlagen:', err);
      return 'fallback';
    }
  }

  function triggerBlobDownload(blob, filename, options = {}) {
    const {
      defaultName = 'download',
      forceJsonExtension = false,
      iosDelay = 4000,
      defaultDelay = 1200,
      onErrorMessage = null,
    } = options;
    const normalizedName = (typeof filename === 'string' ? filename : '').trim() || defaultName;
    const finalName = forceJsonExtension ? ensureJsonFilename(normalizedName) : normalizedName;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalName;
    link.rel = 'noopener';
    link.style.display = 'none';
    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(link);
    }
    try {
      if (typeof link.click === 'function') {
        link.click();
      } else {
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        link.dispatchEvent(evt);
      }
    } catch (err) {
      if (onErrorMessage) {
        console.warn(onErrorMessage, err);
      } else {
        console.warn('Download konnte nicht gestartet werden:', err);
      }
    }
    const cleanup = () => {
      if (link.parentNode) {
        link.remove();
      }
      URL.revokeObjectURL(url);
    };
    const delay = isIOSDevice ? iosDelay : defaultDelay;
    setTimeout(cleanup, delay);
  }

  function triggerPlanDownload(blob, filename) {
    triggerBlobDownload(blob, filename, {
      defaultName: getDefaultPlanModeLabel(),
      forceJsonExtension: true,
      iosDelay: 4000,
      defaultDelay: 1200,
    });
  }

  function downloadCsvTemplate() {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Downloads sind für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const blob = new Blob([TEMPLATE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, TEMPLATE_CSV_NAME, {
      defaultName: TEMPLATE_CSV_NAME,
      forceJsonExtension: false,
      iosDelay: 6000,
      defaultDelay: 2500,
      onErrorMessage: 'CSV-Download konnte nicht gestartet werden:',
    });
  }

  async function downloadSeatPlan() {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Speichern und Exportieren ist für Beispieldaten deaktiviert.', 'info', { presentation: 'toast' });
      return;
    }
    const snapshot = createPlanSnapshot();
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
    const prettyJson = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([prettyJson], { type: 'application/json' });
    const saveStatus = await savePlanWithPicker(blob, safeName);
    if (saveStatus === 'aborted') {
      return;
    }
    if (saveStatus === 'fallback') {
      triggerPlanDownload(blob, safeName);
    }
    showMessage('Man kann die Gruppen NICHT durch Anklicken der eben erstellten Datenbankdatei öffnen.\n\nStattdessen muss man die Datenbankdatei hier in TeachHelper über „Gruppen laden“ auswählen oder sie irgendwo in TeachHelper ziehen.', 'info');
  }

  function applyPlanData(data, options = {}) {
    const restoreSeatAssignments = options.restoreSeatAssignments !== false;
    if (!data || typeof data !== 'object') throw new Error('Ungültiges Plan-Format.');
    const incomingStudents = Array.isArray(data.students) ? data.students : [];
    const incomingCsvName = typeof data.csvName === 'string' ? data.csvName : '';
    state.performanceFlairCount = clampPerformanceFlairCount(data.performanceFlairCount, 4);
    state.randomPickerAutoDisableSelected = normalizeRandomPickerAutoDisableSelected(
      data.randomPickerAutoDisableSelected
    );
    state.students = incomingStudents.map(student => sanitizeRandomPickerStudent(student));
    state.headers = Array.isArray(data.headers) ? data.headers : [];
    state.delim = typeof data.delim === 'string' ? data.delim : ',';
    const normalizedCsvName = String(incomingCsvName || '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-');
    state.csvName = normalizedCsvName || state.csvName || '';
    groupsController?.restorePlanState(data, { restoreSeatAssignments });
    workPhaseController?.restorePlanState(data);
    if (!restoreSeatAssignments) {
      els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    }
    renderRandomPicker();
  }

  async function importPlanFromFile(file, handle) {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    assertFileSizeAtMost(file, FILE_LIMITS.JSON_BYTES, 'JSON-Datei');
    const planLabelFromFile = sanitizeExportFileName(stripFileExtension(file.name || ''));
    const rawText = await file.text();
    const text = stripJsonWarning(rawText);
    assertJsonNestingAtMost(text);
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('Datei ist kein gültiges JSON.');
    }
    if (handle) {
      state.lastDirectoryHandle = handle;
    }
    applyPlanData(data, { restoreSeatAssignments: true });
    const importedLabel = typeof data?.csvName === 'string' ? data.csvName.trim() : '';
    if (!importedLabel) {
      state.csvName = planLabelFromFile || state.csvName;
    }
  }

  function detectDelimiter(s) {
    const candidates = [';', ',', '\t'];
    const lines = String(s || '')
      .split(/\r?\n/)
      .map(line => String(line || ''))
      .filter(line => line.trim() && !/^sep\s*=/.test(line.trim().toLowerCase()))
      .slice(0, 8);
    let best = ';';
    let bestScore = -1;
    candidates.forEach((candidate) => {
      const pattern = candidate === '\t' ? /\t/g : new RegExp(`\\${candidate}`, 'g');
      const score = lines.reduce((sum, line) => sum + ((line.match(pattern) || []).length), 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best;
  }
  function parseCSV(text) {
    const delim = detectDelimiter(text); state.delim = delim;
    const maxRows = FILE_LIMITS.CSV_MAX_ROWS;
    const maxColumns = FILE_LIMITS.CSV_MAX_COLUMNS;
    const maxCellChars = FILE_LIMITS.CSV_MAX_CELL_CHARS;
    const rows = [];
    let i = 0, cur = '', inQ = false; const out = [];
    const push = () => {
      if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
      if (out.length >= maxColumns) throw new Error(`CSV enthält zu viele Spalten: maximal ${maxColumns}.`);
      out.push(cur);
      cur = '';
    };
    const flush = () => {
      if (rows.length >= maxRows) throw new Error(`CSV enthält zu viele Zeilen: maximal ${maxRows}.`);
      rows.push(out.slice());
      out.length = 0;
    };
    while (i < text.length) {
      const ch = text[i++];
      if (ch === '"') {
        if (inQ && text[i] == '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) { push(); }
      else if ((ch === '\n') && !inQ) { push(); flush(); }
      else if ((ch === '\r') && !inQ) { }
      else {
        cur += ch;
        if (cur.length > maxCellChars) throw new Error(`CSV-Zelle ist zu lang: maximal ${maxCellChars} Zeichen.`);
      }
    }
    if (cur.length > 0 || out.length > 0) { push(); flush(); }
    return rows;
  }

  function normalizeCsvCell(value) {
    return String(value ?? '')
      .replace(/\uFEFF/g, '')
      .trim();
  }

  function normalizeCsvHeader(value) {
    return normalizeCsvCell(value).toLocaleLowerCase('de');
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

  function dataTransferHasFiles(dt) {
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    const types = dt.types;
    if (!types) return false;
    if (typeof types.includes === 'function') return types.includes('Files');
    if (typeof types.contains === 'function') return types.contains('Files');
    return Array.from(types).includes('Files');
  }

  function isCsvFile(file) {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return name.endsWith('.csv')
      || type.includes('text/csv')
      || type.includes('application/csv')
      || type.includes('application/vnd.ms-excel');
  }

  function isJsonFile(file) {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return name.endsWith('.json')
      || type.includes('application/json')
      || type.includes('text/json');
  }

  function stripFileExtension(name) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    const idx = raw.lastIndexOf('.');
    if (idx <= 0) return raw;
    return raw.slice(0, idx);
  }

  function updateCsvStatusDisplay() {
    if (!els.csvStatus) return;
    const label = String(state.csvName || '').trim();
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
  window.addEventListener(GRADES_GRADE_VAULT_OVERLAY_EVENT, (event) => {
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
          window.clearTimeout(gradeVaultOverlayRestoreTimer);
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
        window.clearTimeout(gradeVaultOverlayRestoreTimer);
      }
      gradeVaultOverlayRestoreTimer = window.setTimeout(() => {
        gradeVaultOverlayRestoreTimer = 0;
        restoreSourceTab();
      }, 360);
    }
    if (!isOpen) {
      gradeVaultOverlayPreservesSourceTab = false;
    }
  });

  let gradeRosterRequestSequence = 0;
  let pendingGradeRosterCoursesRequestId = '';
  let pendingGradeRosterImportRequestId = '';
  let gradeRosterCourses = [];
  let gradeRosterCoursesState = 'idle';
  let gradeRosterHasAvailableCourses = true;
  let gradeRosterSelectedCourseId = 0;
  let gradeRosterSelectedCourseName = '';
  let gradePickerBinding = null;
  let gradePickerSaveSequence = 0;
  const pendingGradePickerSaveRequestIds = new Set();
  const createGradeRosterRequestId = () => `shell-grade-roster-${Date.now()}-${++gradeRosterRequestSequence}`;
  const closeGradeRosterImportMenu = () => {
    if (!els.gradeRosterImportMenu) return;
    els.gradeRosterImportMenu.hidden = true;
    els.gradeRosterImportMenu.replaceChildren();
    els.gradeRosterImportTrigger?.setAttribute('aria-expanded', 'false');
  };
  const showGradeRosterImportMessage = (message) => {
    if (!els.gradeRosterImportMenu) return;
    els.gradeRosterImportMenu.replaceChildren();
    const row = document.createElement('div');
    row.className = 'grade-roster-import-message';
    row.textContent = message;
    els.gradeRosterImportMenu.append(row);
  };
  const getGradeRosterPillTextColor = () => '#000000';
  const requestGradeRosterCourses = ({ interactive = false, unlock = false } = {}) => {
    if (!interactive && pendingGradeRosterCoursesRequestId) return;
    const requestId = createGradeRosterRequestId();
    pendingGradeRosterCoursesRequestId = requestId;
    if (interactive) {
      gradeRosterCoursesState = 'loading';
      renderGradeRosterPills();
    }
    bridgeController?.requestGradeRosterCourses?.({
      requestId,
      returnTab: getActiveTab(),
      interactive,
      unlock,
      restoreTabAfterUnlock: true,
    });
  };
  const importGradeRosterCourse = (courseId) => {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Importe aus dem Notenmodul verändern die Beispieldaten nicht.', 'info');
      return;
    }
    const requestId = createGradeRosterRequestId();
    pendingGradeRosterImportRequestId = requestId;
    bridgeController?.requestGradeRosterImport?.({
      requestId,
      courseId: Number(courseId || 0),
      mode: isRandomPickerTabActive() ? 'picker' : 'roster',
      returnTab: getActiveTab(),
    });
  };
  const updateGradePickerBindingUi = () => {
    const bound = Boolean(gradePickerBinding);
    if (els.randomPickerCourseResetRow) els.randomPickerCourseResetRow.hidden = !bound;
    if (els.randomPickerCourseReset) {
      els.randomPickerCourseReset.title = bound
        ? `Kursbindung zu „${gradePickerBinding.courseName}“ lösen`
        : 'Kursbindung lösen';
    }
  };
  const getGradePickerConfig = () => {
    if (!gradePickerBinding) return null;
    return {
      weightsByStudentId: Object.fromEntries(gradePickerBinding.students.map((student) => [
        String(student.id),
        normalizeRandomPickerWeight(student.randomWeight),
      ])),
      autoDisableSelected: Boolean(gradePickerBinding.autoDisableSelected),
    };
  };
  const saveGradePickerConfig = () => {
    const binding = gradePickerBinding;
    const config = getGradePickerConfig();
    if (!binding || !config) return;
    const requestId = `shell-grade-picker-${Date.now()}-${++gradePickerSaveSequence}`;
    pendingGradePickerSaveRequestIds.add(requestId);
    bridgeController?.requestGradePickerConfigSave?.({
      requestId,
      courseId: binding.courseId,
      rosterToken: binding.rosterToken,
      config,
    });
  };
  const syncGradeRosterImportHeight = () => {
    els.gradeRosterPills?.parentElement?.style.removeProperty('height');
  };
  const setGradeRosterImportSurfaceVisible = (visible) => {
    const pills = els.gradeRosterPills;
    const surface = pills?.parentElement;
    const row = pills?.closest('.roster-import-row');
    if (surface) surface.hidden = !visible;
    row?.classList.toggle('grade-roster-import-unavailable', !visible);
  };
  const setGradeRosterImportColumns = (coursePercent = 50) => {
    const row = els.gradeRosterPills?.closest('.roster-import-row');
    if (!row) return;
    const normalizedCoursePercent = Math.max(50, Math.min(200 / 3, Number(coursePercent) || 50));
    row.style.setProperty('--grade-roster-csv-column', `${100 - normalizedCoursePercent}fr`);
    row.style.setProperty('--grade-roster-course-column', `${normalizedCoursePercent}fr`);
  };
  const getGradeRosterPillRowCount = () => {
    const pills = els.gradeRosterPills;
    if (!pills?.children.length) return 0;
    return new Set([...pills.children].map((pill) => Math.round(pill.offsetTop))).size;
  };
  const fitGradeRosterImportColumns = () => {
    const pills = els.gradeRosterPills;
    if (!pills || pills.clientWidth < 1 || pills.clientHeight < 1) return;
    if (window.matchMedia?.('(max-width: 420px)').matches) {
      setGradeRosterImportColumns(50);
      return;
    }
    const candidates = [...Array.from({ length: 17 }, (_, index) => 50 + index), 200 / 3];
    let bestPercent = 50;
    setGradeRosterImportColumns(bestPercent);
    let bestRows = getGradeRosterPillRowCount();
    for (const coursePercent of candidates.slice(1)) {
      setGradeRosterImportColumns(coursePercent);
      const rows = getGradeRosterPillRowCount();
      if (rows < bestRows) {
        bestRows = rows;
        bestPercent = coursePercent;
      }
    }
    setGradeRosterImportColumns(bestPercent);
  };
  const renderGradeRosterPills = () => {
    const pills = els.gradeRosterPills;
    const trigger = els.gradeRosterImportTrigger;
    if (!pills || !trigger) return;
    const hasNoAvailableCourses = gradeRosterCoursesState === 'ready'
      && !gradeRosterHasAvailableCourses;
    setGradeRosterImportSurfaceVisible(!hasNoAvailableCourses);
    if (hasNoAvailableCourses) {
      pills.replaceChildren();
      pills.hidden = true;
      trigger.hidden = true;
      closeGradeRosterImportMenu();
      setGradeRosterImportColumns(50);
      return;
    }
    syncGradeRosterImportHeight();
    pills.replaceChildren();
    trigger.hidden = true;
    if (gradeRosterCoursesState === 'loading') {
      setGradeRosterImportColumns(50);
      const loading = document.createElement('span');
      loading.className = 'grade-roster-pills-loading';
      loading.textContent = 'Notenkurse werden geladen …';
      pills.append(loading);
      pills.hidden = false;
      return;
    }
    if (gradeRosterCoursesState !== 'ready' || !gradeRosterCourses.length) {
      setGradeRosterImportColumns(50);
      pills.hidden = true;
      trigger.hidden = false;
      return;
    }
    gradeRosterCourses.forEach((course) => {
      const button = document.createElement('button');
      const color = String(course?.color || '#475569');
      button.type = 'button';
      button.className = 'grade-roster-pill';
      button.textContent = String(course?.name || 'Kurs');
      button.style.background = color;
      button.style.color = getGradeRosterPillTextColor(color);
      const courseName = String(course?.name || '').trim();
      const isSelected = (isRandomPickerTabActive() && gradePickerBinding
        ? Number(course?.id || 0) === gradePickerBinding.courseId
        : Number(course?.id || 0) === gradeRosterSelectedCourseId)
        || (gradeRosterSelectedCourseName && courseName === gradeRosterSelectedCourseName)
        || state.csvName === `${courseName} (Notenmodul)`;
      button.classList.toggle('is-imported', isSelected);
      if (isSelected) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => importGradeRosterCourse(course?.id));
      pills.append(button);
    });
    pills.hidden = false;
    if (pills.clientWidth < 1 || pills.clientHeight < 1) {
      return;
    }
    fitGradeRosterImportColumns();
    if (pills.scrollHeight > pills.clientHeight + 1 || pills.scrollWidth > pills.clientWidth + 1) {
      pills.hidden = true;
      trigger.hidden = false;
    }
  };
  const renderGradeRosterImportCourses = (courses) => {
    if (!els.gradeRosterImportMenu) return;
    els.gradeRosterImportMenu.replaceChildren();
    if (!Array.isArray(courses) || courses.length === 0) {
      showGradeRosterImportMessage('Keine Notenkurse mit Lernenden vorhanden.');
      return;
    }
    courses.forEach((course) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = String(course?.name || 'Kurs');
      button.addEventListener('click', () => {
        showGradeRosterImportMessage('Namensliste wird importiert …');
        importGradeRosterCourse(course?.id);
      });
      els.gradeRosterImportMenu.append(button);
    });
  };

  els.gradeRosterImportTrigger?.addEventListener('click', () => {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Importe aus dem Notenmodul verändern die Beispieldaten nicht.', 'info');
      return;
    }
    if (!els.gradeRosterImportMenu) return;
    if (!els.gradeRosterImportMenu.hidden) {
      closeGradeRosterImportMenu();
      return;
    }
    els.gradeRosterImportMenu.hidden = false;
    els.gradeRosterImportTrigger.setAttribute('aria-expanded', 'true');
    if (gradeRosterCoursesState === 'ready' && gradeRosterCourses.length) {
      renderGradeRosterImportCourses(gradeRosterCourses);
      return;
    }
    showGradeRosterImportMessage('Notenkurse werden geladen …');
    requestGradeRosterCourses({ interactive: true });
  });

  document.addEventListener(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || String(detail.requestId || '') !== pendingGradeRosterCoursesRequestId) return;
    pendingGradeRosterCoursesRequestId = '';
    if (detail.locked) {
      gradeRosterCourses = Array.isArray(detail.courses) ? detail.courses : [];
      gradeRosterHasAvailableCourses = detail.hasCourses !== false;
      gradeRosterCoursesState = 'ready';
      closeGradeRosterImportMenu();
      renderGradeRosterPills();
      return;
    }
    if (!detail.ok) {
      if (detail.unlockRequired || detail.unlockCancelled) {
        closeGradeRosterImportMenu();
        return;
      }
      showGradeRosterImportMessage(detail.message || 'Notenkurse konnten nicht geladen werden.');
      gradeRosterCourses = [];
      gradeRosterCoursesState = 'error';
      renderGradeRosterPills();
      return;
    }
    gradeRosterCourses = Array.isArray(detail.courses) ? detail.courses : [];
    gradeRosterHasAvailableCourses = detail.hasCourses !== false;
    gradeRosterCoursesState = 'ready';
    closeGradeRosterImportMenu();
    renderGradeRosterPills();
  });

  document.addEventListener(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || String(detail.requestId || '') !== pendingGradeRosterImportRequestId) return;
    pendingGradeRosterImportRequestId = '';
    if (!detail.ok) {
      if (detail.unlockRequired || detail.unlockCancelled) {
        closeGradeRosterImportMenu();
        return;
      }
      const message = detail.message || 'Namensliste konnte nicht importiert werden.';
      if (els.gradeRosterImportMenu?.hidden) {
        showMessage(message, 'warn');
      } else {
        showGradeRosterImportMessage(message);
      }
      requestGradeRosterCourses();
      return;
    }
    if (detail.mode === 'picker') {
      const storedConfig = detail.pickerConfig && typeof detail.pickerConfig === 'object'
        ? detail.pickerConfig
        : {};
      const storedWeights = storedConfig.weightsByStudentId && typeof storedConfig.weightsByStudentId === 'object'
        ? storedConfig.weightsByStudentId
        : {};
      gradePickerBinding = {
        courseId: Number(detail.courseId || 0),
        courseName: String(detail.courseName || '').trim(),
        rosterToken: String(detail.rosterToken || ''),
        autoDisableSelected: storedConfig.autoDisableSelected === true,
        students: (Array.isArray(detail.students) ? detail.students : []).map((student) => ({
          ...student,
          randomWeight: normalizeRandomPickerWeight(storedWeights[String(student?.id || '')]),
        })),
      };
      updateGradePickerBindingUi();
      randomPickerController?.render();
    } else {
      gradeRosterSelectedCourseId = Number(detail.courseId || 0);
      gradeRosterSelectedCourseName = String(detail.courseName || '').trim();
    }
    renderGradeRosterPills();
    closeGradeRosterImportMenu();
    showMessage(detail.mode === 'picker'
      ? `Picker mit „${detail.courseName}“ verbunden.`
      : `${Number(detail.students?.length || 0)} Lernende aus „${detail.courseName}“ importiert.`, 'success', { presentation: 'toast' });
    requestGradeRosterCourses();
  });

  const restoreGradeRosterReturnTab = (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail?.restoreTabAfterUnlock) return;
    const returnTab = String(detail.returnTab || '');
    if (![TAB_GROUPS, TAB_RANDOM_PICKER, TAB_SEATPLAN].includes(returnTab)) return;
    setActiveTab(returnTab);
  };
  document.addEventListener(GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, restoreGradeRosterReturnTab);
  document.addEventListener(GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, restoreGradeRosterReturnTab);
  document.addEventListener(GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || !pendingGradePickerSaveRequestIds.delete(String(detail.requestId || ''))) return;
    if (detail.ok || detail.unlockRequired || detail.unlockCancelled) return;
    showMessage(detail.message || 'Picker-Konfiguration konnte nicht gespeichert werden.', 'warn');
  });

  if (typeof ResizeObserver === 'function' && els.csvDropZone) {
    const observer = new ResizeObserver(() => renderGradeRosterPills());
    observer.observe(els.csvDropZone);
  }
  requestGradeRosterCourses();

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && !event.target.closest('.grade-roster-import')) {
      closeGradeRosterImportMenu();
    }
  });

  async function importCsvFromFile(file) {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    if (!file) return;
    assertFileSizeAtMost(file, FILE_LIMITS.CSV_BYTES, 'CSV-Datei');
    const guessedLabel = sanitizeExportFileName(stripFileExtension(file.name));
    state.csvName = guessedLabel || state.csvName;
    updateCsvStatusDisplay();
    const text = await file.text();
    let rows = parseCSV(text);
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
    state.headers = headers;
    state.performanceFlairCount = 4;
    state.students = readStudents(dataRows, headers);
    workPhaseController?.reset();
    groupsController?.handleRosterReplacement({ rebuildCapacity: true });

    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    renderRandomPicker();
    syncSharedRosterState(STUDENTS_SYNC_SOURCE_GROUPS);
    const importedCount = state.students.length;
    const importedLabel = importedCount === 1 ? 'Name' : 'Namen';
    showMessage(`${importedCount} ${importedLabel} importiert.`, 'success', { presentation: 'toast' });
  }

  async function pickPlanFileWithPicker() {
    const canPick = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
    if (!canPick) return { supported: false };
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        startIn: state.lastDirectoryHandle || 'downloads',
        types: [{
          description: 'Gruppen JSON',
          accept: { 'application/json': ['.json'] }
        }],
        excludeAcceptAllOption: true,
      });
      if (!handle) return { supported: true, aborted: true };
      const file = await handle.getFile();
      if (!file) return { supported: true, aborted: true };
      return { supported: true, file, handle };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { supported: true, aborted: true };
      }
      console.warn('showOpenFilePicker fehlgeschlagen, fallback auf klassische Datei-Auswahl', err);
      return { supported: true, aborted: true };
    }
  }

  async function handlePlanImportAction() {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info', { presentation: 'toast' });
      return;
    }
    const picked = await pickPlanFileWithPicker();
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

  els.templateLink?.addEventListener('click', (e) => {
    e.preventDefault();
    downloadCsvTemplate();
  });

  els.file.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      state.csvName = '';
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
    els.csvDropZone.addEventListener('dragenter', (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      csvDragDepth += 1;
      els.csvDropZone.classList.add('drag-over-file');
    });
    els.csvDropZone.addEventListener('dragover', (e) => {
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      els.csvDropZone.classList.add('drag-over-file');
    });
    els.csvDropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      csvDragDepth = Math.max(0, csvDragDepth - 1);
      if (csvDragDepth === 0) {
        els.csvDropZone.classList.remove('drag-over-file');
      }
    });
    els.csvDropZone.addEventListener('drop', async (e) => {
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
    document.addEventListener('drop', clearCsvDragState);
    document.addEventListener('dragend', clearCsvDragState);
  }

  document.addEventListener('dragover', (e) => {
    if (!dataTransferHasFiles(e.dataTransfer)) return;
    if (isEventInsideCsvDropZone(e)) return;
    if (isEventInsideMergerDropZone(e)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  document.addEventListener('drop', async (e) => {
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
    getStudents: () => state.students,
    getPerformanceFlairCount: () => state.performanceFlairCount,
    setPerformanceFlairCount: (value) => {
      state.performanceFlairCount = value;
    },
    displayStudentName: displayName,
    formatStudentLabel,
    isGroupsActive: () => getActiveTab() === TAB_GROUPS,
    isRandomPickerActive: isRandomPickerTabActive,
    isTutorialDemoActive: () => classroomTutorialDemoActive,
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

  randomPickerController = mountRandomPicker({
    doc: document,
    getStudents: () => gradePickerBinding?.students || state.students,
    formatStudentLabel,
    getAutoDisableSelected: () => gradePickerBinding?.autoDisableSelected ?? state.randomPickerAutoDisableSelected,
    setAutoDisableSelected: (value, { deferSave = false } = {}) => {
      if (gradePickerBinding) {
        gradePickerBinding.autoDisableSelected = value;
        if (!deferSave) saveGradePickerConfig();
      } else {
        state.randomPickerAutoDisableSelected = value;
      }
    },
    setStudentWeight: (student, weight, { deferSave = false } = {}) => {
      student.randomWeight = weight;
      if (gradePickerBinding && !deferSave) saveGradePickerConfig();
    },
    onConditionsSaved: () => saveGradePickerConfig(),
    sanitizeStudent: sanitizeRandomPickerStudent,
    showMessage,
    onImport: () => {
      void handlePlanImportAction();
    },
    onExport: () => {
      void downloadSeatPlan();
    },
  });
  els.randomPickerCourseReset?.addEventListener('click', () => {
    gradePickerBinding = null;
    updateGradePickerBindingUi();
    renderRandomPicker();
    renderGradeRosterPills();
  });

  [els.groupSeatPreferences].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      const preferenceStudents = isRandomPickerTabActive()
        ? (gradePickerBinding?.students || state.students)
        : state.students;
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
        else { setTimeout(focusDialog, 0); }
      }
    });
  });
  els.preferencesForm?.addEventListener('submit', e => {
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
  els.preferencesReset?.addEventListener('click', () => {
    if (!isRandomPickerTabActive()) return;
    randomPickerController?.resetConditions();
  });
  els.preferencesTableBody?.addEventListener('change', e => {
    if (randomPickerController?.handleConditionsChange(e)) return;
    groupsController?.handlePreferencesChange(e);
  });
  els.preferencesPerformanceSummary?.addEventListener('change', (event) => {
    if (isRandomPickerTabActive()) return;
    groupsController?.handlePerformanceFlairCountChange(event);
  });
  els.preferencesCancel?.addEventListener('click', () => {
    if (els.preferencesDialog) {
      if (typeof els.preferencesDialog.close === 'function' && els.preferencesDialog.open) {
        els.preferencesDialog.close();
      }
      els.preferencesDialog.removeAttribute('open');
    }
  });
  els.preferencesDialog?.addEventListener('cancel', e => {
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

  const handleViewportChange = (options = {}) => {
    if (!options?.skipImmediateGroupRefresh && getActiveTab() === TAB_GROUPS) {
      groupsController?.refreshLayout();
    }
    workPhaseController?.refreshLayout();
    if (typeof requestAnimationFrame === 'function') {
      if (isIOSDevice) {
        requestAnimationFrame(() => {
          if (getActiveTab() === TAB_GROUPS) {
            groupsController?.refreshLayout();
          }
          workPhaseController?.refreshLayout();
        });
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (getActiveTab() === TAB_GROUPS || getActiveTab() === TAB_RANDOM_PICKER) {
            renderGradeRosterPills();
          }
        });
      });
    }
    if (getActiveTab() === TAB_GROUPS) {
      groupsController?.refreshLayout({ resetViewport: true });
    }
  }
  window.addEventListener('resize', handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
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
    els.headerVersion.addEventListener('click', () => {
      void runManualUpdateCheck();
    });
    els.headerVersion.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
        return;
      }
      event.preventDefault();
      void runManualUpdateCheck();
    });
  }
})();
