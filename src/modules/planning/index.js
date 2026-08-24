import {
  PLANNING_COURSE_CONTEXT_EVENT,
  PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
  PLANNING_MANUAL_SAVE_REQUEST_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_SHELL_LAYOUT_EVENT,
  PLANNING_TAB_LEAVE_REQUEST_EVENT,
  PLANNING_TAB_LEAVE_RESULT_EVENT,
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
import { WORKSPACE_GLOBAL_KEY } from '../workspace/index.js';

const PLANNING_URL = new URL('./app.html', import.meta.url);
const FORWARDED_FRAME_EVENTS = new Set([
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_UNSAVED_STATE_EVENT,
  PLANNING_TAB_LEAVE_RESULT_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
  PLANNING_TUTORIAL_START_REQUEST_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
  PLANNING_COURSE_CONTEXT_EVENT,
]);

export function mountPlanning({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._planningController || null;

  host.textContent = '';
  const frame = createModuleFrame({
    className: 'planning-frame',
    loading: 'lazy',
    src: PLANNING_URL,
    allow: PLANNING_MODULE_ALLOW,
  });
  const pending = [];
  let pendingShellLayout = null;
  let ready = false;
  let disposed = false;
  let unregisterWorkspaceMessageSource = null;

  const registerWorkspaceMessageSource = () => {
    unregisterWorkspaceMessageSource?.();
    unregisterWorkspaceMessageSource = window[WORKSPACE_GLOBAL_KEY]
      ?.registerMessageSource?.(frame.contentWindow, 'planning') || null;
  };

  const post = (type, detail = null) => {
    if (disposed) return;
    const payload = { type, detail };
    if (!ready || !frame.contentWindow) {
      pending.push(payload);
      return;
    }
    postToModule(frame, payload);
  };

  const applyShellLayout = (detail) => {
    if (disposed || !detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    postToModule(frame, { type: PLANNING_SHELL_LAYOUT_EVENT, detail });
  };

  const requestTabLeave = (detail = {}) => post(
    PLANNING_TAB_LEAVE_REQUEST_EVENT,
    detail && typeof detail === 'object' ? detail : {},
  );

  const onWindowMessage = (event) => {
    if (disposed || !isTrustedModuleMessage(event, frame)) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !FORWARDED_FRAME_EVENTS.has(data.type)) return;
    window.dispatchEvent(new CustomEvent(data.type, {
      detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
    }));
  };

  const onViewRequest = (event) => {
    if (disposed) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (detail?.source === 'iframe') return;
    post(PLANNING_VIEW_REQUEST_EVENT, detail && typeof detail === 'object' ? detail : null);
  };
  const onSaveRequest = () => post(PLANNING_MANUAL_SAVE_REQUEST_EVENT, null);
  const onFrameLoad = () => {
    if (disposed) return;
    registerWorkspaceMessageSource();
    ready = true;
    while (pending.length) postToModule(frame, pending.shift());
    if (pendingShellLayout) {
      applyShellLayout(pendingShellLayout);
      pendingShellLayout = null;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pending.length = 0;
    unregisterWorkspaceMessageSource?.();
    unregisterWorkspaceMessageSource = null;
    frame.removeEventListener('load', onFrameLoad);
    window.removeEventListener('message', onWindowMessage);
    window.removeEventListener(PLANNING_VIEW_REQUEST_EVENT, onViewRequest);
    window.removeEventListener(PLANNING_MANUAL_SAVE_REQUEST_EVENT, onSaveRequest);
    frame.remove();
    delete host.dataset.initialized;
    if (host._planningController === controller) delete host._planningController;
  };

  const controller = { frame, post, requestTabLeave, applyShellLayout, dispose };
  frame.addEventListener('load', onFrameLoad, { once: true });
  window.addEventListener('message', onWindowMessage);
  window.addEventListener(PLANNING_VIEW_REQUEST_EVENT, onViewRequest);
  window.addEventListener(PLANNING_MANUAL_SAVE_REQUEST_EVENT, onSaveRequest);
  host.appendChild(frame);
  registerWorkspaceMessageSource();
  host.dataset.initialized = '1';
  host._planningController = controller;
  return controller;
}
