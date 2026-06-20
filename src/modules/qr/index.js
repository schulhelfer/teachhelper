const QR_VERSION = 'qr-r4';
const QR_URL = new URL(`./app.html?v=${QR_VERSION}`, import.meta.url);

export function mountQr({ host }) {
  if (!host || host.dataset.initialized === '1') return host?._qrController || null;

  host.textContent = '';

  const frame = document.createElement('iframe');
  frame.className = 'qr-frame';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.src = QR_URL.href;

  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frame.isConnected) {
      frame.remove();
    }
    delete host.dataset.initialized;
    if (host._qrController === controller) {
      delete host._qrController;
    }
  };

  const controller = { frame, dispose };

  host.appendChild(frame);
  host.dataset.initialized = '1';
  host._qrController = controller;
  return host._qrController;
}
