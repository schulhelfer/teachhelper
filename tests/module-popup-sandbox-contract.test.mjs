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
  }
});

test('qr and merger delegate window opening to the shell instead of opening popups', async () => {
  const [qr, merger] = await Promise.all([
    read('../src/modules/qr/app.js'),
    read('../src/modules/merger/app.js'),
  ]);

  for (const [label, source] of [['qr', qr], ['merger', merger]]) {
    const opens = [...source.matchAll(/window\.open\(/g)];
    assert.equal(opens.length, 1, `${label}: genau ein window.open (Standalone-Fallback) erwartet`);
    const guarded = source.slice(Math.max(0, opens[0].index - 400), opens[0].index);
    assert.match(
      guarded,
      /!window\.parent \|\| window\.parent === window/,
      `${label}: window.open ist nicht durch den Standalone-Check abgesichert`,
    );
  }

  assert.match(qr, /MODULE_OPEN_EXTERNAL_REQUEST_EVENT/);
  assert.match(merger, /MERGER_OPEN_RESULT_REQUEST_EVENT/);
});

test('the shell revalidates module open requests instead of trusting the frame', async () => {
  const main = await read('../src/main.js');

  assert.match(
    main,
    /data\.type === MODULE_OPEN_EXTERNAL_REQUEST_EVENT\)\s*\{\s*if \(frame !== getQrFrame\(\)\) return;/,
  );
  assert.match(
    main,
    /data\.type === MERGER_OPEN_RESULT_REQUEST_EVENT\)\s*\{\s*if \(frame !== getMergerFrame\(\)\) return;/,
  );

  const externalHelper = main.match(/const openExternalUrlForModule = \([\s\S]*?\n  \};/)?.[0] || '';
  assert.match(externalHelper, /new URL\(/);
  assert.match(externalHelper, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/);

  const pdfHelper = main.match(/const openModuleResultPdf = \([\s\S]*?\n  \};/)?.[0] || '';
  assert.match(pdfHelper, /instanceof ArrayBuffer/);
  assert.match(pdfHelper, /FILE_LIMITS\.PDF_RESULT_OPEN_BYTES/);
  assert.match(pdfHelper, /type: 'application\/pdf'/);
});
