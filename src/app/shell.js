import {
  PLANNING_GRADE_VAULT_REQUEST_EVENT,
  PLANNING_GRADE_VAULT_STATE_EVENT,
  normalizeTab,
  PLANNING_MANUAL_SAVE_REQUEST_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_UNSAVED_STATE_EVENT,
  TAB_GRADES,
  TAB_GROUPS,
  TAB_DUPLICATE_CHECK,
  TAB_MERGER,
  TAB_PLANNING,
  TAB_QR,
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

const SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING = 'planning';
const SHELL_SIDEBAR_WIDTH_SCOPE_OTHER = 'other';
const SHELL_SIDEBAR_WIDTH_STORAGE_KEYS = Object.freeze({
  [SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING]: 'teachhelper:sidebar-width:planning',
  [SHELL_SIDEBAR_WIDTH_SCOPE_OTHER]: 'teachhelper:sidebar-width:other',
});
const LEGACY_SHELL_SIDEBAR_WIDTH_STORAGE_KEY = 'teachhelper:shell-sidebar-width';
const SHELL_SIDEBAR_DEFAULT_WIDTHS = Object.freeze({
  [SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING]: 220,
  [SHELL_SIDEBAR_WIDTH_SCOPE_OTHER]: 360,
});
const SHELL_SIDEBAR_FULLSCREEN_THRESHOLD = 160;
const SHELL_SIDEBAR_DESKTOP_BREAKPOINT = 981;

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
  onSidebarWidthChange,
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
  const notifySidebarWidthChange = typeof onSidebarWidthChange === 'function'
    ? onSidebarWidthChange
    : (() => {});
  let unsavedTabConfirmPromise = null;
  let tabIndicatorFrame = 0;
  let tabNavResizeObserver = null;
  let moreToolsSyncFrame = 0;
  const shellSidebarWidths = {
    [SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING]: readStoredSidebarWidth(SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING),
    [SHELL_SIDEBAR_WIDTH_SCOPE_OTHER]: readStoredSidebarWidth(SHELL_SIDEBAR_WIDTH_SCOPE_OTHER),
  };
  let sidebarResizeState = null;

  function getSidebarWidthScope(tab = state.activeTab) {
    return tab === TAB_PLANNING || tab === TAB_GRADES
      ? SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING
      : SHELL_SIDEBAR_WIDTH_SCOPE_OTHER;
  }

  function isShellSidebarResizableTab(tab = state.activeTab) {
    return tab === TAB_GROUPS || tab === TAB_RANDOM_PICKER || tab === TAB_WORK_PHASE;
  }

  function isSidebarResizeDesktop() {
    return typeof window !== 'undefined' && window.innerWidth >= SHELL_SIDEBAR_DESKTOP_BREAKPOINT;
  }

  function normalizeSidebarWidthScope(scope) {
    return scope === SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SHELL_SIDEBAR_WIDTH_SCOPE_PLANNING
      : SHELL_SIDEBAR_WIDTH_SCOPE_OTHER;
  }

  function getDefaultShellSidebarWidth(scope) {
    return SHELL_SIDEBAR_DEFAULT_WIDTHS[normalizeSidebarWidthScope(scope)];
  }

  function getMinimumShellSidebarWidth(scope) {
    return SHELL_SIDEBAR_FULLSCREEN_THRESHOLD;
  }

  function readStoredSidebarWidth(scope) {
    const normalizedScope = normalizeSidebarWidthScope(scope);
    if (typeof window === 'undefined') return getDefaultShellSidebarWidth(normalizedScope);
    try {
      const storageKey = SHELL_SIDEBAR_WIDTH_STORAGE_KEYS[normalizedScope];
      const storedValue = window.localStorage?.getItem(storageKey)
        ?? (normalizedScope === SHELL_SIDEBAR_WIDTH_SCOPE_OTHER
          ? window.localStorage?.getItem(LEGACY_SHELL_SIDEBAR_WIDTH_STORAGE_KEY)
          : null);
      const stored = Number.parseFloat(storedValue);
      if (!Number.isFinite(stored) || stored < getMinimumShellSidebarWidth(normalizedScope)) {
        return getDefaultShellSidebarWidth(normalizedScope);
      }
      return Math.round(stored);
    } catch {
      return getDefaultShellSidebarWidth(normalizedScope);
    }
  }

  function updateShellSidebarWidth(width) {
    if (!els.app || !Number.isFinite(width)) return;
    els.app.style.setProperty('--shell-sidebar-width', `${Math.round(width)}px`);
  }

  function applyActiveShellSidebarWidth() {
    updateShellSidebarWidth(shellSidebarWidths[getSidebarWidthScope()]);
  }

  function persistShellSidebarWidth(scope, width) {
    try {
      window.localStorage?.setItem(
        SHELL_SIDEBAR_WIDTH_STORAGE_KEYS[normalizeSidebarWidthScope(scope)],
        String(Math.round(width))
      );
    } catch {
      // The resized shell remains usable when storage is unavailable.
    }
  }

  function setShellSidebarWidth(scope, width, { persist = false, notify = persist } = {}) {
    const normalizedWidth = Math.round(width);
    if (!Number.isFinite(normalizedWidth)) return;
    const normalizedScope = normalizeSidebarWidthScope(scope);
    shellSidebarWidths[normalizedScope] = normalizedWidth;
    if (getSidebarWidthScope() === normalizedScope) {
      updateShellSidebarWidth(normalizedWidth);
    }
    if (persist) {
      persistShellSidebarWidth(normalizedScope, normalizedWidth);
    }
    if (notify) {
      notifySidebarWidthChange(normalizedScope, normalizedWidth);
    }
    return normalizedWidth;
  }

  function getMaximumShellSidebarWidth() {
    if (typeof window === 'undefined') return SHELL_SIDEBAR_DEFAULT_WIDTHS[SHELL_SIDEBAR_WIDTH_SCOPE_OTHER];
    return Math.floor(window.innerWidth * 0.5);
  }

  function finishSidebarResize(event, { cancelled = false } = {}) {
    const resizeState = sidebarResizeState;
    if (!resizeState) return;
    sidebarResizeState = null;
    els.app?.classList.remove('is-sidebar-resizing');
    if (event?.pointerId != null && els.sidebarResizeHandle?.hasPointerCapture?.(event.pointerId)) {
      els.sidebarResizeHandle.releasePointerCapture(event.pointerId);
    }
    if (cancelled) {
      setShellSidebarWidth(resizeState.scope, resizeState.startWidth, { notify: false });
      return;
    }
    if (!resizeState.hasMoved) {
      setShellSidebarWidth(resizeState.scope, resizeState.startWidth, { notify: false });
      return;
    }
    if (resizeState.lastRawWidth < SHELL_SIDEBAR_FULLSCREEN_THRESHOLD) {
      setChromeCollapsed(true);
      return;
    }
    const maximumWidth = getMaximumShellSidebarWidth();
    const committedWidth = Math.min(
      maximumWidth,
      Math.max(SHELL_SIDEBAR_FULLSCREEN_THRESHOLD, resizeState.lastRawWidth)
    );
    setShellSidebarWidth(resizeState.scope, committedWidth, { persist: true });
  }

  function initializeSidebarResize() {
    applyActiveShellSidebarWidth();
    const handle = els.sidebarResizeHandle;
    if (!handle) return;
    handle.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0
        || !isSidebarResizeDesktop()
        || !isShellSidebarResizableTab()
        || state.chromeCollapsed
        || state.chromeTransitionState !== 'idle'
        || !els.app
      ) {
        return;
      }
      event.preventDefault();
      const appBounds = els.app.getBoundingClientRect();
      const scope = getSidebarWidthScope();
      sidebarResizeState = {
        pointerId: event.pointerId,
        appLeft: appBounds.left,
        scope,
        startWidth: shellSidebarWidths[scope],
        lastRawWidth: Math.round(event.clientX - appBounds.left),
        hasMoved: false,
      };
      els.app.classList.add('is-sidebar-resizing');
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!sidebarResizeState || sidebarResizeState.pointerId !== event.pointerId || !els.app) return;
      event.preventDefault();
      const rawWidth = Math.round(event.clientX - sidebarResizeState.appLeft);
      sidebarResizeState.hasMoved = sidebarResizeState.hasMoved || rawWidth !== sidebarResizeState.lastRawWidth;
      const visualWidth = Math.min(getMaximumShellSidebarWidth(), Math.max(0, rawWidth));
      sidebarResizeState.lastRawWidth = rawWidth;
      updateShellSidebarWidth(visualWidth);
    });
    handle.addEventListener('pointerup', (event) => {
      if (sidebarResizeState?.pointerId !== event.pointerId) return;
      finishSidebarResize(event);
    });
    handle.addEventListener('pointercancel', (event) => {
      if (sidebarResizeState?.pointerId !== event.pointerId) return;
      finishSidebarResize(event, { cancelled: true });
    });
    handle.addEventListener('lostpointercapture', (event) => {
      if (sidebarResizeState?.pointerId !== event.pointerId) return;
      finishSidebarResize(event, { cancelled: true });
    });
    handle.addEventListener('dblclick', (event) => {
      if (!isSidebarResizeDesktop() || !isShellSidebarResizableTab()) return;
      event.preventDefault();
      setShellSidebarWidth(getSidebarWidthScope(), getDefaultShellSidebarWidth(getSidebarWidthScope()), { persist: true });
    });
    window.addEventListener('storage', (event) => {
      const scope = Object.entries(SHELL_SIDEBAR_WIDTH_STORAGE_KEYS)
        .find(([, storageKey]) => storageKey === event.key)?.[0];
      if (!scope) return;
      const nextWidth = Number.parseFloat(event.newValue);
      if (!Number.isFinite(nextWidth) || nextWidth < getMinimumShellSidebarWidth(scope)) return;
      setShellSidebarWidth(scope, nextWidth, { notify: false });
    });
  }
  function isPlanningTab(tab) {
    return tab === TAB_PLANNING || tab === TAB_GRADES;
  }

  function isMoreToolsTab(tab) {
    return tab === TAB_GROUPS
      || tab === TAB_RANDOM_PICKER
      || tab === TAB_DUPLICATE_CHECK
      || tab === TAB_WORK_PHASE
      || tab === TAB_QR;
  }

  function isGradeVaultStatusTab(tab) {
    return tab === TAB_PLANNING || tab === TAB_GRADES || tab === TAB_SEATPLAN;
  }

  function getUnsavedAreaLabel() {
    const unsaved = state.planningUnsavedState || {};
    if (unsaved.planningDirty && unsaved.gradesDirty) {
      return 'Planung und Noten';
    }
    if (unsaved.planningDirty) {
      return 'Planung';
    }
    if (unsaved.gradesDirty) {
      return 'Noten';
    }
    return 'Planung oder Noten';
  }

  function shouldConfirmPlanningTabLeave(nextTab, options = {}) {
    if (options.skipUnsavedPrompt) return false;
    if (!isPlanningTab(state.activeTab) || isPlanningTab(nextTab)) return false;
    return Boolean(state.planningUnsavedState?.dirty);
  }

  function showUnsavedTabLeaveDialog() {
    if (unsavedTabConfirmPromise) {
      return unsavedTabConfirmPromise;
    }
    const dialog = els.unsavedDataDialog;
    if (!dialog) {
      return Promise.resolve(true);
    }
    const areaLabel = getUnsavedAreaLabel();
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

  function getMoreToolsMenuItems() {
    if (!els.moreToolsMenu) return [];
    return Array.from(els.moreToolsMenu.querySelectorAll('[data-more-tools-target]'));
  }

  function setMoreToolsMenuOpen(open, options = {}) {
    const canOpen = Boolean(
      open
      && els.tabNav?.classList.contains('is-tools-condensed')
      && els.moreToolsTrigger
      && els.moreToolsMenu
    );
    if (els.moreToolsMenu) {
      els.moreToolsMenu.hidden = !canOpen;
    }
    if (els.moreToolsTrigger) {
      els.moreToolsTrigger.setAttribute('aria-expanded', canOpen ? 'true' : 'false');
    }
    if (canOpen && options.focusFirst) {
      const focusFirst = () => getMoreToolsMenuItems()[0]?.focus();
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(focusFirst);
      } else {
        setTimeout(focusFirst, 0);
      }
    }
  }

  function updateMoreToolsNavigationState() {
    const isCondensed = Boolean(els.tabNav?.classList.contains('is-tools-condensed'));
    const hasTabSelection = !els.app?.classList.contains('tutorial-no-tab-selection');
    const hasActiveTool = hasTabSelection && isMoreToolsTab(state.activeTab);
    if (els.moreToolsTrigger) {
      const isActive = isCondensed && hasActiveTool;
      els.moreToolsTrigger.classList.toggle('active', isActive);
      els.moreToolsTrigger.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    getMoreToolsMenuItems().forEach((item) => {
      const isActive = hasTabSelection && item.dataset.moreToolsTarget === state.activeTab;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-checked', isActive ? 'true' : 'false');
      if (isActive) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
    if (!isCondensed) {
      setMoreToolsMenuOpen(false);
    }
  }

  function syncMoreToolsNavigation() {
    if (!els.tabNav || els.tabNav.hidden) return;
    setMoreToolsMenuOpen(false);
    els.tabNav.classList.remove('is-tools-condensed', 'is-tabs-compact');
    els.tabNav.classList.add('is-measuring-full-tabs');
    els.tabNav.getBoundingClientRect();
    const needsCompactTabs = els.tabNav.scrollWidth > els.tabNav.clientWidth + 1;
    els.tabNav.classList.toggle('is-tabs-compact', needsCompactTabs);
    if (needsCompactTabs) {
      els.tabNav.getBoundingClientRect();
    }
    const needsCondensing = els.tabNav.scrollWidth > els.tabNav.clientWidth + 1;
    els.tabNav.classList.remove('is-measuring-full-tabs');
    els.tabNav.classList.toggle('is-tools-condensed', needsCondensing);
    updateMoreToolsNavigationState();
  }

  function queueMoreToolsNavigationSync() {
    if (!els.tabNav || typeof window === 'undefined') return;
    if (moreToolsSyncFrame) {
      window.cancelAnimationFrame?.(moreToolsSyncFrame);
    }
    const sync = () => {
      moreToolsSyncFrame = 0;
      syncMoreToolsNavigation();
      queueActiveTabIndicatorUpdate();
    };
    if (typeof window.requestAnimationFrame !== 'function') {
      sync();
      return;
    }
    moreToolsSyncFrame = window.requestAnimationFrame(sync);
  }

  function positionActiveTabIndicator(options = {}) {
    if (!els.tabNav || !els.tabIndicator || typeof window === 'undefined') return;
    const instant = Boolean(options?.instant);
    const activeButton = Array.from(els.tabNav.querySelectorAll('.tab-button.active'))
      .find((button) => button instanceof HTMLElement && button.offsetParent !== null);
    if (!(activeButton instanceof HTMLElement) || els.tabNav.hidden) {
      els.tabIndicator.classList.remove('is-ready');
      return;
    }
    const useLocalOffsets = activeButton.offsetParent === els.tabNav;
    const navRect = useLocalOffsets ? null : els.tabNav.getBoundingClientRect();
    const buttonRect = useLocalOffsets ? null : activeButton.getBoundingClientRect();
    const width = useLocalOffsets ? activeButton.offsetWidth : buttonRect.width;
    const height = useLocalOffsets ? activeButton.offsetHeight : buttonRect.height;
    if (
      !width
      || !height
      || (!useLocalOffsets && (!navRect.width || !navRect.height))
    ) {
      els.tabIndicator.classList.remove('is-ready');
      return;
    }
    const x = useLocalOffsets
      ? activeButton.offsetLeft
      : buttonRect.left - navRect.left + els.tabNav.scrollLeft;
    const y = useLocalOffsets
      ? activeButton.offsetTop
      : buttonRect.top - navRect.top + els.tabNav.scrollTop;
    if (instant) {
      els.tabIndicator.style.transition = 'none';
      els.tabIndicator.getBoundingClientRect();
    }
    els.tabIndicator.style.setProperty('--tab-indicator-x', `${x.toFixed(2)}px`);
    els.tabIndicator.style.setProperty('--tab-indicator-y', `${y.toFixed(2)}px`);
    els.tabIndicator.style.setProperty('--tab-indicator-width', `${width.toFixed(2)}px`);
    els.tabIndicator.style.setProperty('--tab-indicator-height', `${height.toFixed(2)}px`);
    els.tabIndicator.classList.add('is-ready');
    if (instant) {
      els.tabIndicator.getBoundingClientRect();
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          els.tabIndicator.style.transition = '';
        });
      } else {
        els.tabIndicator.style.transition = '';
      }
    }
  }

  function queueActiveTabIndicatorUpdate(options = {}) {
    if (!els.tabIndicator || typeof window === 'undefined') return;
    const instant = Boolean(options?.instant);
    if (tabIndicatorFrame) {
      window.cancelAnimationFrame?.(tabIndicatorFrame);
    }
    if (typeof window.requestAnimationFrame !== 'function') {
      positionActiveTabIndicator({ instant });
      return;
    }
    tabIndicatorFrame = window.requestAnimationFrame(() => {
      tabIndicatorFrame = 0;
      positionActiveTabIndicator({ instant });
    });
  }

  function queueSettledActiveTabIndicatorUpdate() {
    if (typeof window === 'undefined') return;
    if (tabIndicatorFrame) {
      window.cancelAnimationFrame?.(tabIndicatorFrame);
      tabIndicatorFrame = 0;
    }
    positionActiveTabIndicator({ instant: true });
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          queueActiveTabIndicatorUpdate({ instant: true });
        });
      });
    }
    window.setTimeout?.(() => {
      queueActiveTabIndicatorUpdate({ instant: true });
    }, 120);
  }

  function renderTabs() {
    if (!els.app) return;
    applyActiveShellSidebarWidth();
    updateSeatPreferencesTrigger();
    els.app.classList.toggle('app-tab-merger', state.activeTab === TAB_MERGER);
    els.app.classList.toggle('app-tab-duplicate-check', state.activeTab === TAB_DUPLICATE_CHECK);
    els.app.classList.toggle('app-tab-qr', state.activeTab === TAB_QR);
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
    if (els.qrShell) {
      els.qrShell.hidden = state.activeTab !== TAB_QR;
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
      [els.tabQr, TAB_QR],
    ].forEach(([button, tabKey]) => {
      if (!button) return;
      const selected = !els.app.classList.contains('tutorial-no-tab-selection')
        && state.activeTab === tabKey;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    syncMoreToolsNavigation();
    queueActiveTabIndicatorUpdate();
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
      return 100;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 1;
    }
    const styleHost = els.app || document.documentElement;
    const computed = window.getComputedStyle(styleHost);
    return parseCssTimeToMs(computed.getPropertyValue('--tab-switch-duration')) || 100;
  }

  function collectRenderedTabRegions() {
    if (!els.app) return [];
    return Array.from(els.app.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;
      if (!child.matches('.side, .main, .merger-shell, .duplicate-check-shell, .qr-shell, .planning-shell, .monitor-shell, .work-order-shell, .timer-shell')) {
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
      && child.matches('.side, .main, .merger-shell, .duplicate-check-shell, .qr-shell, .planning-shell, .monitor-shell, .work-order-shell, .timer-shell')
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
    renderPlanningGradeVaultUnlockButton();
  }

  function clearChromeTransitionTimer() {
    if (!state.chromeTransitionTimer || typeof window === 'undefined') return;
    window.clearTimeout(state.chromeTransitionTimer);
    state.chromeTransitionTimer = 0;
  }

  function getChromeTransitionDuration() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return 320;
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
    const resolved = (durations.length ? Math.max(...durations) : 280) + 40;
    return resolved;
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
    if (hidden) {
      setMoreToolsMenuOpen(false);
    } else {
      queueMoreToolsNavigationSync();
    }
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
    const shouldMoveFocus = hiddenContainers.some((container) => container.contains(active))
      || active === els.firstRunTutorialStart
      || Boolean(els.sidebarFooter?.contains(active));
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
      setTutorialEntryVisibility(false);
      setChromeRegionVisibility(true);
      setChromeHeaderVisibility(true);
      return;
    }
    setChromeRegionVisibility(false);
    setChromeHeaderVisibility(false);
    setTutorialEntryVisibility(true);
    moveFocusOutOfChromeOverlayBeforeHide();
    setChromeOverlayVisibility(false, false);
  }

  function finalizeChromeTransition(collapsed) {
    clearChromeTransitionTimer();
    state.chromeTransitionState = 'idle';
    const settleChromeLayout = !collapsed && els.app;
    if (settleChromeLayout) {
      els.app.classList.add('is-chrome-layout-settling');
    }
    if (els.app) {
      els.app.classList.remove('is-collapsing', 'is-expanding');
      els.app.classList.toggle('chrome-collapsed', collapsed);
    }
    updateChromeToggleUI();
    applyChromeVisibility(collapsed);
    renderPlanningGradeVaultUnlockButton();
    renderPlanningManualSaveButton();
    refreshLayouts();
    queueSettledActiveTabIndicatorUpdate();
    if (settleChromeLayout) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          els.app?.classList.remove('is-chrome-layout-settling');
        });
      } else {
        els.app.classList.remove('is-chrome-layout-settling');
      }
    }
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

  function updateChromeToggleUI({ preserveHeaderIcon = false, preserveOverlayIcon = false } = {}) {
    const label = state.chromeCollapsed
      ? 'Randleiste anzeigen'
      : 'Hauptansicht im Vollbild';
    [els.chromeToggle, els.chromeOverlayToggle].forEach((button) => {
      if (!button) return;
      button.setAttribute('aria-pressed', state.chromeCollapsed ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      if (
        (button === els.chromeToggle && preserveHeaderIcon)
        || (button === els.chromeOverlayToggle && preserveOverlayIcon)
      ) {
        return;
      }
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
    const mode = typeof planningGradeVaultState.mode === 'string' ? planningGradeVaultState.mode : 'off';
    const configured = Boolean(planningGradeVaultState.configured);
    const unlocked = Boolean(planningGradeVaultState.unlocked);
    const setupRequired = Boolean(planningGradeVaultState.setupRequired);
    const statusAvailable = isGradeVaultStatusTab(state.activeTab)
      && Boolean(planningGradeVaultState.ready)
      && Boolean(planningGradeVaultState.dbConnected);
    const locked = configured
      && !unlocked
      && !setupRequired
      && mode === 'unlock';
    const shouldShow = statusAvailable
      && configured
      && !setupRequired
      && (locked || unlocked);
    const canRequestToggle = isGradeVaultStatusTab(state.activeTab)
      && Boolean(planningGradeVaultState.ready)
      && Boolean(planningGradeVaultState.dbConnected)
      && configured
      && !setupRequired
      && (locked || unlocked)
      && state.tabTransitionState === 'idle'
      && state.chromeTransitionState === 'idle';
    const actionLabel = locked ? 'Notenmodul entsperren' : 'Notenmodul sperren';
    const label = locked ? 'Notenmodul gesperrt' : 'Notenmodul entsperrt';
    els.tabGradesUnlock.textContent = locked ? '🔒' : '🔓';
    els.tabGradesUnlock.title = canRequestToggle ? actionLabel : label;
    els.tabGradesUnlock.setAttribute('aria-label', canRequestToggle ? actionLabel : label);
    els.tabGradesUnlock.hidden = false;
    els.tabGradesUnlock.style.display = 'inline-flex';
    els.tabGradesUnlock.classList.toggle('is-reserved', !shouldShow);
    els.tabGradesUnlock.disabled = !canRequestToggle;
    els.tabGradesUnlock.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (shouldShow) {
      els.tabGradesUnlock.removeAttribute('tabindex');
    } else {
      els.tabGradesUnlock.setAttribute('tabindex', '-1');
    }
  }

  function setChromeCollapsed(collapsed) {
    const nextCollapsed = Boolean(collapsed);
    if (state.chromeTransitionState !== 'idle') {
      return;
    }
    if (!nextCollapsed && state.chromeCollapsed) {
      setShellSidebarWidth(getSidebarWidthScope(), getDefaultShellSidebarWidth(getSidebarWidthScope()), { persist: true });
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
    if (!els.app) {
      updateChromeToggleUI();
      applyChromeVisibility(nextCollapsed);
      renderPlanningManualSaveButton();
      refreshLayouts();
      return;
    }
    updateChromeToggleUI(nextCollapsed
      ? { preserveHeaderIcon: true }
      : { preserveOverlayIcon: true });
    clearChromeTransitionTimer();
    setChromeRegionVisibility(false);
    setChromeHeaderVisibility(false);
    setChromeOverlayVisibility(true, nextCollapsed);
    setTutorialEntryVisibility(false);
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

  function setActiveTab(tab, options = {}) {
    const nextTab = normalizeTab(tab);
    if (shouldConfirmPlanningTabLeave(nextTab, options)) {
      if (unsavedTabConfirmPromise) {
        return;
      }
      showUnsavedTabLeaveDialog().then((confirmed) => {
        if (confirmed) {
          setActiveTab(nextTab, { skipUnsavedPrompt: true });
        }
      });
      return;
    }
    if (options.skipAnimation) {
      state.pendingTabTransitionTarget = null;
      state.activeTab = nextTab;
      ensureTabInitialized(state.activeTab);
      renderTabs();
      refreshLayouts();
      finishTabTransition();
      return;
    }
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
    if (!currentRegions.length || transitionDuration <= 1) {
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
      mode: mode === 'off' || mode === 'unlock' || mode === 'ready' || mode === 'setup' ? mode : 'off',
      dbConnected: Boolean(nextDetail.dbConnected),
      backupConnected: Boolean(nextDetail.backupConnected),
      hasGradeCourse: Boolean(nextDetail.hasGradeCourse),
      hasGradeStudents: Boolean(nextDetail.hasGradeStudents),
      configured: Boolean(nextDetail.configured),
      unlocked: Boolean(nextDetail.unlocked),
      encryptionEnabled: Boolean(nextDetail.encryptionEnabled),
      setupRequired: Boolean(nextDetail.setupRequired),
    };
    renderPlanningGradeVaultUnlockButton();
  }

  function setPlanningUnsavedState(detail = null) {
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const planningDirty = Boolean(nextDetail.planningDirty);
    const gradesDirty = Boolean(nextDetail.gradesDirty);
    state.planningUnsavedState = {
      dirty: Boolean(nextDetail.dirty || planningDirty || gradesDirty),
      planningDirty,
      gradesDirty,
      dirtyGradeCourseIds: Array.isArray(nextDetail.dirtyGradeCourseIds)
        ? nextDetail.dirtyGradeCourseIds.map((id) => String(id)).filter(Boolean)
        : [],
    };
  }

  function markPlanningReady(detail = null) {
    const nextDetail = detail && typeof detail === 'object' ? detail : {};
    const mode = typeof nextDetail.gradeVaultMode === 'string' ? nextDetail.gradeVaultMode : '';
    state.planningGradeVaultState = {
      ...state.planningGradeVaultState,
      ready: true,
      mode: mode === 'off' || mode === 'unlock' || mode === 'ready' || mode === 'setup'
        ? mode
        : 'off',
      dbConnected: Boolean(nextDetail.gradeVaultDbConnected ?? state.planningGradeVaultState?.dbConnected),
      backupConnected: Boolean(nextDetail.gradeBackupConnected ?? state.planningGradeVaultState?.backupConnected),
      hasGradeCourse: Boolean(nextDetail.hasGradeCourse ?? state.planningGradeVaultState?.hasGradeCourse),
      hasGradeStudents: Boolean(nextDetail.hasGradeStudents ?? state.planningGradeVaultState?.hasGradeStudents),
      planningAccessReady: Boolean(nextDetail.planningAccessReady ?? state.planningGradeVaultState?.planningAccessReady),
      hasPlanningCourse: Boolean(nextDetail.hasPlanningCourse ?? state.planningGradeVaultState?.hasPlanningCourse),
      hasPlanningSlot: Boolean(nextDetail.hasPlanningSlot ?? state.planningGradeVaultState?.hasPlanningSlot),
      configured: Boolean(nextDetail.gradeVaultUnlockConfigured ?? state.planningGradeVaultState?.configured),
      unlocked: Boolean(nextDetail.gradeVaultUnlocked ?? state.planningGradeVaultState?.unlocked),
      encryptionEnabled: Boolean(nextDetail.gradeVaultEncryptionEnabled ?? state.planningGradeVaultState?.encryptionEnabled),
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

  initializeSidebarResize();

  function handleBeforeUnload(event) {
    if (!state.planningUnsavedState?.dirty) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  window.addEventListener(PLANNING_MANUAL_SAVE_STATE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    setPlanningManualSaveState(detail);
  });
  window.addEventListener(PLANNING_UNSAVED_STATE_EVENT, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    setPlanningUnsavedState(detail);
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
      const mode = typeof planningGradeVaultState.mode === 'string' ? planningGradeVaultState.mode : 'off';
      const configured = Boolean(planningGradeVaultState.configured);
      const unlocked = Boolean(planningGradeVaultState.unlocked);
      const setupRequired = Boolean(planningGradeVaultState.setupRequired);
      const locked = configured
        && !unlocked
        && !setupRequired
        && mode === 'unlock';
      const shouldAllowRequest = isGradeVaultStatusTab(state.activeTab)
        && Boolean(planningGradeVaultState.ready)
        && Boolean(planningGradeVaultState.dbConnected)
        && configured
        && !setupRequired
        && (locked || unlocked)
        && state.tabTransitionState === 'idle'
        && state.chromeTransitionState === 'idle';
      if (!shouldAllowRequest) {
        return;
      }
      window.dispatchEvent(new CustomEvent(PLANNING_GRADE_VAULT_REQUEST_EVENT, {
        detail: {
          action: locked ? 'unlock' : 'lock',
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
  if (els.moreToolsTrigger) {
    els.moreToolsTrigger.addEventListener('click', () => {
      setMoreToolsMenuOpen(els.moreToolsMenu?.hidden !== false);
    });
    els.moreToolsTrigger.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      setMoreToolsMenuOpen(true, { focusFirst: true });
    });
  }
  if (els.moreToolsMenu) {
    els.moreToolsMenu.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-more-tools-target]')
        : null;
      if (!(target instanceof HTMLElement)) return;
      const tabTarget = target.dataset.moreToolsTarget;
      const originalTabButton = Array.from(els.tabNav?.querySelectorAll('[data-tab-target]') || [])
        .find((button) => button.dataset.tabTarget === tabTarget);
      setMoreToolsMenuOpen(false);
      originalTabButton?.click();
    });
    els.moreToolsMenu.addEventListener('keydown', (event) => {
      const items = getMoreToolsMenuItems();
      const currentIndex = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        setMoreToolsMenuOpen(false);
        els.moreToolsTrigger?.focus();
        return;
      }
      if (!items.length || currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + items.length) % items.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      items[nextIndex]?.focus();
    });
  }
  document.addEventListener('pointerdown', (event) => {
    if (!els.moreToolsMenu || els.moreToolsMenu.hidden) return;
    if (!(event.target instanceof Node) || !els.moreTools?.contains(event.target)) {
      setMoreToolsMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || els.moreToolsMenu?.hidden) return;
    setMoreToolsMenuOpen(false);
    els.moreToolsTrigger?.focus();
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', queueMoreToolsNavigationSync);
    window.visualViewport?.addEventListener?.('resize', queueMoreToolsNavigationSync);
    document.addEventListener('fullscreenchange', queueMoreToolsNavigationSync);
    document.addEventListener('webkitfullscreenchange', queueMoreToolsNavigationSync);
    if (typeof ResizeObserver === 'function' && els.tabNav) {
      tabNavResizeObserver = new ResizeObserver(queueMoreToolsNavigationSync);
      tabNavResizeObserver.observe(els.tabNav);
    }
    queueMoreToolsNavigationSync();
  }
  window.addEventListener('beforeunload', handleBeforeUnload);

  return {
    getActiveTab: () => state.activeTab,
    getSidebarWidth: (scope) => shellSidebarWidths[normalizeSidebarWidthScope(scope)],
    isChromeCollapsed: () => state.chromeCollapsed,
    getChromeTransitionState: () => state.chromeTransitionState,
    closeMoreToolsMenu: () => setMoreToolsMenuOpen(false),
    renderTabs,
    renderPlanningGradeVaultUnlockButton,
    renderPlanningManualSaveButton,
    setChromeCollapsed,
    setSidebarWidth: (scope, width) => {
      const maximumWidth = getMaximumShellSidebarWidth();
      const normalizedWidth = Math.min(
        maximumWidth,
        Math.max(SHELL_SIDEBAR_FULLSCREEN_THRESHOLD, Math.round(Number(width)))
      );
      if (!Number.isFinite(normalizedWidth)) return null;
      return setShellSidebarWidth(scope, normalizedWidth, { persist: true });
    },
    setActiveTab,
    setActiveTabImmediate,
    toggleChromeCollapsed,
    updateChromeToggleUI,
    setChromeRegionVisibility,
    setChromeHeaderVisibility,
    setChromeOverlayVisibility,
    setPlanningManualSaveState,
    setPlanningGradeVaultState,
    setPlanningUnsavedState,
    markPlanningReady,
    syncChromeState,
  };
}
