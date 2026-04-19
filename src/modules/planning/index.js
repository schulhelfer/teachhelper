import {
  PLANNING_GRADE_VAULT_REQUEST_EVENT,
  PLANNING_GRADE_VAULT_STATE_EVENT,
  PLANNING_MANUAL_SAVE_REQUEST_EVENT,
  PLANNING_MANUAL_SAVE_STATE_EVENT,
  PLANNING_READY_EVENT,
  PLANNING_SHELL_LAYOUT_EVENT,
  PLANNING_VIEW_REQUEST_EVENT,
} from '../../shell/tabs.js';

const PLANNING_URL = new URL('./app.html', import.meta.url);

export function mountPlanning({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._planningController || null;

  const targetOrigin = PLANNING_URL.origin;
  host.textContent = '';
  const frame = document.createElement('iframe');
  frame.className = 'planning-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = PLANNING_URL.href;

  const pending = [];
  let ready = false;
  let pendingShellLayout = null;
  let disposed = false;

  const post = (type, detail = null) => {
    if (disposed) return;
    const payload = { type, detail };
    if (!ready || !frame.contentWindow) {
      pending.push(payload);
      return;
    }
    frame.contentWindow.postMessage(payload, targetOrigin);
  };

  const applyShellLayout = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    frame.contentWindow.postMessage({ type: PLANNING_SHELL_LAYOUT_EVENT, detail }, targetOrigin);
  };

  const flush = () => {
    if (disposed) return;
    while (pending.length) {
      const next = pending.shift();
      frame.contentWindow?.postMessage(next, targetOrigin);
    }
  };

  const onWindowMessage = (event) => {
    if (disposed) return;
    if (event.source !== frame.contentWindow) return;
    if (event.origin !== targetOrigin) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === PLANNING_MANUAL_SAVE_STATE_EVENT) {
      window.dispatchEvent(new CustomEvent(PLANNING_MANUAL_SAVE_STATE_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === PLANNING_VIEW_REQUEST_EVENT) {
      window.dispatchEvent(new CustomEvent(PLANNING_VIEW_REQUEST_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === PLANNING_READY_EVENT) {
      window.dispatchEvent(new CustomEvent(PLANNING_READY_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
      return;
    }
    if (data.type === PLANNING_GRADE_VAULT_STATE_EVENT) {
      window.dispatchEvent(new CustomEvent(PLANNING_GRADE_VAULT_STATE_EVENT, {
        detail: data.detail && typeof data.detail === 'object' ? data.detail : null,
      }));
    }
  };

  const onViewRequest = (event) => {
    if (disposed) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (detail && typeof detail === 'object' && detail.source === 'iframe') {
      return;
    }
    post(PLANNING_VIEW_REQUEST_EVENT, detail && typeof detail === 'object' ? detail : null);
  };

  const onSaveRequest = () => {
    if (disposed) return;
    post(PLANNING_MANUAL_SAVE_REQUEST_EVENT, null);
  };

  const onGradeVaultRequest = (event) => {
    if (disposed) return;
    const detail = event instanceof CustomEvent ? event.detail : null;
    post(PLANNING_GRADE_VAULT_REQUEST_EVENT, detail && typeof detail === 'object' ? detail : null);
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    flush();
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
    pendingShellLayout = null;
    frame.removeEventListener('load', onFrameLoad);
    window.removeEventListener('message', onWindowMessage);
    window.removeEventListener(PLANNING_VIEW_REQUEST_EVENT, onViewRequest);
    window.removeEventListener(PLANNING_MANUAL_SAVE_REQUEST_EVENT, onSaveRequest);
    window.removeEventListener(PLANNING_GRADE_VAULT_REQUEST_EVENT, onGradeVaultRequest);
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._planningController === controller) {
      delete host._planningController;
    }
  };

  const controller = { frame, post, applyShellLayout, dispose };

  frame.addEventListener('load', onFrameLoad, { once: true });
  window.addEventListener('message', onWindowMessage);
  window.addEventListener(PLANNING_VIEW_REQUEST_EVENT, onViewRequest);
  window.addEventListener(PLANNING_MANUAL_SAVE_REQUEST_EVENT, onSaveRequest);
  window.addEventListener(PLANNING_GRADE_VAULT_REQUEST_EVENT, onGradeVaultRequest);

  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._planningController = controller;
  return host._planningController;
}
