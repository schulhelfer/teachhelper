(() => {
  const MANUAL_SAVE_STATE_EVENT = 'classroom:planning-manual-save-state';
  const MANUAL_SAVE_REQUEST_EVENT = 'classroom:planning-manual-save-request';
  const UNSAVED_STATE_EVENT = 'classroom:planning-unsaved-state';
  const GRADE_VAULT_STATE_EVENT = 'classroom:planning-grade-vault-state';
  const GRADE_VAULT_REQUEST_EVENT = 'classroom:planning-grade-vault-request';
  const COURSE_SEATPLAN_OPEN_EVENT = 'classroom:planning-course-seatplan-open';
  const COURSE_SEATPLAN_SAVE_REQUEST_EVENT = 'classroom:planning-course-seatplan-save-request';
  const COURSE_SEATPLAN_SAVE_RESULT_EVENT = 'classroom:planning-course-seatplan-save-result';
  const COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:planning-course-grade-config-request';
  const COURSE_GRADE_CONFIG_RESULT_EVENT = 'classroom:planning-course-grade-config-result';
  const COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:planning-course-grade-save-request';
  const COURSE_GRADE_SAVE_RESULT_EVENT = 'classroom:planning-course-grade-save-result';
  const READY_EVENT = 'classroom:planning-ready';
  const SHELL_LAYOUT_EVENT = 'classroom:planning-shell-layout';
  const VIEW_REQUEST_EVENT = 'classroom:planning-view-request';
  const TUTORIAL_COMMAND_EVENT = 'classroom:planning-tutorial-command';
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
  const ALLOWED_PARENT_MESSAGE_TYPES = new Set([
    SHELL_LAYOUT_EVENT,
    VIEW_REQUEST_EVENT,
    TUTORIAL_COMMAND_EVENT,
    MANUAL_SAVE_REQUEST_EVENT,
    GRADE_VAULT_REQUEST_EVENT,
    COURSE_SEATPLAN_SAVE_REQUEST_EVENT,
    COURSE_GRADE_CONFIG_REQUEST_EVENT,
    COURSE_GRADE_SAVE_REQUEST_EVENT,
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
    if (!window.parent || event.source !== window.parent) return;
    if (event.origin !== TRUSTED_PARENT_ORIGIN) return;
    const data = event?.data;
    if (!data || typeof data !== 'object') return;
    if (!ALLOWED_PARENT_MESSAGE_TYPES.has(data.type)) return;
    if (data.type === SHELL_LAYOUT_EVENT) {
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
      document.documentElement.dataset.shellCollapsed = detail && detail.collapsed ? 'true' : 'false';
      return;
    }
    if (data.type === VIEW_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(VIEW_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === TUTORIAL_COMMAND_EVENT) {
      const detail = data.detail && typeof data.detail === 'object' ? data.detail : {};
      const command = String(detail.command || '');
      const commandDetail = detail.detail && typeof detail.detail === 'object' ? detail.detail : {};
      if (command === 'activate') {
        withPlanningTutorialApi((api) => api.activate?.());
        return;
      }
      if (command === 'showSurface') {
        withPlanningTutorialApi((api) => api.showSurface?.(String(commandDetail.surface || '')));
        return;
      }
      if (command === 'cleanup') {
        withPlanningTutorialApi((api) => api.cleanup?.());
      }
      return;
    }
    if (data.type === MANUAL_SAVE_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(MANUAL_SAVE_REQUEST_EVENT));
      return;
    }
    if (data.type === GRADE_VAULT_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(GRADE_VAULT_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === COURSE_SEATPLAN_SAVE_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(COURSE_SEATPLAN_SAVE_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === COURSE_GRADE_CONFIG_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(COURSE_GRADE_CONFIG_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === COURSE_GRADE_SAVE_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(COURSE_GRADE_SAVE_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
    }
  });

  window.addEventListener(MANUAL_SAVE_STATE_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: MANUAL_SAVE_STATE_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(UNSAVED_STATE_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: UNSAVED_STATE_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(READY_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: READY_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(GRADE_VAULT_STATE_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: GRADE_VAULT_STATE_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(COURSE_SEATPLAN_OPEN_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: COURSE_SEATPLAN_OPEN_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(COURSE_SEATPLAN_SAVE_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: COURSE_SEATPLAN_SAVE_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(COURSE_GRADE_CONFIG_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: COURSE_GRADE_CONFIG_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(COURSE_GRADE_SAVE_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: COURSE_GRADE_SAVE_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });
})();
