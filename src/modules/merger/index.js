import { MERGER_SHELL_LAYOUT_EVENT } from '../../shell/tabs.js';

const MERGER_VERSION = 'merger-r11';
const MERGER_URL = new URL(`./app.html?v=${MERGER_VERSION}`, import.meta.url);

export function mountMerger({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._mergerController || null;

  const targetOrigin = MERGER_URL.origin;
  host.textContent = '';

  const frame = document.createElement('iframe');
  frame.className = 'merger-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = MERGER_URL.href;

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
      type: MERGER_SHELL_LAYOUT_EVENT,
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
    if (host._mergerController === controller) {
      delete host._mergerController;
    }
  };

  const controller = { frame, applyShellLayout, dispose };

  frame.addEventListener('load', onFrameLoad, { once: true });
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._mergerController = controller;
  return host._mergerController;
}
