import { createTutorialCatalog } from './tutorials/catalog.js';
import {
  HELP_PREVIEW_COMMAND_EVENT,
  HELP_PREVIEW_STATE_EVENT,
  getHelpPreviewFrameNonce,
} from './help-preview.js';
import { createModuleFrame, postToModule } from '../shared/module-frame-bridge.js';
import {
  hasTutorialEntryHintBeenSeen,
  TUTORIAL_ENTRY_HINT_SYNC_EVENT,
} from '../shared/tutorial-entry-state.js';
import {
  GRADES_VIEW_REQUEST_EVENT,
  TAB_DUPLICATE_CHECK,
  TAB_GRADES,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_SEATPLAN,
  TAB_WORK_PHASE,
} from '../shell/tabs.js';

export function createAppTutorialController({
  view: window,
  els,
  helpPreviewRequest,
  shellSupportsExternalFileSync,
  bindRuntime,
  setRuntimeTimeout,
  getBridgeController,
  getClassroomState,
  getGroupsController,
  getRandomPickerController,
  getWorkPhaseController,
  getFirstRunTutorial,
  updateCsvStatusDisplay,
  renderRandomPicker,
  setActiveTabForTutorial,
}) {
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
  const getDuplicateCheckController = () => els.duplicateCheckHost?._duplicateCheckController || null;
  const getQrController = () => els.qrHost?._qrController || null;
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
  const openMergerToolForTutorial = (tool = 'layout') => {
    getBridgeController()?.ensureTabInitialized(TAB_MERGER);
    getBridgeController()?.dispatchMergerToolRequest?.(tool);
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
    getBridgeController()?.ensureTabInitialized(TAB_PLANNING);
    getBridgeController()?.dispatchPlanningViewRequest({
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
    getBridgeController()?.ensureTabInitialized(TAB_NAME_LEARNING);
    postNameLearningTutorialCommand('showSurface', { surface });
  };
  function activateNameLearningTutorialDemo() {
    getBridgeController()?.ensureTabInitialized(TAB_NAME_LEARNING);
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
    getBridgeController()?.ensureTabInitialized(TAB_QR);
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
    getBridgeController()?.ensureTabInitialized(TAB_QR);
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
    const demoUrl = new URL('../modules/planning/app.html', import.meta.url);
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
    const demoUrl = new URL('../modules/grades/app.html', import.meta.url);
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
    getBridgeController()?.ensureTabInitialized(TAB_SEATPLAN);
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
    const demoUrl = new URL('../modules/seatplan/app.html', import.meta.url);
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
    getBridgeController()?.ensureTabInitialized(TAB_DUPLICATE_CHECK);
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
  function activateClassroomTutorialDemo(tab) {
    if (getClassroomState().isDemoActive()) {
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
    const previousGroupsState = getGroupsController()?.getStateSnapshot();
    const fileInputWasDisabled = Boolean(els.file?.disabled);
    if (els.file) els.file.disabled = true;
    const restoreClassroomState = getClassroomState().activateDemoState({
      students: demoStudents,
      headers: ['Nachname', 'Vorname'],
      csvName: 'Beispielklasse',
      performanceFlairCount: 4,
    });
    getGroupsController()?.replaceState({
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
    getGroupsController()?.render({ resetViewport: true });
    renderRandomPicker();
    const cleanup = () => {
      if (!getClassroomState().isDemoActive()) return;
      if (getGroupsController()?.isSuggesting() || getRandomPickerController()?.isSpinning()) {
        setRuntimeTimeout(cleanup, 120);
        return;
      }
      restoreClassroomState();
      getGroupsController()?.replaceState(previousGroupsState);
      if (els.file) els.file.disabled = fileInputWasDisabled;
      if (els.preferencesDialog?.open && typeof els.preferencesDialog.close === 'function') {
        els.preferencesDialog.close();
      }
      els.preferencesDialog?.removeAttribute('open');
      updateCsvStatusDisplay();
      getGroupsController()?.render({ resetViewport: true });
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

  function activateWorkPhaseTutorialDemo() {
    const cleanup = getWorkPhaseController()?.activateTutorialDemo() || (() => {});
    try {
      const current = getCurrentModuleTutorialSteps({ activeTab: TAB_WORK_PHASE });
      return { steps: Array.isArray(current) ? current : current.steps, cleanup };
    } catch (error) {
      cleanup();
      throw error;
    }
  }
  let tutorialCatalog = null;
  const getCurrentModuleTutorialSteps = (...args) => tutorialCatalog.getDefinition(...args);
  function initializeCatalog() {
    tutorialCatalog = createTutorialCatalog({
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
  }
  function startHelpPreview() {
    const firstRunTutorial = getFirstRunTutorial();
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

  return {
    frames: {
      getPlanningFrame,
      getGradesFrame,
      getMergerFrame,
      getDuplicateCheckFrame,
      getQrFrame,
      getSeatplanFrame,
      getNameLearningFrame,
    },
    initializeCatalog,
    getDefinition: getCurrentModuleTutorialSteps,
    syncTutorialEntryHintToModules,
    startHelpPreview,
  };
}
