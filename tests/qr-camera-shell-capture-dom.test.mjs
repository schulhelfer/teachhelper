import test from 'node:test';
import assert from 'node:assert/strict';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('the shell camera controller decodes a QR frame and reports it to the module', async (t) => {
  const evaluate = await openDomBrowser(t);

  const result = await evaluate(async () => {
    const [{ createQrCameraController }, { createQrDecoder }] = await Promise.all([
      import('/src/app/qr-camera-controller.js'),
      import('/src/shared/qr-decode.js'),
    ]);

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/src/modules/qr/vendor/qrcode.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('qrcode vendor failed'));
      document.head.appendChild(script);
    });

    const payload = 'https://www.tagesschau.de/';
    const generated = document.createElement('canvas');
    document.body.appendChild(generated);
    await window.QRCode.toCanvas(generated, payload, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000ff', light: '#ffffffff' },
    });

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 640;
    sourceCanvas.height = 640;
    const sourceContext = sourceCanvas.getContext('2d');
    sourceContext.fillStyle = '#ffffff';
    sourceContext.fillRect(0, 0, 640, 640);
    sourceContext.drawImage(generated, 160, 160, 320, 320);

    const host = document.createElement('div');
    host.className = 'qr-host';
    document.body.appendChild(host);

    const decoderCheck = createQrDecoder({ root: document, getDecoder: () => window.jsQR });

    const stream = sourceCanvas.captureStream(30);
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
    let requestedConstraints = null;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (constraints) => {
          requestedConstraints = constraints;
          return stream;
        },
      },
    });

    const states = [];
    const decoded = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout; states=${JSON.stringify(states)}`)), 12000);
      const controller = createQrCameraController({
        documentRef: document,
        view: window,
        getHost: () => host,
        onResult: (value) => {
          clearTimeout(timer);
          resolve({
            value,
            overlayGoneAfterResult: !document.querySelector('.qr-camera-overlay'),
            tracksStopped: stream.getTracks().every((track) => track.readyState === 'ended'),
            stillActive: controller.isActive(),
          });
        },
        onState: (state) => states.push(state),
      });
      controller.start();
    });

    if (originalGetUserMedia) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: originalGetUserMedia },
      });
    }

    return {
      ...decoded,
      payload,
      states,
      facingMode: requestedConstraints?.video?.facingMode,
      decoderExposesApi: typeof decoderCheck.decodeCanvasContent === 'function',
    };
  });

  assert.equal(result.value, result.payload, 'der dekodierte Wert stammt aus dem Kamerabild');
  assert.equal(result.facingMode, 'environment', 'die Rückkamera wird angefragt');
  assert.equal(result.decoderExposesApi, true);
  assert.deepEqual(result.states[0], { active: true, supported: true }, 'der Start wird gemeldet');
  assert.equal(result.stillActive, false, 'der Scan endet nach dem Treffer');
  assert.equal(result.tracksStopped, true, 'die Kamera wird nach dem Treffer freigegeben');
  assert.equal(result.overlayGoneAfterResult, true, 'das Overlay wird entfernt');
});
