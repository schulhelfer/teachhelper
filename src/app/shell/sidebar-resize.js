const SIDEBAR_WIDTH_SCOPE_PLANNING = 'planning';
const SIDEBAR_WIDTH_SCOPE_OTHER = 'other';
const SIDEBAR_WIDTH_STORAGE_KEYS = Object.freeze({
  [SIDEBAR_WIDTH_SCOPE_PLANNING]: 'teachhelper:sidebar-width:planning',
  [SIDEBAR_WIDTH_SCOPE_OTHER]: 'teachhelper:sidebar-width:other',
});
const LEGACY_SIDEBAR_WIDTH_STORAGE_KEY = 'teachhelper:shell-sidebar-width';
const SIDEBAR_DEFAULT_WIDTHS = Object.freeze({
  [SIDEBAR_WIDTH_SCOPE_PLANNING]: 220,
  [SIDEBAR_WIDTH_SCOPE_OTHER]: 360,
});
const SIDEBAR_FULLSCREEN_THRESHOLD = 160;
const SIDEBAR_DESKTOP_BREAKPOINT = 981;
const SIDEBAR_TOUCH_DOUBLE_TAP_DELAY_MS = 350;
const SIDEBAR_TOUCH_DOUBLE_TAP_DISTANCE_PX = 24;

export function createSidebarResizeController({
  app = null,
  sidebar = null,
  handle = null,
  view = null,
  ResizeObserverClass = view?.ResizeObserver,
  getActiveScope = () => SIDEBAR_WIDTH_SCOPE_OTHER,
  isActiveTabResizable = () => false,
  getChromeCollapsed = () => false,
  getChromeTransitionState = () => 'idle',
  onCollapseRequest = () => {},
  onWidthChange = () => {},
  now = () => Date.now(),
} = {}) {
  let disposed = false;
  let resizeState = null;
  let lastTouchTap = null;
  let handlePositionObserver = null;
  const bindings = [];
  const scheduledFrames = new Set();

  function normalizeScope(scope) {
    return scope === SIDEBAR_WIDTH_SCOPE_PLANNING
      ? SIDEBAR_WIDTH_SCOPE_PLANNING
      : SIDEBAR_WIDTH_SCOPE_OTHER;
  }

  function getDefaultWidth(scope) {
    return SIDEBAR_DEFAULT_WIDTHS[normalizeScope(scope)];
  }

  function getMinimumWidth() {
    return SIDEBAR_FULLSCREEN_THRESHOLD;
  }

  function readStoredWidth(scope) {
    const normalizedScope = normalizeScope(scope);
    if (!view) return getDefaultWidth(normalizedScope);
    try {
      const storageKey = SIDEBAR_WIDTH_STORAGE_KEYS[normalizedScope];
      const storedValue = view.localStorage?.getItem(storageKey)
        ?? (normalizedScope === SIDEBAR_WIDTH_SCOPE_OTHER
          ? view.localStorage?.getItem(LEGACY_SIDEBAR_WIDTH_STORAGE_KEY)
          : null);
      const stored = Number.parseFloat(storedValue);
      if (!Number.isFinite(stored) || stored < getMinimumWidth(normalizedScope)) {
        return getDefaultWidth(normalizedScope);
      }
      return Math.round(stored);
    } catch {
      return getDefaultWidth(normalizedScope);
    }
  }

  const widths = {
    [SIDEBAR_WIDTH_SCOPE_PLANNING]: readStoredWidth(SIDEBAR_WIDTH_SCOPE_PLANNING),
    [SIDEBAR_WIDTH_SCOPE_OTHER]: readStoredWidth(SIDEBAR_WIDTH_SCOPE_OTHER),
  };

  function getActiveWidthScope() {
    return normalizeScope(getActiveScope());
  }

  function isResizeDesktop() {
    return Number(view?.innerWidth) >= SIDEBAR_DESKTOP_BREAKPOINT;
  }

  function getMaximumWidth() {
    if (!view) return SIDEBAR_DEFAULT_WIDTHS[SIDEBAR_WIDTH_SCOPE_OTHER];
    return Math.floor(view.innerWidth * 0.5);
  }

  function updateWidth(width) {
    if (disposed || !app || !Number.isFinite(width)) return;
    app.style.setProperty('--shell-sidebar-width', `${Math.round(width)}px`);
  }

  function applyActiveWidth() {
    if (disposed) return;
    updateWidth(widths[getActiveWidthScope()]);
  }

  function persistWidth(scope, width) {
    try {
      view?.localStorage?.setItem(
        SIDEBAR_WIDTH_STORAGE_KEYS[normalizeScope(scope)],
        String(Math.round(width))
      );
    } catch {
    }
  }

  function updateScopedWidth(scope, width, { persist = false, notify = persist } = {}) {
    if (disposed) return;
    const normalizedWidth = Math.round(width);
    if (!Number.isFinite(normalizedWidth)) return;
    const normalizedScope = normalizeScope(scope);
    widths[normalizedScope] = normalizedWidth;
    if (getActiveWidthScope() === normalizedScope) {
      updateWidth(normalizedWidth);
    }
    if (persist) persistWidth(normalizedScope, normalizedWidth);
    if (notify) onWidthChange(normalizedScope, normalizedWidth);
    return normalizedWidth;
  }

  function setWidth(scope, width) {
    if (disposed) return null;
    const normalizedWidth = Math.min(
      getMaximumWidth(),
      Math.max(SIDEBAR_FULLSCREEN_THRESHOLD, Math.round(Number(width)))
    );
    if (!Number.isFinite(normalizedWidth)) return null;
    return updateScopedWidth(scope, normalizedWidth, { persist: true });
  }

  function getWidth(scope) {
    return widths[normalizeScope(scope)];
  }

  function resetActiveWidth() {
    if (disposed) return;
    const scope = getActiveWidthScope();
    return updateScopedWidth(scope, getDefaultWidth(scope), { persist: true });
  }

  function canStartResize() {
    return isResizeDesktop()
      && isActiveTabResizable()
      && !getChromeCollapsed()
      && getChromeTransitionState() === 'idle';
  }

  function handleTouchTap(event, wasTap) {
    if (
      event?.pointerType !== 'touch'
      || !wasTap
      || !canStartResize()
    ) {
      lastTouchTap = null;
      return;
    }
    const tap = {
      at: now(),
      clientX: Number(event.clientX) || 0,
      clientY: Number(event.clientY) || 0,
      scope: getActiveWidthScope(),
    };
    const previousTap = lastTouchTap;
    lastTouchTap = tap;
    if (
      !previousTap
      || previousTap.scope !== tap.scope
      || tap.at - previousTap.at > SIDEBAR_TOUCH_DOUBLE_TAP_DELAY_MS
      || Math.hypot(tap.clientX - previousTap.clientX, tap.clientY - previousTap.clientY)
        > SIDEBAR_TOUCH_DOUBLE_TAP_DISTANCE_PX
    ) {
      return;
    }
    lastTouchTap = null;
    event.preventDefault();
    resetActiveWidth();
  }

  function finishResize(event, { cancelled = false } = {}) {
    const state = resizeState;
    if (!state) return;
    resizeState = null;
    app?.classList.remove('is-sidebar-resizing');
    if (event?.pointerId != null && handle?.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (cancelled || !state.hasMoved) {
      updateScopedWidth(state.scope, state.startWidth, { notify: false });
      return;
    }
    if (state.lastRawWidth < SIDEBAR_FULLSCREEN_THRESHOLD) {
      onCollapseRequest();
      return;
    }
    const committedWidth = Math.min(
      getMaximumWidth(),
      Math.max(SIDEBAR_FULLSCREEN_THRESHOLD, state.lastRawWidth)
    );
    updateScopedWidth(state.scope, committedWidth, { persist: true });
  }

  function syncHandlePosition() {
    if (disposed || !app || !sidebar || !handle) return;
    const appBounds = app.getBoundingClientRect();
    const sidebarBounds = sidebar.getBoundingClientRect();
    handle.style.setProperty('--sidebar-resize-left', `${Math.round(sidebarBounds.right - appBounds.left - 7)}px`);
    handle.style.setProperty('--sidebar-resize-top', `${Math.round(sidebarBounds.top - appBounds.top)}px`);
    handle.style.setProperty('--sidebar-resize-height', `${Math.round(sidebarBounds.height)}px`);
  }

  function scheduleHandlePositionSync() {
    if (disposed) return;
    if (typeof view?.requestAnimationFrame !== 'function') {
      syncHandlePosition();
      return;
    }
    const scheduled = { id: 0 };
    scheduledFrames.add(scheduled);
    scheduled.id = view.requestAnimationFrame(() => {
      scheduledFrames.delete(scheduled);
      syncHandlePosition();
    });
  }

  function bind(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    bindings.push([target, type, listener]);
  }

  function handlePointerDown(event) {
    if (event.button !== 0 || !canStartResize() || !app || !sidebar) return;
    event.preventDefault();
    const appBounds = app.getBoundingClientRect();
    const sidebarBounds = sidebar.getBoundingClientRect();
    const scope = getActiveWidthScope();
    resizeState = {
      pointerId: event.pointerId,
      appLeft: appBounds.left,
      scope,
      startWidth: widths[scope],
      pointerOffset: event.clientX - sidebarBounds.right,
      lastRawWidth: Math.round(sidebarBounds.right - appBounds.left),
      hasMoved: false,
    };
    app.classList.add('is-sidebar-resizing');
    handle.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!resizeState || resizeState.pointerId !== event.pointerId || !app) return;
    event.preventDefault();
    const rawWidth = Math.round(
      event.clientX - resizeState.appLeft - resizeState.pointerOffset
    );
    resizeState.hasMoved = resizeState.hasMoved || rawWidth !== resizeState.lastRawWidth;
    const visualWidth = Math.min(getMaximumWidth(), Math.max(0, rawWidth));
    resizeState.lastRawWidth = rawWidth;
    updateWidth(visualWidth);
  }

  function handlePointerUp(event) {
    if (resizeState?.pointerId !== event.pointerId) return;
    const wasTap = !resizeState.hasMoved;
    finishResize(event);
    handleTouchTap(event, wasTap);
  }

  function handlePointerCancel(event) {
    if (resizeState?.pointerId !== event.pointerId) return;
    finishResize(event, { cancelled: true });
  }

  function handleDoubleClick(event) {
    if (!isResizeDesktop() || !isActiveTabResizable()) return;
    event.preventDefault();
    resetActiveWidth();
  }

  function handleStorage(event) {
    const scope = Object.entries(SIDEBAR_WIDTH_STORAGE_KEYS)
      .find(([, storageKey]) => storageKey === event.key)?.[0];
    if (!scope) return;
    const nextWidth = Number.parseFloat(event.newValue);
    if (!Number.isFinite(nextWidth) || nextWidth < getMinimumWidth(scope)) return;
    updateScopedWidth(scope, nextWidth, { notify: false });
  }

  function initialize() {
    applyActiveWidth();
    if (!handle || !sidebar || !app) return;
    app.append(handle);
    syncHandlePosition();
    if (typeof ResizeObserverClass === 'function') {
      handlePositionObserver = new ResizeObserverClass(scheduleHandlePositionSync);
      handlePositionObserver.observe(app);
      handlePositionObserver.observe(sidebar);
    }
    bind(view, 'resize', scheduleHandlePositionSync);
    bind(handle, 'pointerdown', handlePointerDown);
    bind(handle, 'pointermove', handlePointerMove);
    bind(handle, 'pointerup', handlePointerUp);
    bind(handle, 'pointercancel', handlePointerCancel);
    bind(handle, 'lostpointercapture', handlePointerCancel);
    bind(handle, 'dblclick', handleDoubleClick);
    bind(view, 'storage', handleStorage);
  }

  function dispose() {
    if (disposed) return;
    if (resizeState) {
      const state = resizeState;
      resizeState = null;
      app?.classList.remove('is-sidebar-resizing');
      if (handle?.hasPointerCapture?.(state.pointerId)) {
        handle.releasePointerCapture(state.pointerId);
      }
      updateScopedWidth(state.scope, state.startWidth, { notify: false });
    }
    disposed = true;
    bindings.splice(0).forEach(([target, type, listener]) => {
      target.removeEventListener?.(type, listener);
    });
    handlePositionObserver?.disconnect?.();
    handlePositionObserver = null;
    scheduledFrames.forEach(({ id }) => view?.cancelAnimationFrame?.(id));
    scheduledFrames.clear();
    lastTouchTap = null;
  }

  initialize();

  return {
    applyActiveWidth,
    getWidth,
    setWidth,
    resetActiveWidth,
    dispose,
  };
}
