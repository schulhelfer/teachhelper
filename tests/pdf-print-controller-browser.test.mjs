import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('PDF-Werkzeug sendet nach Erstellung einen Druckauftrag an die Shell und behält die Checkbox bis zum Neuladen', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { ensurePdfLibLoaded } = await import('/src/shared/pdf-vendor.js');
    const PDFLib = await ensurePdfLibLoaded();
    const pdf = await PDFLib.PDFDocument.create();
    pdf.addPage([100, 100]);
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
    const waitFor = async (condition) => {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        try {
          if (condition()) return;
        } catch (error) {
          if (error.name !== 'SecurityError') throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('PDF-Werkzeug wurde nicht rechtzeitig bereit.');
    };
    await waitFor(() => frame.contentWindow.__teachhelperMergerApp);
    const moduleDocument = frame.contentDocument;
    const checkbox = moduleDocument.getElementById('autoPrintToggle');
    const initial = checkbox.checked;
    checkbox.click();
    for (const tool of ['merge', 'rotate', 'split', 'layout']) moduleDocument.getElementById(`tool-tab-${tool}`).click();
    const retained = !checkbox.checked && !checkbox.disabled && Boolean(checkbox.closest('aside'));
    checkbox.click();
    moduleDocument.getElementById('tool-tab-merge').click();
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'A.pdf', { type: 'application/pdf' }));
    transfer.items.add(new File([bytes], 'B.pdf', { type: 'application/pdf' }));
    moduleDocument.getElementById('mergeDropZone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const button = moduleDocument.getElementById('mergeStartButton');
    await waitFor(() => !button.disabled);
    const { createIframeModuleShellBindings } = await import('/src/app/iframe-module-shell-bindings.js');
    const { createModuleMessageRouter } = await import('/src/app/module-message-router.js');
    const cleanups = [];
    const warnings = [];
    const bindings = createIframeModuleShellBindings({ documentRef: document, view: window, appEl: host, registerCleanup: (cleanup) => cleanups.push(cleanup), showMessage: (...args) => warnings.push(args) });
    const router = createModuleMessageRouter({ messageTarget: window, modules: [{ role: 'merger', getFrame: () => frame }], handlers: bindings.handlers });
    let printCalls = 0;
    let pageCount = 0;
    window.print = () => {
      printCalls += 1;
      pageCount = document.querySelectorAll('.pdf-print-page').length;
      window.dispatchEvent(new Event('afterprint'));
    };
    button.click();
    await waitFor(() => printCalls === 1);
    checkbox.click();
    await waitFor(() => !button.disabled);
    button.click();
    await waitFor(() => !button.disabled);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const disabledPrintCalls = printCalls;
    const dialogClosed = !moduleDocument.getElementById('resultDialog').open;
    const successToast = Boolean(moduleDocument.querySelector('.toast-message.message-success'));
    const oldApp = frame.contentWindow.__teachhelperMergerApp;
    frame.contentWindow.location.reload();
    await waitFor(() => frame.contentWindow.__teachhelperMergerApp && frame.contentWindow.__teachhelperMergerApp !== oldApp);
    const reset = frame.contentDocument.getElementById('autoPrintToggle').checked;
    router.dispose();
    cleanups.forEach((cleanup) => cleanup());
    mounted.dispose();
    return { initial, retained, reset, printCalls, disabledPrintCalls, pageCount, dialogClosed, successToast, warnings };
  });
  assert.equal(result.initial, true);
  assert.equal(result.retained, true);
  assert.equal(result.reset, true);
  assert.equal(result.printCalls, 1);
  assert.equal(result.disabledPrintCalls, 1);
  assert.equal(result.pageCount, 2);
  assert.equal(result.dialogClosed, true);
  assert.equal(result.successToast, true);
  assert.deepEqual(result.warnings, []);
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
    let printCalls = 0;
    let pages = [];
    let rules = [];
    window.print = () => {
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
    window.pdfPrintTest = { controller, shell, warnings, originalSheets };
    return { printed, printCalls, pages, rules, retained, shellHidden, areaVisible };
  });
  const printedPdf = await evaluate.printToPdf();
  const completion = await evaluate(async (base64) => {
    const { controller, shell, warnings, originalSheets } = window.pdfPrintTest;
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
    return { paperSizes, rejectedParallel, warnings, cleaned, restored };
  }, printedPdf);
  assert.equal(result.printed, true);
  assert.equal(result.printCalls, 1);
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
  assert.equal(completion.warnings.length, 1);
  assert.equal(completion.cleaned, true);
  assert.equal(completion.restored, true);
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
    return { invalidResults, loadingDestroyed, failure, retry, printCalls, cleanedFailure, cleanedDispose, cancelled, afterDispose, warnings };
  });
  assert.ok(result.invalidResults.every((value) => value === false));
  assert.equal(result.loadingDestroyed, 1);
  assert.equal(result.failure, false);
  assert.equal(result.retry, true);
  assert.equal(result.printCalls, 2);
  assert.equal(result.cleanedFailure, true);
  assert.equal(result.cleanedDispose, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.afterDispose, false);
  assert.equal(result.warnings.length, 7);
  assert.ok(result.warnings.every(([message, variant, options]) => message.includes('heruntergeladene PDF') && variant === 'warn' && options.presentation === 'toast'));
});
