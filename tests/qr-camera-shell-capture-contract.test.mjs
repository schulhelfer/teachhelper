import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

test('qr module never requests camera access from its opaque origin frame', async () => {
  const source = await read('../src/modules/qr/app.js');
  assert.doesNotMatch(source, /getUserMedia/, 'QR-Frame darf keine Kamera anfordern');
  assert.doesNotMatch(source, /mediaDevices/, 'QR-Frame darf mediaDevices nicht verwenden');
  assert.doesNotMatch(source, /cameraVideo/, 'Das Kamerabild liegt nicht mehr im Frame');
});

test('qr module delegates camera start and stop to the shell', async () => {
  const source = await read('../src/modules/qr/app.js');
  assert.match(source, /QR_CAMERA_REQUEST_EVENT/);
  assert.match(source, /QR_CAMERA_STATE_EVENT/);
  assert.match(source, /QR_CAMERA_RESULT_EVENT/);
  assert.match(
    source,
    /type: QR_CAMERA_REQUEST_EVENT,\s*detail: \{ source: 'iframe', action \}/,
    'Kamera-Anfragen laufen über den Parent'
  );
});

test('qr module frame stays on an opaque sandbox origin', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');
  const match = bridge.match(/QR_MODULE_SANDBOX\s*=\s*'(?<tokens>[^']*)'/);
  assert.ok(match, 'QR_MODULE_SANDBOX fehlt');
  assert.ok(
    !match.groups.tokens.split(/\s+/).includes('allow-same-origin'),
    'QR_MODULE_SANDBOX muss opaque bleiben'
  );
});

test('shell camera controller owns the stream and releases every track', async () => {
  const controller = await read('../src/app/qr-camera-controller.js');
  assert.match(controller, /navigator\?\.mediaDevices/);
  assert.match(controller, /getUserMedia\(\{/);
  assert.match(controller, /facingMode: 'environment'/);
  assert.match(controller, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(controller, /createQrDecoder/);
});

test('router accepts camera requests only from the qr frame', async () => {
  const router = await read('../src/app/module-message-router.js');
  assert.match(
    router,
    /data\.type === QR_CAMERA_REQUEST_EVENT\) \{\s*if \(role !== 'qr'\) return false;/,
    'Kamera-Anfragen sind an die QR-Rolle gebunden'
  );
});

test('shell coordinator stops the camera when the qr tab is left', async () => {
  const coordinator = await read('../src/app/module-shell-coordinator.js');
  assert.match(coordinator, /createQrCameraController/);
  assert.match(coordinator, /app-tab-qr/);
  assert.match(coordinator, /qrCameraController\?\.dispose\?\.\(\)/);
});
