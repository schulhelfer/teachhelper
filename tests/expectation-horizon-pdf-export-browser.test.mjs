import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('EWH-Ausgabeformat steuert Dialog und vollständige ZIP-Dateien', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  await evaluate(async () => {
    const { createEwhPdfExportApp } = await import('/tests/helpers/ewh-pdf.mjs');
    window.ewhExportFixture = await createEwhPdfExportApp();
    await window.ewhExportApp.openExpectationHorizonDialog();
  });
  await t.test('Beides ist bei jedem Öffnen aktiv; Pfeiltasten und Slide-Indikator funktionieren', async () => {
    const initial = await evaluate(() => {
      const app = window.ewhExportApp;
      const inputs = app.refs.expectationHorizonOutputFormatInputs;
      inputs[1].focus();
      return { value: app.expectationHorizonOutputFormat, checked: inputs.filter((input) => input.checked).map((input) => input.value) };
    });
    assert.equal(initial.value, 'both');
    assert.deepEqual(initial.checked, ['both']);
    await evaluate.dispatchKeyEvent({ type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await evaluate.dispatchKeyEvent({ type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    const changed = await evaluate(async () => {
      const app = window.ewhExportApp;
      const control = app.refs.expectationHorizonOutputFormatField.querySelector('.segment-control');
      const changed = { value: app.expectationHorizonOutputFormat, indicator: control.classList.contains('is-segment-index-2') };
      app.closeExpectationHorizonDialog();
      await app.openExpectationHorizonDialog();
      return { ...changed, reopened: app.expectationHorizonOutputFormat };
    });
    assert.deepEqual(changed, { value: 'pdf', indicator: true, reopened: 'both' });
  });
  for (const format of ['docx', 'both', 'pdf']) {
    await t.test(`${format}: passende ZIP-Einträge mit gleichen Basisnamen`, async () => {
      const result = await evaluate(async (format) => {
        const { prepareDocxTemplate } = await import('/src/shared/docx-template.js');
        const { app, downloads, context } = window.ewhExportFixture;
        if (!app.refs.expectationHorizonDialog.open) await app.openExpectationHorizonDialog();
        app.refs.expectationHorizonOutputFormatInputs.find((input) => input.value === format).click();
        downloads.length = 0;
        const exporting = app.generateExpectationHorizons();
        const disabled = app.refs.expectationHorizonOutputFormatInputs.every((input) => input.disabled);
        await exporting;
        const [download] = downloads;
        const archive = await prepareDocxTemplate(download.data);
        const entries = [];
        for (const entry of archive.entries) {
          if (entry.name.endsWith('.pdf')) {
            const pdf = await window.PDFLib.PDFDocument.load(entry.data);
            entries.push({ name: entry.name, pages: pdf.getPageCount() });
          } else {
            const prepared = await prepareDocxTemplate(entry.data);
            const xml = new TextDecoder().decode(prepared.entries.find((item) => item.name === 'word/document.xml').data);
            entries.push({ name: entry.name, ownText: xml.includes('Eigene Erwartung mit Formel:'), formula: xml.includes('oMath') });
          }
        }
        return {
          entries, disabled, enabled: app.refs.expectationHorizonOutputFormatInputs.every((input) => !input.disabled),
          closed: !app.refs.expectationHorizonDialog.open, downloads: downloads.length,
          name: download.name, expectedName: app.buildExpectationHorizonZipFileName(context),
          status: app.refs.expectationHorizonStatus.textContent,
          pdfLibrariesLoaded: Boolean(window.docx || window.htmlToImage),
        };
      }, format);
      const extensions = format === 'both' ? ['docx', 'pdf'] : [format];
      assert.deepEqual(result.entries.map((entry) => entry.name), ['Anna Beispiel', 'Ben Beispiel'].flatMap((name) => extensions.map((extension) => `${name}.${extension}`)));
      assert.ok(result.entries.every((entry) => entry.pages >= 1 || (entry.ownText && entry.formula)));
      assert.equal(result.downloads, 1);
      assert.equal(result.name, result.expectedName);
      assert.ok(result.disabled && result.enabled && result.closed);
      assert.match(result.status, format === 'both' ? /2 DOCX-Dateien und 2 PDF-Dateien/ : new RegExp(`2 ${format.toUpperCase()}-Dateien`));
      if (format === 'docx') assert.equal(result.pdfLibrariesLoaded, false);
    });
  }
  await t.test('PDF-Fehler verhindert ZIP-Download; DOCX kann im offenen Dialog erneut exportiert werden', async () => {
    const result = await evaluate(async () => {
      const { app, downloads } = window.ewhExportFixture;
      await app.openExpectationHorizonDialog();
      downloads.length = 0;
      const original = window.htmlToImage.toCanvas;
      let conversions = 0;
      window.htmlToImage.toCanvas = async (element, options) => {
        if (++conversions === 2) throw new Error('PDF-Konvertierung fehlgeschlagen. Bitte DOCX auswählen.');
        return original(element, options);
      };
      try {
        await app.generateExpectationHorizons();
        const failure = {
          downloads: downloads.length, open: app.refs.expectationHorizonDialog.open,
          error: app.refs.expectationHorizonStatus.classList.contains('is-error'),
          message: app.refs.expectationHorizonStatus.textContent,
          enabled: app.refs.expectationHorizonOutputFormatInputs.every((input) => !input.disabled),
          areas: document.querySelectorAll('[data-docx-pdf-render]').length,
        };
        app.refs.expectationHorizonOutputFormatInputs[0].click();
        await app.generateExpectationHorizons();
        return { failure, downloads: downloads.length, closed: !app.refs.expectationHorizonDialog.open, conversions };
      } finally {
        window.htmlToImage.toCanvas = original;
      }
    });
    assert.deepEqual(result.failure, {
      downloads: 0, open: true, error: true,
      message: 'PDF-Konvertierung fehlgeschlagen. Bitte DOCX auswählen.', enabled: true, areas: 0,
    });
    assert.equal(result.downloads, 1);
    assert.equal(result.closed, true);
    assert.equal(result.conversions, 2);
  });
  await t.test('Vorlagendownload bleibt auch bei PDF-Auswahl eine DOCX-Datei', async () => {
    const result = await evaluate(async () => {
      const { app, downloads } = window.ewhExportFixture;
      await app.openExpectationHorizonDialog();
      app.refs.expectationHorizonOutputFormatInputs[2].click();
      downloads.length = 0;
      await app.downloadCurrentExpectationHorizonDialogTemplate();
      return downloads.map((file) => ({ name: file.name, type: file.type, signature: [...file.data.slice(0, 2)] }));
    });
    assert.deepEqual(result, [{ name: 'Eigene Vorlage.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: [80, 75] }]);
  });
});

test('PDF-Konvertierung lädt Bibliotheken unter echter CSP offline aus dem PWA-Cache', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  await evaluate(async () => {
    const { createEwhPdfFixture } = await import('/tests/helpers/ewh-pdf.mjs');
    const html = await (await fetch('/src/modules/grades/app.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    document.head.append(meta);
    window.offlinePdfViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.offlinePdfViolations.push(event.violatedDirective));
    window.offlinePdfFixture = await createEwhPdfFixture(13, { blocks: true, math: true });
    window.offlinePdfConverter = (await import('/src/shared/docx-pdf.js')).convertDocxToPdfBytes;
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const required = [
      '/src/vendor/jszip/3.10.2/jszip.min.js', '/src/vendor/docx-preview/0.4.1/docx-preview.min.js',
      '/src/vendor/html-to-image/1.11.13/html-to-image.js', '/src/vendor/cantoo-pdf-lib/2.11.1/pdf-lib.min.js',
    ];
    const deadline = Date.now() + 15000;
    while (!(await Promise.all(required.map((url) => caches.match(url)))).every(Boolean)) {
      if (Date.now() > deadline) throw new Error('PDF-Bibliotheken wurden nicht vom Service Worker vorab gespeichert.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
  await evaluate.setNetworkOffline(true);
  try {
    const result = await evaluate(async () => {
      const lazy = !window.docx && !window.htmlToImage;
      const bytes = await window.offlinePdfConverter(window.offlinePdfFixture.docxBytes);
      const pdf = await window.PDFLib.PDFDocument.load(bytes);
      return {
        offline: !navigator.onLine, lazy, pages: pdf.getPageCount(),
        areas: document.querySelectorAll('[data-docx-pdf-render]').length,
        violations: window.offlinePdfViolations,
      };
    });
    assert.ok(result.offline && result.lazy);
    assert.ok(result.pages >= 1);
    assert.equal(result.areas, 0);
    assert.deepEqual(result.violations, []);
  } finally {
    await evaluate.setNetworkOffline(false);
  }
});
