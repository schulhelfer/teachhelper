(() => {
  const MANUAL_SAVE_STATE_EVENT = 'classroom:grades-manual-save-state';
  const MANUAL_SAVE_REQUEST_EVENT = 'classroom:grades-manual-save-request';
  const UNSAVED_STATE_EVENT = 'classroom:grades-unsaved-state';
  const TAB_LEAVE_REQUEST_EVENT = 'classroom:grades-tab-leave-request';
  const TAB_LEAVE_RESULT_EVENT = 'classroom:grades-tab-leave-result';
  const GRADE_VAULT_STATE_EVENT = 'classroom:grades-grade-vault-state';
  const GRADE_VAULT_REQUEST_EVENT = 'classroom:grades-grade-vault-request';
  const GRADE_VAULT_OVERLAY_EVENT = 'classroom:grades-grade-vault-overlay';
  const GRADE_VAULT_ACTIVITY_EVENT = 'classroom:grades-grade-vault-activity';
  const COURSE_SEATPLAN_OPEN_EVENT = 'classroom:grades-course-seatplan-open';
  const COURSE_SEATPLAN_SAVE_REQUEST_EVENT = 'classroom:grades-course-seatplan-save-request';
  const COURSE_SEATPLAN_SAVE_RESULT_EVENT = 'classroom:grades-course-seatplan-save-result';
  const COURSE_GRADE_CONFIG_REQUEST_EVENT = 'classroom:grades-course-grade-config-request';
  const COURSE_GRADE_CONFIG_RESULT_EVENT = 'classroom:grades-course-grade-config-result';
  const COURSE_GRADE_SAVE_REQUEST_EVENT = 'classroom:grades-course-grade-save-request';
  const COURSE_GRADE_SAVE_RESULT_EVENT = 'classroom:grades-course-grade-save-result';
  const GRADE_ROSTER_COURSES_REQUEST_EVENT = 'classroom:grades-grade-roster-courses-request';
  const GRADE_ROSTER_COURSES_RESULT_EVENT = 'classroom:grades-grade-roster-courses-result';
  const GRADE_ROSTER_IMPORT_REQUEST_EVENT = 'classroom:grades-grade-roster-import-request';
  const GRADE_ROSTER_IMPORT_RESULT_EVENT = 'classroom:grades-grade-roster-import-result';
  const NAME_LEARNING_DATA_REQUEST_EVENT = 'classroom:grades-name-learning-data-request';
  const NAME_LEARNING_DATA_RESULT_EVENT = 'classroom:grades-name-learning-data-result';
  const NAME_LEARNING_REVIEW_REQUEST_EVENT = 'classroom:grades-name-learning-review-request';
  const NAME_LEARNING_REVIEW_RESULT_EVENT = 'classroom:grades-name-learning-review-result';
  const NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT = 'classroom:grades-name-learning-course-visibility-request';
  const NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT = 'classroom:grades-name-learning-student-search-request';
  const NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT = 'classroom:grades-name-learning-student-search-result';
  const READY_EVENT = 'classroom:grades-ready';
  const SHELL_LAYOUT_EVENT = 'classroom:grades-shell-layout';
  const VIEW_REQUEST_EVENT = 'classroom:grades-view-request';
  const TUTORIAL_COMMAND_EVENT = 'classroom:grades-tutorial-command';
  const CONTEXT_MENU_DISMISS_EVENT = 'classroom:module-context-menu-dismiss';
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
  const ALLOWED_PARENT_MESSAGE_TYPES = new Set([
    SHELL_LAYOUT_EVENT,
    TAB_LEAVE_REQUEST_EVENT,
    VIEW_REQUEST_EVENT,
    TUTORIAL_COMMAND_EVENT,
    MANUAL_SAVE_REQUEST_EVENT,
    GRADE_VAULT_REQUEST_EVENT,
    COURSE_SEATPLAN_SAVE_REQUEST_EVENT,
    COURSE_GRADE_CONFIG_REQUEST_EVENT,
    COURSE_GRADE_SAVE_REQUEST_EVENT,
    GRADE_ROSTER_COURSES_REQUEST_EVENT,
    GRADE_ROSTER_IMPORT_REQUEST_EVENT,
    NAME_LEARNING_DATA_REQUEST_EVENT,
    NAME_LEARNING_REVIEW_REQUEST_EVENT,
    NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT,
    NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT,
    CONTEXT_MENU_DISMISS_EVENT,
  ]);

  function withGradesTutorialApi(callback, attempt = 0) {
    const api = window.__teachhelperGradesTutorial || null;
    if (api) {
      callback(api);
      return;
    }
    if (attempt >= 40) return;
    window.setTimeout(() => withGradesTutorialApi(callback, attempt + 1), 50);
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
    if (data.type === CONTEXT_MENU_DISMISS_EVENT) {
      window.dispatchEvent(new CustomEvent(CONTEXT_MENU_DISMISS_EVENT));
      return;
    }
    if (data.type === TAB_LEAVE_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(TAB_LEAVE_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
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
        withGradesTutorialApi((api) => api.activate?.());
        return;
      }
      if (command === 'showSurface') {
        withGradesTutorialApi((api) => api.showSurface?.(String(commandDetail.surface || '')));
        return;
      }
      if (command === 'cleanup') {
        withGradesTutorialApi((api) => api.cleanup?.());
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
      return;
    }
    if (data.type === GRADE_ROSTER_COURSES_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(GRADE_ROSTER_COURSES_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === GRADE_ROSTER_IMPORT_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(GRADE_ROSTER_IMPORT_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (
      data.type === NAME_LEARNING_DATA_REQUEST_EVENT
      || data.type === NAME_LEARNING_REVIEW_REQUEST_EVENT
      || data.type === NAME_LEARNING_COURSE_VISIBILITY_REQUEST_EVENT
      || data.type === NAME_LEARNING_STUDENT_SEARCH_REQUEST_EVENT
    ) {
      window.dispatchEvent(new CustomEvent(data.type, {
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

  window.addEventListener(TAB_LEAVE_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: TAB_LEAVE_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
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

  window.addEventListener(GRADE_VAULT_OVERLAY_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: GRADE_VAULT_OVERLAY_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(GRADE_ROSTER_COURSES_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: GRADE_ROSTER_COURSES_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(GRADE_ROSTER_IMPORT_RESULT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: GRADE_ROSTER_IMPORT_RESULT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });
})();

(() => {
  const NAVIGATE_EVENT = 'classroom:grades-navigate';
  const GRADE_VAULT_ACTIVITY_EVENT = 'classroom:grades-grade-vault-activity';
  const COURSE_CONTEXT_EVENT = 'classroom:grades-course-context';
  const NAME_LEARNING_DATA_RESULT_EVENT = 'classroom:grades-name-learning-data-result';
  const NAME_LEARNING_REVIEW_RESULT_EVENT = 'classroom:grades-name-learning-review-result';
  const NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT = 'classroom:grades-name-learning-student-search-result';
  const TRUSTED_PARENT_ORIGIN = window.location.origin;
  const pendingNavigations = [];
  let navigationFlushTimer = 0;
  let navigationPromise = Promise.resolve();

  function getGradesApi() {
    const api = window.__teachhelperGradesApp;
    return api && typeof api.navigate === 'function' ? api : null;
  }

  function flushNavigations() {
    navigationFlushTimer = 0;
    const api = getGradesApi();
    if (!api) {
      if (pendingNavigations.length) {
        navigationFlushTimer = window.setTimeout(flushNavigations, 50);
      }
      return;
    }
    while (pendingNavigations.length) {
      const detail = pendingNavigations.shift();
      navigationPromise = navigationPromise
        .then(() => api.navigate(detail))
        .catch((error) => console.error('[TeachHelper] Grades navigation failed.', error));
    }
  }

  window.addEventListener('message', (event) => {
    if (!window.parent || event.source !== window.parent || event.origin !== TRUSTED_PARENT_ORIGIN) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== NAVIGATE_EVENT) return;
    pendingNavigations.push(data.detail && typeof data.detail === 'object' ? data.detail : {});
    if (!navigationFlushTimer) flushNavigations();
  });
  [NAME_LEARNING_DATA_RESULT_EVENT, NAME_LEARNING_REVIEW_RESULT_EVENT, NAME_LEARNING_STUDENT_SEARCH_RESULT_EVENT].forEach((type) => {
    window.addEventListener(type, (event) => {
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage({ type, detail: event instanceof CustomEvent ? event.detail : null }, TRUSTED_PARENT_ORIGIN);
    });
  });

  window.addEventListener(GRADE_VAULT_ACTIVITY_EVENT, () => {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type: GRADE_VAULT_ACTIVITY_EVENT, detail: {} }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener(COURSE_CONTEXT_EVENT, (event) => {
    if (!window.parent || window.parent === window) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    window.parent.postMessage({ type: COURSE_CONTEXT_EVENT, detail }, TRUSTED_PARENT_ORIGIN);
  });

  window.addEventListener('classroom:grades-ready', flushNavigations);
})();
