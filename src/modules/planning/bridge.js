(function installPlanningBridge() {
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
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

  const incomingEvents = new Set([
    VIEW_REQUEST_EVENT,
    MANUAL_SAVE_REQUEST_EVENT,
    TAB_LEAVE_REQUEST_EVENT,
    SHELL_LAYOUT_EVENT,
    TUTORIAL_COMMAND_EVENT,
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

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.origin !== TRUSTED_PARENT_ORIGIN) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !incomingEvents.has(data.type)) return;
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
      window.parent.postMessage({ type, detail }, TRUSTED_PARENT_ORIGIN);
    });
  });
})();
