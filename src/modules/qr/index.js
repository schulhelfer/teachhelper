import {
  CAMERA_MODULE_ALLOW,
  createModuleFrame,
  postToModule,
} from '../../shared/module-frame-bridge.js';

const QR_VERSION = 'qr-r4';
const QR_URL = new URL(`./app.html?v=${QR_VERSION}`, import.meta.url);

export function mountQr({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._qrController || null;

  host.textContent = '';

  const frame = createModuleFrame({
    className: 'qr-frame',
    loading: 'lazy',
    src: QR_URL,
    allow: CAMERA_MODULE_ALLOW,
  });

  let disposed = false;
  let ready = false;
  const pending = [];

  const flush = () => {
    if (disposed || !ready) return;
    while (pending.length) {
      postToModule(frame, pending.shift());
    }
  };

  const onFrameLoad = () => {
    if (disposed) return;
    ready = true;
    flush();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    pending.length = 0;
    frame.removeEventListener('load', onFrameLoad);
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._qrController === controller) {
      delete host._qrController;
    }
  };

  const post = (payload) => {
    if (disposed) return false;
    if (!ready || !frame.contentWindow) {
      pending.push(payload);
      return true;
    }
    return postToModule(frame, payload);
  };

  const controller = { frame, post, dispose };

  frame.addEventListener('load', onFrameLoad);
  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._qrController = controller;
  return host._qrController;
}
