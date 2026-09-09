(function installPlanningBridge() {
  const TRUSTED_PARENT_ORIGIN = (window.origin === 'null' || window.location.origin === 'null')
    ? new URL(document.currentScript?.src || window.location.href).origin
    : window.location.origin;
  const MODULE_FRAME_NONCE = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('moduleFrameNonce') || '';
  const PARENT_MESSAGE_TARGET = (window.origin === 'null' || window.location.origin === 'null') ? '*' : TRUSTED_PARENT_ORIGIN;
  const EXPECTED_PARENT_ORIGIN = MODULE_FRAME_NONCE ? '' : TRUSTED_PARENT_ORIGIN;
  const TUTORIAL_TARGET_RECT_REQUEST_EVENT = 'classroom:tutorial-target-rect-request';
  const TUTORIAL_TARGET_RECT_RESPONSE_EVENT = 'classroom:tutorial-target-rect-response';
  const VIEW_REQUEST_EVENT = 'classroom:planning-view-request';
  const MANUAL_SAVE_REQUEST_EVENT = 'classroom:planning-manual-save-request';
  const MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';
  const UNSAVED_STATE_EVENT = 'classroom:planning-unsaved-state';
  const TAB_LEAVE_REQUEST_EVENT = 'classroom:planning-tab-leave-request';
  const TAB_LEAVE_RESULT_EVENT = 'classroom:planning-tab-leave-result';
  const TUTORIAL_START_REQUEST_EVENT = 'classroom:planning-tutorial-start-request';
  const TUTORIAL_COMMAND_EVENT = 'classroom:planning-tutorial-command';
  const READY_EVENT = 'classroom:planning-ready';
  const COURSE_SEATPLAN_OPEN_EVENT = 'classroom:planning-course-seatplan-open';
  const COURSE_CONTEXT_EVENT = 'classroom:planning-course-context';
  const SHELL_LAYOUT_EVENT = 'classroom:planning-shell-layout';
  const CONTEXT_MENU_DISMISS_EVENT = 'classroom:module-context-menu-dismiss';

  const incomingEvents = new Set([
    VIEW_REQUEST_EVENT,
    MANUAL_SAVE_REQUEST_EVENT,
    TAB_LEAVE_REQUEST_EVENT,
    SHELL_LAYOUT_EVENT,
    TUTORIAL_COMMAND_EVENT,
    CONTEXT_MENU_DISMISS_EVENT,
    TUTORIAL_TARGET_RECT_REQUEST_EVENT,
  ]);
  const outgoingEvents = new Set([
    MANUAL_SAVE_STATE_EVENT,
    UNSAVED_STATE_EVENT,
    TAB_LEAVE_RESULT_EVENT,
    TUTORIAL_START_REQUEST_EVENT,
    READY_EVENT,
    COURSE_SEATPLAN_OPEN_EVENT,
    COURSE_CONTEXT_EVENT,
  ]);

  function withPlanningTutorialApi(callback, attempt = 0) {
    const api = window.__teachhelperPlanningTutorial || null;
    if (api) {
      callback(api);
      return;
    }
    if (attempt >= 40) return;
    window.setTimeout(() => withPlanningTutorialApi(callback, attempt + 1), 50);
  }

  function withModuleFrameNonce(message) {
    return MODULE_FRAME_NONCE ? { ...message, frameNonce: MODULE_FRAME_NONCE } : message;
  }

  function isVisibleTutorialTarget(candidate) {
    if (!(candidate instanceof HTMLElement) || candidate.hidden) return false;
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function respondWithTutorialTargetRect(detail) {
    const requestId = String(detail?.requestId || '');
    if (!requestId) return;
    const selectors = Array.isArray(detail?.selectors) ? detail.selectors : [];
    const element = selectors
      .map((selector) => (typeof selector === 'string' && selector ? document.querySelector(selector) : null))
      .find(isVisibleTutorialTarget);
    if (element && detail?.reveal) {
      const bounds = element.getBoundingClientRect();
      if (bounds.top < 0 || bounds.left < 0 || bounds.bottom > window.innerHeight || bounds.right > window.innerWidth) {
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    }
    const rect = element?.getBoundingClientRect();
    window.parent.postMessage(withModuleFrameNonce({
      type: TUTORIAL_TARGET_RECT_RESPONSE_EVENT,
      detail: {
        requestId,
        rect: rect ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        } : null,
      },
    }), PARENT_MESSAGE_TARGET);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || (EXPECTED_PARENT_ORIGIN && event.origin !== EXPECTED_PARENT_ORIGIN)) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !incomingEvents.has(data.type)) return;
    if (MODULE_FRAME_NONCE && data.frameNonce !== MODULE_FRAME_NONCE) return;
    if (data.type === TUTORIAL_TARGET_RECT_REQUEST_EVENT) {
      respondWithTutorialTargetRect(data.detail && typeof data.detail === 'object' ? data.detail : {});
      return;
    }
    if (data.type === SHELL_LAYOUT_EVENT) {
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
      document.documentElement.dataset.shellCollapsed = detail && detail.collapsed ? 'true' : 'false';
      return;
    }
    if (data.type === TUTORIAL_COMMAND_EVENT) {
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
      const command = String(detail.command || '');
      const commandDetail = detail.detail && typeof detail.detail === 'object' ? detail.detail : {};
      if (command === 'activate') {
        withPlanningTutorialApi((api) => api.activate?.());
      } else if (command === 'showSurface') {
        withPlanningTutorialApi((api) => api.showSurface?.(String(commandDetail.surface || '')));
      } else if (command === 'cleanup') {
        withPlanningTutorialApi((api) => api.cleanup?.());
      }
      return;
    }
    window.dispatchEvent(new CustomEvent(data.type, {
      detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
    }));
  });

  outgoingEvents.forEach((type) => {
    window.addEventListener(type, (event) => {
      const detail = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? event.detail
        : null;
      window.parent.postMessage(withModuleFrameNonce({ type, detail }), PARENT_MESSAGE_TARGET);
    });
  });
})();
