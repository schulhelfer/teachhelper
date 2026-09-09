import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PARENT_ORIGIN = 'http://127.0.0.1:5500';

let bridgePromise = null;
function loadBridge() {
  if (!bridgePromise) {
    bridgePromise = readFile(new URL('../src/shared/module-frame-bridge.js', import.meta.url), 'utf8')
      .then((source) => import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`));
  }
  return bridgePromise;
}

function withDom(run) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const sent = [];
  const makeFrame = ({ childOrigin, sandbox = '', crossOrigin = false }) => {
    const frame = {
      dataset: {},
      attributes: new Map(),
      getAttribute(name) {
        return this.attributes.get(name) ?? null;
      },
      setAttribute(name, value) {
        this.attributes.set(name, String(value));
      },
      contentWindow: {
        get origin() {
          if (crossOrigin) {
            const error = new Error('blocked');
            error.name = 'SecurityError';
            throw error;
          }
          return childOrigin;
        },
        postMessage(message, targetOrigin) {
          sent.push({ message, targetOrigin });
        },
      },
    };
    frame.setAttribute('src', `${PARENT_ORIGIN}/src/modules/grades/app.html`);
    if (sandbox) frame.setAttribute('sandbox', sandbox);
    return frame;
  };
  globalThis.window = { origin: PARENT_ORIGIN, location: { origin: PARENT_ORIGIN, href: `${PARENT_ORIGIN}/index.html` } };
  globalThis.document = { documentElement: { dataset: {} }, createElement: () => makeFrame({ childOrigin: PARENT_ORIGIN }) };
  try {
    return run({ makeFrame, sent });
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
}

test('ein Frame mit opaker Kind-Origin wird erkannt und per "*" beliefert', async () => {
  const bridge = await loadBridge();
  withDom(({ makeFrame, sent }) => {
    const frame = makeFrame({ childOrigin: 'null' });
    frame.dataset.moduleFrameNonce = 'abc';

    assert.equal(bridge.isOpaqueOriginModuleFrame(frame), true);
    assert.equal(bridge.postToModule(frame, { type: 'shell-layout' }), true);
    assert.equal(sent.at(-1).targetOrigin, '*');
    assert.equal(sent.at(-1).message.frameNonce, 'abc');
  });
});

test('ein gleichursprünglicher Frame behält die strikte Ziel-Origin', async () => {
  const bridge = await loadBridge();
  withDom(({ makeFrame, sent }) => {
    const frame = makeFrame({ childOrigin: PARENT_ORIGIN });

    assert.equal(bridge.isOpaqueOriginModuleFrame(frame), false);
    assert.equal(bridge.postToModule(frame, { type: 'shell-layout' }), true);
    assert.equal(sent.at(-1).targetOrigin, PARENT_ORIGIN);
  });
});

test('ein cross-origin Frame wird nicht faelschlich als opaque eingestuft', async () => {
  const bridge = await loadBridge();
  withDom(({ makeFrame, sent }) => {
    const frame = makeFrame({ childOrigin: 'https://example.com', crossOrigin: true });

    assert.equal(bridge.isOpaqueOriginModuleFrame(frame), false);
    assert.equal(bridge.postToModule(frame, { type: 'shell-layout' }), true);
    assert.equal(sent.at(-1).targetOrigin, PARENT_ORIGIN);
  });
});

test('jeder Modulrahmen erhaelt einen Nonce, damit der opake Rueckkanal vertrauenswuerdig bleibt', async () => {
  const bridge = await loadBridge();
  withDom(({ makeFrame }) => {
    const frame = makeFrame({ childOrigin: 'null' });
    frame.dataset.moduleFrameNonce = 'abc';

    const trusted = bridge.isTrustedModuleMessage(
      { source: frame.contentWindow, origin: 'null', data: { type: 'ready', frameNonce: 'abc' } },
      frame,
    );
    assert.equal(trusted, true);

    const forged = bridge.isTrustedModuleMessage(
      { source: frame.contentWindow, origin: 'null', data: { type: 'ready', frameNonce: 'wrong' } },
      frame,
    );
    assert.equal(forged, false);
  });
});
