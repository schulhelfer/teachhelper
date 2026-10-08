import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('EWH-DOCX werden unter der echten CSP als vollständige PDF-Seiten dargestellt', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  await evaluate(async () => {
    const html = await (await fetch('/src/modules/grades/app.html')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const policy = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = policy;
    document.head.append(meta);
    window.pdfCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.pdfCspViolations.push(event.violatedDirective));
  });
  for (const taskCount of [1, 9, 13]) {
    await t.test(`${taskCount} Aufgaben mit Kommentaren, Grafik und Formeln`, async () => {
      const result = await evaluate(async (count) => {
        const { createEwhPdfFixture } = await import('/tests/helpers/ewh-pdf.mjs');
        const { convertDocxToPdfBytes } = await import('/src/shared/docx-pdf.js');
        const { ensurePdfLibLoaded, ensurePdfJsLoaded } = await import('/src/shared/pdf-vendor.js');
        const fixture = await createEwhPdfFixture(count, { blocks: true, math: true });
        const bytes = await convertDocxToPdfBytes(fixture.docxBytes);
        const PDFLib = await ensurePdfLibLoaded();
        const pdf = await PDFLib.PDFDocument.load(bytes);
        const pdfjs = await ensurePdfJsLoaded();
        const loading = pdfjs.getDocument({ data: bytes.slice() });
        const preview = await loading.promise;
        const page = await preview.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] < 200 && pixels[index + 1] < 200 && pixels[index + 2] < 200) ink += 1;
        }
        const screenshot = canvas.toDataURL('image/png');
        await loading.destroy();
        return {
          signature: new TextDecoder().decode(bytes.slice(0, 5)),
          pages: pdf.getPages().map((item) => item.getSize()),
          ink,
          screenshot,
          violations: window.pdfCspViolations,
          renderAreas: document.querySelectorAll('[data-docx-pdf-render]').length,
        };
      }, taskCount);
      assert.equal(result.signature, '%PDF-');
      assert.ok(result.pages.length >= 1);
      assert.ok(Math.abs(result.pages[0].width - 595.3) < 1);
      assert.ok(Math.abs(result.pages[0].height - 841.9) < 1);
      assert.ok(result.ink > 2000, `PDF enthält zu wenig sichtbaren Inhalt: ${result.ink}`);
      assert.deepEqual(result.violations, []);
      assert.equal(result.renderAreas, 0);
      await writeFile(`/tmp/teachhelper-ewh-pdf-${taskCount}.png`, Buffer.from(result.screenshot.split(',')[1], 'base64'));
    });
  }
  await t.test('lange Aufgaben werden mit wiederholtem Tabellenkopf auf mehrere Seiten verteilt', async () => {
    const result = await evaluate(async () => {
      const { createEwhPdfFixture } = await import('/tests/helpers/ewh-pdf.mjs');
      const { convertDocxToPdfBytes } = await import('/src/shared/docx-pdf.js');
      const fixture = await createEwhPdfFixture(13, { longText: true });
      const rendered = [];
      const original = window.htmlToImage.toCanvas;
      window.htmlToImage.toCanvas = async (element, options) => {
        rendered.push({
          numbers: [...element.querySelectorAll('article table')].flatMap((table) => [...table.rows].map((row) => row.cells[0].textContent.trim())),
          content: element.textContent,
          math: element.querySelectorAll('math').length,
        });
        if (element.textContent.includes('(13)')) {
          const svg = await window.htmlToImage.toSvg(element, options);
          const frame = document.createElement('iframe');
          frame.src = '/';
          frame.style.position = 'fixed';
          frame.style.left = '-200000px';
          try {
            await new Promise((resolve, reject) => {
              frame.onload = resolve;
              frame.onerror = reject;
              document.body.append(frame);
            });
            const doc = new frame.contentWindow.DOMParser().parseFromString(decodeURIComponent(svg.split(',')[1]), 'application/xml');
            const clone = doc.querySelector('foreignObject').firstElementChild;
            frame.contentDocument.body.append(clone);
            rendered.at(-1).imageOverflow = [...clone.querySelectorAll('article table tr')]
              .filter((row) => /^\(\d+\)$/.test(row.cells[0].textContent.trim()))
              .map((row) => {
                const range = document.createRange();
                range.selectNodeContents(row.cells[1]);
                return range.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom;
              });
          } finally {
            frame.remove();
          }
        }
        const canvas = await original(element, options);
        rendered.at(-1).pixels = [canvas.width, canvas.height];
        rendered.at(-1).bounds = [element.getBoundingClientRect().width, element.getBoundingClientRect().height];
        if (rendered.length === 1 || element.textContent.includes('(13)')) rendered.at(-1).screenshot = canvas.toDataURL('image/png');
        return canvas;
      };
      try {
        const bytes = await convertDocxToPdfBytes(fixture.docxBytes);
        const pdf = await window.PDFLib.PDFDocument.load(bytes);
        const images = pdf.getPages().map((page) => page.node.Resources().lookup(window.PDFLib.PDFName.of('XObject')).keys().length);
        return { rendered, images, pageCount: pdf.getPageCount(), renderAreas: document.querySelectorAll('[data-docx-pdf-render]').length };
      } finally {
        window.htmlToImage.toCanvas = original;
      }
    });
    assert.ok(result.pageCount > 1);
    assert.equal(result.rendered.length, result.pageCount);
    const numbers = result.rendered.flatMap((page) => page.numbers).filter((value) => /^\(\d+\)$/.test(value));
    assert.deepEqual(numbers, Array.from({ length: 13 }, (_, index) => `(${index + 1})`));
    assert.ok(result.rendered.every((page) => !page.numbers.length || page.numbers[0] === 'Nr.'), JSON.stringify(result.rendered.map((page) => page.numbers)));
    assert.ok(result.images.every((count) => count === 1));
    assert.ok(result.rendered.every((page) => page.pixels.every((value, index) => Math.abs(value - page.bounds[index] * 2) < 2)));
    assert.ok(result.rendered.flatMap((page) => page.imageOverflow || []).every((overflow) => overflow < 0.5), 'Aufgabentext darf im Seitenbild nicht in die Summenzeile ragen');
    assert.equal(result.renderAreas, 0);
    for (const [index, page] of result.rendered.entries()) {
      if (page.screenshot) await writeFile(`/tmp/teachhelper-ewh-pdf-long-${index + 1}.png`, Buffer.from(page.screenshot.split(',')[1], 'base64'));
    }
  });
  await t.test('eigenes Querformat, Kopf-/Fußzeilen und manuelle Seitenumbrüche bleiben erhalten', async () => {
    const result = await evaluate(async () => {
      const { createEwhPdfFixture } = await import('/tests/helpers/ewh-pdf.mjs');
      const { convertDocxToPdfBytes } = await import('/src/shared/docx-pdf.js');
      const fixture = await createEwhPdfFixture(1, { pageBreak: true, landscape: true, blocks: true, math: true });
      const rendered = [];
      const original = window.htmlToImage.toCanvas;
      window.htmlToImage.toCanvas = async (element, options) => {
        rendered.push({ text: element.textContent, header: element.querySelector('header')?.textContent, footer: element.querySelector('footer')?.textContent, math: element.querySelectorAll('math').length });
        return original(element, options);
      };
      try {
        const bytes = await convertDocxToPdfBytes(fixture.docxBytes);
        const pdf = await window.PDFLib.PDFDocument.load(bytes);
        return { rendered, sizes: pdf.getPages().map((page) => page.getSize()) };
      } finally {
        window.htmlToImage.toCanvas = original;
      }
    });
    assert.equal(result.sizes.length, 2);
    assert.ok(result.sizes.every((size) => Math.abs(size.width - 841.9) < 1 && Math.abs(size.height - 595.3) < 1));
    assert.match(result.rendered[0].text, /Vor dem manuellen Seitenumbruch/);
    assert.doesNotMatch(result.rendered[0].text, /Nach dem manuellen Seitenumbruch/);
    assert.match(result.rendered[1].text, /Nach dem manuellen Seitenumbruch/);
    assert.ok(result.rendered.every((page) => page.header.includes('Anna Beispiel') && page.footer.includes('Berlin')));
    assert.equal(result.rendered[0].math, 1);
    assert.match(result.rendered[1].text, /Individueller Kommentar/);
    assert.match(result.rendered[1].text, /Prozentgrenze/);
  });
  await t.test('PDF-Fehler, Abbruch und Zeitüberschreitung räumen alle Renderressourcen auf', async () => {
    const result = await evaluate(async () => {
      const { createEwhPdfFixture } = await import('/tests/helpers/ewh-pdf.mjs');
      const { convertDocxToPdfBytes } = await import('/src/shared/docx-pdf.js');
      const fixture = await createEwhPdfFixture(1);
      const original = window.htmlToImage.toCanvas;
      const failures = [];
      const lateCanvases = [];
      try {
        for (const mode of ['error', 'abort', 'timeout']) {
          const controller = new AbortController();
          let release;
          window.htmlToImage.toCanvas = async () => {
            if (mode === 'error') throw new Error('PDF-Testfehler');
            const canvas = document.createElement('canvas');
            canvas.width = 100;
            canvas.height = 100;
            lateCanvases.push(canvas);
            if (mode === 'abort') setTimeout(() => controller.abort(), 0);
            return new Promise((resolve) => { release = () => resolve(canvas); });
          };
          const originalTimer = window.setTimeout;
          if (mode === 'timeout') window.setTimeout = (fn, delay, ...args) => originalTimer(fn, delay === 60000 ? 200 : delay, ...args);
          try {
            await convertDocxToPdfBytes(fixture.docxBytes, { signal: controller.signal });
            failures.push({ mode, message: 'Unerwarteter Erfolg' });
          } catch (error) {
            failures.push({ mode, message: error.message, name: error.name, areas: document.querySelectorAll('[data-docx-pdf-render]').length });
          } finally {
            window.setTimeout = originalTimer;
            release?.();
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } finally {
        window.htmlToImage.toCanvas = original;
      }
      const retry = await convertDocxToPdfBytes(fixture.docxBytes);
      const oversized = await createEwhPdfFixture(1, { longText: true, repetitions: 300 });
      let oversizedMessage;
      try {
        await convertDocxToPdfBytes(oversized.docxBytes);
      } catch (error) {
        oversizedMessage = error.message;
      }
      return {
        failures,
        canvasSizes: lateCanvases.map((canvas) => [canvas.width, canvas.height]),
        retry: new TextDecoder().decode(retry.slice(0, 5)),
        oversizedMessage,
        areas: document.querySelectorAll('[data-docx-pdf-render]').length,
        violations: window.pdfCspViolations,
      };
    });
    assert.deepEqual(result.failures.map((item) => item.areas), [0, 0, 0]);
    assert.match(result.failures[0].message, /PDF-Testfehler/);
    assert.equal(result.failures[1].name, 'AbortError');
    assert.match(result.failures[2].message, /zu lange gedauert/);
    assert.deepEqual(result.canvasSizes, [[0, 0], [0, 0]]);
    assert.equal(result.retry, '%PDF-');
    assert.match(result.oversizedMessage, /passt nicht auf eine PDF-Seite/);
    assert.equal(result.areas, 0);
    assert.deepEqual(result.violations, []);
  });
});
