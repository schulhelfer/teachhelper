import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('Archiv-PDFs lassen sich mit den verbleibenden Bibliotheken erzeugen und für die OCR rendern', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { buildWorkspaceArchivePdfBytes } = await import('/src/modules/workspace/archive-pdf.js');
    const { createOcrPdfSession } = await import('/src/modules/grades/roster-ocr-pdf.js');
    const bytes = await buildWorkspaceArchivePdfBytes({ name: 'Beispieljahr' }, [
      { type: 'note', title: 'Beispielabschnitt', text: 'Material für die Archivprüfung.' },
    ]);
    const session = createOcrPdfSession({ createCanvas: () => document.createElement('canvas') });
    let canvas;
    try {
      const pageCount = await session.load(new File([bytes], 'archiv.pdf', { type: 'application/pdf' }));
      canvas = await session.render(1);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const outcome = {
        signature: new TextDecoder().decode(bytes.slice(0, 5)),
        pageCount,
        width: canvas.width,
        height: canvas.height,
        containsContent: pixels.some((value, index) => index % 4 !== 3 && value < 240),
      };
      session.destroy();
      return { ...outcome, released: canvas.width === 0 && canvas.height === 0 };
    } finally {
      session.destroy();
    }
  });
  assert.equal(result.signature, '%PDF-');
  assert.equal(result.pageCount, 1);
  assert.ok(result.width > result.height && result.height > 0);
  assert.equal(result.containsContent, true);
  assert.equal(result.released, true);
});

test('der gemeinsame Worker verarbeitet ZIP-Abgaben und DOCX-Vorlagen mit den echten Bibliotheken', async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    await import('/src/vendor/jszip/3.10.2/jszip.min.js');
    const { runFileProcessingTask } = await import('/src/shared/file-processing-client.js');
    const { prepareDocxTemplateInWorker } = await import('/src/shared/docx-worker-client.js');
    const { createDocxFromPreparedTemplate } = await import('/src/shared/docx-template.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    canvas.getContext('2d').fillRect(0, 0, 2, 2);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const archive = new window.JSZip();
    archive.file('abgabe.txt', 'Beispielinhalt');
    archive.file('bild.png', await png.arrayBuffer());
    const data = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const { records } = await runFileProcessingTask('zip-analyze', { data });
    const template = new Uint8Array(await fetch('/src/modules/grades/expectation-horizon-template.docx').then((response) => response.arrayBuffer()));
    const prepared = await prepareDocxTemplateInWorker(template);
    const output = await createDocxFromPreparedTemplate(prepared, { '<<Kommentar>>': 'Beispielkommentar' });
    const exported = await prepareDocxTemplateInWorker(output);
    const xml = new TextDecoder().decode(exported.entries.find((entry) => entry.name === 'word/document.xml').data);
    const documentXml = new DOMParser().parseFromString(xml, 'application/xml');
    const text = [...documentXml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't')]
      .map((node) => node.textContent).join('');
    return {
      records: records.map((record) => ({ name: record.name, mime: record.mime, hasImage: record.data instanceof Uint8Array })),
      pngSignature: [...records.find((record) => record.name === 'bild.png').data.slice(0, 8)],
      outputSignature: [...output.slice(0, 2)],
      replaced: text.includes('Beispielkommentar') && !text.includes('<<Kommentar>>'),
    };
  });
  assert.deepEqual(result.records, [
    { name: 'abgabe.txt', mime: '', hasImage: false },
    { name: 'bild.png', mime: 'image/png', hasImage: true },
  ]);
  assert.deepEqual(result.pngSignature, [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(result.outputSignature, [80, 75]);
  assert.equal(result.replaced, true);
});
