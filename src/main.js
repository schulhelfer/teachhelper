import { createAppDom } from './app/dom.js';
import { createFirstRunTutorial } from './app/first-run-tutorial.js';
import { createHelpCenter } from './app/help-center.js';
import { createPlanningSeatplanBridge } from './app/planning-seatplan-bridge.js';
import { registerServiceWorkerUpdates } from './app/pwa-updates.js';
import { createPwaInstallPrompt } from './app/pwa-install-prompt.js';
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
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from './shared/tutorial-entry-state.js';
import { FILE_LIMITS } from './shared/file-guards.js';
import { createSharedRosterStore } from './shared/roster-store.js';
import {
  STUDENTS_SYNC_SOURCE_GRADES,
  STUDENTS_SYNC_SOURCE_GROUPS,
} from './shared/student-sync-bus.js';
import { createSharedTimerStore } from './shared/timer-store.js';
import {
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_GRADE_VAULT_ACTIVITY_EVENT,
  GRADES_GRADE_VAULT_REQUEST_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  NAME_LEARNING_DATA_REQUEST_EVENT,
  NAME_LEARNING_REVIEW_REQUEST_EVENT,
  GRADES_COURSE_CONTEXT_EVENT,
  GRADES_COURSE_SEATPLAN_OPEN_EVENT,
  GRADES_NAVIGATE_EVENT,
  GRADES_TUTORIAL_START_REQUEST_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  MERGER_OPEN_RESULT_REQUEST_EVENT,
  MODULE_OPEN_EXTERNAL_REQUEST_EVENT,
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
  const { appEl, els, monitorLights } = createAppDom(document);
  if (!appEl) {
    return;
  }
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
  const monitorLightNodes = Object.values(monitorLights).filter(Boolean);
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
      if (safeVersion) {
        els.headerVersion.setAttribute('role', 'button');
        els.headerVersion.setAttribute('tabindex', '0');
        els.headerVersion.setAttribute('title', 'Auf Updates prüfen');
        els.headerVersion.setAttribute('aria-label', `Version v${safeVersion}. Auf Updates prüfen`);
      } else {
        els.headerVersion.removeAttribute('role');
        els.headerVersion.removeAttribute('tabindex');
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
    const vault = detail.snapshot.vault;
    shellController?.setPlanningGradeVaultState?.({
      ...vault,
      ready: Boolean(detail.snapshot.ready),
    });
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
      `Die Noten-Datenbank konnte nicht automatisch gesperrt werden, weil ungespeicherte Noten vorhanden sind. Bitte speichere die Noten. Nächster Sperrversuch: ${retryLabel}.`,
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
  const RANDOM_PICKER_MIN_WEIGHT = 0;
  const RANDOM_PICKER_MAX_WEIGHT = 4;
  const RANDOM_PICKER_DEFAULT_WEIGHT = 1;
  const RANDOM_PICKER_CERTAIN_WEIGHT = 4;
  const RANDOM_PICKER_SPIN_DURATION_MS = 4000;
  const TIMER_DURATION_RANGE_DEFAULT = 45;
  const TIMER_DURATION_RANGE_MAX = 180;
  let bridgeController = null;
  let shellController = null;
  const getActiveTab = () => (shellController ? shellController.getActiveTab() : shellState.activeTab);
  const isChromeCollapsed = () => (shellController ? shellController.isChromeCollapsed() : shellState.chromeCollapsed);
  const getChromeTransitionState = () => (
    shellController ? shellController.getChromeTransitionState() : shellState.chromeTransitionState
  );
  const setChromeCollapsed = (collapsed) => shellController?.setChromeCollapsed(collapsed);
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
  const MORE_TOOLS_DISMISS_EVENT = 'classroom:more-tools-dismiss';
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
  const getDuplicateCheckController = () => els.duplicateCheckHost?._duplicateCheckController || null;
  const getQrController = () => els.qrHost?._qrController || null;
  const getModuleFrameForMessage = (event) => (
    [
      getPlanningFrame(),
      getGradesFrame(),
      getMergerFrame(),
      getDuplicateCheckFrame(),
      getQrFrame(),
      getSeatplanFrame(),
      getNameLearningFrame(),
    ].find((frame) => isTrustedModuleMessage(event, frame)) || null
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
    if (buffer.byteLength > FILE_LIMITS.PDF_BYTES) return;
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
    return postToModule(frame, {
      type: PLANNING_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    });
  };
  const postGradesTutorialCommand = (command, detail = null, frame = getGradesFrame()) => {
    if (!frame) return false;
    return postToModule(frame, {
      type: GRADES_TUTORIAL_COMMAND_EVENT,
      detail: { command, detail },
    });
  };
  const preparePlanningTutorialSurface = (surface) => {
    postPlanningTutorialCommand('showSurface', { surface });
  };
  const prepareGradesTutorialSurface = (surface) => {
    postGradesTutorialCommand('showSurface', { surface });
  };
  const activatePlanningTutorialPresentation = () => {
    const frame = getPlanningFrame();
    postPlanningTutorialCommand('activate', null, frame);
    return {
      cleanup: () => {
        postPlanningTutorialCommand('cleanup', null, frame);
      },
    };
  };
  const activateGradesTutorialPresentation = () => {
    const frame = getGradesFrame();
    postGradesTutorialCommand('activate', null, frame);
    return {
      cleanup: () => {
        postGradesTutorialCommand('cleanup', null, frame);
      },
    };
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
  const openPlanningDatabaseSettingsForTutorial = () => openPlanningSettingsForTutorial('database');
  const openPlanningDayOffSettingsForTutorial = () => openPlanningSettingsForTutorial('dayoff');
  const openPlanningDisplaySettingsForTutorial = () => openPlanningSettingsForTutorial('display');
  const openPlanningLessonTimesForTutorial = () => openPlanningSettingsForTutorial('lessonTimes');
  const openPlanningWeekForTutorial = () => {
    if (planningTutorialDemoActive) {
      dispatchPlanningTutorialDemoView({ view: 'week', source: 'tutorial' });
      return;
    }
    bridgeController?.ensureTabInitialized(TAB_PLANNING);
    bridgeController?.dispatchPlanningViewRequest({
      view: 'week',
      source: 'tutorial',
    });
  };
  const openPlanningCourseForTutorial = () => {
    if (planningTutorialDemoActive) {
      dispatchPlanningTutorialDemoView({ view: 'course', source: 'tutorial' });
      return;
    }
    bridgeController?.ensureTabInitialized(TAB_PLANNING);
    bridgeController?.dispatchPlanningViewRequest({
      view: 'course',
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
  const addTutorialContinuationHint = (steps, prerequisite) => {
    const lastStep = steps[steps.length - 1];
    if (lastStep && typeof lastStep.copy === 'string') {
      lastStep.copy = `${lastStep.copy} Sobald du ${prerequisite} hast, kannst du das Tutorial über 🛟 fortsetzen.`;
    }
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
                'Schütze den Notenbereich mit einem Passwort. Ohne Passwort lassen sie sich nicht wiederherstellen.',
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
          const groupFallback = () => null;
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
                copy: 'Gruppen-Modul und Picker nutzen dieselbe Namensliste. „Liste wählen“ ersetzt sie – auch in den Gruppen.',
                target: (nodes) => nodes.randomPickerImport || nodes.csvDropZone,
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
                copy: 'Über „Liste wählen“ lädst du einen gespeicherten Pickerstand wieder ein und setzt die Runde genau dort fort.',
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

  function bindTabNavigation() {
    if (tabNavigationBound) return;
    tabNavigationBound = true;
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
      button?.addEventListener('click', () => {
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

  async function createBackupBeforeTutorialStart() {
    const workspaceOwner = window.__teachhelperWorkspaceController?.getOwner?.();
    const databaseConnected = Boolean(workspaceOwner?.hasShellDatabaseConnection?.());
    const backupDirectoryConnected = Boolean(workspaceOwner?.backupState?.directoryHandle);
    if (!databaseConnected || !backupDirectoryConnected) return true;
    try {
      const created = await workspaceOwner.createLatestWebBackup?.('tutorial', true);
      if (created) return true;
      showMessage('Vor dem Tutorial konnte kein Backup erstellt werden.', 'error');
      return false;
    } catch (error) {
      const detail = error instanceof Error && error.message
        ? ` ${error.message}`
        : '';
      showMessage(`Vor dem Tutorial konnte kein Backup erstellt werden.${detail}`, 'error');
      return false;
    }
  }

  async function createBackupBeforeUpdateReload() {
    const workspaceOwner = window.__teachhelperWorkspaceController?.getOwner?.();
    const databaseConnected = Boolean(workspaceOwner?.hasShellDatabaseConnection?.());
    const backupDirectoryConnected = Boolean(workspaceOwner?.backupState?.directoryHandle);
    if (!databaseConnected || !backupDirectoryConnected) return true;
    try {
      const created = await workspaceOwner.createLatestWebBackup?.('update', true);
      if (created) return true;
      showMessage('Vor dem Update konnte kein Backup erstellt werden.', 'error');
      return false;
    } catch (error) {
      const detail = error instanceof Error && error.message
        ? ` ${error.message}`
        : '';
      showMessage(`Vor dem Update konnte kein Backup erstellt werden.${detail}`, 'error');
      return false;
    }
  }

  async function beforeReloadForUpdate() {
    const backupCreated = await createBackupBeforeUpdateReload();
    if (!backupCreated) return false;
    markVersionUpdateHintPending();
    return true;
  }

  let sharedCourseContextId = 0;
  let planningCourseViewCourseId = 0;
  let gradesCourseAutoSelectSuppressedUntil = 0;

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
      if (data.type === NAME_LEARNING_DATA_REQUEST_EVENT || data.type === NAME_LEARNING_REVIEW_REQUEST_EVENT) {
        if (frame !== getNameLearningFrame()) return;
        window.__teachhelperWorkspaceController?.getOwner?.().recordGradeVaultActivity?.();
        document.dispatchEvent(new CustomEvent(data.type, {
          detail: data.detail && typeof data.detail === 'object' ? data.detail : {},
        }));
        return;
      }
      if (data.type === THEME_PREFERENCE_CHANGE_EVENT) {
        if (frame !== getPlanningFrame() && frame !== getGradesFrame()) return;
        themeController.setPreference(data.detail?.preference);
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
      if (data.type === TUTORIAL_ENTRY_HINT_SYNC_EVENT) {
        if (data.detail?.action !== 'request') return;
        postToModule(frame, {
          type: TUTORIAL_ENTRY_HINT_SYNC_EVENT,
          detail: { seen: hasTutorialEntryHintBeenSeen() },
        });
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
    window.addEventListener(GRADES_TUTORIAL_START_REQUEST_EVENT, openHelpEntry);
    const openCourseSeatplan = (event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail || typeof detail !== 'object') {
        return;
      }
      bridgeController?.ensureTabInitialized(TAB_SEATPLAN);
      bridgeController?.sendCourseSeatplanContext(detail);
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
    seats: {},
    gridRows: 3,
    gridCols: 3,
    activeSeats: new Set(),
    activeSeatOrder: [],
    lockedSeats: new Set(),
    dragSourceSeat: null,
    dragPayloadType: null,
    headers: [],
    delim: ',',
    minGroupSize: 2,
    maxGroupSize: 4,
    seatTopics: {},
    _lastImport: false,
    workOrder: '',
    workOrderDurationMinutes: null,
    workOrderStartISO: null,
    workOrderAlarmed: false,
    scrollHintDismissed: true,
    csvName: '',
    lastDirectoryHandle: null,
    performanceFlairCount: 4,
    randomPickerAutoDisableSelected: false,
  };
  const realClassroomState = state;
  let classroomTutorialDemoActive = false;
  let workPhaseTutorialDemoActive = false;
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
    const fileInputWasDisabled = Boolean(els.file?.disabled);
    classroomTutorialDemoActive = true;
    if (els.file) els.file.disabled = true;
    state = {
      ...realClassroomState,
      students: demoStudents,
      seats: { '1-1': ['01', '02'], '1-2': ['03', '05'], '2-1': ['04'], '2-2': ['06'] },
      gridRows: 2,
      gridCols: 2,
      activeSeats: new Set(['1-1', '1-2', '2-1', '2-2']),
      activeSeatOrder: ['1-1', '1-2', '2-1', '2-2'],
      lockedSeats: new Set(['1-1']),
      seatTopics: { '1-1': 'Recherche', '1-2': 'Auswertung', '2-1': '', '2-2': '' },
      headers: ['Nachname', 'Vorname'],
      csvName: 'Beispielklasse',
      minGroupSize: 2,
      maxGroupSize: 3,
      performanceFlairCount: 4,
      _lastImport: false,
      scrollHintDismissed: true,
    };
    updateCsvStatusDisplay();
    syncGroupSizeInputs();
    refreshUnseated();
    renderRandomPicker();
    renderSeats();
    requestGroupGridLayoutRefresh({ resetViewport: true });
    const cleanup = () => {
      if (!classroomTutorialDemoActive) return;
      if (groupSuggestInProgress || randomPickerSpinInProgress) {
        window.setTimeout(cleanup, 120);
        return;
      }
      SharedRosterStore.replace(previousRosterState);
      classroomTutorialDemoActive = false;
      state = realClassroomState;
      if (els.file) els.file.disabled = fileInputWasDisabled;
      if (els.preferencesDialog?.open && typeof els.preferencesDialog.close === 'function') {
        els.preferencesDialog.close();
      }
      els.preferencesDialog?.removeAttribute('open');
      updateCsvStatusDisplay();
      syncGroupSizeInputs();
      refreshUnseated();
      renderRandomPicker();
      renderSeats();
      renderWorkOrder();
      requestGroupGridLayoutRefresh({ resetViewport: true });
    };
    try {
      const current = getCurrentModuleTutorialSteps({ activeTab: tab });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  let randomPickerSpinInProgress = false;
  let randomPickerCurrentIndex = 0;
  let randomPickerLockedWidthPx = 0;
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

  const SharedTimerStore = createSharedTimerStore({
    workOrderText: state.workOrder,
    durationMinutes: state.workOrderDurationMinutes,
    startISO: state.workOrderStartISO,
    alarmState: state.workOrderAlarmed,
  });
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
  const MIC_UI_STATE = Object.freeze({
    READY: 'ready',
    STARTING: 'starting',
    ACTIVE: 'active',
    UNSUPPORTED: 'unsupported',
    ERROR: 'error',
  });
  const TIMER_UI_STATE = Object.freeze({
    READY: 'ready',
    RUNNING: 'running',
    ALARM: 'alarm',
  });
  let timerUiState = TIMER_UI_STATE.READY;
  const syncStateFromTimerStore = (timerState = SharedTimerStore.getState()) => {
    state.workOrder = timerState.workOrderText;
    state.workOrderDurationMinutes = timerState.durationMinutes;
    state.workOrderStartISO = timerState.startISO;
    state.workOrderAlarmed = timerState.alarmState;
    renderWorkOrderTimerButtonsState();
  };
  const replaceTimerState = (next) => {
    SharedTimerStore.replace(next);
    syncStateFromTimerStore();
  };
  function activateWorkPhaseTutorialDemo() {
    if (workPhaseTutorialDemoActive) {
      const current = getCurrentModuleTutorialSteps({ activeTab: TAB_WORK_PHASE });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup: () => { } };
    }
    const previousTimerState = SharedTimerStore.getState();
    workPhaseTutorialDemoActive = true;
    stopWorkOrderAlarmSound();
    replaceTimerState({
      workOrderText: 'Bearbeitet die Beispielaufgabe zu zweit und haltet eure Ergebnisse fest.',
      durationMinutes: 20,
      startISO: null,
      alarmState: false,
    });
    renderWorkOrder();
    const cleanup = () => {
      if (!workPhaseTutorialDemoActive) return;
      workPhaseTutorialDemoActive = false;
      stopWorkOrderAlarmSound();
      clearTimerVisualWarnings();
      replaceTimerState(previousTimerState);
      renderWorkOrder();
      if (previousTimerState.alarmState) {
        updateWorkOrderAlert(true);
      }
    };
    try {
      const current = getCurrentModuleTutorialSteps({ activeTab: TAB_WORK_PHASE });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  syncStateFromTimerStore();
  SharedTimerStore.subscribe((timerState) => {
    syncStateFromTimerStore(timerState);
  });
  bridgeController = createPlanningSeatplanBridge({
    els,
    getChromeCollapsed: isChromeCollapsed,
    rosterStore: SharedRosterStore,
    documentBus: document,
    onCourseGradeSaveSuccess: () => {
      setActiveTab(TAB_PLANNING);
      showMessage('Noten gespeichert', 'success', {
        presentation: 'toast',
        durationMs: 1500,
      });
    },
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
    state.seats = {};
    state.seatTopics = {};
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
    requestGroupGridLayoutRefresh({ resetViewport: true });
    state.scrollHintDismissed = false;
    state._lastImport = true;
    updateScrollHint();
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
    onTabActivating: (tab) => applySharedCourseContext(tab),
  });
  const initialWorkspaceSnapshot = window.__teachhelperWorkspaceController?.getSnapshot?.('shell');
  if (initialWorkspaceSnapshot?.vault) {
    shellController.setPlanningGradeVaultState({
      ...initialWorkspaceSnapshot.vault,
      ready: Boolean(initialWorkspaceSnapshot.ready),
    });
  }
  bindTabNavigation();
  const PREFERENCE_SLOT_COUNT = 3;
  const MAX_GRID_SIZE = 20;
  const MAX_PERFORMANCE_FLAIR_COUNT = 10;
  const TOUCH_DRAG_DELAY_MS = 90;
  const TOUCH_DRAG_CANCEL_DISTANCE = 10;
  const touchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;
  const supportsTouchDrag = typeof window !== 'undefined'
    && (('ontouchstart' in window) || touchPoints > 0);
  let touchDragState = null;
  let workOrderTimerId = null;
  let workOrderAlarmIntervalId = null;
  let workOrderAudioCtx = null;
  let timerVisualWarningTimeoutId = null;
  let timerWarningToneEnabled = { end: true, half: true, quarter: true };
  let timerMilestoneTriggered = { half: false, quarter: false };
  let timerLastRemainingRatio = null;
  let timerShowSeconds = true;
  const SCROLL_HINT_HIDE_OFFSET = 0;

  function toggleScrollHint(visible) {
    if (!els.scrollHint) return;
    els.scrollHint.classList.toggle('active', Boolean(visible));
    positionScrollHintBox();
  }
  function dismissScrollHint() {
    toggleScrollHint(false);
  }
  function setScrollHintText() {
    if (!els.scrollHint) return;
    const textNode = els.scrollHint.querySelector('.text');
    if (!textNode) return;
    const count = Array.isArray(state.students) ? state.students.length : 0;
    if (count > 0) {
      const label = count === 1 ? 'Name' : 'Namen';
      textNode.textContent = `${count} ${label} wurden importiert.`;
    } else {
      textNode.textContent = 'Namen importiert';
    }
  }
  function positionScrollHintBox() {
    if (!els.scrollHint) return;
    const hint = els.scrollHint;
    if (!hint.classList.contains('active')) {
      hint.style.left = '';
      hint.style.transform = '';
      return;
    }
    const panelRect = els.sidePanel?.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const inset = 12;
    const hintWidth = hint.offsetWidth || hint.getBoundingClientRect().width || 0;
    if (panelRect && viewportWidth && hintWidth) {
      const targetCenter = panelRect.left + (panelRect.width / 2);
      const minCenter = inset + (hintWidth / 2);
      const maxCenter = viewportWidth - inset - (hintWidth / 2);
      const clampedCenter = Math.min(Math.max(targetCenter, minCenter), maxCenter);
      hint.style.left = `${clampedCenter}px`;
      hint.style.transform = 'translateX(-50%)';
    } else {
      hint.style.left = '50%';
      hint.style.transform = 'translateX(-50%)';
    }
  }
  function initSeatTopicInput(input) {
    if (!input) return;
    const defaultPlaceholder = input.getAttribute('data-default-placeholder') || input.getAttribute('placeholder') || 'Thema';
    input.dataset.defaultPlaceholder = defaultPlaceholder;
    input.addEventListener('focus', () => {
      input.placeholder = '';
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) {
        input.placeholder = input.dataset.defaultPlaceholder || 'Thema';
      }
    });
  }
  function syncSeatTopicState(seat, topicValue) {
    if (!seat) return;
    const hasTopic = Boolean(String(topicValue || '').trim());
    seat.classList.toggle('seat-topic-empty', !hasTopic);
  }
  function updateScrollHint() {
    if (!els.scrollHint || !els.sidePanel) return;
    setScrollHintText();
    const requiresScroll = (els.sidePanel.scrollHeight - els.sidePanel.clientHeight) > 16;
    const isAtTop = els.sidePanel.scrollTop <= 4;
    toggleScrollHint(requiresScroll && isAtTop && state.students.length > 0);
  }
  function handleSideScroll() {
    if (!els.sidePanel) return;
    if (els.sidePanel.scrollTop > SCROLL_HINT_HIDE_OFFSET) { dismissScrollHint(); }
  }
  function handleRosterScroll(e) {
    const scroller = e?.target;
    if (!scroller) return;
    if (scroller.scrollTop > SCROLL_HINT_HIDE_OFFSET) { dismissScrollHint(); }
  }
  els.sidePanel?.addEventListener('scroll', handleSideScroll, { passive: true });
  els.rosterPanel?.addEventListener('scroll', handleRosterScroll, { passive: true });
  els.unseated?.addEventListener('scroll', handleRosterScroll, { passive: true });
  els.groupsGridWrap?.addEventListener('scroll', dismissScrollHint, { passive: true });
  window.addEventListener('resize', () => {
    updateScrollHint();
    positionScrollHintBox();
  });
  window.addEventListener('scroll', (e) => {
    if (state.scrollHintDismissed) return;
    const target = e?.target;
    if (target && typeof target.scrollTop === 'number' && target.scrollTop > SCROLL_HINT_HIDE_OFFSET) {
      dismissScrollHint();
      return;
    }
    const doc = document;
    const isMainScroll = target === doc || target === doc.body || target === doc.documentElement;
    if (isMainScroll) {
      const offset = window.scrollY
        || doc.documentElement?.scrollTop
        || doc.body?.scrollTop
        || 0;
      if (offset > SCROLL_HINT_HIDE_OFFSET) {
        dismissScrollHint();
      }
    }
  }, true);

  function normalizeGridDimension(value) {
    if (value === undefined || value === null) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return null;
    return Math.min(MAX_GRID_SIZE, Math.max(1, parsed));
  }
  function clampGridDimension(value) {
    return normalizeGridDimension(value) ?? 1;
  }
  function findBestGridSize(target) {
    const limit = MAX_GRID_SIZE;
    const cappedTarget = Math.max(1, Math.min(target, limit * limit));
    let best = { rows: 1, cols: 1, area: 1, diff: Infinity };
    for (let rows = 1; rows <= limit; rows++) {
      const cols = Math.ceil(cappedTarget / rows);
      if (cols > limit) continue;
      const area = rows * cols;
      const diff = area - cappedTarget;
      if (diff < best.diff || (diff === best.diff && Math.abs(rows - cols) < Math.abs(best.rows - best.cols))) {
        best = { rows, cols, area, diff };
      }
    }
    return { rows: clampGridDimension(best.rows), cols: clampGridDimension(best.cols) };
  }

  function nextSeatSlot() {
    const limit = MAX_GRID_SIZE;
    let rows = clampGridDimension(state.gridRows);
    let cols = clampGridDimension(state.gridCols);
    const occupied = new Set(state.activeSeatOrder || state.activeSeats);

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const id = seatId(r, c);
        if (!occupied.has(id)) {
          return { id, rows, cols };
        }
      }
    }

    if (cols < limit) {
      cols += 1;
      return { id: seatId(rows, cols), rows, cols };
    }
    if (rows < limit) {
      rows += 1;
      return { id: seatId(rows, 1), rows, cols };
    }
    return null;
  }

  function ensureCapacityForStudents(maxSize, minSize = state.minGroupSize || 1) {
    const total = Math.max(0, state.students.length || 0);
    const minGroupsNeeded = Math.max(1, Math.ceil(total / Math.max(1, maxSize)));
    const maxGroupsAllowed = Math.max(1, Math.floor(total / Math.max(1, minSize))) || 1;
    const targetGroups = Math.max(1, Math.min(maxGroupsAllowed, minGroupsNeeded));
    const { rows, cols } = findBestGridSize(targetGroups);
    const full = Array.from(buildFullActiveSet(rows, cols));
    state.activeSeatOrder = full;
    state.activeSeats = new Set(full);
    state.gridRows = rows;
    state.gridCols = cols;
    buildGrid();
  }
  function maxGroupLimit() {
    const total = Math.max(1, state.students.length || 0);
    const fallback = Math.max(99, state.activeSeats.size || (state.gridRows * state.gridCols) || 0);
    return Math.max(total, fallback);
  }
  function clampMaxGroupSize(value) {
    const limit = maxGroupLimit();
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    const maxed = Math.max(1, Math.min(limit, parsed));
    return Math.max(state.minGroupSize || 1, maxed);
  }
  function clampMinGroupSize(value) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    const maxLimit = clampMaxGroupSize(state.maxGroupSize || 1);
    return Math.min(parsed, maxLimit);
  }
  function syncGroupSizeInputs() {
    if (els.maxGroupSize) {
      const limit = maxGroupLimit();
      els.maxGroupSize.min = '1';
      els.maxGroupSize.max = String(limit);
    }
    state.minGroupSize = clampMinGroupSize(state.minGroupSize);
    state.maxGroupSize = clampMaxGroupSize(state.maxGroupSize);
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    if (els.minGroupSize) els.minGroupSize.value = String(state.minGroupSize);
    if (els.maxGroupSize) els.maxGroupSize.value = String(state.maxGroupSize);
  }
  function hasAnyAssignedGroupStudents() {
    return Object.values(state.seats || {}).some((seatList) => ensureSeatList(seatList).length > 0);
  }
  function syncGroupGridFromSizeInputs(options = {}) {
    const { forceCapacity = false } = options;
    syncGroupSizeInputs();
    if (!state.students.length) {
      requestGroupGridLayoutRefresh({ resetViewport: true });
      return;
    }
    if (forceCapacity || !hasAnyAssignedGroupStudents()) {
      const maxSize = clampMaxGroupSize(state.maxGroupSize);
      const minSize = clampMinGroupSize(state.minGroupSize);
      ensureCapacityForStudents(maxSize, minSize);
      return;
    }
    requestGroupGridLayoutRefresh({ resetViewport: true });
  }
  const guardGroupInput = () => {
    if (!state.students.length) {
      showMessage('Importiere zuerst die Namensliste!', 'warn');
      return false;
    }
    return true;
  };
  const adjustMinGroupSize = (delta) => {
    if (!guardGroupInput()) return;
    const current = state.minGroupSize || 1;
    state.minGroupSize = clampMinGroupSize(current + delta);
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    syncGroupGridFromSizeInputs();
  };
  const adjustMaxGroupSize = (delta) => {
    if (!guardGroupInput()) return;
    const current = state.maxGroupSize || 1;
    state.maxGroupSize = clampMaxGroupSize(current + delta);
    if (state.minGroupSize > state.maxGroupSize) {
      state.minGroupSize = clampMinGroupSize(state.maxGroupSize);
    }
    syncGroupGridFromSizeInputs();
  };
  els.minGroupSize?.addEventListener('change', () => {
    if (!guardGroupInput()) return;
    state.minGroupSize = clampMinGroupSize(Number(els.minGroupSize.value));
    if (state.minGroupSize > state.maxGroupSize) {
      state.maxGroupSize = clampMaxGroupSize(state.minGroupSize);
    }
    syncGroupGridFromSizeInputs();
  });
  els.maxGroupSize?.addEventListener('change', () => {
    if (!guardGroupInput()) return;
    state.maxGroupSize = clampMaxGroupSize(Number(els.maxGroupSize.value));
    if (state.minGroupSize > state.maxGroupSize) {
      state.minGroupSize = clampMinGroupSize(state.maxGroupSize);
    }
    syncGroupGridFromSizeInputs();
  });
  els.minGroupDec?.addEventListener('click', () => adjustMinGroupSize(-1));
  els.minGroupInc?.addEventListener('click', () => adjustMinGroupSize(1));
  els.maxGroupDec?.addEventListener('click', () => adjustMaxGroupSize(-1));
  els.maxGroupInc?.addEventListener('click', () => adjustMaxGroupSize(1));
  syncGroupSizeInputs();
  function ensureSeatList(val) {
    if (!val) return [];
    if (Array.isArray(val)) return Array.from(new Set(val.filter(Boolean).map(String)));
    return [String(val)].filter(Boolean);
  }
  function startWiggle() {
    document.querySelectorAll('.seat-chip, .student').forEach(el => el.classList.add('wiggle'));
  }
  function stopWiggle() {
    document.querySelectorAll('.wiggle').forEach(el => el.classList.remove('wiggle'));
  }
  function getSeatList(id) {
    return ensureSeatList(state.seats[id]);
  }
  function setSeatList(id, list) {
    state.seats[id] = ensureSeatList(list);
  }
  function addStudentToSeat(seatId, studentId) {
    if (!seatId || !studentId) return;
    const list = getSeatList(seatId);
    if (!list.includes(studentId)) {
      list.push(studentId);
      setSeatList(seatId, list);
    }
  }
  function removeStudentFromSeat(seatId, studentId) {
    if (!seatId || !studentId) return;
    const list = getSeatList(seatId);
    const next = list.filter(id => id !== studentId);
    setSeatList(seatId, next);
  }
  function buildFullActiveSet(rows, cols) {
    const set = new Set();
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        set.add(seatId(r, c));
      }
    }
    return set;
  }
  function seatId(r, c) { return `${r}-${c}` }
  function displayName(s) { return `${s.first || ''} ${s.last || ''}`.trim(); }
  function formatStudentLabel(student) {
    if (!student) return '';
    const name = displayName(student);
    return name || `ID ${student.id || ''}`.trim();
  }
  function getPerformanceFlairLabel(index) {
    let remaining = Math.max(0, Math.floor(Number(index) || 0));
    let label = '';
    do {
      label = String.fromCharCode(65 + (remaining % 26)) + label;
      remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return label;
  }
  function clampPerformanceFlairCount(value, fallback = 4) {
    const parsed = Number.parseInt(value, 10);
    const fallbackParsed = Number.parseInt(fallback, 10);
    const normalizedFallback = Number.isFinite(fallbackParsed) && fallbackParsed >= 2
      ? Math.min(MAX_PERFORMANCE_FLAIR_COUNT, fallbackParsed)
      : 4;
    if (!Number.isFinite(parsed)) return normalizedFallback;
    if (parsed < 2) return normalizedFallback;
    return Math.min(MAX_PERFORMANCE_FLAIR_COUNT, parsed);
  }
  function normalizePerformanceFlair(value) {
    const normalized = String(value || '').trim().toUpperCase();
    return /^[A-Z]+$/.test(normalized) ? normalized : '';
  }
  function getAllowedPerformanceFlairs(count = state.performanceFlairCount) {
    const total = clampPerformanceFlairCount(count, 4);
    return Array.from({ length: total }, (_, index) => getPerformanceFlairLabel(index));
  }
  function sanitizePerformanceFlairForCount(value, count = state.performanceFlairCount) {
    const normalized = normalizePerformanceFlair(value);
    return getAllowedPerformanceFlairs(count).includes(normalized) ? normalized : '';
  }
  function getPerformanceFlairRank(value, count = state.performanceFlairCount) {
    const flair = sanitizePerformanceFlairForCount(value, count);
    if (!flair) return -1;
    return getAllowedPerformanceFlairs(count).indexOf(flair);
  }
  function getPerformanceFlairDistance(first, second, count = state.performanceFlairCount) {
    const firstRank = getPerformanceFlairRank(first, count);
    const secondRank = getPerformanceFlairRank(second, count);
    if (firstRank < 0 || secondRank < 0) return null;
    return Math.abs(firstRank - secondRank);
  }
  function sanitizePerformanceFlairCountInStudents(count = state.performanceFlairCount, students = state.students) {
    if (!Array.isArray(students)) return;
    students.forEach((student) => {
      if (!student || typeof student !== 'object') return;
      student.performanceFlair = sanitizePerformanceFlairForCount(student.performanceFlair, count);
    });
  }
  function formatPerformanceFlairRangeLabel(count = state.performanceFlairCount) {
    const normalizedCount = clampPerformanceFlairCount(count, 4);
    return `A-${getPerformanceFlairLabel(normalizedCount - 1)}`;
  }
  function normalizeRandomPickerWeight(value, fallback = RANDOM_PICKER_DEFAULT_WEIGHT) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed <= RANDOM_PICKER_MIN_WEIGHT) return RANDOM_PICKER_MIN_WEIGHT;
    if (parsed >= RANDOM_PICKER_CERTAIN_WEIGHT) return RANDOM_PICKER_CERTAIN_WEIGHT;
    if (parsed >= RANDOM_PICKER_MAX_WEIGHT) return RANDOM_PICKER_MAX_WEIGHT;
    return RANDOM_PICKER_DEFAULT_WEIGHT;
  }
  function normalizeRandomPickerAutoDisableSelected(value) {
    return value === true;
  }
  function sanitizeRandomPickerStudent(student) {
    if (!student || typeof student !== 'object') return student;
    student.randomWeight = normalizeRandomPickerWeight(student.randomWeight);
    student.performanceFlair = sanitizePerformanceFlairForCount(student.performanceFlair);
    return student;
  }
  function getRandomPickerCandidates({ includeZeroWeight = false } = {}) {
    return state.students
      .map((student) => {
        const name = formatStudentLabel(student);
        if (!name) return null;
        const weight = normalizeRandomPickerWeight(student?.randomWeight);
        return {
          id: student.id,
          name,
          weight,
        };
      })
      .filter((entry) => entry && (includeZeroWeight || entry.weight > 0));
  }
  function getRandomPickerNames({ includeZeroWeight = true } = {}) {
    return getRandomPickerCandidates({ includeZeroWeight }).map((entry) => entry.name);
  }
  function pickWeightedRandomPickerCandidate(candidates) {
    const pool = Array.isArray(candidates)
      ? candidates.filter((entry) => entry && entry.weight > 0)
      : [];
    const certainCandidate = pool.find((entry) => entry.weight === RANDOM_PICKER_CERTAIN_WEIGHT);
    if (certainCandidate) return certainCandidate;
    const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (!pool.length || totalWeight <= 0) return null;
    let threshold = Math.random() * totalWeight;
    for (const entry of pool) {
      threshold -= entry.weight;
      if (threshold < 0) return entry;
    }
    return pool[pool.length - 1] || null;
  }
  function measureRandomPickerWheelWidth(labels = []) {
    if (!els.randomPickerWheel || typeof document === 'undefined') return 0;
    const probeCard = els.randomPickerCards?.[3] || els.randomPickerCards?.[0];
    if (!probeCard) return 0;
    const wheelStyle = window.getComputedStyle(els.randomPickerWheel);
    const cardStyle = window.getComputedStyle(probeCard);
    const horizontalPadding = ['paddingLeft', 'paddingRight']
      .reduce((sum, key) => sum + (Number.parseFloat(wheelStyle[key]) || 0), 0);
    const cardHorizontal = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
      .reduce((sum, key) => sum + (Number.parseFloat(cardStyle[key]) || 0), 0);
    const candidates = Array.from(new Set(
      labels
        .map((label) => String(label || '').trim())
        .filter(Boolean)
        .concat(['Noch keine Namen importiert', 'Keine Auswahl aktiv'])
    ));
    if (!candidates.length) return 0;
    const measurer = document.createElement('span');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.pointerEvents = 'none';
    measurer.style.whiteSpace = 'nowrap';
    measurer.style.font = cardStyle.font;
    measurer.style.fontWeight = cardStyle.fontWeight;
    measurer.style.letterSpacing = cardStyle.letterSpacing;
    measurer.style.textTransform = cardStyle.textTransform;
    measurer.style.padding = '0';
    measurer.style.border = '0';
    measurer.style.top = '-9999px';
    measurer.style.left = '-9999px';
    document.body.appendChild(measurer);
    let maxLabelWidth = 0;
    candidates.forEach((label) => {
      measurer.textContent = label;
      maxLabelWidth = Math.max(maxLabelWidth, Math.ceil(measurer.getBoundingClientRect().width));
    });
    measurer.remove();
    const arrowClearance = Number.parseFloat(wheelStyle.getPropertyValue('--random-picker-arrow-clearance')) || 0;
    return Math.ceil(maxLabelWidth + cardHorizontal + horizontalPadding + arrowClearance);
  }
  function applyRandomPickerWheelWidth(widthPx = 0) {
    if (!els.randomPickerWheel) return;
    if (widthPx > 0) {
      const wheelStyle = window.getComputedStyle(els.randomPickerWheel);
      const horizontalPadding = ['paddingLeft', 'paddingRight']
        .reduce((sum, key) => sum + (Number.parseFloat(wheelStyle[key]) || 0), 0);
      const arrowClearance = Number.parseFloat(wheelStyle.getPropertyValue('--random-picker-arrow-clearance')) || 0;
      const cardWidthPx = Math.max(0, widthPx - horizontalPadding - arrowClearance);
      randomPickerLockedWidthPx = widthPx;
      els.randomPickerWheel.style.setProperty('--random-picker-wheel-static-width', `${widthPx}px`);
      els.randomPickerWheel.style.setProperty('--random-picker-card-static-width', `${cardWidthPx}px`);
      return;
    }
    randomPickerLockedWidthPx = 0;
    els.randomPickerWheel.style.removeProperty('--random-picker-wheel-static-width');
    els.randomPickerWheel.style.removeProperty('--random-picker-card-static-width');
  }
  function refreshRandomPickerWheelWidth(labels = []) {
    const measuredWidth = measureRandomPickerWheelWidth(labels);
    applyRandomPickerWheelWidth(measuredWidth);
    return measuredWidth;
  }
  function getRandomPickerStartButtons() {
    return Array.from(els.randomPickerStartButtons || []).filter(Boolean);
  }
  function setRandomPickerStartButtons({ disabled, text } = {}) {
    getRandomPickerStartButtons().forEach((button) => {
      if (typeof disabled === 'boolean') {
        button.disabled = disabled;
      }
      if (typeof text === 'string') {
        if (button.dataset.collapsedIcon === '1') {
          button.textContent = '✨';
        } else {
          button.textContent = text;
        }
      }
    });
  }
  function renderRandomPickerCardEmptyState(card, title, copy) {
    if (!card) return;
    card.classList.add('is-empty-state');
    card.replaceChildren();
    const titleEl = document.createElement('span');
    titleEl.className = 'empty-state-title';
    titleEl.textContent = title;
    const copyEl = document.createElement('span');
    copyEl.className = 'empty-state-copy';
    copyEl.textContent = copy;
    card.append(titleEl, copyEl);
  }
  function updateRandomPickerCards(centerIndex = 0, { final = false } = {}) {
    if (!els.randomPickerCards?.length) return;
    const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
    const names = getRandomPickerNames({ includeZeroWeight: true });
    const total = names.length;
    els.randomPickerWheel?.closest('.random-picker-machine')?.classList.toggle('is-empty-state', !total);
    const cards = Array.from(els.randomPickerCards);
    if (!total) {
      const emptyLabel = allCandidates.length ? 'Keine Auswahl aktiv' : 'Noch keine Namen importiert';
      cards.forEach((card, slotIndex) => {
        const distance = Math.abs(slotIndex - 3);
        card.dataset.distance = String(distance);
        card.classList.toggle('is-final', false);
        if (slotIndex === 3) {
          renderRandomPickerCardEmptyState(
            card,
            allCandidates.length ? 'Keine Auswahl aktiv' : 'Noch keine Namen',
            allCandidates.length
              ? 'Aktiviere mindestens einen Namen für den Picker.'
              : 'Importiere zuerst eine Namensliste.'
          );
        } else {
          card.classList.remove('is-empty-state');
          card.textContent = '';
        }
        card.setAttribute('aria-hidden', slotIndex === 3 ? 'false' : 'true');
      });
      randomPickerCurrentIndex = 0;
      return;
    }
    const safeIndex = ((Math.round(centerIndex) % total) + total) % total;
    randomPickerCurrentIndex = safeIndex;
    cards.forEach((card, slotIndex) => {
      const offset = slotIndex - 3;
      const candidateIndex = ((safeIndex + offset) % total + total) % total;
      const distance = Math.abs(offset);
      card.classList.remove('is-empty-state');
      card.removeAttribute('aria-hidden');
      card.textContent = names[candidateIndex];
      card.dataset.distance = String(Math.min(3, distance));
      card.classList.toggle('is-final', final && offset === 0);
    });
  }
  function renderRandomPicker() {
    const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
    const candidates = getRandomPickerCandidates();
    const names = allCandidates.map((entry) => entry.name);
    refreshRandomPickerWheelWidth(names);
    const count = candidates.length;
    if (els.randomPickerCount) {
      els.randomPickerCount.textContent = String(count);
    }
    if (!count) {
      randomPickerSpinInProgress = false;
      if (els.randomPickerResultName) {
        els.randomPickerResultName.textContent = allCandidates.length
          ? 'Keine Auswahl aktiv'
          : 'Noch keine Namen importiert';
      }
      if (els.randomPickerResultNote) {
        els.randomPickerResultNote.textContent = allCandidates.length
          ? 'Alle Einträge stehen auf „unmöglich“. Stelle mindestens einen Eintrag auf „normal“, „doppelt“, „dreifach“ oder „sicher“.'
          : 'Importiere zuerst eine Namensliste in der Sidebar.';
      }
      if (els.randomPickerActionNote) {
        els.randomPickerActionNote.textContent = allCandidates.length
          ? 'Lege im Dialog Bedingungen pro Name „unmöglich“, „normal“, „doppelt“, „dreifach“ oder „sicher“ fest.'
          : 'Tippe auf den Button, damit der Generator losläuft.';
      }
      setRandomPickerStartButtons({ disabled: !allCandidates.length, text: 'Start' });
      updateRandomPickerCards(0);
      return;
    }
    const safeIndex = Math.min(randomPickerCurrentIndex, Math.max(0, names.length - 1));
    updateRandomPickerCards(safeIndex);
    if (!randomPickerSpinInProgress) {
      setRandomPickerStartButtons({ disabled: false });
    }
    if (els.randomPickerResultName && !randomPickerSpinInProgress) {
      els.randomPickerResultName.textContent = names[safeIndex];
    }
    if (els.randomPickerResultNote) {
      els.randomPickerResultNote.textContent = randomPickerSpinInProgress
        ? 'Der Generator läuft und bremst kontrolliert ab.'
        : 'Die Auswahl erfolgt zufällig aus allen importierten Namen.';
    }
    if (els.randomPickerActionNote && !randomPickerSpinInProgress) {
      els.randomPickerActionNote.textContent = count === 1
        ? 'Es ist nur ein Name verfügbar.'
        : 'Tippe auf den Button, damit der Generator losläuft.';
    }
  }
  async function startRandomPickerSpin() {
    const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
    if (!allCandidates.length) {
      showMessage('Importiere zuerst die Namensliste!', 'warn');
      return;
    }
    const candidates = allCandidates.filter((entry) => entry.weight > 0);
    if (!candidates.length) {
      showMessage('Für den Picker ist aktuell kein Name auf „normal“, „doppelt“, „dreifach“ oder „sicher“ gesetzt.', 'warn');
      return;
    }
    const displayNames = allCandidates.map((entry) => entry.name);
    if (randomPickerSpinInProgress) return;
    refreshRandomPickerWheelWidth(displayNames);
    randomPickerSpinInProgress = true;
    setRandomPickerStartButtons({ disabled: true, text: 'Läuft...' });
    if (els.randomPickerResultNote) {
      els.randomPickerResultNote.textContent = 'Der Generator läuft und bremst kontrolliert ab.';
    }
    if (els.randomPickerActionNote) {
      els.randomPickerActionNote.textContent = 'Zufallsgenerator läuft...';
    }
    try {
      const winner = pickWeightedRandomPickerCandidate(candidates);
      const total = displayNames.length;
      const winnerIndex = Math.max(0, allCandidates.findIndex((entry) => entry.id === winner?.id));
      const loops = total <= 1 ? 0 : Math.max(2, Math.ceil(14 / total));
      const totalSteps = total <= 1
        ? 1
        : Math.max(18, (loops * total) + winnerIndex - randomPickerCurrentIndex + (winnerIndex >= randomPickerCurrentIndex ? 0 : total));
      const stepWeights = [];
      for (let step = 1; step <= totalSteps; step += 1) {
        const progress = totalSteps <= 1 ? 1 : step / totalSteps;
        stepWeights.push(1 + Math.pow(progress, 2.2) * 6.5);
      }
      const totalWeight = stepWeights.reduce((sum, weight) => sum + weight, 0) || 1;
      for (let step = 1; step <= totalSteps; step += 1) {
        const frameIndex = total <= 1 ? winnerIndex : (randomPickerCurrentIndex + 1) % total;
        updateRandomPickerCards(frameIndex, { final: false });
        const delayMs = (RANDOM_PICKER_SPIN_DURATION_MS * stepWeights[step - 1]) / totalWeight;
        await waitMs(delayMs);
      }
      updateRandomPickerCards(winnerIndex, { final: true });
      const shouldDisableWinner = state.randomPickerAutoDisableSelected && winner?.id;
      if (shouldDisableWinner) {
        const winnerStudent = state.students.find((student) => student?.id === winner.id);
        if (winnerStudent) {
          winnerStudent.randomWeight = RANDOM_PICKER_MIN_WEIGHT;
          renderRandomPicker();
        }
      }
      if (els.randomPickerResultName) {
        els.randomPickerResultName.textContent = winner?.name || displayNames[winnerIndex] || '';
      }
      if (els.randomPickerResultNote) {
        els.randomPickerResultNote.textContent = shouldDisableWinner
          ? 'Der ausgewählte Name wurde auf „unmöglich“ gesetzt.'
          : 'Der Zufallsgenerator ist stehen geblieben.';
      }
      if (els.randomPickerActionNote) {
        const winnerName = winner?.name || displayNames[winnerIndex] || '';
        els.randomPickerActionNote.textContent = shouldDisableWinner
          ? `Gewählt wurde: ${winnerName}. Der Name ist nun unmöglich.`
          : `Gewählt wurde: ${winnerName}`;
      }
      setRandomPickerStartButtons({ text: 'Nochmal' });
    } finally {
      randomPickerSpinInProgress = false;
      getRandomPickerStartButtons().forEach((button) => {
        button.disabled = false;
        if (button.textContent.trim() === 'Läuft...') {
          button.textContent = button.dataset.collapsedIcon === '1' ? '✨' : 'Start';
        }
      });
    }
  }
  function isRandomPickerTabActive() {
    return getActiveTab() === TAB_RANDOM_PICKER;
  }
  function setPreferencesResetVisibility(isVisible) {
    if (!els.preferencesReset) return;
    els.preferencesReset.hidden = !isVisible;
  }
  function setRandomPickerAutoDisableControlVisibility(isVisible) {
    if (els.preferencesRandomPickerAutoDisable) {
      els.preferencesRandomPickerAutoDisable.hidden = !isVisible;
    }
    if (isVisible && els.randomPickerAutoDisableSelected) {
      els.randomPickerAutoDisableSelected.checked = normalizeRandomPickerAutoDisableSelected(
        state.randomPickerAutoDisableSelected
      );
    }
  }
  function renderSeatPreferencesHeader() {
    if (!els.preferencesDialogTitle || !els.preferencesTableHead) return;
    setPreferencesResetVisibility(false);
    setRandomPickerAutoDisableControlVisibility(false);
    els.preferencesDialogTitle.textContent = 'Bedingungen';
    els.preferencesTableHead.innerHTML = `
          <tr>
            <th colspan="3" class="group-header">
              Gute Gruppenpartner
            </th>
            <th class="group-header name-header"></th>
            <th class="group-header performance-flair-header">Leistungsklasse</th>
            <th colspan="3" class="group-header">
              Schlechte Gruppenpartner
            </th>
          </tr>
        `;
  }
  function createSeatPreferencesDraft(students = state.students) {
    const draft = new Map();
    (Array.isArray(students) ? students : []).forEach((student) => {
      if (!student || typeof student !== 'object') return;
      const sid = String(student.id || '').trim();
      if (!sid) return;
      draft.set(sid, {
        buddies: Array.from({ length: PREFERENCE_SLOT_COUNT }, (_, index) => student.buddies?.[index] || ''),
        foes: Array.from({ length: PREFERENCE_SLOT_COUNT }, (_, index) => student.foes?.[index] || ''),
        performanceFlair: sanitizePerformanceFlairForCount(student.performanceFlair),
      });
    });
    return draft;
  }
  function readSeatPreferencesDraftFromForm() {
    if (!els.preferencesTableBody || !els.preferencesTableBody.children.length) return null;
    const draft = createSeatPreferencesDraft();
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id]');
    selects.forEach((select) => {
      const sid = String(select.dataset.studentId || '').trim();
      if (!sid) return;
      if (!draft.has(sid)) {
        draft.set(sid, {
          buddies: Array(PREFERENCE_SLOT_COUNT).fill(''),
          foes: Array(PREFERENCE_SLOT_COUNT).fill(''),
          performanceFlair: '',
        });
      }
      const entry = draft.get(sid);
      if (select.dataset.preference === 'performance-flair') {
        entry.performanceFlair = sanitizePerformanceFlairForCount(select.value);
        return;
      }
      const slot = Number(select.dataset.prefSlot);
      if (Number.isNaN(slot)) return;
      if (select.dataset.prefType === 'foe') {
        entry.foes[slot] = select.value || '';
      } else if (select.dataset.prefType === 'buddy') {
        entry.buddies[slot] = select.value || '';
      }
    });
    return draft;
  }
  function buildSeatPreferencesTable(draft = null) {
    if (!els.preferencesTableBody) return;
    renderSeatPreferencesHeader();
    els.preferencesTableBody.innerHTML = '';
    const safeDraft = draft instanceof Map ? draft : createSeatPreferencesDraft();
    const ordered = state.students.slice().sort((a, b) => {
      const nameA = formatStudentLabel(a).toLowerCase();
      const nameB = formatStudentLabel(b).toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
    ordered.forEach(student => {
      els.preferencesTableBody.appendChild(createPreferenceRow(student, ordered, safeDraft));
    });
    const binds = els.preferencesTableBody.querySelectorAll('select[data-pref-type]');
    binds.forEach(sel => {
      sel.addEventListener('change', () => {
        refreshPreferenceOptionsForStudent(sel.dataset.studentId);
      });
    });
    refreshAllPreferenceOptions();
    renderSeatPreferencesPerformanceSummary(safeDraft);
  }
  function buildRandomPickerConditionsTable() {
    if (!els.preferencesDialogTitle || !els.preferencesTableHead || !els.preferencesTableBody) return;
    setPreferencesResetVisibility(true);
    setRandomPickerAutoDisableControlVisibility(true);
    els.preferencesDialogTitle.textContent = 'Bedingungen';
    els.preferencesTableHead.innerHTML = `
          <tr>
            <th class="group-header name-header">Name</th>
            <th class="group-header">Wahrscheinlichkeit</th>
          </tr>
        `;
    els.preferencesTableBody.innerHTML = '';
    if (els.preferencesPerformanceSummary) {
      els.preferencesPerformanceSummary.hidden = true;
      els.preferencesPerformanceSummary.textContent = '';
    }
    const ordered = state.students.slice().sort((a, b) => {
      const nameA = formatStudentLabel(a).toLowerCase();
      const nameB = formatStudentLabel(b).toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
    ordered.forEach((student) => {
      sanitizeRandomPickerStudent(student);
      const row = document.createElement('tr');

      const nameCell = document.createElement('th');
      nameCell.scope = 'row';
      nameCell.className = 'name-cell';
      nameCell.textContent = formatStudentLabel(student);
      row.appendChild(nameCell);

      const weightCell = document.createElement('td');
      weightCell.className = 'weight-cell';
      const wrap = document.createElement('div');
      wrap.className = 'weight-choice-group';
      const currentValue = String(normalizeRandomPickerWeight(student.randomWeight));
      const choiceName = `random-weight-${student.id}`;
      [
        { value: '0', label: 'unmöglich' },
        { value: '1', label: 'normal' },
        { value: '2', label: 'doppelt' },
        { value: '3', label: 'dreifach' },
        { value: '4', label: 'sicher' },
      ].forEach((optionConfig) => {
        const choice = document.createElement('label');
        choice.className = 'weight-choice';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = choiceName;
        input.value = optionConfig.value;
        input.dataset.studentId = student.id;
        input.dataset.preference = 'random-weight';
        input.checked = currentValue === optionConfig.value;
        const text = document.createElement('span');
        text.textContent = optionConfig.label;
        choice.appendChild(input);
        choice.appendChild(text);
        wrap.appendChild(choice);
      });
      weightCell.appendChild(wrap);
      row.appendChild(weightCell);

      els.preferencesTableBody.appendChild(row);
    });
  }
  function createPreferenceRow(student, optionsList, draftMap = null) {
    const draft = draftMap instanceof Map ? draftMap.get(student.id) : null;
    const row = document.createElement('tr');
    for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
      row.appendChild(createPreferenceCell(student, 'buddy', i, optionsList, draft));
    }
    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.className = 'name-cell';
    nameCell.textContent = formatStudentLabel(student);
    row.appendChild(nameCell);
    row.appendChild(createPerformanceFlairCell(student, draft));
    for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
      row.appendChild(createPreferenceCell(student, 'foe', i, optionsList, draft));
    }
    return row;
  }
  function createPerformanceFlairCell(student, draft = null) {
    const cell = document.createElement('td');
    cell.className = 'performance-flair-col';
    const select = document.createElement('select');
    select.dataset.studentId = student.id;
    select.dataset.preference = 'performance-flair';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-';
    select.appendChild(placeholder);
    getAllowedPerformanceFlairs().forEach((flair) => {
      const option = document.createElement('option');
      option.value = flair;
      option.textContent = flair;
      select.appendChild(option);
    });
    select.value = sanitizePerformanceFlairForCount(draft?.performanceFlair ?? student.performanceFlair);
    const wrap = document.createElement('div');
    wrap.className = 'select-wrap';
    wrap.appendChild(select);
    cell.appendChild(wrap);
    return cell;
  }
  function createPreferenceCell(student, type, slotIndex, optionsList, draft = null) {
    const cell = document.createElement('td');
    cell.className = type === 'buddy' ? 'buddy-col' : 'foe-col';
    const select = document.createElement('select');
    select.dataset.studentId = student.id;
    select.dataset.prefType = type;
    select.dataset.prefSlot = String(slotIndex);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-';
    select.appendChild(placeholder);
    optionsList.forEach(optionStudent => {
      if (!optionStudent || optionStudent.id === student.id) return;
      const option = document.createElement('option');
      option.value = optionStudent.id;
      option.textContent = formatStudentLabel(optionStudent);
      select.appendChild(option);
    });
    const source = type === 'buddy'
      ? (draft?.buddies || student.buddies || [])
      : (draft?.foes || student.foes || []);
    select.value = source[slotIndex] || '';
    const wrap = document.createElement('div');
    wrap.className = 'select-wrap';
    wrap.appendChild(select);
    cell.appendChild(wrap);
    return cell;
  }
  function refreshPreferenceOptionsForStudent(studentId) {
    if (!studentId || !els.preferencesTableBody) return;
    const selects = els.preferencesTableBody.querySelectorAll(`select[data-student-id="${studentId}"][data-pref-type]`);
    const chosen = new Set();
    selects.forEach(sel => {
      const val = sel.value || '';
      if (val) chosen.add(val);
    });
    selects.forEach(sel => {
      sel.querySelectorAll('option').forEach(opt => {
        if (!opt.value) { opt.disabled = false; return; }
        const shouldDisable = chosen.has(opt.value) && opt.value !== sel.value;
        opt.disabled = shouldDisable;
      });
    });
  }
  function refreshAllPreferenceOptions() {
    if (!els.preferencesTableBody) return;
    const seen = new Set();
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-pref-type]');
    selects.forEach(sel => {
      const sid = sel.dataset.studentId;
      if (!sid || seen.has(sid)) return;
      seen.add(sid);
      refreshPreferenceOptionsForStudent(sid);
    });
  }
  function buildPerformanceFlairSummaryStats(draft = null, count = state.performanceFlairCount) {
    const flairs = getAllowedPerformanceFlairs(count);
    const counts = new Map(flairs.map((flair) => [flair, 0]));
    let unassigned = 0;
    state.students.forEach((student) => {
      if (!student || typeof student !== 'object') return;
      const sid = String(student.id || '').trim();
      const draftEntry = draft instanceof Map && sid ? draft.get(sid) : null;
      const flair = sanitizePerformanceFlairForCount(draftEntry?.performanceFlair ?? student.performanceFlair, count);
      if (!flair) {
        unassigned += 1;
        return;
      }
      counts.set(flair, (counts.get(flair) || 0) + 1);
    });
    return { flairs, counts, unassigned };
  }
  function renderSeatPreferencesPerformanceSummary(draft = null) {
    if (!els.preferencesPerformanceSummary) return;
    if (isRandomPickerTabActive() || !state.students.length) {
      els.preferencesPerformanceSummary.hidden = true;
      els.preferencesPerformanceSummary.textContent = '';
      return;
    }
    const { flairs, counts, unassigned } = buildPerformanceFlairSummaryStats(draft);
    els.preferencesPerformanceSummary.hidden = false;
    els.preferencesPerformanceSummary.innerHTML = '';

    const valuesLabel = document.createElement('span');
    valuesLabel.className = 'preferences-performance-summary-sublabel';
    valuesLabel.textContent = 'Lernendenanzahl pro Leistungsklasse:';
    els.preferencesPerformanceSummary.appendChild(valuesLabel);

    const values = document.createElement('div');
    values.className = 'preferences-performance-summary-values';
    flairs.forEach((flair) => {
      const pill = document.createElement('span');
      pill.className = 'preferences-performance-summary-pill';
      pill.textContent = `${flair}: ${counts.get(flair) || 0}`;
      values.appendChild(pill);
    });
    if (unassigned > 0) {
      const pill = document.createElement('span');
      pill.className = 'preferences-performance-summary-pill is-unassigned';
      pill.textContent = `Ohne Zuordnung: ${unassigned}`;
      values.appendChild(pill);
    }
    els.preferencesPerformanceSummary.appendChild(values);

    const countControl = document.createElement('label');
    countControl.className = 'preferences-performance-summary-control';
    countControl.htmlFor = 'performance-flair-count-input';

    const countLabel = document.createElement('span');
    countLabel.className = 'preferences-performance-summary-control-label';
    countLabel.textContent = 'Anzahl an Leistungsklassen:';
    countControl.appendChild(countLabel);

    const countInput = document.createElement('input');
    countInput.type = 'text';
    countInput.id = 'performance-flair-count-input';
    countInput.inputMode = 'numeric';
    countInput.maxLength = 3;
    countInput.value = String(clampPerformanceFlairCount(state.performanceFlairCount));
    countInput.dataset.performanceFlairCountInput = '1';
    countInput.setAttribute('aria-label', 'Anzahl an Leistungsklassen');
    countControl.appendChild(countInput);

    els.preferencesPerformanceSummary.appendChild(countControl);
  }
  function applyPerformanceFlairCount(nextValue, draft = null) {
    const nextCount = clampPerformanceFlairCount(nextValue);
    state.performanceFlairCount = nextCount;
    sanitizePerformanceFlairCountInStudents(nextCount);
    if (draft instanceof Map) {
      draft.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        entry.performanceFlair = sanitizePerformanceFlairForCount(entry.performanceFlair, nextCount);
      });
      buildSeatPreferencesTable(draft);
      return;
    }
    buildSeatPreferencesTable();
  }
  function savePreferencesFromForm() {
    if (!els.preferencesTableBody) return;
    const selects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-pref-type]');
    const performanceSelects = els.preferencesTableBody.querySelectorAll('select[data-student-id][data-preference="performance-flair"]');
    const buddyMap = new Map();
    const foeMap = new Map();
    selects.forEach(select => {
      const sid = select.dataset.studentId;
      const type = select.dataset.prefType;
      const slot = Number(select.dataset.prefSlot);
      if (!sid || Number.isNaN(slot)) return;
      const map = type === 'foe' ? foeMap : buddyMap;
      if (!map.has(sid)) {
        map.set(sid, Array(PREFERENCE_SLOT_COUNT).fill(''));
      }
      map.get(sid)[slot] = select.value || '';
    });
    const flairMap = new Map();
    performanceSelects.forEach((select) => {
      const sid = String(select.dataset.studentId || '').trim();
      if (!sid) return;
      flairMap.set(sid, sanitizePerformanceFlairForCount(select.value));
    });
    state.students.forEach(student => {
      const buddySlots = buddyMap.get(student.id) || [];
      const foeSlots = foeMap.get(student.id) || [];
      applyPreferenceSlots(student, buddySlots, 'buddy');
      applyPreferenceSlots(student, foeSlots, 'foe');
      student.performanceFlair = flairMap.get(student.id) || '';
    });
  }
  function saveRandomPickerConditionsFromForm() {
    if (!els.preferencesTableBody) return;
    const inputs = els.preferencesTableBody.querySelectorAll('input[type="radio"][data-student-id][data-preference="random-weight"]:checked');
    const weightsById = new Map();
    let certainStudentId = '';
    inputs.forEach((input) => {
      const studentId = typeof input.dataset.studentId === 'string' ? input.dataset.studentId : '';
      if (!studentId) return;
      const normalizedWeight = normalizeRandomPickerWeight(input.value);
      weightsById.set(studentId, normalizedWeight);
      if (normalizedWeight === RANDOM_PICKER_CERTAIN_WEIGHT) {
        certainStudentId = studentId;
      }
    });
    state.students.forEach((student) => {
      if (!student) return;
      if (certainStudentId) {
        student.randomWeight = student.id === certainStudentId
          ? RANDOM_PICKER_CERTAIN_WEIGHT
          : RANDOM_PICKER_MIN_WEIGHT;
        return;
      }
      student.randomWeight = weightsById.has(student.id)
        ? weightsById.get(student.id)
        : normalizeRandomPickerWeight(student.randomWeight);
    });
    if (els.randomPickerAutoDisableSelected) {
      state.randomPickerAutoDisableSelected = normalizeRandomPickerAutoDisableSelected(
        els.randomPickerAutoDisableSelected.checked
      );
    }
    renderRandomPicker();
  }
  function resetRandomPickerConditionsInForm() {
    if (!els.preferencesTableBody) return;
    const normalChoices = els.preferencesTableBody.querySelectorAll(
      `input[type="radio"][data-preference="random-weight"][value="${RANDOM_PICKER_DEFAULT_WEIGHT}"]`
    );
    normalChoices.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = true;
    });
    if (els.randomPickerAutoDisableSelected) {
      els.randomPickerAutoDisableSelected.checked = false;
    }
  }
  function applyPreferenceSlots(student, slots, variant) {
    const entries = [];
    const seen = new Set();
    slots.forEach(value => {
      if (!value || value === student.id || seen.has(value)) return;
      seen.add(value);
      entries.push(value);
    });
    if (variant === 'buddy') {
      student.buddies = entries;
    } else {
      student.foes = entries;
    }
  }
  function isSeatWithinBounds(id, rows, cols) {
    if (!id) return false;
    const [rStr, cStr] = id.split('-');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
    return r >= 1 && r <= rows && c >= 1 && c <= cols;
  }
  function sanitizeSeatIdWithinLimit(id, maxRows = MAX_GRID_SIZE, maxCols = MAX_GRID_SIZE) {
    if (typeof id !== 'string') return null;
    const [rStr, cStr] = id.split('-');
    const r = parseInt(rStr, 10);
    const c = parseInt(cStr, 10);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    if (r < 1 || r > maxRows || c < 1 || c > maxCols) return null;
    return seatId(r, c);
  }
  function enforceGridBounds() {
    const rows = clampGridDimension(state.gridRows);
    const cols = clampGridDimension(state.gridCols);
    state.gridRows = rows;
    state.gridCols = cols;
    const filterSet = (set) => {
      const next = new Set();
      set.forEach(id => {
        if (isSeatWithinBounds(id, rows, cols)) next.add(id);
      });
      return next;
    };
    state.activeSeats = filterSet(state.activeSeats);
    state.lockedSeats = filterSet(state.lockedSeats);
    const trimmedSeats = {};
    Object.entries(state.seats).forEach(([id, val]) => {
      if (isSeatWithinBounds(id, rows, cols)) {
        trimmedSeats[id] = ensureSeatList(val);
      }
    });
    state.seats = trimmedSeats;
    const trimmedTopics = {};
    state.activeSeats.forEach(id => {
      const val = state.seatTopics?.[id];
      if (typeof val === 'string') { trimmedTopics[id] = val; }
    });
    state.seatTopics = trimmedTopics;
  }
  function createPlanSnapshot() {
    if (!state.activeSeats.size) {
      showMessage('Keine aktiven Gruppenfelder vorhanden.', 'warn');
      return null;
    }
    const orderedActiveIds = Array.isArray(state.activeSeatOrder)
      ? state.activeSeatOrder.filter(id => state.activeSeats.has(id))
      : [];
    const activeIds = orderedActiveIds.length ? orderedActiveIds : Array.from(state.activeSeats);
    const seatSnapshot = {};
    activeIds.forEach(id => {
      seatSnapshot[id] = getSeatList(id);
    });
    const storedDuration = parseWorkOrderDuration(state.workOrderDurationMinutes);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      grid: { rows: state.gridRows, cols: state.gridCols },
      activeSeats: activeIds,
      lockedSeats: Array.from(state.lockedSeats),
      seats: seatSnapshot,
      seatTopics: activeIds.reduce((acc, id) => {
        if (typeof state.seatTopics?.[id] === 'string') {
          acc[id] = state.seatTopics[id];
        }
        return acc;
      }, {}),
      workOrder: typeof state.workOrder === 'string' ? state.workOrder : '',
      workOrderDurationMinutes: storedDuration,
      workOrderStartISO: hasWorkOrderTiming() ? state.workOrderStartISO : null,
      students: state.students,
      performanceFlairCount: clampPerformanceFlairCount(state.performanceFlairCount),
      randomPickerAutoDisableSelected: normalizeRandomPickerAutoDisableSelected(
        state.randomPickerAutoDisableSelected
      ),
      headers: state.headers,
      delim: state.delim,
      csvName: state.csvName || '',
      minGroupSize: clampMinGroupSize(state.minGroupSize || 1),
      maxGroupSize: clampMaxGroupSize(state.maxGroupSize || 1),
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
      showMessage('Demo: Downloads sind für Beispieldaten deaktiviert.', 'info');
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
      showMessage('Demo: Speichern und Exportieren ist für Beispieldaten deaktiviert.', 'info');
      return;
    }
    const snapshot = createPlanSnapshot();
    if (!snapshot) return;
    const defaultName = getSuggestedPlanFileName();
    let nameInput = defaultName;
    if (!isIOSDevice) {
      const promptLabel = getActiveTab() === TAB_RANDOM_PICKER
        ? 'Bitte gib einen Dateinamen für den Pickerstand ein:'
        : 'Bitte gib einen Dateinamen ein:';
      const desiredName = prompt(promptLabel, defaultName);
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

  function printSeatPlan() {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Drucken ist für Beispieldaten deaktiviert.', 'info');
      return;
    }
    if (typeof window === 'undefined' || typeof window.print !== 'function') {
      showMessage('Drucken wird vom Browser nicht unterstützt.', 'warn');
      return;
    }
    if (els.printPlanTitle) {
      els.printPlanTitle.textContent = getSuggestedPlanFileName();
    }
    applyPrintScale();
    requestAnimationFrame(() => {
      try {
        window.print();
      } finally {
        resetPrintScale();
      }
    });
  }

  let printScaleApplied = false;
  function measurePrintTitleBlockHeight(maxWidth) {
    if (!els.printPlanTitle) return 0;
    const titleEl = els.printPlanTitle;
    const prev = {
      display: titleEl.style.display,
      position: titleEl.style.position,
      left: titleEl.style.left,
      top: titleEl.style.top,
      visibility: titleEl.style.visibility,
      pointerEvents: titleEl.style.pointerEvents,
      width: titleEl.style.width,
      maxWidth: titleEl.style.maxWidth,
    };
    const width = Math.max(120, Math.floor(maxWidth || 120));
    titleEl.style.display = 'block';
    titleEl.style.position = 'fixed';
    titleEl.style.left = '0';
    titleEl.style.top = '0';
    titleEl.style.visibility = 'hidden';
    titleEl.style.pointerEvents = 'none';
    titleEl.style.width = `${width}px`;
    titleEl.style.maxWidth = `${width}px`;
    const rect = titleEl.getBoundingClientRect();
    const style = getComputedStyle(titleEl);
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    titleEl.style.display = prev.display;
    titleEl.style.position = prev.position;
    titleEl.style.left = prev.left;
    titleEl.style.top = prev.top;
    titleEl.style.visibility = prev.visibility;
    titleEl.style.pointerEvents = prev.pointerEvents;
    titleEl.style.width = prev.width;
    titleEl.style.maxWidth = prev.maxWidth;
    return Math.max(0, rect.height + marginTop + marginBottom);
  }

  function applyPrintScale() {
    const target = els.groupsGrid || els.groupsGridWrap;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const contentWidth = Math.max(1, rect.width, target.scrollWidth || 0);
    const contentHeight = Math.max(1, rect.height, target.scrollHeight || 0);
    const marginMm = 6;
    const mmPerIn = 25.4;
    const marginIn = marginMm / mmPerIn;
    const a4Landscape = { widthIn: 297 / mmPerIn, heightIn: 210 / mmPerIn };
    const letterLandscape = { widthIn: 11, heightIn: 8.5 };
    const printableWidthIn = Math.min(
      a4Landscape.widthIn - 2 * marginIn,
      letterLandscape.widthIn - 2 * marginIn
    );
    const printableHeightIn = Math.min(
      a4Landscape.heightIn - 2 * marginIn,
      letterLandscape.heightIn - 2 * marginIn
    );
    const pxPerIn = 96;
    const pageWidthPx = printableWidthIn * pxPerIn;
    const pageHeightPx = printableHeightIn * pxPerIn;
    const roundingReservePx = 6;
    const maxWidth = Math.max(1, pageWidthPx - roundingReservePx);
    const titleBlockHeight = measurePrintTitleBlockHeight(maxWidth);
    const maxHeight = Math.max(1, pageHeightPx - roundingReservePx - titleBlockHeight);
    if (!contentWidth || !contentHeight) {
      document.documentElement.style.setProperty('--print-scale', '1');
      printScaleApplied = true;
      return;
    }
    const rawScale = Math.min(1, maxWidth / contentWidth, maxHeight / contentHeight);
    const precisionReserve = rawScale < 1 ? 0.002 : 0;
    const scale = Math.max(0.05, rawScale - precisionReserve);
    document.documentElement.style.setProperty('--print-scale', scale.toFixed(3));
    printScaleApplied = true;
  }

  function resetPrintScale() {
    if (!printScaleApplied) return;
    document.documentElement.style.setProperty('--print-scale', '1');
    printScaleApplied = false;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeprint', applyPrintScale);
    window.addEventListener('afterprint', resetPrintScale);
  }

  function applyPlanData(data, options = {}) {
    const restoreSeatAssignments = options.restoreSeatAssignments !== false;
    if (!data || typeof data !== 'object') throw new Error('Ungültiges Plan-Format.');
    const incomingStudents = Array.isArray(data.students) ? data.students : [];
    const incomingSeats = data.seats && typeof data.seats === 'object' ? data.seats : {};
    const incomingTopics = data.seatTopics && typeof data.seatTopics === 'object' ? data.seatTopics : {};
    const incomingActive = Array.isArray(data.activeSeats) ? data.activeSeats.filter(Boolean) : [];
    const incomingCsvName = typeof data.csvName === 'string' ? data.csvName : '';
    const seatAssignments = new Map();
    const seatIds = new Set();
    const activeSeatOrder = [];
    const activeSeatSet = new Set();
    const registerSeat = (rawId) => {
      const normalized = sanitizeSeatIdWithinLimit(rawId);
      if (!normalized) return null;
      seatIds.add(normalized);
      return normalized;
    };
    const registerActiveSeat = (rawId) => {
      const normalized = registerSeat(rawId);
      if (!normalized || activeSeatSet.has(normalized)) return normalized;
      activeSeatSet.add(normalized);
      activeSeatOrder.push(normalized);
      return normalized;
    };
    incomingActive.forEach(registerActiveSeat);
    Object.entries(incomingSeats).forEach(([id, val]) => {
      const normalized = registerSeat(id);
      if (normalized) {
        seatAssignments.set(normalized, ensureSeatList(val));
        if (!incomingActive.length) {
          registerActiveSeat(normalized);
        }
      }
    });
    if (!incomingActive.length) {
      Object.keys(incomingTopics).forEach(registerActiveSeat);
      (Array.isArray(data.lockedSeats) ? data.lockedSeats : []).forEach(registerActiveSeat);
    }
    if (!seatIds.size) throw new Error('Plan enthält keine Gruppenfelder.');
    const maxFromIds = (idx) => {
      let max = 1;
      seatIds.forEach(id => {
        const parts = id.split('-').map(Number);
        const val = parts[idx];
        if (Number.isFinite(val) && val > max) max = val;
      });
      return max;
    };
    const planRows = normalizeGridDimension(data.grid?.rows);
    const planCols = normalizeGridDimension(data.grid?.cols);
    const requiredRows = maxFromIds(0);
    const requiredCols = maxFromIds(1);
    const currentRows = clampGridDimension(state.gridRows);
    const currentCols = clampGridDimension(state.gridCols);
    state.gridRows = planRows !== null
      ? clampGridDimension(Math.max(planRows, requiredRows))
      : clampGridDimension(Math.max(currentRows, requiredRows));
    state.gridCols = planCols !== null
      ? clampGridDimension(Math.max(planCols, requiredCols))
      : clampGridDimension(Math.max(currentCols, requiredCols));
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
    state.minGroupSize = clampMinGroupSize(data.minGroupSize ?? state.minGroupSize);
    state.maxGroupSize = clampMaxGroupSize(data.maxGroupSize ?? state.maxGroupSize);
    const fallbackActiveOrder = Array.from(buildFullActiveSet(state.gridRows, state.gridCols));
    const nextActiveOrder = activeSeatOrder.length
      ? activeSeatOrder
      : (incomingActive.length ? Array.from(seatIds) : fallbackActiveOrder);
    state.activeSeatOrder = nextActiveOrder;
    state.activeSeats = new Set(nextActiveOrder);
    const locked = Array.isArray(data.lockedSeats) ? data.lockedSeats : [];
    const sanitizedLocks = locked
      .map(id => sanitizeSeatIdWithinLimit(id))
      .filter(id => id && state.activeSeats.has(id));
    state.lockedSeats = restoreSeatAssignments ? new Set(sanitizedLocks) : new Set();
    state.seats = {};
    state.activeSeats.forEach(id => {
      state.seats[id] = restoreSeatAssignments && seatAssignments.has(id)
        ? ensureSeatList(seatAssignments.get(id))
        : [];
    });
    const topics = {};
    state.activeSeats.forEach(id => {
      if (typeof incomingTopics[id] === 'string') {
        topics[id] = incomingTopics[id];
      }
    });
    state.seatTopics = topics;
    const importedWorkOrder = typeof data.workOrder === 'string' ? data.workOrder : '';
    const incomingStart = typeof data.workOrderStartISO === 'string'
      ? data.workOrderStartISO
      : (typeof data.workOrderStart === 'string' ? data.workOrderStart : null);
    const incomingDuration = parseWorkOrderDuration(
      data.workOrderDurationMinutes ?? data.workOrderDuration
    );
    const nextStart = importedWorkOrder.trim() && incomingDuration && incomingStart && Number.isFinite(Date.parse(incomingStart))
      ? incomingStart
      : null;
    replaceTimerState({
      ...SharedTimerStore.getState(),
      workOrderText: importedWorkOrder,
      durationMinutes: incomingDuration,
      startISO: nextStart,
      alarmState: false,
    });
    state._lastImport = !restoreSeatAssignments;
    state.scrollHintDismissed = restoreSeatAssignments;
    enforceGridBounds();
    buildGrid();
    if (!restoreSeatAssignments) {
      els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    }
    renderRandomPicker();
    refreshUnseated();
    renderWorkOrder();
    updateScrollHint();
  }

  async function importPlanFromFile(file, handle) {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info');
      return;
    }
    if (!file) return;
    const planLabelFromFile = sanitizeExportFileName(stripFileExtension(file.name || ''));
    const rawText = await file.text();
    const text = stripJsonWarning(rawText);
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

  function createStudentNode(s) {
    const tpl = document.getElementById('student-tpl');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.sid = s.id;
    node.querySelector('.name').textContent = displayName(s);
    node.querySelector('.tag').textContent = s.id;
    if (getActiveTab() === TAB_RANDOM_PICKER) {
      node.setAttribute('draggable', 'false');
      node.removeAttribute('title');
    } else {
      addDragHandlers(node);
      enableTouchDragSource(node, () => {
        return {
          type: 'assignment',
          studentId: s.id,
          fromSeat: null,
          label: displayName(s) || s.id
        };
      });
    }
    return node;
  }

  function refreshUnseated() {
    if (!els.unseated) return;
    els.unseated.innerHTML = '';
    const seatedIds = new Set(
      Object.values(state.seats)
        .map(ensureSeatList)
        .flat()
    );
    const unassigned = state.students.filter(s => !seatedIds.has(s.id));
    unassigned.forEach(s => {
      els.unseated.appendChild(createStudentNode(s));
    });
    updateScrollHint();
    syncGroupSizeInputs();
  }

  function parseWorkOrderDuration(value) {
    if (value === null || value === undefined) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }
  function syncTimerDurationRange(durationValue) {
    const range = els.workOrderDurationRange;
    if (!range) return;
    const duration = parseWorkOrderDuration(durationValue);
    const rangeValue = duration ?? TIMER_DURATION_RANGE_DEFAULT;
    const nextMax = Math.max(TIMER_DURATION_RANGE_MAX, rangeValue);
    if (range.max !== String(nextMax)) {
      range.max = String(nextMax);
    }
    if (range.value !== String(rangeValue)) {
      range.value = String(rangeValue);
    }
    range.setAttribute('aria-valuetext', `${rangeValue} Minuten`);
  }
  function getTimerPlaceholder() {
    return timerShowSeconds ? '--:--:--' : '--:--';
  }
  function formatDurationHMS(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return getTimerPlaceholder();
    const totalMinutes = Math.floor(minutes);
    const totalSeconds = totalMinutes * 60;
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (timerShowSeconds) {
      const seconds = totalSeconds % 60;
      return [hours, mins, seconds].map(v => String(v).padStart(2, '0')).join(':');
    }
    return [hours, mins].map(v => String(v).padStart(2, '0')).join(':');
  }
  function formatRemainingDuration(remainingMs) {
    const safeRemaining = Math.max(0, remainingMs);
    if (timerShowSeconds) {
      const remainingSeconds = Math.ceil(safeRemaining / 1000);
      const hours = Math.floor(remainingSeconds / 3600);
      const mins = Math.floor((remainingSeconds % 3600) / 60);
      const seconds = remainingSeconds % 60;
      return [hours, mins, seconds].map(v => String(Math.max(0, v)).padStart(2, '0')).join(':');
    }
    const remainingMinutes = Math.ceil(safeRemaining / 60000);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    return [hours, mins].map(v => String(Math.max(0, v)).padStart(2, '0')).join(':');
  }
  function positionWorkOrderHintOverlay() {
    const overlay = els.workOrderHintOverlay;
    const target = els.workOrderRestClock;
    if (!overlay || !target) return;
    if (!overlay.classList.contains('visible')) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const overlayRect = overlay.getBoundingClientRect();
    const width = overlayRect.width || overlay.offsetWidth || 0;
    const height = overlayRect.height || overlay.offsetHeight || 0;
    const offsetParentRect = overlay.offsetParent && typeof overlay.offsetParent.getBoundingClientRect === 'function'
      ? overlay.offsetParent.getBoundingClientRect()
      : null;
    const containerRect = offsetParentRect
      || (els.workOrderShell && !els.workOrderShell.hidden ? els.workOrderShell.getBoundingClientRect() : null)
      || els.mainPanel?.getBoundingClientRect();
    const containerWidth = containerRect?.width || window.innerWidth || document.documentElement.clientWidth || width;
    const containerHeight = containerRect?.height || window.innerHeight || document.documentElement.clientHeight || height;
    const containerLeft = containerRect?.left || 0;
    const containerTop = containerRect?.top || 0;
    const inset = 12;
    const horizontalCenter = (rect.left - containerLeft) + (rect.width / 2);
    const maxLeft = Math.max(inset, containerWidth - width - inset);
    const desiredLeft = horizontalCenter - (width / 2);
    const clampedLeft = Math.min(Math.max(desiredLeft, inset), maxLeft);
    let top = (rect.top - containerTop) - height - inset;
    let positionFlag = 'above';
    if (top < inset) {
      top = (rect.bottom - containerTop) + inset;
      positionFlag = 'below';
    }
    const maxTop = Math.max(inset, containerHeight - height - inset);
    const clampedTop = Math.min(Math.max(top, inset), maxTop);
    overlay.style.left = `${clampedLeft}px`;
    overlay.style.top = `${clampedTop}px`;
    overlay.setAttribute('data-position', positionFlag);
  }
  function hasWorkOrderTiming() {
    const duration = Number(state.workOrderDurationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    const startIso = typeof state.workOrderStartISO === 'string' ? state.workOrderStartISO.trim() : '';
    if (!startIso) return false;
    return Number.isFinite(Date.parse(startIso));
  }
  function renderControlStatus(el, status, text) {
    if (!el) return;
    const normalized = typeof status === 'string' && status.trim() ? status.trim() : 'ready';
    el.textContent = text || 'Status: bereit';
    el.className = `control-status is-${normalized}`;
  }
  function renderWorkOrderTimerButtonsState() {
    timerUiState = state.workOrderAlarmed
      ? TIMER_UI_STATE.ALARM
      : (hasWorkOrderTiming() ? TIMER_UI_STATE.RUNNING : TIMER_UI_STATE.READY);
    const active = timerUiState !== TIMER_UI_STATE.READY;
    const hasDuration = Boolean(parseWorkOrderDuration(state.workOrderDurationMinutes));
    appEl.classList.toggle('work-order-timer-inactive', !hasDuration);
    const startButtons = [els.timerWorkOrderStart, els.workPhaseTimerStartCollapsed].filter(Boolean);
    const stopButtons = [els.timerWorkOrderStop, els.workPhaseTimerStopCollapsed].filter(Boolean);
    startButtons.forEach((button) => {
      button.disabled = active;
      button.textContent = '⏰';
      button.classList.toggle('is-running', false);
      button.classList.toggle('is-off', false);
      button.setAttribute('aria-label', 'Arbeitszeit starten');
      button.setAttribute('title', 'Arbeitszeit starten');
    });
    stopButtons.forEach((button) => {
      button.disabled = !active;
      button.textContent = '⏰';
      button.classList.toggle('is-running', active);
      button.classList.toggle('is-off', true);
      button.setAttribute('aria-label', 'Arbeitszeit stoppen');
      button.setAttribute('title', 'Arbeitszeit stoppen');
    });
    const timerStatusText = timerUiState === TIMER_UI_STATE.ALARM
      ? 'Status: alarm'
      : (timerUiState === TIMER_UI_STATE.RUNNING ? 'Status: läuft' : 'Status: bereit');
    renderControlStatus(els.timerControlStatus, timerUiState, timerStatusText);
  }
  function resetWorkOrderTimerDisplay() {
    if (els.workOrderCountdown) {
      els.workOrderCountdown.textContent = getTimerPlaceholder();
    }
    if (els.workOrderEndtime) {
      els.workOrderEndtime.textContent = '--:--';
    }
  }
  function resetTimerWarningMilestones(lastRatio = null) {
    timerMilestoneTriggered = { half: false, quarter: false };
    if (Number.isFinite(lastRatio)) {
      timerLastRemainingRatio = Math.max(0, Math.min(1, Number(lastRatio)));
    } else {
      timerLastRemainingRatio = null;
    }
  }
  function isTimerWarningToneEnabled(toneKey) {
    if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return false;
    return Boolean(timerWarningToneEnabled[toneKey]);
  }
  function getTimerWarningToneLabel(toneKey) {
    if (toneKey === 'half') return 'Warnton nach 50%';
    if (toneKey === 'quarter') return 'Warnton nach 75%';
    return 'Warnton bei Ende';
  }
  function getTimerWarningMessage(level) {
    if (level === 'half') return '50 % erreicht';
    if (level === 'quarter') return '75 % erreicht';
    return 'Zeit abgelaufen';
  }
  function clearTimerWarningBanner() {
    const banner = els.timerWarningBanner;
    if (!banner) return;
    banner.hidden = true;
    banner.textContent = '';
    banner.classList.remove('visible', 'level-half', 'level-quarter', 'level-end');
  }
  function showTimerWarningBanner(level) {
    const banner = els.timerWarningBanner;
    if (!banner) return;
    const normalizedLevel = level === 'end' ? 'end' : (level === 'quarter' ? 'quarter' : 'half');
    banner.hidden = false;
    banner.textContent = getTimerWarningMessage(normalizedLevel);
    banner.classList.remove('level-half', 'level-quarter', 'level-end');
    banner.classList.add(`level-${normalizedLevel}`);
    banner.classList.remove('visible');
    void banner.offsetWidth;
    banner.classList.add('visible');
  }
  function clearTimerVisualWarnings() {
    if (!els.timerShell) return;
    els.timerShell.classList.remove('timer-warning-half', 'timer-warning-quarter', 'timer-warning-end');
    clearTimerWarningBanner();
  }
  function triggerTimerVisualWarning(level, { persistent = false } = {}) {
    if (!els.timerShell) return;
    clearTimerVisualWarnings();
    const tone = level === 'end' ? 'end' : (level === 'quarter' ? 'quarter' : 'half');
    els.timerShell.classList.add(`timer-warning-${tone}`);
    showTimerWarningBanner(tone);
    if (timerVisualWarningTimeoutId) {
      clearTimeout(timerVisualWarningTimeoutId);
      timerVisualWarningTimeoutId = null;
    }
    if (persistent) return;
    const durationMs = tone === 'quarter' ? 2600 : 2000;
    timerVisualWarningTimeoutId = setTimeout(() => {
      timerVisualWarningTimeoutId = null;
      if (state.workOrderAlarmed) return;
      clearTimerVisualWarnings();
    }, durationMs);
  }
  function ensureWorkOrderAudioContext({ resume = false } = {}) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!workOrderAudioCtx || workOrderAudioCtx.state === 'closed') {
      workOrderAudioCtx = new AudioCtx();
    }
    const ctx = workOrderAudioCtx;
    if (resume && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      const resumePromise = ctx.resume();
      if (resumePromise && typeof resumePromise.catch === 'function') {
        resumePromise.catch((error) => {
          reportAppError(error, '', {
            scope: 'timer-audio',
            action: 'resume-audio-context',
          });
        });
      }
    }
    return ctx;
  }
  function closeWorkOrderAudioContext() {
    if (!workOrderAudioCtx || workOrderAudioCtx.state === 'closed' || typeof workOrderAudioCtx.close !== 'function') {
      workOrderAudioCtx = null;
      return;
    }
    const ctx = workOrderAudioCtx;
    workOrderAudioCtx = null;
    const closePromise = ctx.close();
    if (closePromise && typeof closePromise.catch === 'function') {
      closePromise.catch((error) => {
        reportAppError(error, '', {
          scope: 'timer-audio',
          action: 'close-audio-context',
        });
      });
    }
  }
  function scheduleTimerMilestoneTone(ctx, toneKey) {
    if (!ctx || ctx.state === 'closed') return;
    const pulses = toneKey === 'quarter'
      ? [
        { frequency: 1180, gain: 0.16, durationMs: 150, offsetMs: 0, type: 'triangle' },
        { frequency: 900, gain: 0.14, durationMs: 150, offsetMs: 180, type: 'triangle' },
        { frequency: 1180, gain: 0.16, durationMs: 150, offsetMs: 360, type: 'triangle' },
      ]
      : [
        { frequency: 1040, gain: 0.13, durationMs: 170, offsetMs: 0, type: 'triangle' },
        { frequency: 780, gain: 0.12, durationMs: 160, offsetMs: 180, type: 'triangle' },
      ];
    pulses.forEach(({ frequency, gain, durationMs, offsetMs, type }) => {
      const startTime = ctx.currentTime + (offsetMs / 1000);
      const endTime = startTime + (durationMs / 1000);
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.015);
    });
  }
  function playTimerMilestoneTone(toneKey) {
    try {
      const ctx = ensureWorkOrderAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const resumePromise = ctx.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise
            .then(() => scheduleTimerMilestoneTone(ctx, toneKey))
            .catch((error) => {
              reportAppError(error, '', {
                scope: 'timer-audio',
                action: 'play-milestone-tone',
                toneKey,
              });
            });
          return;
        }
      }
      scheduleTimerMilestoneTone(ctx, toneKey);
    } catch (error) {
      reportAppError(error, '', {
        scope: 'timer-audio',
        action: 'schedule-milestone-tone',
        toneKey,
      });
    }
  }
  function handleTimerMilestones(remainingMs, totalDurationMs) {
    if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));
    if (!Number.isFinite(timerLastRemainingRatio)) {
      timerLastRemainingRatio = ratio;
      return;
    }
    const crossedThreshold = (threshold) => timerLastRemainingRatio > threshold && ratio <= threshold;
    if (!timerMilestoneTriggered.half && crossedThreshold(0.5)) {
      timerMilestoneTriggered.half = true;
      triggerTimerVisualWarning('half');
      if (isTimerWarningToneEnabled('half')) {
        playTimerMilestoneTone('half');
      }
    }
    if (!timerMilestoneTriggered.quarter && crossedThreshold(0.25)) {
      timerMilestoneTriggered.quarter = true;
      triggerTimerVisualWarning('quarter');
      if (isTimerWarningToneEnabled('quarter')) {
        playTimerMilestoneTone('quarter');
      }
    }
    timerLastRemainingRatio = ratio;
  }
  function stopWorkOrderTimer() {
    if (workOrderTimerId !== null) {
      clearInterval(workOrderTimerId);
      workOrderTimerId = null;
    }
    updateWorkOrderAlert(false);
  }
  function startWorkOrderAlarmSound() {
    if (!isTimerWarningToneEnabled('end')) return;
    if (workOrderAlarmIntervalId !== null) return;
    triggerWorkOrderBell();
    workOrderAlarmIntervalId = setInterval(triggerWorkOrderBell, 900);
  }
  function stopWorkOrderAlarmSound() {
    if (workOrderAlarmIntervalId !== null) {
      clearInterval(workOrderAlarmIntervalId);
      workOrderAlarmIntervalId = null;
    }
  }
  function triggerWorkOrderBell() {
    try {
      const ctx = ensureWorkOrderAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const resumePromise = ctx.resume();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise
            .then(() => triggerWorkOrderBell())
            .catch((error) => {
              reportAppError(error, '', {
                scope: 'timer-audio',
                action: 'trigger-bell-resume',
              });
            });
          return;
        }
      }
      const duration = 1.5;
      const base = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();
      base.type = 'sine';
      overtone.type = 'sine';
      base.frequency.setValueAtTime(420, ctx.currentTime);
      overtone.frequency.setValueAtTime(840, ctx.currentTime);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      base.connect(gain);
      overtone.connect(gain);
      gain.connect(ctx.destination);
      base.start();
      overtone.start();
      base.stop(ctx.currentTime + duration);
      overtone.stop(ctx.currentTime + duration);
    } catch (err) {
      reportAppError(err, '', {
        scope: 'timer-audio',
        action: 'trigger-bell',
      });
    }
  }
  function updateWorkOrderAlert(active) {
    if (!els.workOrderRestClock) return;
    els.workOrderRestClock.classList.toggle('alert', Boolean(active));
    if (els.workOrderHintOverlay) {
      if (active) {
        els.workOrderHintOverlay.classList.add('visible');
        positionWorkOrderHintOverlay();
      } else {
        els.workOrderHintOverlay.classList.remove('visible');
      }
    }
    if (!active) {
      if (state.workOrderAlarmed) {
        clearTimerVisualWarnings();
        replaceTimerState({
          ...SharedTimerStore.getState(),
          alarmState: false,
        });
      } else if (!hasWorkOrderTiming()) {
        clearTimerVisualWarnings();
      }
      stopWorkOrderAlarmSound();
    } else if (state.workOrderAlarmed) {
      triggerTimerVisualWarning('end', { persistent: true });
      startWorkOrderAlarmSound();
    }
    renderWorkOrderTimerButtonsState();
  }
  function getTimerSecondsToggleLabel() {
    return 'Sekunden anzeigen';
  }
  function renderTimerWarningToneState() {
    els.timerWarningToneButtons?.forEach((button) => {
      const toneKey = button.dataset.timerWarningToneToggle;
      if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
      const label = getTimerWarningToneLabel(toneKey);
      button.setAttribute('aria-checked', String(isTimerWarningToneEnabled(toneKey)));
      button.setAttribute('aria-label', label);
    });
    els.timerWarningToneLabels?.forEach((labelElement) => {
      const toneKey = labelElement.dataset.timerWarningToneLabel;
      if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
      labelElement.textContent = getTimerWarningToneLabel(toneKey);
    });
  }
  function renderTimerSecondsToggleState() {
    const label = getTimerSecondsToggleLabel();
    els.timerSecondsToggleButtons?.forEach((button) => {
      button.setAttribute('aria-checked', String(timerShowSeconds));
      button.setAttribute('aria-label', label);
    });
    els.timerSecondsToggleLabels?.forEach((labelElement) => {
      labelElement.textContent = label;
    });
  }
  function updateWorkOrderCountdown() {
    if (!hasWorkOrderTiming()) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      stopWorkOrderTimer();
      return;
    }
    const startMs = Date.parse(state.workOrderStartISO);
    const durationMinutes = Number(state.workOrderDurationMinutes);
    if (!Number.isFinite(startMs) || !Number.isFinite(durationMinutes)) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      stopWorkOrderTimer();
      return;
    }
    const totalDurationMs = durationMinutes * 60000;
    const endMs = startMs + totalDurationMs;
    const now = Date.now();
    const remaining = Math.max(0, endMs - now);
    handleTimerMilestones(remaining, totalDurationMs);
    if (els.workOrderCountdown) {
      els.workOrderCountdown.textContent = formatRemainingDuration(remaining);
    }
    if (els.workOrderEndtime) {
      const endDate = new Date(endMs);
      els.workOrderEndtime.textContent = endDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    if (remaining <= 0) {
      timerLastRemainingRatio = 0;
      stopWorkOrderTimer();
      if (!state.workOrderAlarmed) {
        replaceTimerState({
          ...SharedTimerStore.getState(),
          alarmState: true,
        });
        updateWorkOrderAlert(true);
        startWorkOrderAlarmSound();
      }
    } else {
      updateWorkOrderAlert(false);
    }
  }
  function refreshWorkOrderTimer() {
    stopWorkOrderTimer();
    if (!hasWorkOrderTiming()) {
      resetTimerWarningMilestones(null);
      resetWorkOrderTimerDisplay();
      return;
    }
    updateWorkOrderCountdown();
    workOrderTimerId = setInterval(updateWorkOrderCountdown, 1000);
  }

  function renderWorkOrder() {
    const container = els.workOrderDisplay;
    if (!container) return;
    const text = typeof state.workOrder === 'string' ? state.workOrder : '';
    const hasContent = text.trim().length > 0;
    appEl.classList.toggle('work-order-empty', !hasContent);
    if (els.workOrderTextarea && document.activeElement !== els.workOrderTextarea && els.workOrderTextarea.value !== text) {
      els.workOrderTextarea.value = text;
    }
    if (els.workOrderBody) {
      els.workOrderBody.textContent = hasContent ? text : '';
    }
    container.hidden = false;
    const durationValue = parseWorkOrderDuration(state.workOrderDurationMinutes);
    const durationText = durationValue ? String(durationValue) : '';
    if (els.workOrderDurationInput && document.activeElement !== els.workOrderDurationInput
      && els.workOrderDurationInput.value !== durationText) {
      els.workOrderDurationInput.value = durationText;
    }
    syncTimerDurationRange(durationValue);
    const showTiming = Number.isFinite(durationValue) && durationValue > 0;
    if (els.workOrderMeta) {
      els.workOrderMeta.hidden = false;
      els.workOrderMeta.classList.add('visible');
    }
    if (!showTiming) {
      resetTimerWarningMilestones(null);
      stopWorkOrderTimer();
      resetWorkOrderTimerDisplay();
      updateWorkOrderAlert(false);
      return;
    }
    if (showTiming && hasWorkOrderTiming()) {
      refreshWorkOrderTimer();
    } else {
      resetTimerWarningMilestones(null);
      stopWorkOrderTimer();
      if (els.workOrderCountdown) {
        els.workOrderCountdown.textContent = formatDurationHMS(durationValue);
      }
      if (els.workOrderEndtime) {
        els.workOrderEndtime.textContent = '--:--';
      }
      updateWorkOrderAlert(false);
    }
  }

  const GROUP_GRID_LAYOUT = Object.freeze({
    seatWidth: 560,
    seatHeight: 380,
    gap: 12,
    padding: 10,
  });
  const GROUP_GRID_LAYOUT_COLLAPSED = Object.freeze({
    seatWidth: 460,
    seatHeight: 170,
    gap: 10,
    padding: 8,
  });
  const GROUP_TILE_CONTENT_LAYOUT = Object.freeze({
    expanded: Object.freeze({
      seatPaddingTop: 120,
      seatPaddingBottom: 16,
      seatPaddingX: 16,
      chipTrackWidth: 240,
      chipGap: 10,
      chipHeight: 46,
    }),
    collapsed: Object.freeze({
      seatPaddingTop: 70,
      seatPaddingBottom: 8,
      seatPaddingX: 10,
      chipTrackWidth: 200,
      chipGap: 6,
      chipHeight: 32,
    }),
  });
  let groupGridLayoutRafId = 0;
  let lastGroupGridLayoutSignature = '';
  let lastGroupGridViewportMode = '';
  let groupGridLayoutRetryTimers = [];

  function isGroupCollapsedViewport() {
    const hostApp = els.groupsMainHost?.closest('.app');
    return Boolean(
      hostApp?.classList.contains('app-tab-groups')
      && (
        hostApp.classList.contains('is-collapsing')
        || hostApp.classList.contains('chrome-collapsed')
      )
    );
  }

  function getGroupElementPaddingSize(element) {
    if (!element || typeof getComputedStyle !== 'function') {
      return { x: 0, y: 0 };
    }
    const style = getComputedStyle(element);
    return {
      x: (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0),
      y: (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0),
    };
  }

  function getGroupElementContentBoxSize(element) {
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    const padding = getGroupElementPaddingSize(element);
    return {
      width: Math.max(0, Math.round(Math.max(element.clientWidth - padding.x, rect.width - padding.x))),
      height: Math.max(0, Math.round(Math.max(element.clientHeight - padding.y, rect.height - padding.y))),
    };
  }

  function pickGroupViewportDimension(candidates) {
    const sizes = candidates
      .map((value) => Math.max(0, Math.round(Number(value) || 0)));
    for (let index = 0; index < sizes.length; index += 1) {
      const candidate = sizes[index];
      const maxRemaining = Math.max(0, ...sizes.slice(index + 1));
      if (candidate > 40 && (maxRemaining <= 80 || candidate >= maxRemaining * 0.55)) {
        return candidate;
      }
    }
    return Math.max(0, ...sizes);
  }

  function rememberStableGroupViewportSize(size) {
    if (!size) return;
    const width = Math.max(0, Math.round(Number(size.width) || 0));
    const height = Math.max(0, Math.round(Number(size.height) || 0));
    if (width <= 80 || height <= 80) return;
    getGroupGridViewportSize._lastStable = { width, height };
  }

  function getGroupGridViewportSize() {
    if (!els.groupsGridWrap) return { width: 0, height: 0 };
    let width = els.groupsGridWrap.clientWidth;
    let height = els.groupsGridWrap.clientHeight;
    const wrapRect = els.groupsGridWrap.getBoundingClientRect();
    const host = els.groupsMainHost || els.groupsGridWrap.closest('#groups-main-host');
    const main = els.groupsGridWrap.closest('.main');
    const groupsCollapsed = isGroupCollapsedViewport();

    width = Math.max(width, Math.round(wrapRect.width));
    height = Math.max(height, Math.round(wrapRect.height));

    if (groupsCollapsed) {
      const hostPadding = getGroupElementPaddingSize(host);
      const mainSize = getGroupElementContentBoxSize(main);
      const hostSize = getGroupElementContentBoxSize(host);
      const visualViewportWidth = typeof window !== 'undefined'
        ? Math.max(
          0,
          Math.round(
            ((window.visualViewport?.width ?? window.innerWidth ?? 0) || 0) - hostPadding.x
          )
        )
        : 0;
      const visualViewportHeight = typeof window !== 'undefined'
        ? Math.max(
          0,
          Math.round(window.visualViewport?.height ?? window.innerHeight ?? 0)
        )
        : 0;
      const measured = {
        width: pickGroupViewportDimension([
          mainSize.width,
          hostSize.width,
          visualViewportWidth,
          width,
        ]),
        height: pickGroupViewportDimension([
          mainSize.height,
          hostSize.height,
          visualViewportHeight,
          height,
        ]),
      };
      const lastStable = getGroupGridViewportSize._lastStable || null;
      if (lastStable) {
        const unstableWidth = measured.width <= 80 && lastStable.width > 120;
        const unstableHeight = measured.height <= 80 && lastStable.height > 120;
        if (unstableWidth) measured.width = lastStable.width;
        if (unstableHeight) measured.height = lastStable.height;
      }
      rememberStableGroupViewportSize(measured);
      return measured;
    }

    if (width > 40 && height > 40) {
      const measured = { width, height };
      rememberStableGroupViewportSize(measured);
      return measured;
    }

    if (main) {
      const mainRect = main.getBoundingClientRect();
      width = Math.max(width, Math.round(mainRect.width));
      const topOffset = Math.max(0, wrapRect.top - mainRect.top);
      height = Math.max(height, Math.round(mainRect.height - topOffset));
    }
    if (host) {
      const hostRect = host.getBoundingClientRect();
      width = Math.max(width, Math.round(hostRect.width));
      height = Math.max(height, Math.round(hostRect.height));
    }
    const measured = { width, height };
    rememberStableGroupViewportSize(measured);
    return measured;
  }

  function clearGroupGridLayout() {
    if (!els.groupsGrid) return;
    lastGroupGridLayoutSignature = '';
    els.groupsGrid.style.removeProperty('--group-fit-scale');
    els.groupsGrid.style.removeProperty('grid-template-columns');
    els.groupsGrid.style.removeProperty('grid-auto-rows');
  }

  function clearGroupGridLayoutRetryTimers() {
    if (!groupGridLayoutRetryTimers.length || typeof window === 'undefined') return;
    groupGridLayoutRetryTimers.forEach((timerId) => window.clearTimeout(timerId));
    groupGridLayoutRetryTimers = [];
  }

  function measureGroupGridOverflow() {
    if (!els.groupsGridWrap || !els.groupsGrid) {
      return { overflowX: 0, overflowY: 0 };
    }
    const wrapRect = els.groupsGridWrap.getBoundingClientRect();
    const gridRect = els.groupsGrid.getBoundingClientRect();
    return {
      overflowX: Math.max(0, gridRect.right - wrapRect.right, els.groupsGridWrap.scrollWidth - els.groupsGridWrap.clientWidth),
      overflowY: Math.max(0, gridRect.bottom - wrapRect.bottom, els.groupsGridWrap.scrollHeight - els.groupsGridWrap.clientHeight),
    };
  }

  function getMaxGroupSeatOccupancy() {
    const order = Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length
      ? state.activeSeatOrder
      : Array.from(state.activeSeats || []);
    if (!order.length) return 0;
    return order.reduce((max, id) => Math.max(max, getSeatList(id).length), 0);
  }

  function estimateRequiredGroupTileHeight(tileWidth, scale, viewportMode) {
    const contentLayout = GROUP_TILE_CONTENT_LAYOUT[viewportMode] || GROUP_TILE_CONTENT_LAYOUT.expanded;
    const maxOccupancy = getMaxGroupSeatOccupancy();
    if (maxOccupancy <= 0) return 0;
    const contentWidth = Math.max(
      1,
      tileWidth - (contentLayout.seatPaddingX * 2 * scale)
    );
    const chipTrackWidth = Math.max(1, contentLayout.chipTrackWidth * scale);
    const chipGap = Math.max(0, contentLayout.chipGap * scale);
    const chipHeight = Math.max(1, contentLayout.chipHeight * scale);
    const columns = Math.max(1, Math.floor((contentWidth + chipGap) / (chipTrackWidth + chipGap)));
    const rows = Math.max(1, Math.ceil(maxOccupancy / columns));
    const tagsHeight = (rows * chipHeight) + (Math.max(0, rows - 1) * chipGap);
    return Math.ceil((contentLayout.seatPaddingTop * scale) + (contentLayout.seatPaddingBottom * scale) + tagsHeight);
  }

  function applyBestFitGroupGridLayout() {
    if (!els.groupsGrid || !els.groupsGridWrap) return;
    const canMeasure = getActiveTab() === TAB_GROUPS && els.groupsMainHost && !els.groupsMainHost.hidden;
    if (!canMeasure) return;
    const groupsCollapsed = isGroupCollapsedViewport();
    const viewportMode = groupsCollapsed ? 'collapsed' : 'expanded';
    if (viewportMode !== lastGroupGridViewportMode) {
      lastGroupGridViewportMode = viewportMode;
      lastGroupGridLayoutSignature = '';
    }
    const layout = groupsCollapsed ? GROUP_GRID_LAYOUT_COLLAPSED : GROUP_GRID_LAYOUT;
    const maxScale = groupsCollapsed ? 2.4 : 1;
    const seatCount = Array.isArray(state.activeSeatOrder) && state.activeSeatOrder.length
      ? state.activeSeatOrder.length
      : state.activeSeats.size;
    const visualItemCount = Math.max(1, seatCount + (groupsCollapsed ? 0 : 1));
    const { width: wrapWidth, height: wrapHeight } = getGroupGridViewportSize();
    if (wrapWidth <= 40 || wrapHeight <= 40) {
      if (typeof window !== 'undefined') {
        if (applyBestFitGroupGridLayout._retryTimer) {
          window.clearTimeout(applyBestFitGroupGridLayout._retryTimer);
        }
        applyBestFitGroupGridLayout._retryTimer = window.setTimeout(() => {
          applyBestFitGroupGridLayout._retryTimer = 0;
          applyBestFitGroupGridLayout();
        }, groupsCollapsed ? 120 : 90);
      }
      return;
    }
    if (typeof window !== 'undefined' && applyBestFitGroupGridLayout._retryTimer) {
      window.clearTimeout(applyBestFitGroupGridLayout._retryTimer);
      applyBestFitGroupGridLayout._retryTimer = 0;
    }
    const wrapStyle = getComputedStyle(els.groupsGridWrap);
    const innerWidth = wrapWidth
      - (parseFloat(wrapStyle.paddingLeft) || 0)
      - (parseFloat(wrapStyle.paddingRight) || 0);
    const innerHeight = wrapHeight
      - (parseFloat(wrapStyle.paddingTop) || 0)
      - (parseFloat(wrapStyle.paddingBottom) || 0);
    if (innerWidth <= 0 || innerHeight <= 0) return;

    let best = null;
    for (let cols = 1; cols <= visualItemCount; cols += 1) {
      const rows = Math.max(1, Math.ceil(visualItemCount / cols));
      const horizontalGaps = (Math.max(0, cols - 1) * layout.gap) + (layout.padding * 2);
      const verticalGaps = (Math.max(0, rows - 1) * layout.gap) + (layout.padding * 2);
      const usableWidth = Math.max(1, innerWidth - horizontalGaps);
      const usableHeight = Math.max(1, innerHeight - verticalGaps);
      const scale = Math.min(maxScale, usableWidth / (cols * layout.seatWidth), usableHeight / (rows * layout.seatHeight));
      const tileWidth = Math.max(1, Math.floor(layout.seatWidth * scale));
      const tileHeight = Math.max(1, Math.floor(layout.seatHeight * scale));
      const requiredTileHeight = estimateRequiredGroupTileHeight(tileWidth, scale, viewportMode);
      const contentFits = requiredTileHeight <= tileHeight;
      const emptySlots = (rows * cols) - visualItemCount;
      const candidate = {
        cols,
        rows,
        scale,
        emptySlots,
        tileWidth,
        tileHeight,
        requiredTileHeight,
        contentFits,
        tileArea: tileWidth * tileHeight,
      };
      if (!best
        || (candidate.contentFits && !best.contentFits)
        || (candidate.contentFits === best.contentFits && candidate.scale > best.scale + 0.0001)
        || (candidate.contentFits === best.contentFits && Math.abs(candidate.scale - best.scale) <= 0.0001
          && (candidate.emptySlots < best.emptySlots
            || (candidate.emptySlots === best.emptySlots && candidate.tileArea > best.tileArea)))) {
        best = candidate;
      }
    }

    if (!best) {
      clearGroupGridLayout();
      return;
    }
    let scale = Math.max(0.01, Math.min(maxScale, best.scale || 1));
    let fittedWidth = Math.max(1, best.tileWidth || Math.floor(layout.seatWidth * scale));
    let fittedHeight = Math.max(1, best.tileHeight || Math.floor(layout.seatHeight * scale));
    const applyScale = () => {
      els.groupsGrid.style.setProperty('--group-fit-scale', scale.toFixed(4));
      els.groupsGrid.style.gridTemplateColumns = `repeat(${Math.max(1, best.cols)}, minmax(0, ${fittedWidth}px))`;
      els.groupsGrid.style.gridAutoRows = `${fittedHeight}px`;
    };
    applyScale();
    const { overflowX, overflowY } = measureGroupGridOverflow();
    if (overflowX > 0.5 || overflowY > 0.5) {
      const safeWidth = Math.max(1, innerWidth);
      const safeHeight = Math.max(1, innerHeight);
      const adjustX = overflowX > 0.5 ? safeWidth / (safeWidth + overflowX) : 1;
      const adjustY = overflowY > 0.5 ? safeHeight / (safeHeight + overflowY) : 1;
      scale = Math.max(0.01, scale * Math.min(adjustX, adjustY) * 0.995);
      fittedWidth = Math.max(1, Math.floor(layout.seatWidth * scale));
      fittedHeight = Math.max(1, Math.floor(layout.seatHeight * scale));
      applyScale();
    }
    const signature = `${viewportMode}|${visualItemCount}|${best.cols}|${best.rows}|${fittedWidth}|${fittedHeight}|${best.requiredTileHeight}|${best.contentFits ? 1 : 0}|${scale.toFixed(4)}`;
    if (signature === lastGroupGridLayoutSignature) return;
    lastGroupGridLayoutSignature = signature;
    applyScale();
  }

  function scheduleBestFitGroupGridLayout() {
    if (!els.groupsGrid) return;
    if (groupGridLayoutRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(groupGridLayoutRafId);
      groupGridLayoutRafId = 0;
    }
    const run = () => {
      groupGridLayoutRafId = 0;
      applyBestFitGroupGridLayout();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          applyBestFitGroupGridLayout();
        });
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      groupGridLayoutRafId = requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function requestGroupGridLayoutRefresh(options = {}) {
    if (!els.groupsGrid) return;
    const { resetViewport = false } = options;
    clearGroupGridLayoutRetryTimers();
    if (resetViewport) {
      clearGroupGridLayout();
      delete getGroupGridViewportSize._lastStable;
    }
    scheduleBestFitGroupGridLayout();
    if (typeof window === 'undefined') return;
    [48, 120, 240].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        groupGridLayoutRetryTimers = groupGridLayoutRetryTimers.filter((id) => id !== timerId);
        scheduleBestFitGroupGridLayout();
      }, delay);
      groupGridLayoutRetryTimers.push(timerId);
    });
  }

  function deleteGroupSeat(seatId, seatEl = null) {
    const id = typeof seatId === 'string' ? seatId : String(seatId || '');
    if (!id || !state.activeSeats.has(id)) return false;
    const finalizeRemoval = () => {
      state.activeSeats.delete(id);
      state.activeSeatOrder = (state.activeSeatOrder || []).filter(x => x !== id);
      state.lockedSeats.delete(id);
      delete state.seats[id];
      delete state.seatTopics[id];
      state._lastImport = false;
      state.scrollHintDismissed = true;
      buildGrid();
      refreshUnseated();
    };
    if (seatEl instanceof HTMLElement) {
      seatEl.classList.add('removing');
      window.setTimeout(finalizeRemoval, 220);
      return true;
    }
    finalizeRemoval();
    return true;
  }

  function buildGrid() {
    enforceGridBounds();
    const rows = state.gridRows;
    const cols = state.gridCols;
    let order = Array.isArray(state.activeSeatOrder) ? state.activeSeatOrder.slice() : Array.from(state.activeSeats);
    if (!order.length) {
      order = Array.from(buildFullActiveSet(rows, cols));
    } else {
      order = order.filter(id => isSeatWithinBounds(id, rows, cols));
    }
    state.activeSeatOrder = order;
    state.activeSeats = new Set(order);
    order.forEach(id => {
      if (!state.seats[id]) state.seats[id] = [];
      if (typeof state.seatTopics[id] !== 'string') state.seatTopics[id] = '';
    });
    let groupCounter = 0;
    els.groupsGrid.innerHTML = '';
    order.forEach(id => {
      const seat = document.createElement('div');
      seat.className = 'seat';
      seat.dataset.seat = id;
      const label = `${++groupCounter}`;
      seat.innerHTML = `<div class="seat-header">${label}</div><button type="button" class="seat-delete-button" data-seat-delete="${id}" aria-label="Gruppe löschen" title="Gruppe löschen">🗑️</button><input class="seat-topic" type="text" name="seat-topic-${id}" placeholder="Thema" data-default-placeholder="Thema" aria-label="Thema"><div class="name"></div>`;
      seat.classList.add('active');
      if (state.lockedSeats.has(id)) {
        seat.classList.add('locked');
      }
      addDropHandlers(seat);
      const topicInput = seat.querySelector('.seat-topic');
      initSeatTopicInput(topicInput);
      if (topicInput) {
        topicInput.value = typeof state.seatTopics[id] === 'string' ? state.seatTopics[id] : '';
        syncSeatTopicState(seat, topicInput.value);
        topicInput.addEventListener('input', () => {
          state.seatTopics[id] = topicInput.value;
          syncSeatTopicState(seat, topicInput.value);
        });
      } else {
        syncSeatTopicState(seat, state.seatTopics[id]);
      }
      const deleteButton = seat.querySelector('.seat-delete-button');
      if (deleteButton) {
        deleteButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteGroupSeat(id, seat);
        });
        deleteButton.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      }
      seat.addEventListener('dblclick', () => {
        const occupants = getSeatList(id);
        if (!occupants.length) return;
        if (state.lockedSeats.has(id)) state.lockedSeats.delete(id); else state.lockedSeats.add(id);
        renderSeats();
      });
      els.groupsGrid.appendChild(seat);
    });
    const placeholder = document.createElement('div');
    placeholder.className = 'seat-placeholder';
    placeholder.setAttribute('aria-label', 'Neue Gruppe anlegen');
    placeholder.setAttribute('tabindex', '0');
    placeholder.setAttribute('role', 'button');
    placeholder.innerHTML = `
        <div class="seat-placeholder-main">+</div>
      `;
    addPlaceholderDropHandlers(placeholder);
    const handlePlaceholderAdd = () => {
      createNewSeatAndAssign();
    };
    placeholder.addEventListener('click', handlePlaceholderAdd);
    placeholder.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handlePlaceholderAdd();
      }
    });
    els.groupsGrid.appendChild(placeholder);
    renderSeats();
    requestGroupGridLayoutRefresh({ resetViewport: true });
  }

  function renderSeats() {
    [...els.groupsGrid.querySelectorAll('.seat')].forEach(seat => {
      const id = seat.dataset.seat;
      const occupants = getSeatList(id);
      const nameEl = seat.querySelector('.name');
      const topicValue = typeof state.seatTopics[id] === 'string' ? state.seatTopics[id] : '';
      const topicInput = seat.querySelector('.seat-topic');
      if (topicInput && topicInput.value !== topicValue) {
        topicInput.value = topicValue;
      }
      syncSeatTopicState(seat, topicValue);
      nameEl.innerHTML = '';
      seat.classList.toggle('locked', state.lockedSeats.has(id));
      if (!occupants.length) {
        seat.removeAttribute('draggable');
        delete seat.dataset.emptyDraggable;
        return;
      }
      seat.removeAttribute('draggable');
      delete seat.dataset.emptyDraggable;
      const content = document.createElement('div');
      content.className = 'seat-content';
      nameEl.appendChild(content);
      occupants.forEach(sid => {
        const student = state.students.find(x => x.id === sid);
        const label = student ? displayName(student).trim() : sid;
        if (!label) return;
        const flair = sanitizePerformanceFlairForCount(student?.performanceFlair);
        const chip = document.createElement('div');
        chip.className = 'seat-chip';
        chip.dataset.sid = sid;
        chip.dataset.fromSeat = id;
        chip.setAttribute('draggable', 'true');
        const nameText = document.createElement('span');
        nameText.className = 'seat-chip-name';
        nameText.textContent = label;
        chip.appendChild(nameText);
        if (flair) {
          const flairTag = document.createElement('span');
          flairTag.className = 'seat-chip-flair';
          flairTag.textContent = flair;
          chip.appendChild(flairTag);
        }
        content.appendChild(chip);
        addDragHandlers(chip);
        enableTouchDragSource(chip, () => {
          const sidVal = chip.dataset.sid;
          if (!sidVal) return null;
          const fromSeat = chip.dataset.fromSeat || null;
          if (fromSeat && state.lockedSeats.has(fromSeat)) return null;
          if (fromSeat && !getSeatList(fromSeat).includes(sidVal)) return null;
          return {
            type: 'assignment',
            studentId: sidVal,
            fromSeat,
            label: label || 'Lernende/r'
          };
        });
      });
    });
    requestGroupGridLayoutRefresh();
  }

  function addDragHandlers(el) {
    if (el.dataset.dragBound) return;
    if (el.getAttribute('draggable') !== 'true') return;
    el.dataset.dragBound = '1';
    el.addEventListener('dragstart', e => {
      const sid = el.dataset.sid;
      const fromSeat = el.dataset.fromSeat || null;
      if (!sid) { e.preventDefault(); return; }
      if (fromSeat && state.lockedSeats.has(fromSeat)) { e.preventDefault(); return; }
      if (fromSeat && !getSeatList(fromSeat).includes(sid)) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', sid);
      e.dataTransfer.effectAllowed = 'move';
      state.dragSourceSeat = fromSeat;
      state.dragPayloadType = 'assignment';
      startWiggle();
    });
    el.addEventListener('dragend', () => {
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      stopWiggle();
    });
  }

  let currentChipHover = null;
  function clearChipHover() {
    if (currentChipHover) {
      currentChipHover.classList.remove('drag-over-target');
      currentChipHover = null;
    }
  }
  function addDropHandlers(seat) {
    seat.addEventListener('dragover', e => {
      e.preventDefault();
      seat.classList.add('drag-over');
      const targetChip = e.target.closest('.seat-chip');
      if (targetChip && targetChip !== currentChipHover) {
        clearChipHover();
        currentChipHover = targetChip;
        currentChipHover.classList.add('drag-over-target');
      }
      if (!targetChip) {
        clearChipHover();
      }
    });
    seat.addEventListener('dragleave', () => {
      seat.classList.remove('drag-over');
      clearChipHover();
    });
    seat.addEventListener('drop', e => {
      e.preventDefault(); seat.classList.remove('drag-over'); clearChipHover();
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const targetId = seat.dataset.seat;
      const sourceSeat = state.dragSourceSeat;
      const targetChip = e.target.closest('.seat-chip');
      const targetStudentId = targetChip?.dataset?.sid || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      const context = {
        targetSeatEl: seat,
        targetId,
        targetStudentId,
      };
      if (payload) {
        context.studentId = payload;
        context.sourceSeatId = sourceSeat || null;
      }
      applySeatDropAction(context);
    });
  }

  function addPlaceholderDropHandlers(el) {
    if (!el) return;
    el.addEventListener('dragover', e => {
      if (state.dragPayloadType !== 'assignment') return;
      e.preventDefault();
    });
    el.addEventListener('drop', e => {
      if (state.dragPayloadType !== 'assignment') return;
      e.preventDefault();
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const studentId = payload.trim();
      const sourceSeat = state.dragSourceSeat || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      if (!studentId) return;
      createNewSeatAndAssign(studentId, sourceSeat);
    });
  }

  function createNewSeatAndAssign(studentId = null, sourceSeatId = null) {
    const limit = MAX_GRID_SIZE * MAX_GRID_SIZE;
    const currentCount = state.activeSeats.size || (state.gridRows * state.gridCols);
    if (currentCount >= limit) {
      showMessage('Maximale Anzahl an Gruppen erreicht.', 'warn');
      return false;
    }
    const slot = nextSeatSlot();
    if (!slot || !slot.id) {
      showMessage('Keine weitere Gruppe kann angelegt werden.', 'warn');
      return false;
    }
    state.gridRows = slot.rows;
    state.gridCols = slot.cols;
    if (!state.activeSeats.has(slot.id)) {
      state.activeSeats.add(slot.id);
    }
    if (!state.activeSeatOrder.includes(slot.id)) {
      state.activeSeatOrder.push(slot.id);
    }
    if (!state.seats[slot.id]) {
      state.seats[slot.id] = [];
    }
    if (typeof state.seatTopics[slot.id] !== 'string') {
      state.seatTopics[slot.id] = '';
    }
    buildGrid();
    if (sourceSeatId && studentId) {
      removeStudentFromSeat(sourceSeatId, studentId);
    }
    if (studentId) {
      addStudentToSeat(slot.id, studentId);
    }
    renderSeats();
    refreshUnseated();
    return true;
  }

  let backgroundDropLock = false;
  function bindBackgroundDrop(target, options = {}) {
    const { ignoreInsideGrid = false } = options;
    if (!target) return;
    target.addEventListener('dragover', e => {
      if (e.target.closest('.seat')) return;
      if (state.dragPayloadType !== 'assignment') return;
      if (ignoreInsideGrid && e.target.closest('#groups-grid')) return;
      e.preventDefault();
      e.stopPropagation();
    });
    target.addEventListener('drop', e => {
      if (e.target.closest('.seat')) return;
      if (state.dragPayloadType !== 'assignment') return;
      if (ignoreInsideGrid && e.target.closest('#groups-grid')) return;
      e.preventDefault();
      e.stopPropagation();
      if (backgroundDropLock) return;
      backgroundDropLock = true;
      stopWiggle();
      const payload = e.dataTransfer.getData('text/plain') || '';
      const studentId = payload.trim();
      const sourceSeat = state.dragSourceSeat || null;
      state.dragSourceSeat = null;
      state.dragPayloadType = null;
      if (studentId) {
        createNewSeatAndAssign(studentId, sourceSeat);
      }
      setTimeout(() => { backgroundDropLock = false; }, 25);
    });
  }

  function applySeatDropAction(opts) {
    if (!opts || !opts.targetSeatEl || !opts.targetId) return false;
    const seatEl = opts.targetSeatEl;
    const targetId = opts.targetId;
    const seatDragSourceId = opts.seatDragSourceId || null;
    const studentId = opts.studentId || null;
    const sourceSeatId = opts.sourceSeatId || null;
    const targetStudentId = opts.targetStudentId || null;
    if (seatDragSourceId) return false;
    if (!studentId) return false;
    if (sourceSeatId && state.lockedSeats.has(sourceSeatId)) return false;
    if (state.lockedSeats.has(targetId)) return false;
    const limit = clampMaxGroupSize(state.maxGroupSize);
    if (!targetStudentId && getSeatList(targetId).length >= limit && sourceSeatId !== targetId) {
      showMessage(`Gruppe ist voll (max. ${limit}).`, 'warn');
      return false;
    }
    if (sourceSeatId && targetStudentId) {
      const sourceList = getSeatList(sourceSeatId);
      const targetList = getSeatList(targetId);
      const idxSource = sourceList.indexOf(studentId);
      const idxTarget = targetList.indexOf(targetStudentId);
      if (idxSource === -1 || idxTarget === -1) return false;
      sourceList[idxSource] = targetStudentId;
      targetList[idxTarget] = studentId;
      setSeatList(sourceSeatId, sourceList);
      setSeatList(targetId, targetList);
    } else {
      if (targetStudentId) {
        removeStudentFromSeat(targetId, targetStudentId);
      }
      if (getSeatList(targetId).length >= limit) {
        showMessage(`Gruppe ist voll (max. ${limit}).`, 'warn');
        return false;
      }
      if (sourceSeatId) {
        removeStudentFromSeat(sourceSeatId, studentId);
      }
      addStudentToSeat(targetId, studentId);
    }
    renderSeats();
    refreshUnseated();
    state._lastImport = false;
    state.scrollHintDismissed = true;
    return true;
  }

  function enableTouchDragSource(el, resolver) {
    if (!supportsTouchDrag || !el || el.dataset.touchDragBound) return;
    el.dataset.touchDragBound = '1';
    el.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      const descriptor = typeof resolver === 'function' ? resolver(e) : null;
      if (!descriptor) return;
      const touch = e.touches[0];
      startTouchDragCandidate(descriptor, touch);
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.touches, touchDragState.identifier);
      if (!tracked) return;
      handleTouchMove(tracked);
      if (touchDragState && touchDragState.active) {
        e.preventDefault();
      }
    }, { passive: false });
    const finish = e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
      if (!tracked) return;
      finishTouchDrag(e);
    };
    const cancel = e => {
      if (!touchDragState) return;
      const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
      if (!tracked) return;
      cancelTouchDrag();
    };
    el.addEventListener('touchend', finish, { passive: false });
    el.addEventListener('touchcancel', cancel);
  }

  function startTouchDragCandidate(descriptor, touch) {
    cancelTouchDrag();
    const state = {
      descriptor,
      identifier: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      active: false,
      ghost: null,
      overSeat: null,
      timer: null,
    };
    state.timer = setTimeout(() => beginTouchDrag(state), TOUCH_DRAG_DELAY_MS);
    touchDragState = state;
  }

  function beginTouchDrag(state) {
    if (!state || state !== touchDragState) return;
    state.active = true;
    state.ghost = createTouchGhost(state.descriptor);
    updateTouchDrag(state);
    startWiggle();
  }

  function handleTouchMove(touch) {
    if (!touchDragState) return;
    touchDragState.currentX = touch.clientX;
    touchDragState.currentY = touch.clientY;
    if (!touchDragState.active) {
      const dx = Math.abs(touch.clientX - touchDragState.startX);
      const dy = Math.abs(touch.clientY - touchDragState.startY);
      if (dx > TOUCH_DRAG_CANCEL_DISTANCE || dy > TOUCH_DRAG_CANCEL_DISTANCE) {
        cancelTouchDrag();
      }
      return;
    }
    updateTouchDrag(touchDragState);
  }

  function updateTouchDrag(state) {
    if (!state) return;
    if (state.ghost) {
      state.ghost.style.transform = `translate(${state.currentX + 14}px, ${state.currentY + 14}px)`;
    }
    const seat = findSeatAtPoint(state.currentX, state.currentY);
    if (seat !== state.overSeat) {
      if (state.overSeat) state.overSeat.classList.remove('drag-over');
      state.overSeat = seat;
      if (seat) seat.classList.add('drag-over');
    }
  }

  function finishTouchDrag(e) {
    if (!touchDragState) return;
    const state = touchDragState;
    const descriptor = state.descriptor;
    const seatEl = state.overSeat;
    const wasActive = seatEl ? seatEl.classList.contains('active') : false;
    const context = seatEl ? buildTouchDropContext(descriptor, seatEl, wasActive) : null;
    const wasActiveDrag = state.active;
    cancelTouchDrag();
    stopWiggle();
    if (!wasActiveDrag) return;
    if (e) e.preventDefault();
    if (context) {
      applySeatDropAction(context);
    }
  }

  function cancelTouchDrag() {
    if (!touchDragState) return;
    if (touchDragState.timer) {
      clearTimeout(touchDragState.timer);
    }
    if (touchDragState.overSeat) {
      touchDragState.overSeat.classList.remove('drag-over');
    }
    if (touchDragState.ghost) {
      touchDragState.ghost.remove();
    }
    touchDragState = null;
    stopWiggle();
  }

  function buildTouchDropContext(descriptor, seatEl, wasActive) {
    if (!descriptor || !seatEl) return null;
    const seatId = seatEl.dataset.seat;
    if (!seatId) return null;
    const ctx = { targetSeatEl: seatEl, targetId: seatId, wasActive };
    if (descriptor.type === 'seat') {
      ctx.seatDragSourceId = descriptor.seatId;
    } else if (descriptor.type === 'assignment') {
      ctx.studentId = descriptor.studentId;
      ctx.sourceSeatId = descriptor.fromSeat || null;
    } else {
      return null;
    }
    return ctx;
  }

  function findSeatAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest ? el.closest('.seat') : null;
  }

  function findTouchById(touchList, id) {
    if (!touchList || id === undefined || id === null) return null;
    for (let i = 0; i < touchList.length; i++) {
      const touch = touchList.item(i);
      if (touch?.identifier === id) return touch;
    }
    return null;
  }

  function createTouchGhost(descriptor) {
    const ghost = document.createElement('div');
    ghost.className = 'touch-drag-ghost';
    const fallback = descriptor?.type === 'seat' ? 'Gruppe' : 'Ziehen';
    ghost.textContent = descriptor?.label || fallback;
    document.body.appendChild(ghost);
    return ghost;
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
    const rows = [];
    let i = 0, cur = '', inQ = false; const out = []; const push = () => { out.push(cur); cur = '' };
    const flush = () => { rows.push(out.slice()); out.length = 0 };
    while (i < text.length) {
      const ch = text[i++];
      if (ch === '"') {
        if (inQ && text[i] == '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === delim && !inQ) { push(); }
      else if ((ch === '\n') && !inQ) { push(); flush(); }
      else if ((ch === '\r') && !inQ) { }
      else { cur += ch; }
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
  const getGradeRosterPillTextColor = (color) => {
    const hex = String(color || '').trim().replace('#', '');
    if (!/^[\da-f]{6}$/i.test(hex)) return '#ffffff';
    const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const brightness = (red * 299) + (green * 587) + (blue * 114);
    return brightness >= 150000 ? '#0f172a' : '#ffffff';
  };
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
      returnTab: getActiveTab(),
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
      const isSelected = Number(course?.id || 0) === gradeRosterSelectedCourseId
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
  const renderGradeRosterImportCourses = (courses, requestId) => {
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
      renderGradeRosterImportCourses(gradeRosterCourses, 'cached');
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
    gradeRosterSelectedCourseId = Number(detail.courseId || 0);
    gradeRosterSelectedCourseName = String(detail.courseName || '').trim();
    renderGradeRosterPills();
    closeGradeRosterImportMenu();
    showMessage(`${Number(detail.students?.length || 0)} Lernende aus „${detail.courseName}“ importiert.`, 'success', { presentation: 'toast' });
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
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info');
      return;
    }
    if (!file) return;
    const guessedLabel = sanitizeExportFileName(stripFileExtension(file.name));
    state.csvName = guessedLabel || state.csvName;
    updateCsvStatusDisplay();
    const text = await file.text();
    let rows = parseCSV(text);
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn'); return; }
    const isSeparatorRow = (row) => {
      if (!Array.isArray(row)) return false;
      const normalized = row
        .map(val => String(val ?? '').trim())
        .join('')
        .toLowerCase();
      return /^sep\s*=/.test(normalized);
    };
    rows = rows.filter(row => !isSeparatorRow(row));
    if (!rows.length) { showMessage('Keine Daten gefunden.', 'warn'); return; }
    const firstNonEmptyIdx = rows.findIndex(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
    if (firstNonEmptyIdx === -1) { showMessage('Nur leere Zeilen gefunden.', 'warn'); return; }

    const headers = rows[firstNonEmptyIdx] || [];
    const dataStartIdx = firstNonEmptyIdx + 1;
    const dataRows = rows.slice(dataStartIdx);
    state.headers = headers;
    state.performanceFlairCount = 4;
    state.students = readStudents(dataRows, headers);
    state.seats = {};
    state.seatTopics = {};
    SharedTimerStore.setWorkOrder({
      workOrderText: '',
      durationMinutes: null,
      startISO: null,
    });
    SharedTimerStore.stop();
    syncStateFromTimerStore();
    state.lockedSeats.clear();
    syncGroupGridFromSizeInputs({ forceCapacity: true });

    els.sidePanel?.scrollTo({ top: 0, behavior: 'auto' });
    refreshUnseated();
    renderRandomPicker();
    renderSeats();
    renderWorkOrder();
    requestGroupGridLayoutRefresh({ resetViewport: true });
    state.scrollHintDismissed = false;
    state._lastImport = true;
    updateScrollHint();
    syncSharedRosterState(STUDENTS_SYNC_SOURCE_GROUPS);
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
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info');
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
    return Boolean(target.closest('#merger-host') || target.closest('#dropZone'));
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
        showMessage('Bitte hier eine CSV-Datei ablegen.', 'warn');
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
        showMessage('CSV bitte im Feld „Namensliste auswählen“ ablegen.', 'warn');
      } else {
        showMessage('Hier können nur Gruppen als JSON geladen werden.', 'warn');
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

  [els.groupExportPlan].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => downloadSeatPlan());
  });
  [els.groupPrintPlan].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => printSeatPlan());
  });
  [els.groupImportPlan].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      void handlePlanImportAction();
    });
  });
  els.importPlanFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      await importPlanFromFile(file);
    } catch (err) {
      reportAppError(err, err?.message || 'Gruppen konnten nicht geladen werden.', {
        scope: 'plan-import',
        source: 'file-input',
      });
    } finally {
      e.target.value = '';
    }
  });

  [els.groupSeatPreferences].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.students.length) {
        showMessage('Importiere zuerst die Namensliste!', 'warn');
        return;
      }
      if (isRandomPickerTabActive()) {
        buildRandomPickerConditionsTable();
      } else {
        buildSeatPreferencesTable();
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
      saveRandomPickerConditionsFromForm();
    } else {
      savePreferencesFromForm();
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
    resetRandomPickerConditionsInForm();
  });
  els.preferencesTableBody?.addEventListener('change', e => {
    const target = e.target;
    if (target instanceof HTMLSelectElement && target.dataset.preference === 'performance-flair') {
      renderSeatPreferencesPerformanceSummary(readSeatPreferencesDraftFromForm());
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.preference !== 'random-weight') return;
    if (target.checked && target.value === String(RANDOM_PICKER_CERTAIN_WEIGHT)) {
      const allChoices = els.preferencesTableBody.querySelectorAll('input[type="radio"][data-preference="random-weight"][data-student-id]');
      allChoices.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        if (input === target) return;
        if (input.dataset.studentId === target.dataset.studentId) return;
        input.checked = input.value === String(RANDOM_PICKER_MIN_WEIGHT);
      });
    }
    target.checked = true;
  });
  els.preferencesPerformanceSummary?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.performanceFlairCountInput !== '1') return;
    if (isRandomPickerTabActive()) return;
    const trimmed = String(target.value || '').trim();
    const parsed = Number.parseInt(trimmed, 10);
    if (!/^[0-9]+$/.test(trimmed) || parsed < 2 || parsed > MAX_PERFORMANCE_FLAIR_COUNT) {
      showMessage(`Bitte eine Zahl zwischen 2 und ${MAX_PERFORMANCE_FLAIR_COUNT} eingeben.`, 'warn');
      target.value = String(clampPerformanceFlairCount(state.performanceFlairCount));
      target.focus();
      target.select();
      return;
    }
    applyPerformanceFlairCount(parsed, readSeatPreferencesDraftFromForm());
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

  function applyTimerDurationFromInput({ preserveStart = true } = {}) {
    const duration = parseWorkOrderDuration(els.workOrderDurationInput?.value);
    SharedTimerStore.setWorkOrder({
      workOrderText: state.workOrder,
      durationMinutes: duration,
      startISO: preserveStart ? state.workOrderStartISO : null,
    });
    resetTimerWarningMilestones(null);
    syncStateFromTimerStore();
    renderWorkOrder();
    return duration;
  }
  function startWorkOrderTimer() {
    const duration = applyTimerDurationFromInput({ preserveStart: false });
    if (!duration) {
      showMessage('Bitte eine Arbeitsdauer festlegen, bevor die Arbeitszeit gestartet wird.', 'warn');
      return;
    }
    SharedTimerStore.setWorkOrder({
      workOrderText: state.workOrder,
      durationMinutes: duration,
      startISO: null,
    });
    SharedTimerStore.start(new Date().toISOString());
    resetTimerWarningMilestones(1);
    ensureWorkOrderAudioContext({ resume: true });
    syncStateFromTimerStore();
    updateWorkOrderAlert(false);
    renderWorkOrder();
  }
  function stopWorkOrderSession() {
    stopWorkOrderTimer();
    closeWorkOrderAudioContext();
    SharedTimerStore.stop();
    syncStateFromTimerStore();
    resetTimerWarningMilestones(null);
    resetWorkOrderTimerDisplay();
    updateWorkOrderAlert(false);
    renderWorkOrder();
  }
  [els.timerWorkOrderStart, els.workPhaseTimerStartCollapsed].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      startWorkOrderTimer();
    });
  });
  [els.timerWorkOrderStop, els.workPhaseTimerStopCollapsed].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      stopWorkOrderSession();
    });
  });
  const toggleTimerWarningTone = (toneKey) => {
    if (toneKey !== 'end' && toneKey !== 'half' && toneKey !== 'quarter') return;
    timerWarningToneEnabled = {
      ...timerWarningToneEnabled,
      [toneKey]: !isTimerWarningToneEnabled(toneKey),
    };
    renderTimerWarningToneState();
    if (toneKey === 'end' && !isTimerWarningToneEnabled('end')) {
      stopWorkOrderAlarmSound();
      return;
    }
    if (toneKey === 'end' && state.workOrderAlarmed) {
      startWorkOrderAlarmSound();
    }
  };
  els.timerWarningToneButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      toggleTimerWarningTone(button.dataset.timerWarningToneToggle);
    });
  });
  const toggleTimerSeconds = () => {
    timerShowSeconds = !timerShowSeconds;
    renderTimerSecondsToggleState();
    renderWorkOrder();
  };
  els.timerSecondsToggleButtons?.forEach((button) => {
    button.addEventListener('click', toggleTimerSeconds);
  });
  const saveTimerDurationFromInput = () => {
    applyTimerDurationFromInput({ preserveStart: true });
  };

  const adjustTimerDuration = (stepDelta) => {
    if (!els.workOrderDurationInput) return;
    const parsedStep = Math.trunc(Number(stepDelta));
    if (!Number.isFinite(parsedStep) || parsedStep === 0) return;
    const inputDuration = parseWorkOrderDuration(els.workOrderDurationInput.value);
    const stateDuration = parseWorkOrderDuration(state.workOrderDurationMinutes);
    const baseDuration = inputDuration ?? stateDuration ?? 1;
    const nextDuration = Math.max(1, baseDuration + parsedStep);
    els.workOrderDurationInput.value = String(nextDuration);
    applyTimerDurationFromInput({ preserveStart: true });
  };

  els.workOrderDurationInput?.addEventListener('input', saveTimerDurationFromInput);
  els.workOrderDurationInput?.addEventListener('change', () => {
    saveTimerDurationFromInput();
  });
  els.workOrderDurationRange?.addEventListener('input', () => {
    if (!els.workOrderDurationInput || !els.workOrderDurationRange) return;
    els.workOrderDurationInput.value = els.workOrderDurationRange.value;
    applyTimerDurationFromInput({ preserveStart: true });
  });
  els.workOrderDurationStepButtons?.forEach((button) => {
    button.addEventListener('click', () => {
      adjustTimerDuration(button.dataset.durationStep);
    });
  });
  els.chromeToggle?.addEventListener('click', toggleChromeCollapsed);
  els.chromeOverlayToggle?.addEventListener('click', toggleChromeCollapsed);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!isChromeCollapsed() || getChromeTransitionState() !== 'idle') return;
    if (document.querySelector('dialog[open]')) return;
    setChromeCollapsed(false);
  });
  const dismissWorkOrderAlarm = () => {
    if (state.workOrderAlarmed) {
      updateWorkOrderAlert(false);
    }
  };
  els.workOrderRestClock?.addEventListener('click', dismissWorkOrderAlarm);
  els.workOrderMeta?.addEventListener('click', dismissWorkOrderAlarm);
  els.workOrderHintOverlay?.addEventListener('click', dismissWorkOrderAlarm);
  const saveWorkOrderFromTextarea = () => {
    const raw = els.workOrderTextarea?.value || '';
    const normalized = raw.replace(/\s+$/, '');
    const trimmed = normalized.trim();
    const nextWorkOrder = trimmed ? normalized : '';
    SharedTimerStore.setWorkOrder({
      workOrderText: nextWorkOrder,
      durationMinutes: state.workOrderDurationMinutes,
      startISO: state.workOrderStartISO,
    });
    syncStateFromTimerStore();
    renderWorkOrder();
  };
  els.workOrderTextarea?.addEventListener('input', saveWorkOrderFromTextarea);
  els.workOrderTextarea?.addEventListener('change', saveWorkOrderFromTextarea);
  renderTimerWarningToneState();
  renderTimerSecondsToggleState();
  const MonitorModule = (() => {
    const WARNING_TONES = Object.freeze({
      yellow: {
        intervalMs: 1200,
        pulses: [
          { frequency: 1480, gain: 0.085, durationMs: 170, offsetMs: 0, type: 'triangle' },
          { frequency: 1320, gain: 0.075, durationMs: 150, offsetMs: 180, type: 'triangle' },
        ],
      },
      red: {
        intervalMs: 520,
        pulses: [
          { frequency: 900, gain: 0.15, durationMs: 130, offsetMs: 0, type: 'square' },
          { frequency: 700, gain: 0.14, durationMs: 130, offsetMs: 145, type: 'square' },
          { frequency: 900, gain: 0.15, durationMs: 130, offsetMs: 290, type: 'square' },
        ],
      },
    });
    const AVERAGE_WINDOW_MS = 2000;
    const DB_FLOOR = 30;
    const DB_CEILING = 100;
    const DB_OFFSET = 90;
    const DEFAULT_THRESHOLDS = Object.freeze({ yellow: 60, red: 70 });
    const MIN_THRESHOLD_GAP = 1;
    const MONITOR_ASSIGNMENT_PLACEHOLDER = 'Arbeitsauftrag';

    let thresholds = { ...DEFAULT_THRESHOLDS };
    let audioContext;
    let analyser;
    let source;
    let stream;
    let rafId;
    let running = false;
    let starting = false;
    let windowStartMs = 0;
    let windowLevelSum = 0;
    let windowSampleCount = 0;
    let currentLightColor = null;
    let warningToneEnabled = { yellow: true, red: true };
    let warningToneTimerId;
    let warningToneLoopToken = 0;
    let monitorTickId;
    let micUiState = MIC_UI_STATE.READY;
    let micUiDetail = '';
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    const formatTimerText = (timerState) => {
      const duration = parseWorkOrderDuration(timerState.durationMinutes);
      if (!duration) return getTimerPlaceholder();
      if (!timerState.startISO) return formatDurationHMS(duration);
      const startMs = Date.parse(timerState.startISO);
      if (!Number.isFinite(startMs)) return formatDurationHMS(duration);
      const remaining = Math.max(0, (startMs + duration * 60000) - Date.now());
      return formatRemainingDuration(remaining);
    };

    const updateTimerColor = (timerState) => {
      if (!els.monitorCountdownDisplay) return;
      const duration = parseWorkOrderDuration(timerState.durationMinutes);
      if (!duration || !timerState.startISO) {
        els.monitorCountdownDisplay.style.color = 'var(--text)';
        return;
      }
      const startMs = Date.parse(timerState.startISO);
      if (!Number.isFinite(startMs)) {
        els.monitorCountdownDisplay.style.color = 'var(--text)';
        return;
      }
      const endMs = startMs + duration * 60000;
      const remaining = Math.max(0, endMs - Date.now());
      const progress = Math.max(0, Math.min(1, remaining / (duration * 60000)));
      const hue = Math.round(120 * progress);
      els.monitorCountdownDisplay.style.color = `hsl(${hue} 85% 58%)`;
    };

    const renderTimer = () => {
      const timerState = SharedTimerStore.getState();
      if (els.monitorCountdownDisplay) {
        els.monitorCountdownDisplay.textContent = formatTimerText(timerState);
      }
      updateTimerColor(timerState);
      if (els.monitorAssignmentDisplay) {
        const text = typeof timerState.workOrderText === 'string' ? timerState.workOrderText : '';
        const hasText = text.trim().length > 0;
        els.monitorAssignmentDisplay.textContent = hasText ? text : MONITOR_ASSIGNMENT_PLACEHOLDER;
        els.monitorAssignmentDisplay.classList.toggle('is-placeholder', !hasText);
      }
    };

    const toEstimatedDb = (rms) => {
      if (rms <= 0) return DB_FLOOR;
      const dbFs = 20 * Math.log10(rms);
      const estimatedDb = dbFs + DB_OFFSET;
      return Math.round(Math.max(DB_FLOOR, Math.min(DB_CEILING, estimatedDb)));
    };

    const setActiveLight = (color) => {
      const nextColor = color || null;
      const colorChanged = currentLightColor !== nextColor;
      currentLightColor = nextColor;
      Object.entries(monitorLights).forEach(([key, element]) => {
        if (element) {
          element.classList.toggle('active', key === color);
        }
      });
      if (colorChanged) {
        syncWarningToneLoop();
      }
      if (els.monitorShell) {
        els.monitorShell.classList.toggle('monitor-warning-yellow', nextColor === 'yellow');
        els.monitorShell.classList.toggle('monitor-warning-red', nextColor === 'red');
      }
    };

    const classifyLevel = (level) => {
      if (level >= thresholds.red) return 'red';
      if (level >= thresholds.yellow) return 'yellow';
      return 'green';
    };

    const resetAverageWindow = () => {
      windowStartMs = performance.now();
      windowLevelSum = 0;
      windowSampleCount = 0;
    };

    const playTonePulse = ({ frequency, gain, durationMs, offsetMs, type = 'sine' }) => {
      if (!audioContext) return;
      const startTime = audioContext.currentTime + offsetMs / 1000;
      const endTime = startTime + durationMs / 1000;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(endTime + 0.015);
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
      };
    };

    const playWarningTone = async (color) => {
      if (!audioContext) return;
      const config = WARNING_TONES[color];
      if (!config) return;
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
        } catch {
          return;
        }
      }
      config.pulses.forEach(playTonePulse);
    };

    const stopWarningToneLoop = () => {
      warningToneLoopToken += 1;
      if (warningToneTimerId) {
        window.clearTimeout(warningToneTimerId);
        warningToneTimerId = undefined;
      }
    };

    const isWarningToneEnabled = (toneKey) => {
      if (toneKey !== 'yellow' && toneKey !== 'red') return false;
      return Boolean(warningToneEnabled[toneKey]);
    };

    const getWarningToneLabel = (toneKey) => {
      const toneName = toneKey === 'red' ? 'Rot' : 'Gelb';
      return `Warnton ${toneName}`;
    };

    const renderWarningToneState = () => {
      els.monitorWarningToneButtons?.forEach((button) => {
        const toneKey = button.dataset.monitorWarningToneToggle;
        if (toneKey !== 'yellow' && toneKey !== 'red') return;
        const label = getWarningToneLabel(toneKey);
        button.setAttribute('aria-checked', String(isWarningToneEnabled(toneKey)));
        button.setAttribute('aria-label', label);
      });
      els.monitorWarningToneLabels?.forEach((labelElement) => {
        const toneKey = labelElement.dataset.monitorWarningToneLabel;
        if (toneKey !== 'yellow' && toneKey !== 'red') return;
        labelElement.textContent = getWarningToneLabel(toneKey);
      });
    };

    const isMicSupported = () => Boolean(
      navigator.mediaDevices
      && navigator.mediaDevices.getUserMedia
      && AudioContextClass
    );

    const setMicUiState = (nextState, detail = '') => {
      micUiState = nextState;
      micUiDetail = typeof detail === 'string' ? detail.trim() : '';
      renderMicControlState();
    };

    const getEffectiveMicUiState = () => {
      if (!isMicSupported()) return MIC_UI_STATE.UNSUPPORTED;
      if (starting) return MIC_UI_STATE.STARTING;
      if (running) return MIC_UI_STATE.ACTIVE;
      return micUiState === MIC_UI_STATE.ERROR ? MIC_UI_STATE.ERROR : MIC_UI_STATE.READY;
    };

    const getMicStatusText = (stateKey) => {
      if (stateKey === MIC_UI_STATE.STARTING) return 'Status: startet...';
      if (stateKey === MIC_UI_STATE.ACTIVE) return 'Status: aktiv';
      if (stateKey === MIC_UI_STATE.UNSUPPORTED) return 'Status: nicht-unterstützt';
      if (stateKey === MIC_UI_STATE.ERROR) {
        return micUiDetail ? `Status: fehler (${micUiDetail})` : 'Status: fehler';
      }
      return 'Status: bereit';
    };

    const renderMicControlState = () => {
      const effectiveState = getEffectiveMicUiState();
      const activeMic = effectiveState === MIC_UI_STATE.ACTIVE;
      const busyMic = effectiveState === MIC_UI_STATE.STARTING;
      const unsupportedMic = effectiveState === MIC_UI_STATE.UNSUPPORTED;
      const startButtons = [els.monitorMicStartButton, els.workPhaseMonitorStartCollapsed].filter(Boolean);
      const stopButtons = [els.monitorMicStopButton, els.workPhaseMonitorStopCollapsed].filter(Boolean);
      startButtons.forEach((button) => {
        button.textContent = '🚦';
        button.classList.toggle('is-running', false);
        button.classList.toggle('is-off', false);
        button.disabled = unsupportedMic || busyMic || activeMic;
        button.setAttribute('aria-label', 'Lautstärkeüberwachung starten');
        button.setAttribute('title', 'Lautstärkeüberwachung starten');
      });
      stopButtons.forEach((button) => {
        button.textContent = '🚦';
        button.classList.toggle('is-running', activeMic);
        button.classList.toggle('is-off', true);
        button.disabled = unsupportedMic || busyMic || !activeMic;
        button.setAttribute('aria-label', 'Lautstärkeüberwachung stoppen');
        button.setAttribute('title', 'Lautstärkeüberwachung stoppen');
      });
      renderControlStatus(els.monitorControlStatus, effectiveState, getMicStatusText(effectiveState));
    };

    const syncWarningToneLoop = () => {
      stopWarningToneLoop();
      if (currentLightColor !== 'yellow' && currentLightColor !== 'red') {
        return;
      }
      if (!isWarningToneEnabled(currentLightColor)) {
        return;
      }
      const loopToken = warningToneLoopToken;
      const loop = async () => {
        if (loopToken !== warningToneLoopToken) return;
        if (currentLightColor !== 'yellow' && currentLightColor !== 'red') return;
        if (!isWarningToneEnabled(currentLightColor)) return;
        const config = WARNING_TONES[currentLightColor];
        if (!config) return;
        await playWarningTone(currentLightColor);
        if (loopToken !== warningToneLoopToken) return;
        if (currentLightColor !== 'yellow' && currentLightColor !== 'red') return;
        if (!isWarningToneEnabled(currentLightColor)) return;
        warningToneTimerId = window.setTimeout(loop, config.intervalMs);
      };
      void loop();
    };

    const clampThresholdValue = (value, min, max, fallback) => {
      const parsed = Math.round(Number(value));
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(Math.max(parsed, min), max);
    };

    const renderThresholdControls = () => {
      if (els.monitorYellowThresholdInput) {
        els.monitorYellowThresholdInput.value = String(thresholds.yellow);
      }
      if (els.monitorRedThresholdInput) {
        els.monitorRedThresholdInput.value = String(thresholds.red);
      }
      if (els.monitorYellowThresholdValue) {
        els.monitorYellowThresholdValue.textContent = `${thresholds.yellow} dB`;
      }
      if (els.monitorRedThresholdValue) {
        els.monitorRedThresholdValue.textContent = `${thresholds.red} dB`;
      }
    };

    const setMonitorThreshold = (thresholdKey, value) => {
      if (thresholdKey === 'yellow') {
        const yellow = clampThresholdValue(value, DB_FLOOR, DB_CEILING - MIN_THRESHOLD_GAP, DEFAULT_THRESHOLDS.yellow);
        thresholds = {
          yellow,
          red: Math.max(thresholds.red, yellow + MIN_THRESHOLD_GAP),
        };
      } else if (thresholdKey === 'red') {
        const red = clampThresholdValue(value, DB_FLOOR + MIN_THRESHOLD_GAP, DB_CEILING, DEFAULT_THRESHOLDS.red);
        thresholds = {
          yellow: Math.min(thresholds.yellow, red - MIN_THRESHOLD_GAP),
          red,
        };
      }
      renderThresholdControls();
    };

    const monitorLevel = () => {
      if (!analyser || !running) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const level = toEstimatedDb(rms);
      const now = performance.now();
      windowLevelSum += level;
      windowSampleCount += 1;
      if ((now - windowStartMs) >= AVERAGE_WINDOW_MS && windowSampleCount > 0) {
        const avg = Math.round(windowLevelSum / windowSampleCount);
        setActiveLight(classifyLevel(avg));
        windowStartMs = now;
        windowLevelSum = 0;
        windowSampleCount = 0;
      }
      rafId = requestAnimationFrame(monitorLevel);
    };

    const stopMeasurement = async ({ silent = false } = {}) => {
      stopWarningToneLoop();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      try {
        source?.disconnect?.();
      } catch { }
      try {
        analyser?.disconnect?.();
      } catch { }
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch { }
        });
      }
      stream = null;
      source = null;
      analyser = null;
      if (audioContext) {
        try {
          await audioContext.close();
        } catch { }
      }
      audioContext = null;
      running = false;
      starting = false;
      resetAverageWindow();
      setActiveLight(null);
      setMicUiState(MIC_UI_STATE.READY, silent ? '' : 'gestoppt');
    };

    const startMeasurement = async () => {
      if (running || starting) return;
      if (!isMicSupported()) {
        setMicUiState(MIC_UI_STATE.UNSUPPORTED);
        setActiveLight(null);
        return;
      }
      if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasAudioInput = Array.isArray(devices) && devices.some((device) => device?.kind === 'audioinput');
          if (!hasAudioInput) {
            setMicUiState(MIC_UI_STATE.ERROR, 'kein Mikrofon gefunden');
            showMessage('Kein Mikrofon angeschlossen. Bitte Mikrofon verbinden und erneut starten.', 'warn');
            setActiveLight(null);
            return;
          }
        } catch {

        }
      }
      starting = true;
      setMicUiState(MIC_UI_STATE.STARTING);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        audioContext = new AudioContextClass();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        running = true;
        setActiveLight(null);
        resetAverageWindow();
        monitorLevel();
        setMicUiState(MIC_UI_STATE.ACTIVE);
      } catch (error) {
        setActiveLight(null);
        const errorName = typeof error?.name === 'string' ? error.name : '';
        const errorMessage = typeof error?.message === 'string' ? error.message : '';
        const noMicFound = (
          errorName === 'NotFoundError'
          || errorName === 'DevicesNotFoundError'
          || /no\s+audio\s+input|no\s+input\s+device|device.*not\s*found|kein.*mikrofon/i.test(errorMessage)
        );
        if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
          setMicUiState(MIC_UI_STATE.ERROR, 'Zugriff verweigert');
        } else if (noMicFound) {
          setMicUiState(MIC_UI_STATE.ERROR, 'kein Mikrofon gefunden');
          showMessage('Kein Mikrofon angeschlossen. Bitte Mikrofon verbinden und erneut starten.', 'warn');
        } else {
          setMicUiState(MIC_UI_STATE.ERROR, 'nicht verfügbar');
        }
      } finally {
        starting = false;
        renderMicControlState();
      }
    };

    const init = () => {
      renderThresholdControls();
      renderWarningToneState();
      renderMicControlState();
      renderTimer();
      setActiveLight(null);
      SharedTimerStore.subscribe(() => {
        renderTimer();
      });
      if (monitorTickId) {
        window.clearInterval(monitorTickId);
      }
      monitorTickId = window.setInterval(renderTimer, 250);
      els.monitorThresholdInputs?.forEach((input) => {
        input.addEventListener('input', () => {
          setMonitorThreshold(input.dataset.monitorThreshold, input.value);
        });
      });
      els.monitorWarningToneButtons?.forEach((button) => {
        button.addEventListener('click', () => {
          const toneKey = button.dataset.monitorWarningToneToggle;
          if (toneKey !== 'yellow' && toneKey !== 'red') return;
          warningToneEnabled = {
            ...warningToneEnabled,
            [toneKey]: !isWarningToneEnabled(toneKey),
          };
          renderWarningToneState();
          syncWarningToneLoop();
        });
      });
      [els.monitorMicStartButton, els.workPhaseMonitorStartCollapsed].filter(Boolean).forEach((button) => {
        button.addEventListener('click', () => {
          void startMeasurement();
        });
      });
      [els.monitorMicStopButton, els.workPhaseMonitorStopCollapsed].filter(Boolean).forEach((button) => {
        button.addEventListener('click', () => {
          void stopMeasurement();
        });
      });
    };

    return Object.freeze({
      init,
      startMeasurement,
      stopMeasurement,
    });
  })();
  function assignStudentsEvenly(options = {}) {
    const { shuffle = true } = options;
    if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn'); return; }
    if (!state.activeSeats.size) { showMessage('Bitte zuerst das Gruppenraster einrichten.', 'warn'); return; }
    syncGroupSizeInputs();
    const maxSize = clampMaxGroupSize(state.maxGroupSize);
    const minSize = clampMinGroupSize(state.minGroupSize);
    ensureCapacityForStudents(maxSize, minSize);
    const activeIds = Array.from(state.activeSeats);
    state._lastImport = false;
    state.scrollHintDismissed = true;
    const lockedAssignments = {};
    const assigned = new Set();
    state.lockedSeats.forEach(id => {
      lockedAssignments[id] = getSeatList(id);
      lockedAssignments[id].forEach(sid => assigned.add(sid));
    });
    const freeSeats = activeIds.filter(id => !state.lockedSeats.has(id));
    if (!freeSeats.length) {
      showMessage('Keine freien Gruppen verfügbar (alle gesperrt).', 'warn');
      return;
    }
    const capacity = activeIds.length * maxSize;
    const remainingCount = state.students.length;
    if (capacity < remainingCount) {
      showMessage('Raster wurde erweitert, aber es fehlt Platz für alle Lernenden bei dieser Gruppengröße.', 'warn');
    }
    const order = state.students.slice().filter(s => !assigned.has(s.id));
    if (shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    const nextSeats = {};
    activeIds.forEach(id => {
      nextSeats[id] = state.lockedSeats.has(id) ? ensureSeatList(lockedAssignments[id]) : [];
    });
    let idx = 0;
    order.forEach(student => {
      let attempts = 0;
      let target = null;
      while (attempts < freeSeats.length) {
        const candidate = freeSeats[idx % freeSeats.length];
        if ((nextSeats[candidate]?.length || 0) < maxSize) {
          target = candidate; break;
        }
        idx++; attempts++;
      }
      if (target === null) {
        target = freeSeats[idx % freeSeats.length];
      }
      nextSeats[target].push(student.id);
      idx++;
    });
    state.seats = nextSeats;
    renderSeats();
    refreshUnseated();
  }

  const GROUP_SUGGEST_ROULETTE_CONFIG = Object.freeze({
    candidateAttempts: 42,
    minFrames: 18,
    maxFrames: 28,
    minDelayMs: 55,
    maxDelayMs: 260,
    finalHoldMs: 900,
  });
  let groupSuggestInProgress = false;

  const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, Math.max(0, Math.round(ms))));
  const nextPaint = () => new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    } else {
      setTimeout(resolve, 16);
    }
  });

  function flashGroupSuggestionFrame({ final = false } = {}) {
    if (!els.groupsGrid) return;
    const seats = Array.from(els.groupsGrid.querySelectorAll('.seat'));
    els.groupsGrid.classList.add('group-suggesting');
    seats.forEach((seat) => {
      seat.classList.remove('group-suggest-frame', 'group-suggest-final');
      void seat.offsetWidth;
      seat.classList.add('group-suggest-frame');
      if (final) {
        seat.classList.add('group-suggest-final');
      }
    });
  }

  function clearGroupSuggestionFrameState() {
    if (!els.groupsGrid) return;
    els.groupsGrid.classList.remove('group-suggesting');
    els.groupsGrid.querySelectorAll('.seat').forEach((seat) => {
      seat.classList.remove('group-suggest-frame', 'group-suggest-final');
    });
  }

  function setGroupSuggestProgress(percent, text) {
    if (!els.suggestProgress || !els.suggestProgressFill || !els.suggestProgressLabel) return;
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    els.suggestProgress.classList.add('active');
    els.suggestProgress.classList.remove('fade-out');
    els.suggestProgress.style.opacity = '';
    els.suggestProgressFill.style.animation = 'none';
    els.suggestProgressFill.style.transition = '';
    els.suggestProgressFill.style.transform = `scaleX(${pct / 100})`;
    els.suggestProgressLabel.textContent = text || '';
  }

  function finishGroupSuggestProgress(text) {
    if (!els.suggestProgress) return;
    setGroupSuggestProgress(100, text || 'Fertig');
    setTimeout(() => {
      if (!els.suggestProgress) return;
      els.suggestProgress.classList.remove('fade-out');
      void els.suggestProgress.offsetWidth;
      els.suggestProgress.classList.add('fade-out');
      setTimeout(() => {
        if (!els.suggestProgress) return;
        els.suggestProgress.classList.remove('active');
        els.suggestProgress.classList.remove('fade-out');
        els.suggestProgress.style.opacity = '';
      }, 1500);
    }, 180);
  }

  function hideGroupSuggestProgress() {
    if (!els.suggestProgress) return;
    els.suggestProgress.classList.add('fade-out');
    setTimeout(() => {
      if (!els.suggestProgress) return;
      els.suggestProgress.classList.remove('active');
      els.suggestProgress.classList.remove('fade-out');
      els.suggestProgress.style.opacity = '';
    }, 250);
  }

  function cloneGroupSeatMap(source) {
    const out = {};
    if (!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([seatId, occupants]) => {
      out[seatId] = Array.isArray(occupants) ? occupants.slice() : [];
    });
    return out;
  }

  function buildGroupSuggestionSignature(seatMap, seatIds) {
    return seatIds
      .map((seatId) => {
        const occupants = Array.isArray(seatMap[seatId]) ? seatMap[seatId] : [];
        return `${seatId}:${occupants.join(',')}`;
      })
      .join('|');
  }

  function scoreGroupSuggestionSeatMap(seatMap, studentById) {
    let score = 0;
    const buddySetById = new Map();
    const foeSetById = new Map();
    const performanceConstraintActive = clampPerformanceFlairCount(state.performanceFlairCount) >= 2
      && state.students.some((student) => sanitizePerformanceFlairForCount(student?.performanceFlair));
    studentById.forEach((student, studentId) => {
      buddySetById.set(studentId, new Set(student?.buddies || []));
      foeSetById.set(studentId, new Set(student?.foes || []));
    });

    const seatSizes = [];
    Object.values(seatMap).forEach((occupantsRaw) => {
      const occupants = Array.isArray(occupantsRaw) ? occupantsRaw : [];
      const size = occupants.length;
      seatSizes.push(size);
      if (size <= 1) return;

      occupants.forEach((studentId) => {
        const student = studentById.get(studentId);
        if (student?.prefersAlone) {
          score += (size - 1) * 1.2;
        }
      });

      for (let i = 0; i < size; i += 1) {
        const aId = occupants[i];
        const aBuddies = buddySetById.get(aId) || new Set();
        const aFoes = foeSetById.get(aId) || new Set();
        for (let j = i + 1; j < size; j += 1) {
          const bId = occupants[j];
          const bBuddies = buddySetById.get(bId) || new Set();
          const bFoes = foeSetById.get(bId) || new Set();
          if (performanceConstraintActive) {
            const distance = getPerformanceFlairDistance(
              studentById.get(aId)?.performanceFlair,
              studentById.get(bId)?.performanceFlair
            );
            if (distance && distance > 0) {
              score += distance * 12000;
            }
          }
          if (aFoes.has(bId)) score += 3;
          if (bFoes.has(aId)) score += 3;
          if (aBuddies.has(bId)) score -= 1.7;
          if (bBuddies.has(aId)) score -= 1.7;
        }
      }
    });

    if (seatSizes.length > 0) {
      const avg = seatSizes.reduce((sum, size) => sum + size, 0) / seatSizes.length;
      seatSizes.forEach((size) => {
        const delta = size - avg;
        score += delta * delta * 0.14;
      });
    }

    return score;
  }
  function formatGroupSuggestionSeatLabel(seatId, activeIds = []) {
    const index = Array.isArray(activeIds) ? activeIds.indexOf(seatId) : -1;
    return index >= 0 ? `Gruppe ${index + 1}` : `Gruppe ${seatId}`;
  }
  function buildPerformanceFlairGroupCountOptions(flairs, remainingCounts, maxSize, minSize, freeSeatCount) {
    const relevantFlairs = (Array.isArray(flairs) ? flairs : []).filter((flair) => (remainingCounts.get(flair) || 0) > 0);
    const options = [];
    const backtrack = (index, usedSeats, current) => {
      if (usedSeats > freeSeatCount) return;
      if (index >= relevantFlairs.length) {
        options.push(new Map(current));
        return;
      }
      const flair = relevantFlairs[index];
      const count = remainingCounts.get(flair) || 0;
      const minGroups = Math.ceil(count / Math.max(1, maxSize));
      const maxGroups = Math.floor(count / Math.max(1, minSize));
      if (maxGroups < minGroups) return;
      for (let groupCount = minGroups; groupCount <= maxGroups; groupCount += 1) {
        current.set(flair, groupCount);
        backtrack(index + 1, usedSeats + groupCount, current);
      }
      current.delete(flair);
    };
    backtrack(0, 0, new Map());
    return options.filter((option) => {
      let used = 0;
      option.forEach((value) => { used += value; });
      return used <= freeSeatCount;
    });
  }
  function analyzePerformanceFlairConstraints({
    activeIds,
    freeSeats,
    lockedSeatSet,
    lockedAssignments,
    maxSize,
    minSize,
    studentById,
  }) {
    const allowedFlairs = getAllowedPerformanceFlairs();
    const assignedFlairs = state.students
      .map(student => sanitizePerformanceFlairForCount(student?.performanceFlair))
      .filter(Boolean);
    if (!allowedFlairs.length || !assignedFlairs.length) {
      return { active: false };
    }
    const invalidStudent = state.students.find((student) => !sanitizePerformanceFlairForCount(student?.performanceFlair));
    const missingFlairWarningMessage = invalidStudent
      ? `Nicht alle Lernenden haben eine Leistungsstufe aus ${formatPerformanceFlairRangeLabel()}. Es wird eine bestmögliche Verteilung erstellt.`
      : null;
    const lockedCounts = new Map(allowedFlairs.map((flair) => [flair, 0]));
    for (const seatId of activeIds) {
      if (!lockedSeatSet.has(seatId)) continue;
      const occupants = ensureSeatList(lockedAssignments[seatId]);
      if (!occupants.length) continue;
      if (occupants.length < minSize || occupants.length > maxSize) {
        showMessage(
          `${formatGroupSuggestionSeatLabel(seatId, activeIds)} ist gesperrt und verletzt mit ${occupants.length} Lernenden die Gruppengröße ${minSize}-${maxSize}.`,
          'warn'
        );
        return null;
      }
      const flairSet = new Set(
        occupants
          .map((studentId) => sanitizePerformanceFlairForCount(studentById.get(studentId)?.performanceFlair))
          .filter(Boolean)
      );
      if (flairSet.size !== 1) {
        showMessage(
          `${formatGroupSuggestionSeatLabel(seatId, activeIds)} mischt Leistungsstufen. Entsperre oder bereinige die Gruppe zuerst.`,
          'warn'
        );
        return null;
      }
      const flair = [...flairSet][0];
      lockedCounts.set(flair, (lockedCounts.get(flair) || 0) + occupants.length);
    }
    const remainingCounts = new Map(allowedFlairs.map((flair) => [flair, 0]));
    state.students.forEach((student) => {
      const flair = sanitizePerformanceFlairForCount(student?.performanceFlair);
      remainingCounts.set(flair, (remainingCounts.get(flair) || 0) + 1);
    });
    lockedCounts.forEach((count, flair) => {
      remainingCounts.set(flair, Math.max(0, (remainingCounts.get(flair) || 0) - count));
    });
    const groupCountOptions = buildPerformanceFlairGroupCountOptions(
      allowedFlairs,
      remainingCounts,
      maxSize,
      minSize,
      freeSeats.length
    );
    if (!groupCountOptions.length) {
      return {
        active: true,
        bestEffort: true,
        warningMessage: missingFlairWarningMessage
          || `Die Leistungsstufen lassen sich mit der aktuellen Gruppenanzahl und Gruppengröße ${minSize}-${maxSize} nicht vollständig homogen verteilen. Es wird eine bestmögliche Verteilung erstellt.`,
        flairs: allowedFlairs,
        groupCountOptions: [],
      };
    }
    return {
      active: true,
      bestEffort: Boolean(missingFlairWarningMessage),
      warningMessage: missingFlairWarningMessage,
      flairs: allowedFlairs,
      groupCountOptions,
    };
  }
  function buildPerformanceFlairSeatAllocation(freeSeats, flairs, groupCounts) {
    const shuffledSeats = Array.isArray(freeSeats) ? freeSeats.slice() : [];
    for (let i = shuffledSeats.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledSeats[i], shuffledSeats[j]] = [shuffledSeats[j], shuffledSeats[i]];
    }
    const flairList = Array.isArray(flairs) ? flairs : [];
    const allocation = new Map(flairList.map((flair) => [flair, []]));
    let seatIndex = 0;
    flairList.forEach((flair) => {
      const groupCount = groupCounts?.get(flair) || 0;
      allocation.set(flair, shuffledSeats.slice(seatIndex, seatIndex + groupCount));
      seatIndex += groupCount;
    });
    return allocation;
  }

  function buildPreferenceGroupSuggestionCandidate({
    activeIds,
    freeSeats,
    lockedSeatSet,
    lockedAssignments,
    initiallyAssignedIds,
    maxSize,
    studentById,
    performanceFlairPlan = null,
    performanceFlairBestEffort = false,
  }) {
    const assigned = new Set(initiallyAssignedIds || []);
    const nextSeats = {};
    activeIds.forEach((seatId) => {
      nextSeats[seatId] = lockedSeatSet.has(seatId) ? ensureSeatList(lockedAssignments[seatId]) : [];
      nextSeats[seatId].forEach((studentId) => assigned.add(studentId));
    });

    const seatScore = (seatId, studentId) => {
      const occup = nextSeats[seatId] || [];
      const stu = studentById.get(studentId);
      const buddies = new Set(stu?.buddies || []);
      const foes = new Set(stu?.foes || []);
      const studentFlair = sanitizePerformanceFlairForCount(stu?.performanceFlair);
      let score = occup.length * 0.4;
      occup.forEach((otherId) => {
        if (foes.has(otherId)) score += 3;
        if (buddies.has(otherId)) score -= 2;
        if (performanceFlairBestEffort) {
          const distance = getPerformanceFlairDistance(studentFlair, studentById.get(otherId)?.performanceFlair);
          if (distance && distance > 0) {
            score += distance * 2.4;
          }
        }
      });
      return score;
    };
    const orderStudents = (students) => {
      const ordered = students.slice().sort((a, b) => {
        const score = (stu) => ((stu.buddies?.length || 0) * -1) + ((stu.foes?.length || 0) * -2);
        return score(a) - score(b);
      });
      for (let i = ordered.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
      return ordered;
    };
    const placeStudents = (students, seatIds) => {
      orderStudents(students).forEach((student) => {
        let bestSeat = null;
        let bestScore = Infinity;
        seatIds.forEach((seatId) => {
          if ((nextSeats[seatId]?.length || 0) >= maxSize) return;
          const value = seatScore(seatId, student.id);
          if (value < bestScore - 1e-6 || (Math.abs(value - bestScore) < 1e-6 && Math.random() < 0.5)) {
            bestScore = value;
            bestSeat = seatId;
          }
        });
        if (!bestSeat) {
          bestSeat = seatIds.find(id => (nextSeats[id]?.length || 0) < maxSize) || null;
        }
        if (bestSeat) {
          nextSeats[bestSeat].push(student.id);
        }
      });
    };

    if (performanceFlairPlan?.active) {
      (performanceFlairPlan.flairs || []).forEach((flair) => {
        placeStudents(
          state.students.filter((student) => (
            !assigned.has(student.id)
            && sanitizePerformanceFlairForCount(student.performanceFlair) === flair
          )),
          performanceFlairPlan.seatAllocation.get(flair) || []
        );
      });
      return nextSeats;
    }

    placeStudents(
      state.students.filter(student => !assigned.has(student.id)),
      freeSeats
    );

    return nextSeats;
  }

  async function playGroupSuggestionRoulette(candidates, finalCandidate) {
    if (!Array.isArray(candidates) || !candidates.length || !finalCandidate) return;
    const roulettePool = candidates.filter(candidate => candidate?.signature !== finalCandidate.signature);
    const frameCount = Math.max(
      GROUP_SUGGEST_ROULETTE_CONFIG.minFrames,
      Math.min(GROUP_SUGGEST_ROULETTE_CONFIG.maxFrames, roulettePool.length + 1)
    );
    const frameSequence = [];
    if (roulettePool.length > 0) {
      const randomOffset = Math.floor(Math.random() * roulettePool.length);
      for (let i = 0; i < frameCount - 1; i += 1) {
        frameSequence.push(roulettePool[(i + randomOffset) % roulettePool.length]);
      }
    }
    while (frameSequence.length < frameCount - 1) {
      frameSequence.push(finalCandidate);
    }
    frameSequence.push(finalCandidate);

    for (let i = 0; i < frameSequence.length; i += 1) {
      const frame = frameSequence[i] || finalCandidate;
      state.seats = cloneGroupSeatMap(frame.seats);
      renderSeats();
      const isFinal = i === frameSequence.length - 1;
      flashGroupSuggestionFrame({ final: isFinal });
      await nextPaint();
      const progress = 35 + Math.round(((i + 1) / frameSequence.length) * 63);
      setGroupSuggestProgress(progress, isFinal ? 'Finale Verteilung...' : 'Mische Gruppen...');
      if (isFinal) {
        await waitMs(GROUP_SUGGEST_ROULETTE_CONFIG.finalHoldMs);
        break;
      }
      const t = i / Math.max(1, frameSequence.length - 2);
      const eased = t * t;
      const delayMs = GROUP_SUGGEST_ROULETTE_CONFIG.minDelayMs
        + ((GROUP_SUGGEST_ROULETTE_CONFIG.maxDelayMs - GROUP_SUGGEST_ROULETTE_CONFIG.minDelayMs) * eased);
      await waitMs(delayMs);
    }
  }

  async function assignWithPreferences() {
    if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn'); return; }
    if (!state.activeSeats.size) { showMessage('Bitte zuerst das Gruppenraster einrichten.', 'warn'); return; }
    if (groupSuggestInProgress) return;
    syncGroupSizeInputs();
    const maxSize = clampMaxGroupSize(state.maxGroupSize);
    const minSize = clampMinGroupSize(state.minGroupSize);
    ensureCapacityForStudents(maxSize, minSize);
    const activeIds = Array.from(state.activeSeats);
    state._lastImport = false;
    state.scrollHintDismissed = true;
    const lockedAssignments = {};
    const assigned = new Set();
    state.lockedSeats.forEach(id => {
      lockedAssignments[id] = getSeatList(id);
      lockedAssignments[id].forEach(sid => assigned.add(sid));
    });
    const freeSeats = activeIds.filter(id => !state.lockedSeats.has(id));
    if (!freeSeats.length) {
      showMessage('Keine freien Gruppen verfügbar (alle gesperrt).', 'warn');
      return;
    }
    const capacity = activeIds.length * maxSize;
    const remainingCount = state.students.length;
    if (capacity < remainingCount) {
      showMessage('Raster wurde erweitert, aber es fehlt Platz für alle Lernenden bei dieser Gruppengröße.', 'warn');
    }
    const previousSeats = cloneGroupSeatMap(state.seats);
    const lockedSeatSet = new Set(state.lockedSeats);
    const studentById = new Map(state.students.map(s => [s.id, s]));
    const initiallyAssignedIds = new Set(assigned);
    const performanceFlairConstraints = analyzePerformanceFlairConstraints({
      activeIds,
      freeSeats,
      lockedSeatSet,
      lockedAssignments,
      maxSize,
      minSize,
      studentById,
    });
    if (performanceFlairConstraints === null) {
      return;
    }
    groupSuggestInProgress = true;
    [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    });
    setGroupSuggestProgress(0, 'Vorschläge werden vorbereitet...');

    try {
      const candidates = [];
      const seenSignatures = new Set();
      const totalAttempts = GROUP_SUGGEST_ROULETTE_CONFIG.candidateAttempts;
      const usePerformanceFlairPlan = Boolean(
        performanceFlairConstraints?.active
        && !performanceFlairConstraints.bestEffort
        && performanceFlairConstraints.groupCountOptions?.length
      );

      for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
        const selectedGroupCounts = usePerformanceFlairPlan
          ? performanceFlairConstraints.groupCountOptions[
          Math.floor(Math.random() * performanceFlairConstraints.groupCountOptions.length)
          ]
          : null;
        const candidateSeats = buildPreferenceGroupSuggestionCandidate({
          activeIds,
          freeSeats,
          lockedSeatSet,
          lockedAssignments,
          initiallyAssignedIds,
          maxSize,
          studentById,
          performanceFlairPlan: usePerformanceFlairPlan
            ? {
              active: true,
              flairs: performanceFlairConstraints.flairs,
              seatAllocation: buildPerformanceFlairSeatAllocation(
                freeSeats,
                performanceFlairConstraints.flairs,
                selectedGroupCounts
              ),
            }
            : null,
          performanceFlairBestEffort: Boolean(
            performanceFlairConstraints?.active && performanceFlairConstraints.bestEffort
          ),
        });
        const signature = buildGroupSuggestionSignature(candidateSeats, activeIds);
        if (seenSignatures.has(signature)) {
          continue;
        }
        seenSignatures.add(signature);
        const candidate = {
          seats: candidateSeats,
          signature,
          score: scoreGroupSuggestionSeatMap(candidateSeats, studentById),
        };
        candidates.push(candidate);
        const progress = 5 + Math.round(((attempt + 1) / totalAttempts) * 28);
        setGroupSuggestProgress(progress, `Berechne Varianten... (${attempt + 1}/${totalAttempts})`);
      }

      if (!candidates.length) {
        const fallbackGroupCounts = usePerformanceFlairPlan
          ? performanceFlairConstraints.groupCountOptions[0]
          : null;
        const fallbackSeats = buildPreferenceGroupSuggestionCandidate({
          activeIds,
          freeSeats,
          lockedSeatSet,
          lockedAssignments,
          initiallyAssignedIds,
          maxSize,
          studentById,
          performanceFlairPlan: usePerformanceFlairPlan
            ? {
              active: true,
              flairs: performanceFlairConstraints.flairs,
              seatAllocation: buildPerformanceFlairSeatAllocation(
                freeSeats,
                performanceFlairConstraints.flairs,
                fallbackGroupCounts
              ),
            }
            : null,
          performanceFlairBestEffort: Boolean(
            performanceFlairConstraints?.active && performanceFlairConstraints.bestEffort
          ),
        });
        candidates.push({
          seats: fallbackSeats,
          signature: buildGroupSuggestionSignature(fallbackSeats, activeIds),
          score: scoreGroupSuggestionSeatMap(fallbackSeats, studentById),
        });
      }

      candidates.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return Math.random() < 0.5 ? -1 : 1;
      });

      const topCandidateCount = Math.max(1, Math.min(3, candidates.length));
      const finalCandidate = candidates[Math.floor(Math.random() * topCandidateCount)] || candidates[0];
      const rouletteCandidates = candidates.slice(0, Math.min(candidates.length, 12));
      await playGroupSuggestionRoulette(rouletteCandidates, finalCandidate);

      state.seats = cloneGroupSeatMap(finalCandidate.seats);
      renderSeats();
      refreshUnseated();
      if (performanceFlairConstraints?.bestEffort && performanceFlairConstraints.warningMessage) {
        showMessage(performanceFlairConstraints.warningMessage, 'warn');
      }
      finishGroupSuggestProgress('Vorschlag steht');
    } catch (error) {
      reportAppError(error, 'Gruppenvorschlag konnte nicht erstellt werden.', {
        scope: 'group-suggestion',
        action: 'assign-with-preferences',
      });
      state.seats = previousSeats;
      renderSeats();
      refreshUnseated();
      hideGroupSuggestProgress();
    } finally {
      groupSuggestInProgress = false;
      clearGroupSuggestionFrameState();
      [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
    }
  }

  [els.groupSuggest, els.groupSuggestCollapsed].filter(Boolean).forEach((button) => {
    button.addEventListener('click', assignWithPreferences);
  });

  [els.groupResetLearners].filter(Boolean).forEach((button) => {
    button.addEventListener('click', () => {
      state.seats = {};
      state.lockedSeats.clear();
      state.seatTopics = {};
      state._lastImport = false;
      state.scrollHintDismissed = true;
      renderSeats();
      refreshUnseated();
    });
  });

  getRandomPickerStartButtons().forEach((button) => {
    button.addEventListener('click', () => {
      void startRandomPickerSpin();
    });
  });
  els.randomPickerImport?.addEventListener('click', () => {
    if (classroomTutorialDemoActive) {
      showMessage('Demo: Dateiimporte verändern die Beispieldaten nicht.', 'info');
      return;
    }
    if (!els.file) return;
    els.file.value = '';
    els.file.click();
  });
  els.randomPickerExport?.addEventListener('click', () => {
    void downloadSeatPlan();
  });

  const updateMonitorAmpelSizing = () => {
    const ampel = els.monitorAmpel;
    if (!ampel || !monitorLightNodes.length) return;

    const rect = ampel.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      ampel.style.removeProperty('--monitor-light-fit-size');
      return;
    }

    const computed = window.getComputedStyle(ampel);
    const paddingInline = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
    const paddingBlock = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    const gap = parseFloat(computed.rowGap || computed.gap) || 0;
    const innerWidth = Math.max(0, rect.width - paddingInline);
    const innerHeight = Math.max(0, rect.height - paddingBlock);
    const lightCount = monitorLightNodes.length;
    if (!innerWidth || !innerHeight || !lightCount) {
      ampel.style.removeProperty('--monitor-light-fit-size');
      return;
    }

    const sizeByWidth = innerWidth;
    const sizeByHeight = (innerHeight - (gap * (lightCount - 1))) / lightCount;
    const fitSize = Math.floor(Math.max(0, Math.min(sizeByWidth, sizeByHeight)));

    if (fitSize > 0) {
      ampel.style.setProperty('--monitor-light-fit-size', `${fitSize}px`);
      return;
    }
    ampel.style.removeProperty('--monitor-light-fit-size');
  };

  const handleViewportChange = () => {
    if (getActiveTab() === TAB_GROUPS) {
      requestGroupGridLayoutRefresh();
    }
    updateMonitorAmpelSizing();
    positionWorkOrderHintOverlay();
    if (typeof requestAnimationFrame === 'function') {
      if (isIOSDevice) {
        requestAnimationFrame(() => {
          if (getActiveTab() === TAB_GROUPS) {
            requestGroupGridLayoutRefresh();
          }
          updateMonitorAmpelSizing();
          positionWorkOrderHintOverlay();
        });
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (getActiveTab() === TAB_GROUPS) {
            requestGroupGridLayoutRefresh();
          }
          updateMonitorAmpelSizing();
          positionWorkOrderHintOverlay();
        });
      });
    }
  };
  function refreshChromeDependentLayouts() {
    handleViewportChange();
    bridgeController?.refreshModuleLayouts({
      activeTab: getActiveTab(),
      isIOSDevice,
    });
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
      requestGroupGridLayoutRefresh({ resetViewport: true });
    }
  }
  window.addEventListener('resize', handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
  }
  if (typeof ResizeObserver === 'function' && els.groupsGridWrap) {
    const groupGridObserver = new ResizeObserver(() => {
      if (getActiveTab() === TAB_GROUPS) {
        requestGroupGridLayoutRefresh();
      }
    });
    groupGridObserver.observe(els.groupsGridWrap);
    if (els.groupsMainHost) {
      groupGridObserver.observe(els.groupsMainHost);
    }
  }
  if (typeof ResizeObserver === 'function' && els.monitorAmpel) {
    const monitorAmpelObserver = new ResizeObserver(() => {
      updateMonitorAmpelSizing();
    });
    monitorAmpelObserver.observe(els.monitorAmpel);
    els.monitorAmpel.parentElement && monitorAmpelObserver.observe(els.monitorAmpel.parentElement);
  }
  bindTabNavigation();
  bindBackgroundDrop(els.groupsGrid);
  bindBackgroundDrop(els.groupsGridWrap, { ignoreInsideGrid: true });

  try {
    setActiveTab(TAB_PLANNING);
  } catch (error) {
    reportAppError(error, 'Planung konnte beim Start nicht geladen werden. Gruppenansicht als Fallback geöffnet.', {
      scope: 'app-init',
      action: 'set-initial-tab',
      tab: TAB_PLANNING,
    });
    setActiveTabImmediate(TAB_GROUPS);
  }
  try {
    MonitorModule.init();
  } catch (error) {
    reportAppError(error, 'Lautstärke-Feedback konnte nicht initialisiert werden.', {
      scope: 'app-init',
      action: 'init-monitor-module',
    });
  }
  try {
    buildGrid();
    refreshUnseated();
    renderWorkOrder();
  } catch (error) {
    reportAppError(error, 'Die Hauptansicht konnte nicht vollständig initialisiert werden.', {
      scope: 'app-init',
      action: 'init-main-view',
    });
  }
  syncChromeState();
  updateMonitorAmpelSizing();
  els.app?.classList.add('app-js-ready');
  pwaInstallPrompt.showIfNeeded();
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
  });
  helpCenter = createHelpCenter({
    els,
    onStartTutorial: startTutorialFromEntry,
  });
  firstRunTutorial.showContextHelp({ prompt: true });
  window.addEventListener('resize', positionWorkOrderHintOverlay);
  window.addEventListener('scroll', positionWorkOrderHintOverlay, true);
  const serviceWorkerUpdates = registerServiceWorkerUpdates({
    updateDialog: els.updateDialog,
    updateDialogLater: els.updateDialogLater,
    updateDialogReload: els.updateDialogReload,
    beforeReloadForUpdate,
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
            showMessage('Update verfügbar. Aktualisieren-Dialog geöffnet.', 'info');
            break;
          case 'up-to-date':
            showMessage('TeachHelper ist aktuell.', 'info', { presentation: 'toast' });
            break;
          case 'disabled':
            showMessage('Update-Check ist auf localhost deaktiviert.', 'warn');
            break;
          case 'unsupported':
            showMessage('Update-Check wird von diesem Browser nicht unterstützt.', 'warn');
            break;
          default:
            showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn');
            break;
        }
      } catch {
        showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn');
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
