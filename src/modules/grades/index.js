import {
  GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT,
  GRADES_COURSE_GRADE_SAVE_RESULT_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  GRADES_GRADE_VAULT_OVERLAY_EVENT,
  GRADES_GRADE_VAULT_STATE_EVENT,
  GRADES_MANUAL_SAVE_STATE_EVENT,
  GRADES_NAVIGATE_EVENT,
  GRADES_READY_EVENT,
  GRADES_SHELL_LAYOUT_EVENT,
  GRADES_TUTORIAL_START_REQUEST_EVENT,
  GRADES_UNSAVED_STATE_EVENT,
  GRADES_VIEW_REQUEST_EVENT,
  PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT,
  PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT,
  PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
  PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT,
  PLANNING_GRADE_ROSTER_COURSES_RESULT_EVENT,
  PLANNING_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  PLANNING_GRADE_VAULT_OVERLAY_EVENT,
  PLANNING_GRADE_VAULT_STATE_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_TUTORIAL_START_REQUEST_EVENT,
  PLANNING_UNSAVED_STATE_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
} from '../../shell/tabs.js';
import {
  PLANNING_MODULE_ALLOW,
  createModuleFrame,
  isTrustedModuleMessage,
  postToModule,
} from '../../shared/module-frame-bridge.js';

const GRADES_URL = new URL('./app.html', import.meta.url);

const CHILD_TO_PARENT_EVENT = new Map([
  [PLANNING_MANUAL_SAVE_STATE_EVENT, GRADES_MANUAL_SAVE_STATE_EVENT],
  [PLANNING_UNSAVED_STATE_EVENT, GRADES_UNSAVED_STATE_EVENT],
  [PLANNING_VIEW_REQUEST_EVENT, GRADES_VIEW_REQUEST_EVENT],
  [PLANNING_TUTORIAL_START_REQUEST_EVENT, GRADES_TUTORIAL_START_REQUEST_EVENT],
  [PLANNING_READY_EVENT, GRADES_READY_EVENT],
  [PLANNING_GRADE_VAULT_STATE_EVENT, GRADES_GRADE_VAULT_STATE_EVENT],
  [PLANNING_GRADE_VAULT_OVERLAY_EVENT, GRADES_GRADE_VAULT_OVERLAY_EVENT],
  [PLANNING_COURSE_GRADE_CONFIG_RESULT_EVENT, GRADES_COURSE_GRADE_CONFIG_RESULT_EVENT],
  [PLANNING_COURSE_GRADE_SAVE_RESULT_EVENT, GRADES_COURSE_GRADE_SAVE_RESULT_EVENT],
  [PLANNING_COURSE_SEATPLAN_OPEN_EVENT, PLANNING_COURSE_SEATPLAN_OPEN_EVENT],
  [PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT, PLANNING_COURSE_SEATPLAN_SAVE_RESULT_EVENT],
  [PLANNING_GRADE_ROSTER_COURSES_RESULT_EVENT, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT],
  [PLANNING_GRADE_ROSTER_IMPORT_RESULT_EVENT, GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT],
]);

function normalizeNavigation(detail = {}) {
  const source = detail && typeof detail === 'object' ? detail : {};
  const subview = source.subview === 'entry' || source.gradesSubview === 'entry'
    ? 'entry'
    : 'overview';
  return {
    ...source,
    view: 'grades',
    subview,
    gradesSubview: subview,
  };
}

export function mountGrades({ host } = {}) {
  if (!host) return null;
  if (host.dataset.initialized === '1') {
    return host._gradesController || null;
  }

  host.textContent = '';
  const frame = createModuleFrame({
    className: 'grades-frame',
    loading: 'lazy',
    src: GRADES_URL,
    title: 'Noten',
    allow: PLANNING_MODULE_ALLOW,
  });

  const pending = [];
  let ready = false;
  let pendingShellLayout = null;
  let disposed = false;

  const post = (type, detail = null) => {
    if (disposed || typeof type !== 'string' || !type) return false;
    const payload = { type, detail };
    if (!ready || !frame.contentWindow) {
      pending.push(payload);
      return true;
    }
    return postToModule(frame, payload);
  };

  const navigate = (detail = {}) => post(
    GRADES_NAVIGATE_EVENT,
    normalizeNavigation(detail),
  );

  const applyShellLayout = (detail) => {
    if (disposed || !detail || typeof detail !== 'object') return false;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return true;
    }
    return postToModule(frame, {
      type: GRADES_SHELL_LAYOUT_EVENT,
      detail,
    });
  };

  const flush = () => {
    if (disposed || !ready) return;
    while (pending.length) {
      const next = pending.shift();
      postToModule(frame, next);
    }
    if (pendingShellLayout) {
      const detail = pendingShellLayout;
      pendingShellLayout = null;
      applyShellLayout(detail);
    }
  };

  const onWindowMessage = (event) => {
    if (disposed || !isTrustedModuleMessage(event, frame)) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    const parentEventType = CHILD_TO_PARENT_EVENT.get(data.type);
    if (!parentEventType) return;
    window.dispatchEvent(new CustomEvent(parentEventType, {
      detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
    }));
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    flush();
  };

  let controller = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pending.length = 0;
    pendingShellLayout = null;
    frame.removeEventListener('load', onFrameLoad);
    window.removeEventListener('message', onWindowMessage);
    if (frame.isConnected) frame.remove();
    delete host.dataset.initialized;
    if (host._gradesController === controller) {
      delete host._gradesController;
    }
  };

  controller = {
    frame,
    post,
    navigate,
    applyShellLayout,
    dispose,
  };

  frame.addEventListener('load', onFrameLoad, { once: true });
  window.addEventListener('message', onWindowMessage);
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._gradesController = controller;
  return controller;
}
