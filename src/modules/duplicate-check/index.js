const DUPLICATE_CHECK_VERSION = 'duplicate-check-r3';
const DUPLICATE_CHECK_URL = new URL(`./app.html?v=${DUPLICATE_CHECK_VERSION}`, import.meta.url);

export function mountDuplicateCheck({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._duplicateCheckController || null;

  host.textContent = '';

  const frame = document.createElement('iframe');
  frame.className = 'duplicate-check-frame';
  frame.loading = 'eager';
  frame.referrerPolicy = 'no-referrer';
  frame.src = DUPLICATE_CHECK_URL.href;

  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._duplicateCheckController === controller) {
      delete host._duplicateCheckController;
    }
  };

  const controller = { frame, dispose };

  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._duplicateCheckController = controller;
  return host._duplicateCheckController;
}
