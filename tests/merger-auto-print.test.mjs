import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/modules/merger/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/modules/merger/app.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`\\n\\s*(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  const start = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (!depth) return source.slice(match.index, index + 1);
  }
  throw new Error(name);
}

function createDelivery({ checked = true, shareResult = { handled: false }, zipFailure = false } = {}) {
  const downloads = [];
  const messages = [];
  const dialogs = [];
  const toasts = [];
  const blobs = [];
  class Archive {
    file() {}
    async generateAsync() {
      if (zipFailure) throw new Error('ZIP fehlgeschlagen');
      return new Uint8Array([1, 2]);
    }
  }
  const context = {
    Blob,
    ui: { autoPrintToggle: { checked } },
    MERGER_PRINT_RESULT_REQUEST_EVENT: 'classroom:merger-print-result-request',
    TRUSTED_PARENT_ORIGIN: 'https://teachhelper.test',
    withModuleFrameNonce: (payload) => ({ ...payload, frameNonce: 'nonce' }),
    window: { parent: { postMessage: (...args) => messages.push(args) } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:output'; }, revokeObjectURL() {} },
    setTimeout() {},
    triggerDownload: (...args) => downloads.push(args),
    showResultToast: (...args) => toasts.push(args),
    showResultDialog: (...args) => dialogs.push(args),
    tryShareMergedPdfOnIOS: async () => shareResult,
    ensureJsZipLoaded: async () => Archive,
    runPdfOperation: async (action) => action(),
  };
  vm.runInNewContext(['requestResultPrint', 'deliverSinglePdf', 'deliverMultiplePdfs'].map(extractFunction).join('\n'), context);
  return { ...context, downloads, messages, dialogs, toasts, blobs };
}

test('automatischer Druck steht standardmäßig in der gemeinsamen Sidebar und wird nicht gespeichert', () => {
  const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  assert.match(sidebar, /id="autoPrintToggle" type="checkbox" checked/);
  assert.match(sidebar, /Automatisch Drucken/);
  assert.doesNotMatch(extractFunction('setActiveTool'), /autoPrintToggle/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)/);
  for (const handler of ['handleLayoutStart', 'handleMergeStart', 'handleRotateStart', 'handleSplitStart']) {
    assert.match(extractFunction(handler), /await deliverSinglePdf\(/);
  }
});

test('einzelne PDF wird einmal heruntergeladen und mit einer unveränderten Datenkopie zum Druck gesendet', async () => {
  const delivery = createDelivery();
  const bytes = new Uint8Array([0, 10, 20, 30]).subarray(1, 3);
  await delivery.deliverSinglePdf(bytes, 'Test.pdf', 'PDF erstellt.');
  assert.equal(delivery.downloads.length, 1);
  assert.equal(delivery.toasts.length, 1);
  assert.equal(delivery.dialogs.length, 0);
  assert.equal(delivery.messages.length, 1);
  const [message, origin, transfers] = delivery.messages[0];
  assert.equal(message.type, 'classroom:merger-print-result-request');
  assert.equal(message.frameNonce, 'nonce');
  assert.equal(origin, 'https://teachhelper.test');
  assert.equal(message.detail.outputs[0].name, 'Test.pdf');
  assert.deepEqual(new Uint8Array(message.detail.outputs[0].bytes), bytes);
  assert.notEqual(message.detail.outputs[0].bytes, bytes.buffer);
  assert.equal(transfers[0], message.detail.outputs[0].bytes);
  assert.deepEqual(new Uint8Array(await delivery.blobs[0].arrayBuffer()), bytes);
});

test('ausgeschalteter Druck verändert Download und Erfolgstoast nicht', async () => {
  const delivery = createDelivery({ checked: false });
  await delivery.deliverSinglePdf(new Uint8Array([1]), 'Test.pdf', 'PDF erstellt.');
  assert.equal(delivery.downloads.length, 1);
  assert.equal(delivery.toasts.length, 1);
  assert.equal(delivery.messages.length, 0);
});

test('ZIP sendet alle PDFs in Ausgabereihenfolge als einen Druckauftrag', async () => {
  const delivery = createDelivery();
  const outputs = [
    { bytes: new Uint8Array([1]), name: 'Teil-1.pdf' },
    { bytes: new Uint8Array([2]), name: 'Teil-2.pdf' },
  ];
  await delivery.deliverMultiplePdfs(outputs, 'Test.zip');
  assert.equal(delivery.downloads.length, 1);
  assert.equal(delivery.downloads[0][1], 'Test.zip');
  assert.equal(delivery.messages.length, 1);
  assert.deepEqual(Array.from(delivery.messages[0][0].detail.outputs, ({ name }) => name), outputs.map(({ name }) => name));
  assert.equal(delivery.toasts.length, 1);
});

test('erfolgreiches iOS-Teilen druckt, Abbruch und ZIP-Fehler drucken nicht', async () => {
  const shared = createDelivery({ shareResult: { handled: true, status: 'shared' } });
  const cancelled = createDelivery({ shareResult: { handled: true, status: 'cancelled' } });
  for (const delivery of [shared, cancelled]) {
    await delivery.deliverSinglePdf(new Uint8Array([1]), 'Test.pdf', 'PDF erstellt.');
    assert.equal(delivery.downloads.length, 0);
  }
  assert.equal(shared.messages.length, 1);
  assert.equal(cancelled.messages.length, 0);
  assert.equal(cancelled.dialogs.length, 1);
  const failed = createDelivery({ zipFailure: true });
  await assert.rejects(failed.deliverMultiplePdfs([
    { bytes: new Uint8Array([1]), name: 'Teil-1.pdf' },
    { bytes: new Uint8Array([2]), name: 'Teil-2.pdf' },
  ], 'Test.zip'));
  assert.equal(failed.messages.length, 0);
});
