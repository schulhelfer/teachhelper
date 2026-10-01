import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('sandboxed tool modules never receive popup permissions', async () => {
  const bridge = await read('../src/shared/module-frame-bridge.js');

  for (const name of ['ISOLATED', 'MERGER', 'DUPLICATE_CHECK', 'QR']) {
    const match = bridge.match(new RegExp(`${name}_MODULE_SANDBOX = '([^']*)'`));
    assert.ok(match, `${name}_MODULE_SANDBOX fehlt`);
    const tokens = match[1].split(/\s+/).filter(Boolean);
    assert.ok(
      !tokens.includes('allow-popups') && !tokens.includes('allow-popups-to-escape-sandbox'),
      `${name}_MODULE_SANDBOX darf keine Popups erlauben: ${match[1]}`,
    );
    assert.ok(!tokens.includes('allow-same-origin'), `${name}_MODULE_SANDBOX muss opaque bleiben`);
    assert.ok(!tokens.includes('allow-modals'), `${name}_MODULE_SANDBOX darf keine Druckdialoge öffnen`);
  }
});

test('qr delegates window opening to the shell and merger never opens popups', async () => {
  const [qr, merger] = await Promise.all([
    read('../src/modules/qr/app.js'),
    read('../src/modules/merger/app.js'),
  ]);

  const opens = [...qr.matchAll(/window\.open\(/g)];
  assert.equal(opens.length, 1, 'qr: genau ein window.open (Standalone-Fallback) erwartet');
  const guarded = qr.slice(Math.max(0, opens[0].index - 400), opens[0].index);
  assert.match(
    guarded,
    /!window\.parent \|\| window\.parent === window/,
    'qr: window.open ist nicht durch den Standalone-Check abgesichert',
  );

  assert.match(qr, /MODULE_OPEN_EXTERNAL_REQUEST_EVENT/);
  assert.doesNotMatch(merger, /window\.open\(/);
  assert.doesNotMatch(merger, /MERGER_OPEN_RESULT_REQUEST_EVENT/);
});

test('the shell revalidates module open requests instead of trusting the frame', async () => {
  const [main, router] = await Promise.all([
    read('../src/app/iframe-module-shell-bindings.js'),
    read('../src/app/module-message-router.js'),
  ]);

  assert.match(
    router,
    /data\.type === MODULE_OPEN_EXTERNAL_REQUEST_EVENT\) \{\s*if \(role !== 'qr'\) return false;/,
  );
  assert.match(main, /onOpenExternalRequest: \(detail\) => \{\s*openExternalUrlForModule\(detail\?\.url\);/);
  assert.doesNotMatch(main, /openModuleResultPdf/);
  assert.doesNotMatch(router, /MERGER_OPEN_RESULT_REQUEST_EVENT/);
  assert.match(router, /data\.type === MERGER_PRINT_RESULT_REQUEST_EVENT\) \{\s*if \(role !== 'merger'\) return false;/);
  assert.match(main, /onMergerPrintResultRequest: \(detail\) => \{\s*printModuleResult\(detail\);/);

  const externalHelper = main.match(/const openExternalUrlForModule = \([\s\S]*?\n  \};/)?.[0] || '';
  assert.match(externalHelper, /new URL\(/);
  assert.match(externalHelper, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/);
});
