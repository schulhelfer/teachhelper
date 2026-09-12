import {
  normalizeTab,
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
} from '../../shell/tabs.js';

const TAB_REGION_SELECTOR = '.side, .main, .merger-shell, .duplicate-check-shell, .qr-shell, .planning-shell, .grades-shell, .name-learning-shell, .monitor-shell, .work-order-shell, .timer-shell';

function parseCssTimeToMs(value) {
  if (!value) return 0;
  const normalized = String(value).trim();
  if (!normalized) return 0;
  if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || 0;
  if (normalized.endsWith('s')) return (Number.parseFloat(normalized) || 0) * 1000;
  return Number.parseFloat(normalized) || 0;
}

export function createTabController({
  elements = {},
  initialActiveTab = TAB_PLANNING,
  view = null,
  documentRef = null,
  HTMLElementClass = view?.HTMLElement,
  requestAnimationFrame: requestFrame = view?.requestAnimationFrame?.bind(view),
  cancelAnimationFrame: cancelFrame = view?.cancelAnimationFrame?.bind(view),
  setTimeout: setTimer = view?.setTimeout?.bind(view),
  clearTimeout: clearTimer = view?.clearTimeout?.bind(view),
  matchMedia = view?.matchMedia?.bind(view),
  getComputedStyle = view?.getComputedStyle?.bind(view),
  workspaceStatus = null,
  sidebarResize = null,
  tabNavLayout = null,
  onActiveTabStateChange = () => {},
  onEnsureTabInitialized = () => {},
  onDispatchPlanningViewRequest = () => {},
  onRenderRandomPicker = () => {},
  onPositionWorkOrderHintOverlay = () => {},
  onRefreshLayouts = () => {},
  onRequestGradeVault = () => {},
  onResolveGradesTabLeave = () => Promise.resolve(false),
  onResolvePlanningTabLeave = () => Promise.resolve(false),
  onRenderVaultControl = () => {},
  onRenderManualSaveControl = () => {},
  onActiveTabChange = () => {},
  onTabActivating = () => {},
} = {}) {
  const {
    app = null,
    tabNav = null,
    tabButtons = [],
    mergerShell = null,
    duplicateCheckShell = null,
    qrShell = null,
    planningShell = null,
    nameLearningShell = null,
    seatplanSideHost = null,
    seatplanMainHost = null,
    groupsMainHost = null,
    randomPickerHost = null,
    monitorShell = null,
    workOrderShell = null,
    timerShell = null,
    tabNameLearning = null,
    seatPreferencesLabel = null,
    groupSeatPreferences = null,
    workOrderHintOverlay = null,
  } = elements;
  let disposed = false;
  let activeTab = initialActiveTab;
  let transitionState = 'idle';
  let transitionTimer = null;
  let pendingTransitionTarget = null;
  let pendingTransitionOptions = null;
  let leaveConfirmationPromise = null;
  let lastRenderedActiveTab = null;
  const scheduledFrames = new Set();
  const scheduledTimers = new Set();

  function scheduleFrame(callback) {
    if (disposed) return null;
    if (typeof requestFrame !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledFrames.add(scheduled);
    scheduled.id = requestFrame(() => {
      scheduledFrames.delete(scheduled);
      if (!disposed) callback();
    });
    return scheduled;
  }

  function scheduleTimer(callback, delay) {
    if (disposed) return null;
    if (typeof setTimer !== 'function') {
      callback();
      return null;
    }
    const scheduled = { id: 0 };
    scheduledTimers.add(scheduled);
    scheduled.id = setTimer(() => {
      scheduledTimers.delete(scheduled);
      if (!disposed) callback();
    }, delay);
    return scheduled;
  }

  function cancelTimer(scheduled) {
    if (!scheduled) return;
    scheduledTimers.delete(scheduled);
    if (typeof clearTimer === 'function') clearTimer(scheduled.id);
  }

  function clearTransitionTimer() {
    if (!transitionTimer) return;
    cancelTimer(transitionTimer);
    transitionTimer = null;
  }

  function getActiveTab() {
    return activeTab;
  }

  function getTransitionState() {
    return transitionState;
  }

  function commitActiveTab(nextTab) {
    activeTab = nextTab;
    onActiveTabStateChange(activeTab);
  }

  function updateSeatPreferencesTrigger() {
    const isPicker = activeTab === TAB_RANDOM_PICKER;
    if (seatPreferencesLabel) {
      seatPreferencesLabel.textContent = isPicker
        ? 'Gib Bedingungen an (optional)'
        : 'Gib Bedingungen an (optional)';
    }
    if (groupSeatPreferences) {
      groupSeatPreferences.textContent = isPicker
        ? 'Bedingungen eingeben'
        : 'Bedingungen eingeben';
    }
  }

  function render() {
    if (disposed || !app) return;
    const planningStatus = workspaceStatus?.getPlanningState?.() || {};
    const gradesStatus = workspaceStatus?.getGradesState?.() || {};
    const vaultStatus = workspaceStatus?.getVaultState?.() || {};
    const enteredPlanningTab = activeTab === TAB_PLANNING
      && lastRenderedActiveTab !== TAB_PLANNING;
    lastRenderedActiveTab = activeTab;
    sidebarResize?.applyActiveWidth?.();
    updateSeatPreferencesTrigger();
    app.classList.toggle('app-tab-merger', activeTab === TAB_MERGER);
    app.classList.toggle('app-tab-duplicate-check', activeTab === TAB_DUPLICATE_CHECK);
    app.classList.toggle('app-tab-qr', activeTab === TAB_QR);
    app.classList.toggle('app-tab-planning', activeTab === TAB_PLANNING);
    app.classList.toggle('app-tab-grades', activeTab === TAB_GRADES);
    app.classList.toggle(
      'planning-initial-paint-pending',
      planningStatus.initialPaintPending && activeTab === TAB_PLANNING
    );
    app.classList.toggle(
      'grades-initial-paint-pending',
      gradesStatus.initialPaintPending && activeTab === TAB_GRADES
    );
    app.classList.toggle('app-tab-seatplan', activeTab === TAB_SEATPLAN);
    app.classList.toggle('app-tab-name-learning', activeTab === TAB_NAME_LEARNING);
    app.classList.toggle('app-tab-work-phase', activeTab === TAB_WORK_PHASE);
    app.classList.toggle('app-tab-groups', activeTab === TAB_GROUPS);
    app.classList.toggle('app-tab-random-picker', activeTab === TAB_RANDOM_PICKER);
    app.classList.toggle('app-seatplan-full', activeTab === TAB_SEATPLAN);
    if (mergerShell) mergerShell.hidden = activeTab !== TAB_MERGER;
    if (duplicateCheckShell) duplicateCheckShell.hidden = activeTab !== TAB_DUPLICATE_CHECK;
    if (qrShell) qrShell.hidden = activeTab !== TAB_QR;
    if (planningShell) planningShell.hidden = activeTab !== TAB_PLANNING;
    if (nameLearningShell) nameLearningShell.hidden = activeTab !== TAB_NAME_LEARNING;
    if (seatplanSideHost) seatplanSideHost.hidden = true;
    if (seatplanMainHost) seatplanMainHost.hidden = activeTab !== TAB_SEATPLAN;
    if (groupsMainHost) {
      const isPlanningBoot = activeTab === TAB_PLANNING && !app.classList.contains('app-js-ready');
      groupsMainHost.hidden = isPlanningBoot || activeTab === TAB_SEATPLAN || activeTab === TAB_RANDOM_PICKER;
    }
    if (randomPickerHost) randomPickerHost.hidden = activeTab !== TAB_RANDOM_PICKER;
    if (monitorShell) monitorShell.hidden = activeTab !== TAB_WORK_PHASE;
    if (workOrderShell) workOrderShell.hidden = activeTab !== TAB_WORK_PHASE;
    if (timerShell) timerShell.hidden = activeTab !== TAB_WORK_PHASE;
    tabButtons.forEach(([button, tabKey]) => {
      if (!button) return;
      const selected = activeTab === tabKey;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (tabNameLearning) {
      tabNameLearning.hidden = !workspaceStatus?.canShowNameLearning?.();
    }
    const nameLearningDueCount = Number(vaultStatus.nameLearningDueCount);
    tabNav?.querySelectorAll?.('[data-name-learning-due-count]').forEach((element) => {
      const hasDueCards = Number.isInteger(nameLearningDueCount) && nameLearningDueCount > 0;
      element.hidden = !hasDueCards;
      element.textContent = hasDueCards ? ` (${nameLearningDueCount})` : '';
    });
    tabNavLayout?.syncAfterTabRender?.();
    if (activeTab === TAB_RANDOM_PICKER) onRenderRandomPicker();
    if (activeTab === TAB_WORK_PHASE && workOrderHintOverlay?.classList.contains('visible')) {
      scheduleTimer(onPositionWorkOrderHintOverlay, 0);
    }
    if (enteredPlanningTab) {
      onDispatchPlanningViewRequest({
        view: 'week',
        source: 'shell-tab-entry',
      });
    }
    onRenderVaultControl();
    onRenderManualSaveControl();
  }

  function getTabSwitchDuration() {
    if (typeof matchMedia !== 'function') return 100;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 1;
    const styleHost = app || documentRef?.documentElement;
    const computed = typeof getComputedStyle === 'function' && styleHost
      ? getComputedStyle(styleHost)
      : null;
    return parseCssTimeToMs(computed?.getPropertyValue?.('--tab-switch-duration')) || 100;
  }

  function isHTMLElement(value) {
    return typeof HTMLElementClass !== 'function' || value instanceof HTMLElementClass;
  }

  function collectRenderedTabRegions() {
    if (!app) return [];
    return Array.from(app.children).filter((child) => {
      if (!isHTMLElement(child) || !child.matches(TAB_REGION_SELECTOR) || child.hidden) return false;
      return typeof getComputedStyle !== 'function' || getComputedStyle(child).display !== 'none';
    });
  }

  function collectAllTabRegions() {
    if (!app) return [];
    return Array.from(app.children).filter((child) => (
      isHTMLElement(child) && child.matches(TAB_REGION_SELECTOR)
    ));
  }

  function clearTabTransitionClasses(regions = []) {
    regions.forEach((region) => {
      region.classList.remove('tab-switch-enter', 'tab-switch-leave');
    });
  }

  function finishTabTransition(options = {}) {
    if (disposed) return;
    clearTransitionTimer();
    transitionState = 'idle';
    app?.classList.remove('is-tab-switching');
    clearTabTransitionClasses(collectAllTabRegions());
    if (pendingTransitionTarget && pendingTransitionTarget !== activeTab) {
      const nextTarget = pendingTransitionTarget;
      const nextOptions = pendingTransitionOptions || {};
      pendingTransitionTarget = null;
      pendingTransitionOptions = null;
      setActiveTab(nextTarget, nextOptions);
      return;
    }
    pendingTransitionTarget = null;
    pendingTransitionOptions = null;
    onRenderVaultControl();
    if (options.showTutorialHint) onActiveTabChange(activeTab);
  }

  function resolveLeaveGuard(leaveGuard, nextTab, options) {
    if (leaveConfirmationPromise) return true;
    const resolver = leaveGuard === 'grades'
      ? onResolveGradesTabLeave
      : onResolvePlanningTabLeave;
    const confirmation = Promise.resolve(resolver())
      .then((confirmed) => {
        if (!disposed && confirmed) {
          setActiveTab(nextTab, {
            skipUnsavedPrompt: true,
            showTutorialHint: Boolean(options.showTutorialHint),
          });
        }
      }, () => {})
      .finally(() => {
        if (leaveConfirmationPromise === confirmation) leaveConfirmationPromise = null;
      });
    leaveConfirmationPromise = confirmation;
    return true;
  }

  function setActiveTab(tab, options = {}) {
    if (disposed) return;
    const nextTab = normalizeTab(tab);
    const leaveGuard = workspaceStatus?.getLeaveGuard?.(nextTab, options) || null;
    if (leaveGuard === 'grades' || leaveGuard === 'planning') {
      resolveLeaveGuard(leaveGuard, nextTab, options);
      return;
    }
    if (workspaceStatus?.shouldPromptVaultUnlock?.(nextTab)) {
      onRequestGradeVault({ action: 'unlock', overlay: true });
    }
    if (nextTab !== activeTab) onTabActivating(nextTab, activeTab);
    if (options.skipAnimation) {
      pendingTransitionTarget = null;
      pendingTransitionOptions = null;
      commitActiveTab(nextTab);
      onEnsureTabInitialized(activeTab);
      render();
      onRefreshLayouts();
      finishTabTransition({ showTutorialHint: Boolean(options.showTutorialHint) });
      return;
    }
    if (transitionState !== 'idle') {
      pendingTransitionTarget = nextTab;
      pendingTransitionOptions = { showTutorialHint: Boolean(options.showTutorialHint) };
      return;
    }
    if (nextTab === activeTab) {
      onEnsureTabInitialized(activeTab);
      render();
      onRefreshLayouts();
      return;
    }
    const transitionDuration = getTabSwitchDuration();
    const currentRegions = collectRenderedTabRegions();
    if (!currentRegions.length || transitionDuration <= 1) {
      commitActiveTab(nextTab);
      onEnsureTabInitialized(activeTab);
      render();
      onRefreshLayouts();
      finishTabTransition({ showTutorialHint: Boolean(options.showTutorialHint) });
      return;
    }
    transitionState = 'leaving';
    pendingTransitionTarget = null;
    pendingTransitionOptions = null;
    app?.classList.add('is-tab-switching');
    clearTabTransitionClasses(currentRegions);
    currentRegions.forEach((region) => {
      region.hidden = false;
      region.classList.add('tab-switch-leave');
    });
    transitionTimer = scheduleTimer(() => {
      transitionTimer = null;
      clearTabTransitionClasses(currentRegions);
      commitActiveTab(nextTab);
      onEnsureTabInitialized(activeTab);
      render();
      onRefreshLayouts();
      const nextRegions = collectRenderedTabRegions();
      transitionState = 'entering';
      nextRegions.forEach((region) => {
        region.hidden = false;
        region.classList.add('tab-switch-enter');
      });
      if (typeof requestFrame === 'function') {
        scheduleFrame(() => {
          scheduleFrame(() => clearTabTransitionClasses(nextRegions));
        });
      } else {
        scheduleTimer(() => clearTabTransitionClasses(nextRegions), 0);
      }
      transitionTimer = scheduleTimer(() => {
        transitionTimer = null;
        finishTabTransition({ showTutorialHint: Boolean(options.showTutorialHint) });
      }, transitionDuration);
    }, transitionDuration);
  }

  function setActiveTabImmediate(tab, options = {}) {
    if (disposed) return;
    const nextTab = normalizeTab(tab);
    if (nextTab !== activeTab) onTabActivating(nextTab, activeTab);
    commitActiveTab(nextTab);
    onEnsureTabInitialized(activeTab);
    render();
    if (options.showTutorialHint) onActiveTabChange(activeTab);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTransitionTimer();
    scheduledFrames.forEach(({ id }) => {
      if (typeof cancelFrame === 'function') cancelFrame(id);
    });
    scheduledFrames.clear();
    scheduledTimers.forEach(({ id }) => {
      if (typeof clearTimer === 'function') clearTimer(id);
    });
    scheduledTimers.clear();
    pendingTransitionTarget = null;
    pendingTransitionOptions = null;
    leaveConfirmationPromise = null;
    transitionState = 'idle';
    app?.classList.remove('is-tab-switching');
    clearTabTransitionClasses(collectAllTabRegions());
  }

  return {
    getActiveTab,
    getTransitionState,
    render,
    setActiveTab,
    setActiveTabImmediate,
    dispose,
  };
}
