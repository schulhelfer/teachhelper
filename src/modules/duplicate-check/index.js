import {
  createModuleFrame,
  DUPLICATE_CHECK_MODULE_SANDBOX,
  postToModule,
} from '../../shared/module-frame-bridge.js';

const DUPLICATE_CHECK_VERSION = 'duplicate-check-r3';
const DUPLICATE_CHECK_URL = new URL(`./app.html?v=${DUPLICATE_CHECK_VERSION}`, import.meta.url);

export function mountDuplicateCheck({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._duplicateCheckController || null;

  host.textContent = '';

  const frame = createModuleFrame({
    className: 'duplicate-check-frame',
    loading: 'eager',
    src: DUPLICATE_CHECK_URL,
    sandbox: DUPLICATE_CHECK_MODULE_SANDBOX,
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
    if (host._duplicateCheckController === controller) {
      delete host._duplicateCheckController;
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
  host._duplicateCheckController = controller;
  return host._duplicateCheckController;
}
