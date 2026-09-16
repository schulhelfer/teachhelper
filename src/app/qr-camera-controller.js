import { createQrDecoder } from '../shared/qr-decode.js';

const JSQR_SCRIPT_URL = new URL('../modules/qr/vendor/jsQR.js', import.meta.url);
const DOT_REPAIR_INTERVAL_MS = 700;

function describeCameraError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Der Zugriff auf die Kamera wurde verweigert. Bitte die Berechtigung im Browser erlauben.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Es wurde keine passende Kamera gefunden.';
  }
  if (name === 'NotReadableError') {
    return 'Die Kamera wird bereits von einem anderen Programm verwendet.';
  }
  return error?.message || 'Die Kamera konnte nicht gestartet werden.';
}

export function createQrCameraController({
  documentRef: document,
  view: window,
  getHost,
  onResult,
  onState,
}) {
  const captureCanvas = document.createElement('canvas');
  const captureContext = captureCanvas.getContext('2d', { willReadFrequently: true });

  let decoderScriptPromise = null;
  let decoder = null;
  let stream = null;
  let video = null;
  let overlay = null;
  let scanFrame = 0;
  let active = false;
  let decodeBusy = false;
  let lastDotRepairAt = 0;

  function loadDecoderScript() {
    if (typeof window.jsQR === 'function') return Promise.resolve();
    if (decoderScriptPromise) return decoderScriptPromise;
    decoderScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSQR_SCRIPT_URL.href;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        decoderScriptPromise = null;
        reject(new Error('Der QR-Decoder konnte nicht geladen werden.'));
      };
      document.head.appendChild(script);
    });
    return decoderScriptPromise;
  }

  function buildOverlay() {
    const host = getHost();
    if (!host) return null;
    const layer = document.createElement('div');
    layer.className = 'qr-camera-overlay';
    const frame = document.createElement('div');
    frame.className = 'qr-camera-overlay-frame';
    video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', 'Kamerabild für den QR-Scan');
    const actions = document.createElement('div');
    actions.className = 'qr-camera-overlay-actions';
    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'qr-camera-overlay-stop';
    stopButton.textContent = 'Kamera stoppen';
    stopButton.addEventListener('click', () => {
      stop();
      onState?.({ active: false });
    });
    actions.appendChild(stopButton);
    frame.appendChild(video);
    frame.appendChild(actions);
    layer.appendChild(frame);
    host.appendChild(layer);
    overlay = layer;
    return layer;
  }

  function teardownOverlay() {
    if (video) {
      try {
        video.pause();
      } catch {

      }
      video.srcObject = null;
      video = null;
    }
    overlay?.remove();
    overlay = null;
  }

  function scanLoop() {
    if (!active || !video || !decoder) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width && height && !decodeBusy) {
      captureCanvas.width = width;
      captureCanvas.height = height;
      captureContext.drawImage(video, 0, 0, width, height);
      decodeBusy = true;
      const now = performance.now();
      const useDotRepair = now - lastDotRepairAt > DOT_REPAIR_INTERVAL_MS;
      if (useDotRepair) {
        lastDotRepairAt = now;
      }
      decoder.decodeCanvasContent(captureCanvas, {
        thorough: false,
        useNative: false,
        dotRepair: useDotRepair,
      }).then((code) => {
        if (!active || !code?.data) return;
        stop();
        onResult?.(code.data);
      }).catch(() => {}).finally(() => {
        decodeBusy = false;
      });
    }
    scanFrame = window.requestAnimationFrame(scanLoop);
  }

  async function start() {
    if (active) return;
    const mediaDevices = window.navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      onState?.({ active: false, supported: false, error: 'Kamera-Zugriff wird von diesem Browser nicht unterstützt.' });
      return;
    }
    if (!getHost()) {
      onState?.({ active: false, error: 'Die Kameraansicht konnte nicht geöffnet werden.' });
      return;
    }
    active = true;
    try {
      await loadDecoderScript();
      if (!active) return;
      decoder = decoder || createQrDecoder({ root: document, getDecoder: () => window.jsQR });
      stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
        return;
      }
      if (!buildOverlay()) {
        throw new Error('Die Kameraansicht konnte nicht geöffnet werden.');
      }
      video.srcObject = stream;
      await video.play();
      if (!active) return;
      lastDotRepairAt = 0;
      decodeBusy = false;
      scanFrame = window.requestAnimationFrame(scanLoop);
      onState?.({ active: true, supported: true });
    } catch (error) {
      stop();
      onState?.({ active: false, error: describeCameraError(error) });
    }
  }

  function stop() {
    active = false;
    decodeBusy = false;
    lastDotRepairAt = 0;
    if (scanFrame) {
      window.cancelAnimationFrame(scanFrame);
      scanFrame = 0;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    teardownOverlay();
  }

  return {
    start,
    stop,
    isActive: () => active,
    dispose: stop,
  };
}
