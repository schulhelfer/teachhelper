import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
async function loadModule(path) {
  const url = new URL(path, import.meta.url);
  const source = (await readFile(url, 'utf8')).replaceAll('import.meta.url', JSON.stringify(url.href));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { parseOcrNames, importableOcrNames, boundCrop, changeCrop, cropPixels, ocrOutputSize } = await loadModule('../src/modules/grades/roster-ocr-data.js');
const { recognizeLocalNames } = await loadModule('../src/shared/ocr-vendor.js');
const { buildStudentNameMatchKey } = await loadModule('../src/shared/school-data/seatplan-transfer.js');

test('OCR preserves name parts, punctuation and order and keeps every recognized line for review', () => {
  const rows = parseOcrNames('Nachname  Vorname\n1. Müller-Schön, Anna Maria\n2 van der Meer\tLéa\n\nO’Neill  Max\nSolo\n123');
  assert.equal(rows.length, 6);
  assert.deepEqual(importableOcrNames(rows), [
    { lastName: 'Nachname', firstName: 'Vorname' },
    { lastName: 'Müller-Schön', firstName: 'Anna Maria' },
    { lastName: 'van der Meer', firstName: 'Léa' },
    { lastName: 'O’Neill', firstName: 'Max' },
    { lastName: 'Solo', firstName: '' },
    { lastName: '123', firstName: '' },
  ]);
  assert.deepEqual(importableOcrNames(parseOcrNames('Anna Maria  von Berg\nMax Mustermann', 'first-last')), [
    { firstName: 'Anna Maria', lastName: 'von Berg' },
    { firstName: 'Max', lastName: 'Mustermann' },
  ]);
});

test('only the edited, remaining, nonempty preview entries are returned to the roster', () => {
  const rows = parseOcrNames('Muller Anna\nBauer Max\nLang Lea\nWolf Tom');
  rows[0].lastName = '  Müller  ';
  rows.splice(1, 2);
  rows[1].firstName = rows[1].lastName = ' ';
  assert.deepEqual(importableOcrNames(rows), [{ lastName: 'Müller', firstName: 'Anna' }]);
});

test('crop movement and corner resizing stay inside the image without changing aspect ratio implicitly', () => {
  const crop = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };
  const moved = changeCrop(crop, 'move', 4, -4);
  assert.deepEqual(moved, { x: 0.5, y: 0, width: 0.5, height: 0.4 });
  const resized = changeCrop(crop, 'se', 0.1, -0.2);
  assert.ok(Math.abs(resized.width - 0.6) < 1e-8);
  assert.ok(Math.abs(resized.height - 0.2) < 1e-8);
  assert.equal(changeCrop(crop, 'nw', -5, -5).x, 0);
  assert.ok(changeCrop(crop, 'nw', 5, 5).width > 0);
  assert.deepEqual(cropPixels(crop, 2000, 1000), { x: 400, y: 300, width: 1000, height: 400 });
  assert.deepEqual(boundCrop({ x: -1, y: -1, width: 5, height: 5 }), { x: 0, y: 0, width: 1, height: 1 });
});

test('OCR output respects both the pixel budget and maximum edge, without upscaling', () => {
  for (const [width, height] of [[12000, 8000], [18000, 1000], [1000, 18000], [500, 400]]) {
    const result = ocrOutputSize(width, height);
    assert.ok(result.width <= 4096 && result.height <= 4096);
    assert.ok(result.width * result.height <= 4_000_000);
    assert.ok(result.width <= width && result.height <= height);
    assert.ok(Math.abs((result.width / result.height) / (width / height) - 1) < 0.005);
  }
});

function fakeWorker() {
  return { messages: [], terminated: false, postMessage(data) { this.messages.push(data); }, terminate() { this.terminated = true; } };
}

test('abort before startup creates no worker', async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(recognizeLocalNames(new ArrayBuffer(1), { signal, workerFactory: () => assert.fail('must not start') }), { name: 'AbortError' });
});

for (const phase of ['loading tesseract core', 'recognizing text']) {
  test(`abort during ${phase} terminates the worker tree and ignores late results`, async () => {
    const worker = fakeWorker();
    const controller = new AbortController();
    const progress = [];
    const promise = recognizeLocalNames(new ArrayBuffer(1), { signal: controller.signal, workerFactory: () => worker, onProgress: (value) => progress.push(value.status) });
    const lateMessage = worker.onmessage;
    worker.onmessage({ data: { type: 'progress', status: phase } });
    controller.abort();
    lateMessage({ data: { type: 'result', text: 'Should not import' } });
    await assert.rejects(promise, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
    assert.equal(worker.onmessage, null);
    assert.deepEqual(progress, [phase]);
  });
}

test('successful and failed OCR jobs always release their workers and allow another run', async () => {
  for (const type of ['result', 'error', 'result']) {
    const worker = fakeWorker();
    const promise = recognizeLocalNames(new ArrayBuffer(1), { workerFactory: () => worker });
    worker.onmessage({ data: { type, text: 'Müller Anna' } });
    if (type === 'error') await assert.rejects(promise, /lokale Texterkennung/);
    else assert.equal(await promise, 'Müller Anna');
    assert.equal(worker.terminated, true);
  }
});

const source = await readFile(new URL('../src/modules/grades/app.js', import.meta.url), 'utf8');
const appendBody = source.match(/  appendCourseDialogStudents\(sourceStudents\) \{([\s\S]*?)\n  \}/)[1];
const append = new Function('sourceStudents', 'normalizeGradeTextPart', 'buildGradeStudentNameMatchKey', 'normalizeGradeStudentPortrait', 'compareGradeStudents', appendBody);

test('the shared course/OCR append preserves existing records and metadata and skips duplicate name pairs', () => {
  const existing = { id: 12, lastName: 'Müller', firstName: 'Anna', performanceFlair: 'A', portrait: { existing: true } };
  const meta = { fileName: 'prior.csv' };
  const app = { courseDialogDraft: { students: [existing], importMeta: meta } };
  const result = append.call(app, [
    { lastName: ' MÜLLER ', firstName: 'anna' },
    { lastName: 'Wolf', firstName: 'Tom' },
    { lastName: 'Wolf', firstName: 'Tom' },
  ], (value) => String(value || '').trim().replace(/\s+/g, ' '), buildStudentNameMatchKey, (value) => value || null, (a, b) => a.lastName.localeCompare(b.lastName));
  assert.deepEqual(result, { added: 1, skipped: 2 });
  assert.equal(app.courseDialogDraft.students[0], existing);
  assert.equal(app.courseDialogDraft.importMeta, meta);
  assert.deepEqual(app.courseDialogDraft.students[1], { id: 0, lastName: 'Wolf', firstName: 'Tom', rufname: '', performanceFlair: '', portrait: null });
});
