import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('alle PDF-Werkzeuge drucken ohne Dateiausgabe und speichern ohne Druck; Mehrfachausgabe wird nur beim Speichern gezippt', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { ensurePdfLibLoaded } = await import('/src/shared/pdf-vendor.js');
    const PDFLib = await ensurePdfLibLoaded();
    const pdf = await PDFLib.PDFDocument.create();
    for (let index = 0; index < 3; index += 1) pdf.addPage([100, 100]).drawText(String(index + 1), { x: 10, y: 50 });
    const bytes = await pdf.save();
    const { mountMerger } = await import('/src/modules/merger/index.js');
    const host = document.createElement('div');
    document.body.append(host);
    host.appendChild = (frame) => {
      frame.removeAttribute('sandbox');
      return Element.prototype.appendChild.call(host, frame);
    };
    const mounted = mountMerger({ host });
    const frame = mounted.frame;
    const waitFor = async (condition, describe = () => '') => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        try {
          if (condition()) return;
        } catch (error) {
          if (error.name !== 'SecurityError') throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`PDF-Ausgabe wurde nicht rechtzeitig bereit. ${describe()}`);
    };
    await waitFor(() => frame.contentWindow.__teachhelperMergerApp);
    const moduleDocument = frame.contentDocument;
    const downloads = [];
    frame.contentWindow.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
    const { createIframeModuleShellBindings } = await import('/src/app/iframe-module-shell-bindings.js');
    const { createModuleMessageRouter } = await import('/src/app/module-message-router.js');
    const cleanups = [];
    const messages = [];
    const bindings = createIframeModuleShellBindings({ documentRef: document, view: window, appEl: host, registerCleanup: (cleanup) => cleanups.push(cleanup), showMessage: (...args) => messages.push(args) });
    const router = createModuleMessageRouter({ messageTarget: window, modules: [{ role: 'merger', getFrame: () => frame }], handlers: bindings.handlers });
    let printCalls = 0;
    const printedPages = [];
    window.print = () => {
      printCalls += 1;
      printedPages.push(document.querySelectorAll('.pdf-print-page').length);
      window.dispatchEvent(new Event('afterprint'));
    };
    const actions = [];
    const initiallyDisabledByTool = Object.fromEntries(['layout', 'merge', 'rotate', 'split'].map((tool) => [tool, moduleDocument.getElementById(`${tool}PrintButton`).disabled && moduleDocument.getElementById(`${tool}SaveButton`).disabled]));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'A.pdf', { type: 'application/pdf' }));
    transfer.items.add(new File([bytes], 'B.pdf', { type: 'application/pdf' }));
    moduleDocument.getElementById('mergeDropZone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await waitFor(() => ['layout', 'merge', 'rotate', 'split'].every((tool) => !moduleDocument.getElementById(`${tool}PrintButton`).disabled && !moduleDocument.getElementById(`${tool}SaveButton`).disabled));
    for (const tool of ['layout', 'merge', 'rotate', 'split']) {
      moduleDocument.getElementById(`tool-tab-${tool}`).click();
      const printButton = moduleDocument.getElementById(`${tool}PrintButton`);
      const saveButton = moduleDocument.getElementById(`${tool}SaveButton`);
      const initiallyDisabled = initiallyDisabledByTool[tool];
      if (tool === 'split') moduleDocument.querySelector('[data-split-output-mode="single"]').click();
      const oldPrintCalls = printCalls;
      const oldDownloads = downloads.length;
      printButton.click();
      const locked = printButton.disabled && saveButton.disabled;
      saveButton.click();
      await waitFor(() => printCalls === oldPrintCalls + 1 && !printButton.disabled && !saveButton.disabled, () => JSON.stringify({ tool, printCalls, oldPrintCalls, messages, downloads, result: moduleDocument.getElementById("resultMessage").textContent, busy: moduleDocument.getElementById("busyMessage").textContent, printDisabled: printButton.disabled }));
      const printingDownloads = downloads.length - oldDownloads;
      saveButton.click();
      const savingLocked = printButton.disabled && saveButton.disabled;
      await waitFor(() => downloads.length === oldDownloads + 1 && !printButton.disabled && !saveButton.disabled);
      await new Promise((resolve) => setTimeout(resolve, 50));
      actions.push({ tool, initiallyDisabled, locked, savingLocked, printingDownloads, savedWithoutPrint: printCalls === oldPrintCalls + 1, download: downloads.at(-1) });
    }
    moduleDocument.getElementById('tool-tab-layout').click();
    moduleDocument.getElementById('studentCount').value = '1.5';
    moduleDocument.getElementById('layoutPrintButton').click();
    const invalidInputDialog = moduleDocument.getElementById('resultDialog').open;
    const invalidInputMessage = moduleDocument.getElementById('resultMessage').textContent;
    moduleDocument.getElementById('resultCloseButton').click();
    const dialogClosed = !moduleDocument.getElementById('resultDialog').open;
    const noCheckbox = !moduleDocument.getElementById('autoPrintToggle');
    router.dispose();
    cleanups.forEach((cleanup) => cleanup());
    mounted.dispose();
    return { actions, printCalls, printedPages, dialogClosed, noCheckbox, messages, invalidInputDialog, invalidInputMessage };
  });
  assert.equal(result.printCalls, 4);
  assert.deepEqual(result.printedPages, [3, 6, 3, 3]);
  assert.equal(result.invalidInputDialog, true);
  assert.match(result.invalidInputMessage, /ganze Zahl größer 0/);
  assert.equal(result.dialogClosed, true);
  assert.equal(result.noCheckbox, true);
  assert.equal(result.messages.length, 4);
  assert.ok(result.messages.every(([message, variant, options]) => message === 'Druckdialog geöffnet.' && variant === 'success' && options.presentation === 'toast'));
  for (const action of result.actions) {
    assert.equal(action.initiallyDisabled, true, action.tool);
    assert.equal(action.locked, true, action.tool);
    assert.equal(action.savingLocked, true, action.tool);
    assert.equal(action.printingDownloads, 0, action.tool);
    assert.equal(action.savedWithoutPrint, true, action.tool);
    assert.ok(action.download.endsWith(action.tool === 'split' ? '.zip' : '.pdf'), action.tool);
  }
});

test('echte PDFs werden vollständig und in Reihenfolge gedruckt, anschließend werden Druckressourcen freigegeben', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    for (const path of ['/src/app/shell.css', '/src/app/pdf-print.css']) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      await new Promise((resolve, reject) => {
        link.onload = resolve;
        link.onerror = reject;
        document.head.append(link);
      });
    }
    const shell = document.createElement('main');
    shell.textContent = 'Diese Oberfläche darf nicht gedruckt werden';
    document.body.append(shell);
    const { ensurePdfLibLoaded } = await import('/src/shared/pdf-vendor.js');
    const PDFLib = await ensurePdfLibLoaded();
    const first = await PDFLib.PDFDocument.create();
    for (const color of [PDFLib.rgb(1, 0, 0), PDFLib.rgb(0, 0, 1)]) {
      first.addPage([100, 200]).drawRectangle({ x: 0, y: 0, width: 100, height: 200, color });
    }
    const second = await PDFLib.PDFDocument.create();
    const rotated = second.addPage([80, 120]);
    rotated.setRotation(PDFLib.degrees(90));
    rotated.drawRectangle({ x: 0, y: 0, width: 80, height: 120, color: PDFLib.rgb(0, 1, 0) });
    const outputs = [
      { bytes: (await first.save()).slice().buffer, name: 'Teil-1.pdf' },
      { bytes: (await second.save()).slice().buffer, name: 'Teil-2.pdf' },
    ];
    const { createPdfPrintController } = await import('/src/app/pdf-print-controller.js');
    const warnings = [];
    const imageUrls = [];
    const revokedImageUrls = [];
    const createObjectURL = window.URL.createObjectURL.bind(window.URL);
    const revokeObjectURL = window.URL.revokeObjectURL.bind(window.URL);
    window.URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      if (blob.type === 'image/png') imageUrls.push(url);
      return url;
    };
    window.URL.revokeObjectURL = (url) => {
      if (imageUrls.includes(url)) revokedImageUrls.push(url);
      revokeObjectURL(url);
    };
    let printCalls = 0;
    let pages = [];
    let rules = [];
    const focusSequence = [];
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'macOS' } });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    window.focus = () => {
      focusSequence.push({ action: 'focus', readyPages: document.querySelectorAll('.pdf-print-page img').length });
    };
    window.print = () => {
      focusSequence.push({ action: 'print' });
      printCalls += 1;
      window.dispatchEvent(new Event('beforeprint'));
      pages = [...document.querySelectorAll('.pdf-print-page img')].map((image) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 1, 1);
        return { width: image.naturalWidth, height: image.naturalHeight, color: [...context.getImageData(0, 0, 1, 1).data] };
      });
      rules = [...document.adoptedStyleSheets.at(-1).cssRules[0].cssRules].map((rule) => rule.cssText);
    };
    const originalSheets = document.adoptedStyleSheets.length;
    const controller = createPdfPrintController({ documentRef: document, view: window, showMessage: (...args) => warnings.push(args) });
    const printed = await controller.print({ outputs });
    const retained = Boolean(document.querySelector('.pdf-print-area')) && document.documentElement.classList.contains('pdf-printing');
    const printSheet = [...document.styleSheets].find((sheet) => sheet.href?.endsWith('/pdf-print.css'));
    const mediaRule = [...printSheet.cssRules].find((rule) => rule instanceof CSSMediaRule);
    mediaRule.media.mediaText = 'all';
    const shellHidden = getComputedStyle(shell).display === 'none';
    const areaVisible = getComputedStyle(document.querySelector('.pdf-print-area')).display === 'block';
    mediaRule.media.mediaText = 'print';
    window.pdfPrintTest = { controller, shell, warnings, originalSheets, imageUrls, revokedImageUrls };
    return { printed, printCalls, pages, rules, retained, shellHidden, areaVisible, focusSequence };
  });
  const printedPdf = await evaluate.printToPdf();
  const completion = await evaluate(async (base64) => {
    const { controller, shell, warnings, originalSheets, imageUrls, revokedImageUrls } = window.pdfPrintTest;
    const PDFLib = window.PDFLib;
    const output = await PDFLib.PDFDocument.load(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
    const paperSizes = output.getPages().map((page) => page.getSize());
    const rejectedParallel = await controller.print({ outputs: [{ bytes: new ArrayBuffer(1) }] });
    window.dispatchEvent(new Event('afterprint'));
    const cleaned = !document.querySelector('.pdf-print-area')
      && !document.documentElement.classList.contains('pdf-printing')
      && document.adoptedStyleSheets.length === originalSheets;
    const restored = getComputedStyle(shell).display !== 'none';
    controller.dispose();
    return { paperSizes, rejectedParallel, warnings, cleaned, restored, imageUrls, revokedImageUrls };
  }, printedPdf);
  assert.equal(result.printed, true);
  assert.equal(result.printCalls, 1);
  assert.deepEqual(result.focusSequence, [{ action: 'focus', readyPages: 3 }, { action: 'print' }]);
  assert.deepEqual(result.pages.map(({ color }) => color), [[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255]]);
  assert.deepEqual(result.pages.map(({ width, height }) => [width, height]), [[208, 416], [208, 416], [250, 166]]);
  assert.ok(result.rules.some((rule) => /size: 100pt 200pt/.test(rule)));
  assert.ok(result.rules.some((rule) => /size: 120pt 80pt/.test(rule)));
  assert.equal(result.retained, true);
  assert.equal(result.shellHidden, true);
  assert.equal(result.areaVisible, true);
  assert.equal(completion.paperSizes.length, 3);
  for (const [index, { width, height }] of completion.paperSizes.entries()) {
    const expected = index < 2 ? [100, 200] : [120, 80];
    assert.ok(Math.abs(width - expected[0]) < 1);
    assert.ok(Math.abs(height - expected[1]) < 1);
  }
  assert.equal(completion.rejectedParallel, false);
  assert.equal(completion.warnings.filter(([, variant]) => variant === 'warn').length, 1);
  assert.equal(completion.warnings.filter(([, variant]) => variant === 'success').length, 1);
  assert.equal(completion.cleaned, true);
  assert.equal(completion.restored, true);
  assert.equal(completion.imageUrls.length, 3);
  assert.deepEqual(completion.revokedImageUrls, completion.imageUrls);
});

test('ungültige Daten, Druckfehler, Seitengrenzen und Dispose räumen auf, ohne erneut zu drucken', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createPdfPrintController } = await import('/src/app/pdf-print-controller.js');
    const { FILE_LIMITS } = await import('/src/shared/file-guards.js');
    const warnings = [];
    const controller = createPdfPrintController({ documentRef: document, view: window, showMessage: (...args) => warnings.push(args) });
    const invalidResults = [];
    for (const detail of [null, { outputs: [] }, { outputs: [{ bytes: new Uint8Array([1]) }] }, { outputs: [{ bytes: new ArrayBuffer(FILE_LIMITS.PDF_MERGE_TOTAL_BYTES + 1) }] }]) {
      invalidResults.push(await controller.print(detail));
    }
    invalidResults.push(await controller.print({ outputs: [{ bytes: new Uint8Array([1, 2, 3]).buffer }] }));
    let loadingDestroyed = 0;
    const tooMany = createPdfPrintController({
      documentRef: document,
      view: window,
      showMessage: (...args) => warnings.push(args),
      loadPdfJs: async () => ({ getDocument: () => ({ promise: Promise.resolve({ numPages: FILE_LIMITS.PDF_MAX_PAGES + 1 }), destroy() { loadingDestroyed += 1; } }) }),
    });
    invalidResults.push(await tooMany.print({ outputs: [{ bytes: new ArrayBuffer(1) }] }));
    tooMany.dispose();
    const { ensurePdfLibLoaded } = await import('/src/shared/pdf-vendor.js');
    const PDFLib = await ensurePdfLibLoaded();
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([100, 100]);
    const data = await pdf.save();
    let printCalls = 0;
    let focusCalls = 0;
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'macOS' } });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    window.focus = () => { focusCalls += 1; throw new Error('Fokus wurde abgelehnt'); };
    window.print = () => { printCalls += 1; throw new Error('Druckfehler'); };
    const failure = await controller.print({ outputs: [{ bytes: data.slice().buffer }] });
    const cleanedFailure = !document.querySelector('.pdf-print-area') && !document.documentElement.classList.contains('pdf-printing');
    window.print = () => { printCalls += 1; };
    const retry = await controller.print({ outputs: [{ bytes: data.slice().buffer }] });
    controller.dispose();
    const cleanedDispose = !document.querySelector('.pdf-print-area') && !document.documentElement.classList.contains('pdf-printing');
    let resolveLoad;
    const delayed = createPdfPrintController({
      documentRef: document,
      view: window,
      showMessage: (...args) => warnings.push(args),
      loadPdfJs: () => new Promise((resolve) => { resolveLoad = resolve; }),
    });
    const pending = delayed.print({ outputs: [{ bytes: data.slice().buffer }] });
    await Promise.resolve();
    delayed.dispose();
    resolveLoad({});
    const cancelled = await pending;
    const afterDispose = await delayed.print({ outputs: [{ bytes: data.slice().buffer }] });
    return { invalidResults, loadingDestroyed, failure, retry, printCalls, focusCalls, cleanedFailure, cleanedDispose, cancelled, afterDispose, warnings };
  });
  assert.ok(result.invalidResults.every((value) => value === false));
  assert.equal(result.loadingDestroyed, 1);
  assert.equal(result.failure, false);
  assert.equal(result.retry, true);
  assert.equal(result.printCalls, 2);
  assert.equal(result.focusCalls, 2);
  assert.equal(result.cleanedFailure, true);
  assert.equal(result.cleanedDispose, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.afterDispose, false);
  assert.equal(result.warnings.filter(([, variant]) => variant === 'warn').length, 7);
  assert.equal(result.warnings.filter(([, variant]) => variant === 'success').length, 1);
  assert.ok(result.warnings.filter(([, variant]) => variant === 'warn').every(([message, variant, options]) => message.includes('über „Speichern“ herunterladen') && variant === 'warn' && options.presentation === 'toast'));
});

test('der Fokusversuch gilt ausschließlich für macOS und schließt iPadOS aus', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { createPdfPrintController } = await import('/src/app/pdf-print-controller.js');
    const { ensurePdfLibLoaded } = await import('/src/shared/pdf-vendor.js');
    const PDFLib = await ensurePdfLibLoaded();
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([100, 100]);
    const bytes = await pdf.save();
    let focusCalls = 0;
    let printCalls = 0;
    window.focus = () => { focusCalls += 1; };
    window.print = () => {
      printCalls += 1;
      window.dispatchEvent(new Event('afterprint'));
    };
    const controller = createPdfPrintController({ documentRef: document, view: window, showMessage() {} });
    const cases = [];
    for (const [platform, touchPoints] of [['Win32', 0], ['Linux x86_64', 0], ['MacIntel', 5], ['MacIntel', 0]]) {
      Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'platform', { configurable: true, value: platform });
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
      const previousCalls = focusCalls;
      const printed = await controller.print({ outputs: [{ bytes: bytes.slice().buffer }] });
      cases.push({ printed, focusCalls: focusCalls - previousCalls });
    }
    controller.dispose();
    return { cases, printCalls };
  });
  assert.equal(result.printCalls, 4);
  assert.deepEqual(result.cases, [
    { printed: true, focusCalls: 0 },
    { printed: true, focusCalls: 0 },
    { printed: true, focusCalls: 0 },
    { printed: true, focusCalls: 1 },
  ]);
});
