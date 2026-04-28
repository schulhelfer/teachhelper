import {
  PLANNING_GRADE_VAULT_REQUEST_EVENT,
  PLANNING_GRADE_VAULT_STATE_EVENT,
  normalizeTab,
  PLANNING_MANUAL_SAVE_REQUEST_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  TAB_GRADES,
  TAB_GROUPS,
  TAB_DUPLICATE_CHECK,
  TAB_MERGER,
  TAB_PLANNING,
  TAB_RANDOM_PICKER,
  TAB_SEATPLAN,
  TAB_WORK_PHASE,
} from '../shell/tabs.js';

const CHROME_TOGGLE_EXPAND_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 6H6V2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 2L6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 10H10V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 14L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

const CHROME_TOGGLE_COLLAPSE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 2H2V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 2L6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 14H14V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 14L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

function parseCssTimeToMs(value) {
  if (!value) return 0;
  const normalized = String(value).trim();
  if (!normalized) return 0;
  if (normalized.endsWith('ms')) {
    return Number.parseFloat(normalized) || 0;
  }
  if (normalized.endsWith('s')) {
    return (Number.parseFloat(normalized) || 0) * 1000;
  }
  return Number.parseFloat(normalized) || 0;
}

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

  function updateSeatPreferencesTrigger() {
    const isPicker = state.activeTab === TAB_RANDOM_PICKER;
    if (els.seatPreferencesLabel) {
      els.seatPreferencesLabel.textContent = isPicker
        ? 'Gib Bedingungen an (optional)'
        : 'Gib Bedingungen an (optional)';
    }
    if (els.groupSeatPreferences) {
      els.groupSeatPreferences.textContent = isPicker
        ? 'Bedingungen eingeben'
        : 'Bedingungen eingeben';
    }
  }

  function renderTabs() {
    if (!els.app) return;
    updateSeatPreferencesTrigger();
    els.app.classList.toggle('app-tab-merger', state.activeTab === TAB_MERGER);
    els.app.classList.toggle('app-tab-duplicate-check', state.activeTab === TAB_DUPLICATE_CHECK);
    els.app.classList.toggle('app-tab-planning', state.activeTab === TAB_PLANNING);
    els.app.classList.toggle('app-tab-grades', state.activeTab === TAB_GRADES);
    els.app.classList.toggle(
      'planning-initial-paint-pending',
      state.planningInitialPaintPending && (state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES)
    );
    els.app.classList.toggle('app-tab-seatplan', state.activeTab === TAB_SEATPLAN);
    els.app.classList.toggle('app-tab-work-phase', state.activeTab === TAB_WORK_PHASE);
    els.app.classList.toggle('app-tab-groups', state.activeTab === TAB_GROUPS);
    els.app.classList.toggle('app-tab-random-picker', state.activeTab === TAB_RANDOM_PICKER);
    els.app.classList.toggle('app-seatplan-full', state.activeTab === TAB_SEATPLAN);
    if (els.mergerShell) {
      els.mergerShell.hidden = state.activeTab !== TAB_MERGER;
    }
    if (els.duplicateCheckShell) {
      els.duplicateCheckShell.hidden = state.activeTab !== TAB_DUPLICATE_CHECK;
    }
    if (els.planningShell) {
      els.planningShell.hidden = state.activeTab !== TAB_PLANNING && state.activeTab !== TAB_GRADES;
    }
    if (els.seatplanSideHost) {
      els.seatplanSideHost.hidden = true;
    }
    if (els.seatplanMainHost) {
      els.seatplanMainHost.hidden = state.activeTab !== TAB_SEATPLAN;
    }
    if (els.groupsMainHost) {
      els.groupsMainHost.hidden = state.activeTab === TAB_SEATPLAN || state.activeTab === TAB_RANDOM_PICKER;
    }
    if (els.randomPickerHost) {
      els.randomPickerHost.hidden = state.activeTab !== TAB_RANDOM_PICKER;
    }
    if (els.monitorShell) {
      els.monitorShell.hidden = state.activeTab !== TAB_WORK_PHASE;
    }
    if (els.workOrderShell) {
      els.workOrderShell.hidden = state.activeTab !== TAB_WORK_PHASE;
    }
    if (els.timerShell) {
      els.timerShell.hidden = state.activeTab !== TAB_WORK_PHASE;
    }
    [
      [els.tabGroups, TAB_GROUPS],
      [els.tabMerger, TAB_MERGER],
      [els.tabPlanning, TAB_PLANNING],
      [els.tabGrades, TAB_GRADES],
      [els.tabSeatplan, TAB_SEATPLAN],
      [els.tabRandomPicker, TAB_RANDOM_PICKER],
      [els.tabDuplicateCheck, TAB_DUPLICATE_CHECK],
      [els.tabWorkPhase, TAB_WORK_PHASE],
    ].forEach(([button, tabKey]) => {
      if (!button) return;
      const selected = state.activeTab === tabKey;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (state.activeTab === TAB_RANDOM_PICKER) {
      renderRandomPicker();
    }
    if (state.activeTab === TAB_WORK_PHASE && els.workOrderHintOverlay?.classList.contains('visible')) {
      setTimeout(positionWorkOrderHintOverlay, 0);
    }
    if (state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES) {
      dispatchPlanningViewRequest(state.activeTab === TAB_GRADES ? 'grades' : 'week');
    }
    renderPlanningGradeVaultUnlockButton();
    renderPlanningManualSaveButton();
  }

  function clearTabTransitionTimer() {
    if (!state.tabTransitionTimer || typeof window === 'undefined') return;
    window.clearTimeout(state.tabTransitionTimer);
    state.tabTransitionTimer = 0;
  }

  function getTabSwitchDuration() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return isIOSDevice ? 180 : 400;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 1;
    }
    const styleHost = els.app || document.documentElement;
    const computed = window.getComputedStyle(styleHost);
    const durations = [
      computed.getPropertyValue('--chrome-transition-duration-medium'),
      computed.getPropertyValue('--chrome-transition-duration-short'),
      computed.getPropertyValue('--chrome-transition-duration'),
    ].map(parseCssTimeToMs).filter((duration) => duration > 0);
    const resolved = Math.min(420, Math.max(...(durations.length ? durations : [360]))) + 30;
    return isIOSDevice ? Math.min(180, resolved) : resolved;
  }

  function collectRenderedTabRegions() {
    if (!els.app) return [];
    return Array.from(els.app.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;
      if (!child.matches('.side, .main, .merger-shell, .duplicate-check-shell, .planning-shell, .monitor-shell, .work-order-shell, .timer-shell')) {
        return false;
      }
      if (child.hidden) return false;
      return window.getComputedStyle(child).display !== 'none';
    });
  }

  function collectAllTabRegions() {
    if (!els.app) return [];
    return Array.from(els.app.children).filter((child) => (
      child instanceof HTMLElement
      && child.matches('.side, .main, .merger-shell, .duplicate-check-shell, .planning-shell, .monitor-shell, .work-order-shell, .timer-shell')
    ));
  }

  function clearTabTransitionClasses(regions = []) {
    regions.forEach((region) => {
      region.classList.remove('tab-switch-enter', 'tab-switch-leave');
    });
  }

  function finishTabTransition() {
    clearTabTransitionTimer();
    state.tabTransitionState = 'idle';
    if (els.app) {
      els.app.classList.remove('is-tab-switching');
    }
    clearTabTransitionClasses(collectAllTabRegions());
    if (state.pendingTabTransitionTarget && state.pendingTabTransitionTarget !== state.activeTab) {
      const nextTarget = state.pendingTabTransitionTarget;
      state.pendingTabTransitionTarget = null;
      setActiveTab(nextTarget);
      return;
    }
    state.pendingTabTransitionTarget = null;
  }

  function clearChromeTransitionTimer() {
    if (!state.chromeTransitionTimer || typeof window === 'undefined') return;
    window.clearTimeout(state.chromeTransitionTimer);
    state.chromeTransitionTimer = 0;
  }

  function getChromeTransitionDuration() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return isIOSDevice ? 220 : 460;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 1;
    }
    const styleHost = els.app || document.documentElement;
    const computed = window.getComputedStyle(styleHost);
    const durations = [
      computed.getPropertyValue('--chrome-transition-duration'),
      computed.getPropertyValue('--chrome-transition-duration-medium'),
      computed.getPropertyValue('--chrome-transition-duration-short'),
    ].map(parseCssTimeToMs).filter((duration) => duration > 0);
    const resolved = (durations.length ? Math.max(...durations) : 420) + 40;
    return isIOSDevice ? Math.min(220, resolved) : resolved;
  }

  function setChromeRegionVisibility(hidden) {
    const regions = [els.tabNav, els.sidePanel];
    regions.forEach((region) => {
      if (!region) return;
      region.hidden = Boolean(hidden);
      if (hidden) {
        region.setAttribute('aria-hidden', 'true');
      } else {
        region.removeAttribute('aria-hidden');
      }
      if ('inert' in region) {
        region.inert = Boolean(hidden);
      }
    });
  }

  function setChromeHeaderVisibility(hidden) {
    if (!els.appHeader) return;
    els.appHeader.hidden = Boolean(hidden);
    if (hidden) {
      els.appHeader.setAttribute('aria-hidden', 'true');
      if ('inert' in els.appHeader) {
        els.appHeader.inert = true;
      }
      return;
    }
    els.appHeader.removeAttribute('aria-hidden');
    if ('inert' in els.appHeader) {
      els.appHeader.inert = false;
    }
  }

  function setChromeOverlayVisibility(visible, interactive = visible) {
    if (!els.chromeOverlayToggle) return;
    els.chromeOverlayToggle.hidden = !visible;
    els.chromeOverlayToggle.disabled = !interactive;
    if (visible) {
      els.chromeOverlayToggle.removeAttribute('aria-hidden');
      return;
    }
    els.chromeOverlayToggle.setAttribute('aria-hidden', 'true');
  }

  function focusChromeControl(target) {
    if (!target || target.hidden || target.disabled) return false;
    try {
      target.focus({ preventScroll: true });
    } catch (_error) {
      try {
        target.focus();
      } catch (_focusError) {
        return false;
      }
    }
    return document.activeElement === target;
  }

  function moveFocusOutOfChromeBeforeHide() {
    const active = document.activeElement;
    if (!(active instanceof Element)) return;
    const hiddenContainers = [els.appHeader, els.tabNav, els.sidePanel].filter(Boolean);
    const shouldMoveFocus = hiddenContainers.some((container) => container.contains(active));
    if (!shouldMoveFocus) return;
    if (focusChromeControl(els.chromeOverlayToggle)) return;
    active.blur?.();
  }

  function moveFocusOutOfChromeOverlayBeforeHide() {
    const active = document.activeElement;
    if (!(active instanceof Element)) return;
    if (!els.chromeOverlayToggle?.contains(active) && active !== els.chromeOverlayToggle) return;
    if (focusChromeControl(els.chromeToggle)) return;
    active.blur?.();
  }

  function applyChromeVisibility(collapsed) {
    if (collapsed) {
      setChromeOverlayVisibility(true, true);
      moveFocusOutOfChromeBeforeHide();
      setChromeRegionVisibility(true);
      setChromeHeaderVisibility(true);
      return;
    }
    setChromeRegionVisibility(false);
    setChromeHeaderVisibility(false);
    moveFocusOutOfChromeOverlayBeforeHide();
    setChromeOverlayVisibility(false, false);
  }

  function finalizeChromeTransition(collapsed) {
    clearChromeTransitionTimer();
    state.chromeTransitionState = 'idle';
    if (els.app) {
      els.app.classList.remove('is-collapsing', 'is-expanding');
      els.app.classList.toggle('chrome-collapsed', collapsed);
    }
    applyChromeVisibility(collapsed);
    renderPlanningManualSaveButton();
    refreshLayouts();
  }

  function queueChromeTransition(callback) {
    if (typeof requestAnimationFrame === 'function') {
      if (isIOSDevice) {
        requestAnimationFrame(callback);
        return;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(callback);
      });
      return;
    }
    setTimeout(callback, 0);
  }

  function updateChromeToggleUI() {
    const label = state.chromeCollapsed
      ? 'Randleiste anzeigen'
      : 'Hauptansicht im Vollbild';
    [els.chromeToggle, els.chromeOverlayToggle].forEach((button) => {
      if (!button) return;
      button.setAttribute('aria-pressed', state.chromeCollapsed ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.innerHTML = state.chromeCollapsed
        ? CHROME_TOGGLE_EXPAND_ICON
        : CHROME_TOGGLE_COLLAPSE_ICON;
    });
  }

  function renderPlanningManualSaveButton() {
    if (!els.sidebarManualSaveBtn) return;
    const shouldShow = (state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES)
      && state.planningManualSaveState.isManualMode
      && !shellSupportsExternalFileSync;
    const hidden = !shouldShow;
    if (els.app) {
      els.app.classList.toggle('app-planning-manual-save-active', shouldShow);
      els.app.classList.toggle(
        'app-planning-manual-save-visible',
        shouldShow && !state.chromeCollapsed && state.chromeTransitionState === 'idle'
      );
    }
    els.sidebarManualSaveBtn.hidden = hidden;
    els.sidebarManualSaveBtn.disabled = hidden || state.chromeTransitionState !== 'idle';
    els.sidebarManualSaveBtn.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    els.sidebarManualSaveBtn.classList.toggle('attention-pulse', shouldShow && state.planningManualSaveState.dirty);
    els.sidebarManualSaveBtn.classList.toggle(
      'manual-header-save-btn-collapsed',
      shouldShow && state.chromeCollapsed && state.chromeTransitionState === 'idle'
    );
    const title = state.planningManualSaveState.title || 'Datenbank speichern/neu anlegen';
    const ariaLabel = state.planningManualSaveState.ariaLabel || title;
    els.sidebarManualSaveBtn.title = title;
    els.sidebarManualSaveBtn.setAttribute('aria-label', ariaLabel);
  }

  function renderPlanningGradeVaultUnlockButton() {
    if (!els.tabGradesUnlock) return;
    const planningGradeVaultState = state.planningGradeVaultState || {};
    const mode = typeof planningGradeVaultState.mode === 'string' ? planningGradeVaultState.mode : 'setup';
    const configured = Boolean(planningGradeVaultState.configured);
    const unlocked = Boolean(planningGradeVaultState.unlocked);
    const setupRequired = Boolean(planningGradeVaultState.setupRequired);
    const shouldShow = (state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES)
      && Boolean(planningGradeVaultState.ready)
      && Boolean(planningGradeVaultState.dbConnected)
      && configured
      && !unlocked
      && !setupRequired
      && mode === 'unlock';
    els.tabGradesUnlock.hidden = !shouldShow;
    els.tabGradesUnlock.style.display = shouldShow ? 'inline-flex' : 'none';
    els.tabGradesUnlock.disabled = !shouldShow
      || state.tabTransitionState !== 'idle'
      || state.chromeTransitionState !== 'idle';
    els.tabGradesUnlock.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  function setChromeCollapsed(collapsed) {
    const nextCollapsed = Boolean(collapsed);
    if (state.chromeTransitionState !== 'idle') {
      return;
    }
    if (
      state.chromeCollapsed === nextCollapsed
      && !els.app?.classList.contains('is-collapsing')
      && !els.app?.classList.contains('is-expanding')
    ) {
      applyChromeVisibility(nextCollapsed);
      updateChromeToggleUI();
      renderPlanningManualSaveButton();
      refreshLayouts();
      return;
    }
    state.chromeCollapsed = nextCollapsed;
    updateChromeToggleUI();
    if (!els.app) {
      applyChromeVisibility(nextCollapsed);
      renderPlanningManualSaveButton();
      refreshLayouts();
      return;
    }
    clearChromeTransitionTimer();
    setChromeRegionVisibility(false);
    setChromeHeaderVisibility(false);
    setChromeOverlayVisibility(true, nextCollapsed);
    renderPlanningManualSaveButton();
    if (nextCollapsed) {
      state.chromeTransitionState = 'collapsing';
      els.app.classList.remove('chrome-collapsed', 'is-expanding');
      queueChromeTransition(() => {
        if (state.chromeTransitionState !== 'collapsing' || !els.app) return;
        els.app.classList.add('is-collapsing');
        refreshLayouts();
        state.chromeTransitionTimer = window.setTimeout(
          () => finalizeChromeTransition(true),
          getChromeTransitionDuration()
        );
      });
      return;
    }
    state.chromeTransitionState = 'expanding';
    els.app.classList.remove('is-collapsing');
    els.app.classList.add('chrome-collapsed');
    queueChromeTransition(() => {
      if (state.chromeTransitionState !== 'expanding' || !els.app) return;
      els.app.classList.add('is-expanding');
      refreshLayouts();
      state.chromeTransitionTimer = window.setTimeout(
        () => finalizeChromeTransition(false),
        getChromeTransitionDuration()
      );
    });
  }

  function toggleChromeCollapsed() {
    if (state.chromeTransitionState !== 'idle') return;
    setChromeCollapsed(!state.chromeCollapsed);
  }

  function setActiveTab(tab) {
    const nextTab = normalizeTab(tab);
    const planningTabActive = state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES;
    const planningTabNext = nextTab === TAB_PLANNING || nextTab === TAB_GRADES;
    const skipAnimatedTabSwitch = nextTab === TAB_GROUPS
      || state.activeTab === TAB_GROUPS
      || (planningTabActive && planningTabNext);
    if (state.tabTransitionState !== 'idle') {
      state.pendingTabTransitionTarget = nextTab;
      return;
    }
    if (nextTab === state.activeTab) {
      ensureTabInitialized(state.activeTab);
      renderTabs();
      refreshLayouts();
      return;
    }
    const transitionDuration = getTabSwitchDuration();
    const currentRegions = collectRenderedTabRegions();
    if (skipAnimatedTabSwitch || !currentRegions.length || transitionDuration <= 1) {
      state.activeTab = nextTab;
      ensureTabInitialized(state.activeTab);
      renderTabs();
      refreshLayouts();
      finishTabTransition();
      return;
    }
    state.tabTransitionState = 'leaving';
    state.pendingTabTransitionTarget = null;
    if (els.app) {
      els.app.classList.add('is-tab-switching');
    }
    clearTabTransitionClasses(currentRegions);
    currentRegions.forEach((region) => {
      region.hidden = false;
      region.classList.add('tab-switch-leave');
    });
    state.tabTransitionTimer = window.setTimeout(() => {
      clearTabTransitionClasses(currentRegions);
      state.activeTab = nextTab;
      ensureTabInitialized(state.activeTab);
      renderTabs();
      refreshLayouts();
      const nextRegions = collectRenderedTabRegions();
      state.tabTransitionState = 'entering';
      nextRegions.forEach((region) => {
        region.hidden = false;
        region.classList.add('tab-switch-enter');
      });
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            clearTabTransitionClasses(nextRegions);
          });
        });
      } else {
        setTimeout(() => clearTabTransitionClasses(nextRegions), 0);
      }
      state.tabTransitionTimer = window.setTimeout(() => {
        finishTabTransition();
      }, transitionDuration);
    }, transitionDuration);
  }

  function setActiveTabImmediate(tab) {
    state.activeTab = normalizeTab(tab);
    ensureTabInitialized(state.activeTab);
    renderTabs();
  }

  function setPlanningManualSaveState(detail = null) {
    const title = detail && typeof detail.title === 'string' && detail.title.trim()
      ? detail.title.trim()
      : 'Datenbank speichern/neu anlegen';
    const ariaLabel = detail && typeof detail.ariaLabel === 'string' && detail.ariaLabel.trim()
      ? detail.ariaLabel.trim()
      : title;
    state.planningManualSaveState = {
      isManualMode: Boolean(detail && detail.isManualMode),
      dirty: Boolean(detail && detail.dirty),
      title,
      ariaLabel,
    };
    renderPlanningManualSaveButton();
  }

  function setPlanningGradeVaultState(detail = null) {
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const mode = typeof nextDetail.mode === 'string' ? nextDetail.mode : '';
    state.planningGradeVaultState = {
      ...state.planningGradeVaultState,
      mode: mode === 'unlock' || mode === 'ready' || mode === 'setup' ? mode : 'setup',
      dbConnected: Boolean(nextDetail.dbConnected),
      configured: Boolean(nextDetail.configured),
      unlocked: Boolean(nextDetail.unlocked),
      setupRequired: Boolean(nextDetail.setupRequired),
    };
    renderPlanningGradeVaultUnlockButton();
  }

  function markPlanningReady(detail = null) {
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const mode = typeof nextDetail.gradeVaultMode === 'string' ? nextDetail.gradeVaultMode : '';
    state.planningGradeVaultState = {
      ...state.planningGradeVaultState,
      ready: true,
      mode: mode === 'unlock' || mode === 'ready' || mode === 'setup'
        ? mode
        : 'setup',
      dbConnected: Boolean(nextDetail.gradeVaultDbConnected ?? state.planningGradeVaultState?.dbConnected),
      configured: Boolean(nextDetail.gradeVaultUnlockConfigured ?? state.planningGradeVaultState?.configured),
      unlocked: Boolean(nextDetail.gradeVaultUnlocked ?? state.planningGradeVaultState?.unlocked),
      setupRequired: Boolean(nextDetail.gradeVaultSetupRequired ?? state.planningGradeVaultState?.setupRequired),
    };
    if (!state.planningInitialPaintPending) {
      renderPlanningGradeVaultUnlockButton();
      return;
    }
    state.planningInitialPaintPending = false;
    renderTabs();
  }

  function syncChromeState() {
    updateChromeToggleUI();
    setChromeRegionVisibility(state.chromeCollapsed);
    setChromeHeaderVisibility(state.chromeCollapsed);
    setChromeOverlayVisibility(state.chromeCollapsed, state.chromeCollapsed);
    renderPlanningGradeVaultUnlockButton();
    renderPlanningManualSaveButton();
  }

  window.addEventListener(PLANNING_MANUAL_SAVE_STATE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    setPlanningManualSaveState(detail);
  });
  window.addEventListener(PLANNING_GRADE_VAULT_STATE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    setPlanningGradeVaultState(detail);
  });
  window.addEventListener(PLANNING_READY_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    markPlanningReady(detail);
  });
  if (els.tabGradesUnlock) {
    els.tabGradesUnlock.addEventListener('click', () => {
      const planningGradeVaultState = state.planningGradeVaultState || {};
      const mode = typeof planningGradeVaultState.mode === 'string' ? planningGradeVaultState.mode : 'setup';
      const shouldAllowRequest = (state.activeTab === TAB_PLANNING || state.activeTab === TAB_GRADES)
        && Boolean(planningGradeVaultState.ready)
        && Boolean(planningGradeVaultState.dbConnected)
        && mode === 'unlock'
        && state.tabTransitionState === 'idle'
        && state.chromeTransitionState === 'idle';
      if (!shouldAllowRequest) {
        return;
      }
      window.dispatchEvent(new CustomEvent(PLANNING_GRADE_VAULT_REQUEST_EVENT, {
        detail: {
          action: 'unlock',
        },
      }));
    });
  }
  if (els.sidebarManualSaveBtn) {
    els.sidebarManualSaveBtn.addEventListener('click', () => {
      if ((state.activeTab !== TAB_PLANNING && state.activeTab !== TAB_GRADES) || !state.planningManualSaveState.isManualMode) {
        return;
      }
      window.dispatchEvent(new CustomEvent(PLANNING_MANUAL_SAVE_REQUEST_EVENT));
    });
  }

  return {
    getActiveTab: () => state.activeTab,
    isChromeCollapsed: () => state.chromeCollapsed,
    getChromeTransitionState: () => state.chromeTransitionState,
    renderTabs,
    renderPlanningGradeVaultUnlockButton,
    renderPlanningManualSaveButton,
    setChromeCollapsed,
    setActiveTab,
    setActiveTabImmediate,
    toggleChromeCollapsed,
    updateChromeToggleUI,
    setChromeRegionVisibility,
    setChromeHeaderVisibility,
    setChromeOverlayVisibility,
    setPlanningManualSaveState,
    setPlanningGradeVaultState,
    markPlanningReady,
    syncChromeState,
  };
}
