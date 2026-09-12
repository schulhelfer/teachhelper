import {
  TAB_GRADES,
  TAB_GROUPS,
  TAB_DUPLICATE_CHECK,
  TAB_MERGER,
  TAB_NAME_LEARNING,
  TAB_PLANNING,
  TAB_QR,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
  TAB_WORK_PHASE,
} from '../shell/tabs.js';
import {
  GRADE_VAULT_LOCKED_ICON,
  GRADE_VAULT_UNLOCKED_ICON,
} from '../shared/grade-vault-lock-icons.js';
import { createChromeController } from './shell/chrome-controller.js';
import { createSidebarResizeController } from './shell/sidebar-resize.js';
import { createTabController } from './shell/tab-controller.js';
import {
  createTabNavLayoutController,
  fitTabNavItems,
} from './shell/tab-nav-layout.js';
import { createWorkspaceStatusController } from './shell/workspace-status.js';

export { fitTabNavItems };

const PROTECTED_TAB_TARGETS = Object.freeze([TAB_GRADES, TAB_PLANNING]);

export function createShellController({
  els,
  state,
  isIOSDevice = false,
  shellSupportsExternalFileSync = false,
  onEnsureTabInitialized,
  onDispatchPlanningViewRequest,
  onRenderRandomPicker,
  onPositionWorkOrderHintOverlay,
  onRefreshLayouts,
  onRequestGradeVault,
  onRequestManualSave,
  onResolveGradesTabLeave,
  onResolvePlanningTabLeave,
  onSidebarWidthChange,
  onActiveTabChange,
  onTabActivating,
  onRegisterCleanup,
} = {}) {
  const ensureTabInitialized = typeof onEnsureTabInitialized === 'function'
    ? onEnsureTabInitialized
    : (() => {});
  const dispatchPlanningViewRequest = typeof onDispatchPlanningViewRequest === 'function'
    ? onDispatchPlanningViewRequest
    : (() => {});
  const renderRandomPicker = typeof onRenderRandomPicker === 'function'
    ? onRenderRandomPicker
    : (() => {});
  const positionWorkOrderHintOverlay = typeof onPositionWorkOrderHintOverlay === 'function'
    ? onPositionWorkOrderHintOverlay
    : (() => {});
  const refreshLayouts = typeof onRefreshLayouts === 'function'
    ? onRefreshLayouts
    : (() => {});
  const requestGradeVault = typeof onRequestGradeVault === 'function'
    ? onRequestGradeVault
    : (() => {});
  const requestManualSave = typeof onRequestManualSave === 'function'
    ? onRequestManualSave
    : (() => {});
  const resolveGradesTabLeave = typeof onResolveGradesTabLeave === 'function'
    ? onResolveGradesTabLeave
    : (() => Promise.resolve(false));
  const resolvePlanningTabLeave = typeof onResolvePlanningTabLeave === 'function'
    ? onResolvePlanningTabLeave
    : (() => Promise.resolve(false));
  const notifySidebarWidthChange = typeof onSidebarWidthChange === 'function'
    ? onSidebarWidthChange
    : (() => {});
  const notifyActiveTabChange = typeof onActiveTabChange === 'function'
    ? onActiveTabChange
    : (() => {});
  const notifyTabActivating = typeof onTabActivating === 'function'
    ? onTabActivating
    : (() => {});
  const registerCleanup = typeof onRegisterCleanup === 'function'
    ? onRegisterCleanup
    : (() => {});
  let unsavedTabConfirmPromise = null;
  let chromeController = null;
  let tabNavLayout = null;
  let tabController = null;
  let workspaceStatus = null;

  function getActiveTab() {
    return tabController?.getActiveTab() ?? state.activeTab;
  }

  function getTabTransitionState() {
    return tabController?.getTransitionState() ?? 'idle';
  }

  function getSidebarWidthScope(tab = getActiveTab()) {
    return tab === TAB_PLANNING || tab === TAB_GRADES
      ? 'planning'
      : 'other';
  }

  function isShellSidebarResizableTab(tab = getActiveTab()) {
    return tab === TAB_GROUPS || tab === TAB_RANDOM_PICKER || tab === TAB_WORK_PHASE;
  }

  const sidebarResize = createSidebarResizeController({
    app: els.app,
    sidebar: els.sidePanel,
    handle: els.sidebarResizeHandle,
    view: window,
    ResizeObserverClass: window.ResizeObserver,
    getActiveScope: getSidebarWidthScope,
    isActiveTabResizable: isShellSidebarResizableTab,
    getChromeCollapsed: () => chromeController?.isCollapsed() ?? Boolean(state.chromeCollapsed),
    getChromeTransitionState: () => chromeController?.getTransitionState() ?? 'idle',
    onCollapseRequest: () => chromeController?.setCollapsed(true),
    onWidthChange: notifySidebarWidthChange,
    now: Date.now,
  });
  registerCleanup(() => sidebarResize.dispose());

  function showUnsavedTabLeaveDialog() {
    if (unsavedTabConfirmPromise) {
      return unsavedTabConfirmPromise;
    }
    const dialog = els.unsavedDataDialog;
    if (!dialog) {
      return Promise.resolve(true);
    }
    const areaLabel = workspaceStatus.getUnsavedAreaLabel();
    if (els.unsavedDataDialogText) {
      els.unsavedDataDialogText.textContent = `In ${areaLabel} gibt es ungespeicherte Änderungen. Speichere sie, bevor du die Ansicht verlässt, oder wechsle trotzdem.`;
    }
    unsavedTabConfirmPromise = new Promise((resolve) => {
      const finish = (confirmed) => {
        els.unsavedDataDialogStay?.removeEventListener('click', onStay);
        els.unsavedDataDialogLeave?.removeEventListener('click', onLeave);
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        if (dialog.open && typeof dialog.close === 'function') {
          dialog.close(confirmed ? 'leave' : 'stay');
        } else {
          dialog.removeAttribute('open');
        }
        unsavedTabConfirmPromise = null;
        resolve(Boolean(confirmed));
      };
      const onStay = () => finish(false);
      const onLeave = () => finish(true);
      const onCancel = (event) => {
        event.preventDefault();
        finish(false);
      };
      const onClose = () => finish(dialog.returnValue === 'leave');
      els.unsavedDataDialogStay?.addEventListener('click', onStay);
      els.unsavedDataDialogLeave?.addEventListener('click', onLeave);
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('close', onClose);
      try {
        if (typeof dialog.showModal === 'function') {
          if (!dialog.open) {
            dialog.showModal();
          }
        } else {
          dialog.setAttribute('open', 'open');
        }
      } catch (_error) {
        finish(false);
        return;
      }
      els.unsavedDataDialogStay?.focus();
    });
    return unsavedTabConfirmPromise;
  }

  function setTutorialEntryVisibility(visible) {
    const isVisible = Boolean(visible);
    if (els.sidebarFooter) {
      els.sidebarFooter.hidden = !isVisible;
      els.sidebarFooter.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      if ('inert' in els.sidebarFooter) {
        els.sidebarFooter.inert = !isVisible;
      }
    }
    if (!els.firstRunTutorialStart) return;
    els.firstRunTutorialStart.disabled = !isVisible;
    els.firstRunTutorialStart.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (isVisible) {
      els.firstRunTutorialStart.removeAttribute('tabindex');
    } else {
      els.firstRunTutorialStart.setAttribute('tabindex', '-1');
    }
  }

  function renderPlanningManualSaveButton() {
    if (!els.sidebarManualSaveBtn) return;
    const controlState = workspaceStatus.getManualSaveControlState();
    if (els.app) {
      els.app.classList.toggle('app-planning-manual-save-active', controlState.shouldShow);
      els.app.classList.toggle(
        'app-planning-manual-save-visible',
        controlState.visible
      );
    }
    els.sidebarManualSaveBtn.hidden = controlState.hidden;
    els.sidebarManualSaveBtn.disabled = controlState.disabled;
    els.sidebarManualSaveBtn.setAttribute('aria-hidden', controlState.hidden ? 'true' : 'false');
    els.sidebarManualSaveBtn.classList.toggle('attention-pulse', controlState.attention);
    els.sidebarManualSaveBtn.classList.toggle(
      'manual-header-save-btn-collapsed',
      controlState.collapsed
    );
    els.sidebarManualSaveBtn.title = controlState.title;
    els.sidebarManualSaveBtn.setAttribute('aria-label', controlState.ariaLabel);
  }

  function renderPlanningGradeVaultUnlockButton() {
    if (!els.tabGradesUnlock) return;
    const controlState = workspaceStatus.getVaultControlState();
    const locked = controlState.locked;
    els.tabGradesUnlock.innerHTML = locked ? GRADE_VAULT_LOCKED_ICON : GRADE_VAULT_UNLOCKED_ICON;
    els.tabGradesUnlock.title = controlState.canRequest
      ? controlState.actionLabel
      : controlState.label;
    els.tabGradesUnlock.setAttribute(
      'aria-label',
      controlState.canRequest ? controlState.actionLabel : controlState.label
    );
    els.tabGradesUnlock.hidden = false;
    els.tabGradesUnlock.style.display = 'inline-flex';
    els.tabGradesUnlock.classList.toggle('is-reserved', !controlState.shouldShow);
    els.tabGradesUnlock.disabled = !controlState.canRequest;
    els.tabGradesUnlock.setAttribute('aria-hidden', controlState.shouldShow ? 'false' : 'true');
    if (controlState.shouldShow) {
      els.tabGradesUnlock.removeAttribute('tabindex');
    } else {
      els.tabGradesUnlock.setAttribute('tabindex', '-1');
    }
  }

  function handleWorkspaceStatusChange(change = {}) {
    if (change.type === 'manual-save') {
      renderPlanningManualSaveButton();
      return;
    }
    if (change.type === 'vault') {
      if (!workspaceStatus.canShowNameLearning() && getActiveTab() === TAB_NAME_LEARNING) {
        tabController.setActiveTab(TAB_PLANNING, { skipAnimation: true });
        return;
      }
      tabController.render();
      renderPlanningGradeVaultUnlockButton();
      return;
    }
    if (change.type === 'planning-ready' || change.type === 'grades-ready') {
      if (change.initialReadyTransition) {
        tabController.render();
      } else {
        renderPlanningGradeVaultUnlockButton();
      }
    }
  }

  workspaceStatus = createWorkspaceStatusController({
    view: window,
    CustomEventClass: window.CustomEvent,
    planningTabTarget: TAB_PLANNING,
    gradesTabTarget: TAB_GRADES,
    planningTabTargets: [TAB_PLANNING, TAB_GRADES],
    gradeVaultStatusTabTargets: [
      TAB_PLANNING,
      TAB_GRADES,
      TAB_SEATPLAN,
      TAB_NAME_LEARNING,
      TAB_GROUPS,
      TAB_RANDOM_PICKER,
    ],
    getActiveTab,
    getTabTransitionState,
    getChromeCollapsed: () => chromeController?.isCollapsed() ?? Boolean(state.chromeCollapsed),
    getChromeTransitionState: () => chromeController?.getTransitionState() ?? 'idle',
    supportsExternalFileSync: shellSupportsExternalFileSync,
    isModuleWindow: () => els.app?.dataset.moduleWindow === 'true',
    onChange: handleWorkspaceStatusChange,
  });
  registerCleanup(() => workspaceStatus.dispose());

  if (els.tabGradesUnlock) {
    els.tabGradesUnlock.addEventListener('click', () => {
      const controlState = workspaceStatus.getVaultControlState();
      if (!controlState.canRequest) return;
      requestGradeVault({
        action: controlState.action,
        overlay: getActiveTab() !== TAB_GRADES,
        preserveSourceTab: getActiveTab() !== TAB_GRADES,
      });
    });
  }
  if (els.sidebarManualSaveBtn) {
    els.sidebarManualSaveBtn.addEventListener('click', () => {
      if (!workspaceStatus.getManualSaveControlState().canRequest) return;
      requestManualSave();
    });
  }

  chromeController = createChromeController({
    app: els.app,
    header: els.appHeader,
    tabNav: els.tabNav,
    sidebar: els.sidePanel,
    headerToggle: els.chromeToggle,
    overlayToggle: els.chromeOverlayToggle,
    documentRef: document,
    ElementClass: window.Element,
    additionalCollapseFocusContainers: [els.sidebarFooter],
    additionalCollapseFocusTargets: [els.firstRunTutorialStart],
    initialCollapsed: Boolean(state.chromeCollapsed),
    isIOSDevice,
    requestAnimationFrame: window.requestAnimationFrame?.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame?.bind(window),
    setTimeout: window.setTimeout?.bind(window),
    clearTimeout: window.clearTimeout?.bind(window),
    matchMedia: window.matchMedia?.bind(window),
    getComputedStyle: window.getComputedStyle?.bind(window),
    onResetSidebarWidth: () => sidebarResize.resetActiveWidth(),
    onCloseNavigationMenu: () => tabNavLayout?.closeMenu(),
    onQueueNavigationLayoutSync: () => tabNavLayout?.queueLayoutSync(),
    onQueueSettledIndicatorUpdate: () => tabNavLayout?.queueSettledIndicatorUpdate(),
    onTutorialEntryVisibilityChange: setTutorialEntryVisibility,
    onRefreshLayouts: refreshLayouts,
    onRenderManualSaveControl: renderPlanningManualSaveButton,
    onRenderVaultControl: renderPlanningGradeVaultUnlockButton,
  });
  registerCleanup(() => chromeController.dispose());

  tabNavLayout = createTabNavLayoutController({
    app: els.app,
    tabNav: els.tabNav,
    tabIndicator: els.tabIndicator,
    moreTools: els.moreTools,
    moreToolsTrigger: els.moreToolsTrigger,
    moreToolsMenu: els.moreToolsMenu,
    view: window,
    documentRef: document,
    ResizeObserverClass: window.ResizeObserver,
    HTMLElementClass: window.HTMLElement,
    ElementClass: window.Element,
    NodeClass: window.Node,
    protectedTabTargets: PROTECTED_TAB_TARGETS,
    getActiveTab,
    getTabTransitionState,
    getIndicatorSettleDelay: () => chromeController.getTransitionDuration(),
    onTabRequest: (tabTarget) => {
      const originalTabButton = Array.from(els.tabNav?.querySelectorAll('[data-tab-target]') || [])
        .find((button) => button.dataset.tabTarget === tabTarget);
      originalTabButton?.click();
    },
  });
  registerCleanup(() => tabNavLayout.dispose());

  tabController = createTabController({
    elements: {
      app: els.app,
      tabNav: els.tabNav,
      tabButtons: [
        [els.tabGroups, TAB_GROUPS],
        [els.tabMerger, TAB_MERGER],
        [els.tabPlanning, TAB_PLANNING],
        [els.tabGrades, TAB_GRADES],
        [els.tabSeatplan, TAB_SEATPLAN],
        [els.tabNameLearning, TAB_NAME_LEARNING],
        [els.tabRandomPicker, TAB_RANDOM_PICKER],
        [els.tabDuplicateCheck, TAB_DUPLICATE_CHECK],
        [els.tabWorkPhase, TAB_WORK_PHASE],
        [els.tabQr, TAB_QR],
      ],
      mergerShell: els.mergerShell,
      duplicateCheckShell: els.duplicateCheckShell,
      qrShell: els.qrShell,
      planningShell: els.planningShell,
      nameLearningShell: els.nameLearningShell,
      seatplanSideHost: els.seatplanSideHost,
      seatplanMainHost: els.seatplanMainHost,
      groupsMainHost: els.groupsMainHost,
      randomPickerHost: els.randomPickerHost,
      monitorShell: els.monitorShell,
      workOrderShell: els.workOrderShell,
      timerShell: els.timerShell,
      tabNameLearning: els.tabNameLearning,
      seatPreferencesLabel: els.seatPreferencesLabel,
      groupSeatPreferences: els.groupSeatPreferences,
      workOrderHintOverlay: els.workOrderHintOverlay,
    },
    initialActiveTab: state.activeTab,
    view: window,
    documentRef: document,
    HTMLElementClass: window.HTMLElement,
    requestAnimationFrame: window.requestAnimationFrame?.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame?.bind(window),
    setTimeout: window.setTimeout?.bind(window),
    clearTimeout: window.clearTimeout?.bind(window),
    matchMedia: window.matchMedia?.bind(window),
    getComputedStyle: window.getComputedStyle?.bind(window),
    workspaceStatus,
    sidebarResize,
    tabNavLayout,
    onActiveTabStateChange: (tab) => {
      state.activeTab = tab;
    },
    onEnsureTabInitialized: ensureTabInitialized,
    onDispatchPlanningViewRequest: dispatchPlanningViewRequest,
    onRenderRandomPicker: renderRandomPicker,
    onPositionWorkOrderHintOverlay: positionWorkOrderHintOverlay,
    onRefreshLayouts: refreshLayouts,
    onRequestGradeVault: requestGradeVault,
    onResolveGradesTabLeave: resolveGradesTabLeave,
    onResolvePlanningTabLeave: resolvePlanningTabLeave,
    onRenderVaultControl: renderPlanningGradeVaultUnlockButton,
    onRenderManualSaveControl: renderPlanningManualSaveButton,
    onActiveTabChange: notifyActiveTabChange,
    onTabActivating: notifyTabActivating,
  });
  registerCleanup(() => tabController.dispose());

  return {
    getActiveTab,
    getSidebarWidth: (scope) => sidebarResize.getWidth(scope),
    isChromeCollapsed: () => chromeController.isCollapsed(),
    getChromeTransitionState: () => chromeController.getTransitionState(),
    closeMoreToolsMenu: () => tabNavLayout.closeMenu(),
    isTabOverflowed: (tab) => tabNavLayout.isTabOverflowed(tab),
    renderTabs: () => tabController.render(),
    renderPlanningGradeVaultUnlockButton,
    renderPlanningManualSaveButton,
    setChromeCollapsed: (collapsed, options) => chromeController.setCollapsed(collapsed, options),
    setSidebarWidth: (scope, width) => sidebarResize.setWidth(scope, width),
    setActiveTab: (tab, options) => tabController.setActiveTab(tab, options),
    setActiveTabImmediate: (tab, options) => tabController.setActiveTabImmediate(tab, options),
    toggleChromeCollapsed: () => chromeController.toggle(),
    updateChromeToggleUI: (options) => chromeController.updateToggleUI(options),
    setChromeRegionVisibility: (hidden) => chromeController.setRegionVisibility(hidden),
    setChromeHeaderVisibility: (hidden) => chromeController.setHeaderVisibility(hidden),
    setChromeOverlayVisibility: (visible, interactive) => chromeController.setOverlayVisibility(visible, interactive),
    setPlanningManualSaveState: (detail) => workspaceStatus.setManualSaveState(detail),
    setPlanningGradeVaultState: (detail) => workspaceStatus.setVaultState(detail),
    setPlanningUnsavedState: (detail) => workspaceStatus.setUnsavedState(detail),
    markPlanningReady: (detail) => workspaceStatus.markPlanningReady(detail),
    markGradesReady: (detail) => workspaceStatus.markGradesReady(detail),
    syncChromeState: () => chromeController.sync(),
  };
}
