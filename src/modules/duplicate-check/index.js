import { DUPLICATE_CHECK_SHELL_LAYOUT_EVENT } from '../../shell/tabs.js';

const DUPLICATE_CHECK_VERSION = 'duplicate-check-r3';
const DUPLICATE_CHECK_URL = new URL(`./app.html?v=${DUPLICATE_CHECK_VERSION}`, import.meta.url);

export function mountDuplicateCheck({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._duplicateCheckController || null;

  const targetOrigin = DUPLICATE_CHECK_URL.origin;
  host.textContent = '';

  const frame = document.createElement('iframe');
  frame.className = 'duplicate-check-frame';
  frame.loading = 'eager';
  frame.referrerPolicy = 'no-referrer';
  frame.src = DUPLICATE_CHECK_URL.href;

  let ready = false;
  let pendingShellLayout = null;
  let disposed = false;

  const applyShellLayout = (detail) => {
    if (disposed) return;
    if (!detail || typeof detail !== 'object') return;
    if (!ready || !frame.contentWindow) {
      pendingShellLayout = detail;
      return;
    }
    frame.contentWindow.postMessage({
      type: DUPLICATE_CHECK_SHELL_LAYOUT_EVENT,
      detail: {
        ...detail,
        theme: document.documentElement?.dataset?.theme === 'light' ? 'light' : 'dark',
      },
    }, targetOrigin);
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    applyShellLayout(pendingShellLayout || { collapsed: false });
    pendingShellLayout = null;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pendingShellLayout = null;
    frame.removeEventListener('load', onFrameLoad);
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._duplicateCheckController === controller) {
      delete host._duplicateCheckController;
    }
  };

  const controller = { frame, applyShellLayout, dispose };

  frame.addEventListener('load', onFrameLoad, { once: true });
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._duplicateCheckController = controller;
  return host._duplicateCheckController;
}
