import { QR_SHELL_LAYOUT_EVENT } from '../../shell/tabs.js';

const QR_VERSION = 'qr-r4';
const QR_URL = new URL(`./app.html?v=${QR_VERSION}`, import.meta.url);

export function mountQr({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._qrController || null;

  const targetOrigin = QR_URL.origin;
  host.textContent = '';

  const frame = document.createElement('iframe');
  frame.className = 'qr-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = QR_URL.href;

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
      type: QR_SHELL_LAYOUT_EVENT,
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
    if (host._qrController === controller) {
      delete host._qrController;
    }
  };

  const controller = { frame, applyShellLayout, dispose };

  frame.addEventListener('load', onFrameLoad, { once: true });
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._qrController = controller;
  return host._qrController;
}
