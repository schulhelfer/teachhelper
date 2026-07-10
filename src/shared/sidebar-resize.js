(function installTeachHelperSidebarResize() {
  const FULLSCREEN_THRESHOLD = 160;
  const DEFAULT_WIDTH = 360;
  const DESKTOP_BREAKPOINT = 981;
  const WIDTH_REQUEST_EVENT = 'classroom:sidebar-width-request';
  const WIDTH_SYNC_EVENT = 'classroom:sidebar-width-sync';
  const WIDTH_COMMIT_EVENT = 'classroom:sidebar-width-commit';
  const COLLAPSE_REQUEST_EVENT = 'classroom:sidebar-collapse-request';
  const moduleFrameNonce = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';

  function getScope(app) {
    return app?.dataset.sidebarWidthScope === 'planning' ? 'planning' : 'other';
  }

  function getDefaultWidth(scope) {
    return scope === 'planning' ? 220 : DEFAULT_WIDTH;
  }

  function getMinimumStoredWidth(scope) {
    return FULLSCREEN_THRESHOLD;
  }

  function isDesktop() {
    return window.innerWidth >= DESKTOP_BREAKPOINT;
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
      window.parent.postMessage(withModuleFrameNonce({ type, detail }), window.location.origin);
    } catch {
      // Standalone module usage keeps the default width when no shell is available.
    }
  }

  function isTrustedShellMessage(event) {
    if (!window.parent || event.source !== window.parent || event.origin !== window.location.origin) {
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

    const scope = getScope(app);
    const defaultWidth = getDefaultWidth(scope);
    let currentWidth = defaultWidth;
    let resizeState = null;
    const setWidth = (width) => {
      if (!Number.isFinite(width)) return;
      app.style.setProperty('--module-sidebar-width', `${Math.round(width)}px`);
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
    handle.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0
        || !isDesktop()
        || document.documentElement.dataset.shellCollapsed === 'true'
        || app.closest('[data-shell-collapsed="true"]')
      ) {
        return;
      }
      event.preventDefault();
      const appBounds = app.getBoundingClientRect();
      resizeState = {
        pointerId: event.pointerId,
        appLeft: appBounds.left,
        startWidth: currentWidth,
        lastRawWidth: Math.round(event.clientX - appBounds.left),
        hasMoved: false,
      };
      app.classList.add('is-sidebar-resizing');
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rawWidth = Math.round(event.clientX - resizeState.appLeft);
      resizeState.hasMoved = resizeState.hasMoved || rawWidth !== resizeState.lastRawWidth;
      resizeState.lastRawWidth = rawWidth;
      setWidth(Math.min(getMaximumWidth(), Math.max(0, rawWidth)));
    });
    handle.addEventListener('pointerup', (event) => {
      if (resizeState?.pointerId !== event.pointerId) return;
      finishResize(event);
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
      if (!isDesktop() || document.documentElement.dataset.shellCollapsed === 'true') return;
      event.preventDefault();
      currentWidth = defaultWidth;
      setWidth(currentWidth);
      postToShell(WIDTH_COMMIT_EVENT, { scope, width: currentWidth });
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
