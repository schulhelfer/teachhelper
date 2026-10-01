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

function createDelivery({ shareResult = { handled: false }, zipFailure = false, printFailure = false } = {}) {
  const downloads = [];
  const messages = [];
  const dialogs = [];
  const toasts = [];
  const blobs = [];
  const shares = [];
  let zipLoads = 0;
  class Archive {
    file() {}
    async generateAsync() {
      if (zipFailure) throw new Error('ZIP fehlgeschlagen');
      return new Uint8Array([1, 2]);
    }
  }
  const context = {
    Blob,
    MERGER_PRINT_RESULT_REQUEST_EVENT: 'classroom:merger-print-result-request',
    TRUSTED_PARENT_ORIGIN: 'https://teachhelper.test',
    withModuleFrameNonce: (payload) => ({ ...payload, frameNonce: 'nonce' }),
    window: { parent: { postMessage: (...args) => { if (printFailure) throw new Error("Übertragung fehlgeschlagen"); messages.push(args); } } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:output'; }, revokeObjectURL() {} },
    setTimeout() {},
    triggerDownload: (...args) => downloads.push(args),
    showResultToast: (...args) => toasts.push(args),
    showResultDialog: (...args) => dialogs.push(args),
    tryShareMergedPdfOnIOS: async (...args) => { shares.push(args); return shareResult; },
    ensureJsZipLoaded: async () => { zipLoads += 1; return Archive; },
    runPdfOperation: async (action) => action(),
  };
  vm.runInNewContext(['requestResultPrint', 'deliverSinglePdf', 'deliverMultiplePdfs'].map(extractFunction).join('\n'), context);
  return { ...context, downloads, messages, dialogs, toasts, blobs, shares, get zipLoads() { return zipLoads; } };
}

test('alle Werkzeuge besitzen getrennte Ausgabeaktionen und der automatische Druck entfällt', () => {
  assert.doesNotMatch(html, /autoPrintToggle|Automatisch Drucken|StartButton/);
  assert.doesNotMatch(source, /autoPrintToggle/);
  for (const tool of ['layout', 'merge', 'rotate', 'split']) {
    assert.match(html, new RegExp(`id="${tool}PrintButton"[^>]*>Drucken<`));
    assert.match(html, new RegExp(`id="${tool}SaveButton"[^>]*>Speichern<`));
    assert.match(html, new RegExp(`id="${tool}PrintHelpButton"`));
    const handler = extractFunction(`handle${tool[0].toUpperCase()}${tool.slice(1)}Start`);
    assert.match(handler, /if \(outputInProgress\) return/);
    assert.match(handler, /deliverSinglePdf\([\s\S]*outputMode/);
  }
});

test('Drucken überträgt nur eine unveränderte Datenkopie ohne Download, Teilen oder Erfolgsbehauptung', async () => {
  const delivery = createDelivery();
  const bytes = new Uint8Array([0, 10, 20, 30]).subarray(1, 3);
  await delivery.deliverSinglePdf(bytes, 'Test.pdf', 'PDF erstellt.', 'print');
  assert.equal(delivery.downloads.length, 0);
  assert.equal(delivery.shares.length, 0);
  assert.equal(delivery.blobs.length, 0);
  assert.equal(delivery.toasts.length, 0);
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
});

test('Speichern erzeugt ausschließlich einen Download mit Erfolgstoast', async () => {
  const delivery = createDelivery();
  const bytes = new Uint8Array([1]);
  await delivery.deliverSinglePdf(bytes, 'Test.pdf', 'PDF erstellt.', 'save');
  assert.equal(delivery.downloads.length, 1);
  assert.equal(delivery.toasts.length, 1);
  assert.equal(delivery.messages.length, 0);
  assert.deepEqual(new Uint8Array(await delivery.blobs[0].arrayBuffer()), bytes);
});

test('mehrere PDFs werden als ZIP gespeichert oder als ein geordneter Druckauftrag übertragen', async () => {
  const outputs = [
    { bytes: new Uint8Array([1]), name: 'Teil-1.pdf' },
    { bytes: new Uint8Array([2]), name: 'Teil-2.pdf' },
  ];
  const saved = createDelivery();
  await saved.deliverMultiplePdfs(outputs, 'Test.zip', 'save');
  assert.equal(saved.downloads.length, 1);
  assert.equal(saved.downloads[0][1], 'Test.zip');
  assert.equal(saved.messages.length, 0);
  assert.equal(saved.toasts.length, 1);
  const printed = createDelivery({ zipFailure: true });
  await printed.deliverMultiplePdfs(outputs, 'Test.zip', 'print');
  assert.equal(printed.downloads.length, 0);
  assert.equal(printed.zipLoads, 0);
  assert.equal(printed.shares.length, 0);
  assert.equal(printed.blobs.length, 0);
  assert.equal(printed.messages.length, 1);
  assert.deepEqual(Array.from(printed.messages[0][0].detail.outputs, ({ name }) => name), outputs.map(({ name }) => name));
  const single = createDelivery();
  await single.deliverMultiplePdfs(outputs.slice(0, 1), 'Test.zip', 'save');
  assert.equal(single.downloads[0][1], 'Teil-1.pdf');
  assert.equal(single.zipLoads, 0);
});

test('iOS-Teilen bleibt beim Speichern erhalten; Teilen-Abbruch, ZIP- und Druckfehler speichern nicht zusätzlich', async () => {
  const shared = createDelivery({ shareResult: { handled: true, status: 'shared' } });
  const cancelled = createDelivery({ shareResult: { handled: true, status: 'cancelled' } });
  for (const delivery of [shared, cancelled]) {
    await delivery.deliverSinglePdf(new Uint8Array([1]), 'Test.pdf', 'PDF erstellt.', 'save');
    assert.equal(delivery.downloads.length, 0);
    assert.equal(delivery.messages.length, 0);
  }
  assert.equal(shared.toasts.length, 1);
  assert.equal(cancelled.dialogs.length, 1);
  const failed = createDelivery({ zipFailure: true });
  await assert.rejects(failed.deliverMultiplePdfs([
    { bytes: new Uint8Array([1]), name: 'Teil-1.pdf' },
    { bytes: new Uint8Array([2]), name: 'Teil-2.pdf' },
  ], 'Test.zip', 'save'));
  assert.equal(failed.messages.length, 0);
  assert.equal(failed.downloads.length, 0);
  const printFailed = createDelivery({ printFailure: true });
  await printFailed.deliverSinglePdf(new Uint8Array([1]), 'Test.pdf', 'PDF erstellt.', 'print');
  assert.equal(printFailed.downloads.length, 0);
  assert.equal(printFailed.shares.length, 0);
  assert.match(printFailed.toasts[0][0], /über „Speichern“ herunterladen/);
  assert.equal(printFailed.toasts[0][1], 'warn');
});

test('beide Ausgabeaktionen teilen Voraussetzungen und werden auch bei Zustandsänderungen während Verarbeitung gesperrt', () => {
  const ui = Object.fromEntries(['layout', 'merge', 'rotate', 'split'].flatMap((tool) => ['Print', 'Save'].map((action) => [`${tool}${action}Button`, { disabled: false }])));
  Object.assign(ui, { studentCount: { value: '' }, splitActivateAllButton: {}, splitDeactivateAllButton: {} });
  const context = vm.createContext({
    ui, outputInProgress: false,
    TOOL_LAYOUT: 'layout', TOOL_MERGE: 'merge', TOOL_ROTATE: 'rotate', TOOL_SPLIT: 'split',
    layoutState: { file: null }, mergeState: { files: [] }, rotateState: { file: null, pageRotations: [] }, splitState: { file: null, pageCount: 0 },
    getPaddingModeValue: () => 'blank', getActiveSplitPageIndexes: () => [0],
  });
  vm.runInContext(['setOutputButtonsDisabled', 'syncOutputButtonStates', 'syncLayoutStartButtonState', 'syncMergeStartButtonState', 'syncRotateStartButtonState', 'syncSplitButtonsState'].map(extractFunction).join('\n'), context);
  context.syncOutputButtonStates();
  assert.ok(Object.entries(ui).filter(([key]) => /(?:Print|Save)Button/.test(key)).every(([, button]) => button.disabled));
  context.layoutState.file = {};
  context.mergeState.files = [{}, {}];
  Object.assign(context.rotateState, { file: {}, pageRotations: [0] });
  Object.assign(context.splitState, { file: {}, pageCount: 1 });
  context.outputInProgress = true;
  context.syncOutputButtonStates();
  assert.ok(Object.entries(ui).filter(([key]) => /(?:Print|Save)Button/.test(key)).every(([, button]) => button.disabled));
  context.outputInProgress = false;
  context.syncOutputButtonStates();
  assert.ok(Object.entries(ui).filter(([key]) => /(?:Print|Save)Button/.test(key)).every(([, button]) => !button.disabled));
});
