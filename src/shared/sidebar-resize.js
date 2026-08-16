(function installTeachHelperSidebarResize() {
  const FULLSCREEN_THRESHOLD = 160;
  const DEFAULT_WIDTH = 360;
  const MIN_RESIZE_VIEWPORT_WIDTH = 320;
  const TOUCH_DOUBLE_TAP_DELAY_MS = 350;
  const TOUCH_DOUBLE_TAP_DISTANCE_PX = 24;
  const WIDTH_REQUEST_EVENT = 'classroom:sidebar-width-request';
  const WIDTH_SYNC_EVENT = 'classroom:sidebar-width-sync';
  const WIDTH_COMMIT_EVENT = 'classroom:sidebar-width-commit';
  const COLLAPSE_REQUEST_EVENT = 'classroom:sidebar-collapse-request';
  const MORE_TOOLS_DISMISS_EVENT = 'classroom:more-tools-dismiss';
  const TRUSTED_PARENT_ORIGIN = window.location.origin === 'null'
    ? new URL(document.currentScript?.src || window.location.href).origin
    : window.location.origin;
  const moduleFrameNonce = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';

  function getScope(app) {
    const declaredScope = app?.dataset.sidebarWidthScope;
    return declaredScope === 'planning' || declaredScope === 'grades'
      ? 'planning'
      : 'other';
  }

  function getDefaultWidth(scope) {
    return scope === 'planning' ? 220 : DEFAULT_WIDTH;
  }

  function getMinimumStoredWidth(scope) {
    return FULLSCREEN_THRESHOLD;
  }

  function isResizableViewport() {
    return window.innerWidth >= MIN_RESIZE_VIEWPORT_WIDTH;
  }

  function getMaximumWidth() {
    return Math.floor(window.innerWidth * 0.5);
  }

  function withModuleFrameNonce(payload) {
    return moduleFrameNonce ? { ...payload, frameNonce: moduleFrameNonce } : payload;
  }

  function postToShell(type, detail) {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(withModuleFrameNonce({ type, detail }), TRUSTED_PARENT_ORIGIN);
    } catch {
      
    }
  }

  function isTrustedShellMessage(event) {
    if (!window.parent || event.source !== window.parent || event.origin !== TRUSTED_PARENT_ORIGIN) {
      return false;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') return false;
    return !moduleFrameNonce || data.frameNonce === moduleFrameNonce;
  }

  function initialize() {
    const app = document.querySelector('[data-sidebar-width-scope]');
    const handle = app?.querySelector('.sidebar-resize-handle');
    if (!app || !handle) return;

    const sidebar = handle.closest('.side, .sidebar-panel');
    if (!sidebar) return;
    app.append(handle);
    const syncHandlePosition = () => {
      const appBounds = app.getBoundingClientRect();
      const sidebarBounds = sidebar.getBoundingClientRect();
      handle.style.setProperty('--sidebar-resize-left', `${Math.round(sidebarBounds.right - appBounds.left - 7)}px`);
      handle.style.setProperty('--sidebar-resize-top', `${Math.round(sidebarBounds.top - appBounds.top)}px`);
      handle.style.setProperty('--sidebar-resize-height', `${Math.round(sidebarBounds.height)}px`);
    };
    const scheduleHandlePositionSync = () => {
      window.requestAnimationFrame(syncHandlePosition);
    };
    syncHandlePosition();
    const handlePositionObserver = new ResizeObserver(scheduleHandlePositionSync);
    handlePositionObserver.observe(app);
    handlePositionObserver.observe(sidebar);
    window.addEventListener('resize', scheduleHandlePositionSync);

    const scope = getScope(app);
    const defaultWidth = getDefaultWidth(scope);
    let currentWidth = defaultWidth;
    let resizeState = null;
    let lastTouchTap = null;
    const setWidth = (width) => {
      if (!Number.isFinite(width)) return;
      app.style.setProperty('--module-sidebar-width', `${Math.round(width)}px`);
    };
    const resetWidth = () => {
      currentWidth = defaultWidth;
      setWidth(currentWidth);
      postToShell(WIDTH_COMMIT_EVENT, { scope, width: currentWidth });
    };
    const handleTouchTap = (event, wasTap) => {
      if (
        event?.pointerType !== 'touch'
        || !wasTap
        || !isResizableViewport()
        || document.documentElement.dataset.shellCollapsed === 'true'
        || app.closest('[data-shell-collapsed="true"]')
      ) {
        lastTouchTap = null;
        return;
      }
      const tap = {
        at: Date.now(),
        clientX: Number(event.clientX) || 0,
        clientY: Number(event.clientY) || 0,
      };
      const previousTap = lastTouchTap;
      lastTouchTap = tap;
      if (
        !previousTap
        || tap.at - previousTap.at > TOUCH_DOUBLE_TAP_DELAY_MS
        || Math.hypot(tap.clientX - previousTap.clientX, tap.clientY - previousTap.clientY)
          > TOUCH_DOUBLE_TAP_DISTANCE_PX
      ) {
        return;
      }
      lastTouchTap = null;
      event.preventDefault();
      resetWidth();
    };
    const finishResize = (event, { cancelled = false } = {}) => {
      const state = resizeState;
      if (!state) return;
      resizeState = null;
      app.classList.remove('is-sidebar-resizing');
      if (event?.pointerId != null && handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      if (cancelled) {
        setWidth(state.startWidth);
        return;
      }
      if (!state.hasMoved) {
        setWidth(state.startWidth);
        return;
      }
      if (state.lastRawWidth < FULLSCREEN_THRESHOLD) {
        postToShell(COLLAPSE_REQUEST_EVENT, { scope });
        return;
      }
      const committedWidth = Math.min(
        getMaximumWidth(),
        Math.max(FULLSCREEN_THRESHOLD, state.lastRawWidth)
      );
      currentWidth = committedWidth;
      setWidth(committedWidth);
      postToShell(WIDTH_COMMIT_EVENT, { scope, width: committedWidth });
    };

    setWidth(currentWidth);
    document.addEventListener('pointerdown', () => {
      postToShell(MORE_TOOLS_DISMISS_EVENT);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        postToShell(MORE_TOOLS_DISMISS_EVENT);
      }
    });
    handle.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0
        || !isResizableViewport()
        || document.documentElement.dataset.shellCollapsed === 'true'
        || app.closest('[data-shell-collapsed="true"]')
      ) {
        return;
      }
      event.preventDefault();
      const appBounds = app.getBoundingClientRect();
      const sidebarBounds = sidebar.getBoundingClientRect();
      resizeState = {
        pointerId: event.pointerId,
        appLeft: appBounds.left,
        startWidth: currentWidth,
        pointerOffset: event.clientX - sidebarBounds.right,
        lastRawWidth: Math.round(sidebarBounds.right - appBounds.left),
        hasMoved: false,
      };
      app.classList.add('is-sidebar-resizing');
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rawWidth = Math.round(event.clientX - resizeState.appLeft - resizeState.pointerOffset);
      resizeState.hasMoved = resizeState.hasMoved || rawWidth !== resizeState.lastRawWidth;
      resizeState.lastRawWidth = rawWidth;
      setWidth(Math.min(getMaximumWidth(), Math.max(0, rawWidth)));
    });
    handle.addEventListener('pointerup', (event) => {
      if (resizeState?.pointerId !== event.pointerId) return;
      const wasTap = !resizeState.hasMoved;
      finishResize(event);
      handleTouchTap(event, wasTap);
    });
    handle.addEventListener('pointercancel', (event) => {
      if (resizeState?.pointerId !== event.pointerId) return;
      finishResize(event, { cancelled: true });
    });
    handle.addEventListener('lostpointercapture', (event) => {
      if (resizeState?.pointerId !== event.pointerId) return;
      finishResize(event, { cancelled: true });
    });
    handle.addEventListener('dblclick', (event) => {
      if (!isResizableViewport() || document.documentElement.dataset.shellCollapsed === 'true') return;
      event.preventDefault();
      resetWidth();
    });
    window.addEventListener('message', (event) => {
      if (!isTrustedShellMessage(event)) return;
      const data = event.data;
      if (data.type !== WIDTH_SYNC_EVENT || data.detail?.scope !== scope) return;
      const width = Number(data.detail.width);
      if (!Number.isFinite(width) || width < getMinimumStoredWidth(scope)) return;
      currentWidth = Math.round(width);
      setWidth(currentWidth);
    });
    postToShell(WIDTH_REQUEST_EVENT, { scope });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}());
