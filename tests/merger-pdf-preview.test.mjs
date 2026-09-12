import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [mergerSource, pdfPreviewSource, fileGuardsSource] = await Promise.all([
  readFile(new URL('../src/modules/merger/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/merger/pdf-preview.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-guards.js', import.meta.url), 'utf8'),
]);
const fileGuardsUrl = `data:text/javascript;base64,${Buffer.from(fileGuardsSource).toString('base64')}`;
const pdfPreviewUrl = `data:text/javascript;base64,${Buffer.from(
  pdfPreviewSource.replace("'../../shared/file-guards.js'", JSON.stringify(fileGuardsUrl)),
).toString('base64')}`;

const {
  createCanvasPngObjectUrl,
  createPdfPreviewRenderSpec,
  getPdfPreviewPagePixelBudget,
  PDF_PREVIEW_MAX_EDGE,
  PDF_PREVIEW_MAX_PIXELS,
  PDF_PREVIEW_MAX_TOTAL_PIXELS,
  PDF_PREVIEW_PREFERRED_SCALE,
  replacePdfPreviewUrls,
  revokePdfPreviewUrls,
} = await import(pdfPreviewUrl);

function createPage(width, height, scales = []) {
  return {
    getViewport({ scale }) {
      scales.push(scale);
      return { width: width * scale, height: height * scale, scale };
    },
  };
}

test('eine normale A4-Seite behält den bisherigen Vorschaumaßstab', () => {
  const scales = [];
  const result = createPdfPreviewRenderSpec(createPage(595.3, 841.9, scales), 1);

  assert.equal(result.width, 167);
  assert.equal(result.height, 236);
  assert.equal(result.viewport.scale, PDF_PREVIEW_PREFERRED_SCALE);
  assert.deepEqual(scales, [PDF_PREVIEW_PREFERRED_SCALE]);
});

test('extreme Seitendimensionen bleiben innerhalb aller Vorschaugrenzen', () => {
  for (const [width, height] of [
    [100_000, 100_000],
    [1_000_000, 10],
    [10, 1_000_000],
  ]) {
    const result = createPdfPreviewRenderSpec(createPage(width, height), 1);
    assert.ok(result.width <= PDF_PREVIEW_MAX_EDGE);
    assert.ok(result.height <= PDF_PREVIEW_MAX_EDGE);
    assert.ok(result.width * result.height <= PDF_PREVIEW_MAX_PIXELS);
    assert.ok(result.viewport.width <= result.width + 0.01);
    assert.ok(result.viewport.height <= result.height + 0.01);
  }
});

test('das Dokumentbudget begrenzt die Summe aller Vorschaupixel', () => {
  const pageCount = 500;
  const pagePixelBudget = getPdfPreviewPagePixelBudget(pageCount);
  const result = createPdfPreviewRenderSpec(createPage(100_000, 100_000), pageCount);

  assert.equal(pagePixelBudget, Math.floor(PDF_PREVIEW_MAX_TOTAL_PIXELS / pageCount));
  assert.ok(result.width * result.height <= pagePixelBudget);
  assert.ok(result.width * result.height * pageCount <= PDF_PREVIEW_MAX_TOTAL_PIXELS);
});

test('ungültige Seitendimensionen werden vor einer zweiten Viewport-Berechnung abgewiesen', () => {
  for (const [width, height] of [
    [Infinity, 100],
    [100, NaN],
    [0, 100],
    [100, -1],
  ]) {
    const scales = [];
    assert.throws(
      () => createPdfPreviewRenderSpec(createPage(width, height, scales), 1),
      /ungültige Abmessungen/,
    );
    assert.deepEqual(scales, [PDF_PREVIEW_PREFERRED_SCALE]);
  }
});

test('PNG-Vorschauen werden als Blob-URLs statt als Data-URLs materialisiert', async () => {
  const blobs = [];
  const urlApi = {
    createObjectURL(blob) {
      blobs.push(blob);
      return 'blob:preview-1';
    },
  };
  const canvas = {
    toBlob(callback, type) {
      callback(new Blob(['preview'], { type }));
    },
  };

  assert.equal(await createCanvasPngObjectUrl(canvas, urlApi), 'blob:preview-1');
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].type, 'image/png');
  assert.doesNotMatch(mergerSource, /\.toDataURL\(/);
});

test('fehlgeschlagene Blob-Erzeugung liefert einen kontrollierten Vorschaufehler', async () => {
  await assert.rejects(
    () => createCanvasPngObjectUrl({ toBlob: (callback) => callback(null) }, {}),
    /konnte nicht gespeichert werden/,
  );
  await assert.rejects(
    () => createCanvasPngObjectUrl({ toBlob: () => { throw new Error('kaputt'); } }, {}),
    /kaputt/,
  );
});

test('Vorschau-URLs werden bei Austausch und Leeren genau einmal freigegeben', () => {
  const revoked = [];
  const urlApi = { revokeObjectURL: (url) => revoked.push(url) };
  const state = { previewUrls: ['blob:old-1', 'blob:shared', 'blob:old-1'] };

  replacePdfPreviewUrls(state, ['blob:shared', 'blob:new'], urlApi);
  assert.deepEqual(state.previewUrls, ['blob:shared', 'blob:new']);
  assert.deepEqual(revoked, ['blob:old-1']);

  replacePdfPreviewUrls(state, [], urlApi);
  assert.deepEqual(state.previewUrls, []);
  assert.deepEqual(revoked, ['blob:old-1', 'blob:shared', 'blob:new']);

  revokePdfPreviewUrls(['blob:partial', 'blob:partial'], urlApi);
  assert.deepEqual(revoked, ['blob:old-1', 'blob:shared', 'blob:new', 'blob:partial']);
});

test('Drehen und Aufteilen verwenden dieselbe begrenzte Renderingpipeline', () => {
  assert.match(
    mergerSource,
    /return loadPdfPagePreviews\(file, rotateState, renderRotatePagesList\);/,
  );
  assert.match(
    mergerSource,
    /return loadPdfPagePreviews\(file, splitState, renderSplitPagesList\);/,
  );
  assert.match(
    mergerSource,
    /createPdfPreviewRenderSpec\(page, pdfDocument\.numPages\)/,
  );
  assert.match(mergerSource, /revokePdfPreviewUrls\(generatedPreviewUrls\);/);
  assert.match(mergerSource, /replacePdfPreviewUrls\(rotateState, \[\]\);/);
  assert.match(mergerSource, /replacePdfPreviewUrls\(splitState, \[\]\);/);
  assert.match(
    mergerSource,
    /\[rotateState, splitState\]\.forEach\(\(state\) => \{[\s\S]*?cancelActivePdfPreview\(state\);[\s\S]*?replacePdfPreviewUrls\(state, \[\]\);/,
  );
});
