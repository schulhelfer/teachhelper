import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGradeClassFlair } from '../src/shared/school-data/grades.js';
import { readFile } from 'node:fs/promises';
async function loadModule(path) {
  const url = new URL(path, import.meta.url);
  const source = (await readFile(url, 'utf8'))
    .replaceAll('import.meta.url', JSON.stringify(url.href))
    .replace(/(\bfrom\s*)(['"])(\.[^'"]*)\2/g, (_match, prefix, quote, specifier) => `${prefix}${quote}${new URL(specifier, url).href}${quote}`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { parseOcrNames, importableOcrNames, boundCrop, changeCrop, cropPixels, ocrOutputSize } = await loadModule('../src/modules/grades/roster-ocr-data.js');
const { recognizeLocalNames } = await loadModule('../src/shared/ocr-vendor.js');
const { buildStudentNameMatchKey } = await loadModule('../src/shared/school-data/seatplan-transfer.js');

test('OCR preserves name parts and order and keeps every recognized line for review', () => {
  const rows = parseOcrNames('Nachname  Vorname\n1. Müller-Schön, Anna Maria\n2 van der Meer\tLéa\n\nO’Neill  Max\nSolo\n123');
  assert.equal(rows.length, 6);
  assert.deepEqual(importableOcrNames(rows), [
    { lastName: 'Nachname', firstName: 'Vorname', classFlair: '' },
    { lastName: 'Müller-Schön', firstName: 'Anna Maria', classFlair: '' },
    { lastName: 'van der Meer', firstName: 'Léa', classFlair: '' },
    { lastName: 'O’Neill', firstName: 'Max', classFlair: '' },
    { lastName: 'Solo', firstName: '', classFlair: '' },
  ]);
  assert.deepEqual(importableOcrNames(parseOcrNames('Anna Maria  von Berg\nMax Mustermann', 'first-last')), [
    { firstName: 'Anna Maria', lastName: 'von Berg', classFlair: '' },
    { firstName: 'Max', lastName: 'Mustermann', classFlair: '' },
  ]);
});

test('recognized names lose stray punctuation but keep hyphens and apostrophes inside a name', () => {
  assert.deepEqual(
    importableOcrNames(parseOcrNames('Müller,  Anna .\n• Bauer   Max\n|Lang:   Lea\nSt. Clair  Tom')),
    [
      { lastName: 'Müller', firstName: 'Anna', classFlair: '' },
      { lastName: 'Bauer', firstName: 'Max', classFlair: '' },
      { lastName: 'Lang', firstName: 'Lea', classFlair: '' },
      { lastName: 'St Clair', firstName: 'Tom', classFlair: '' },
    ],
  );
  assert.deepEqual(importableOcrNames(parseOcrNames('Müller-Schön  Anna\nO’Neill  Max')), [
    { lastName: 'Müller-Schön', firstName: 'Anna', classFlair: '' },
    { lastName: 'O’Neill', firstName: 'Max', classFlair: '' },
  ]);
});

test('only the edited, remaining, nonempty preview entries are returned to the roster', () => {
  const rows = parseOcrNames('Muller Anna\nBauer Max\nLang Lea\nWolf Tom');
  rows[0].lastName = '  Müller  ';
  rows.splice(1, 2);
  rows[1].firstName = rows[1].lastName = ' ';
  assert.deepEqual(importableOcrNames(rows), [{ lastName: 'Müller', firstName: 'Anna', classFlair: '' }]);
});

test('OCR extracts a class column before, between or after names without losing name parts', () => {
  for (const line of [
    '7a  van der Meer  Anna Maria',
    'van der Meer  7a  Anna Maria',
    'van der Meer  Anna Maria  7a',
    '1. van der Meer  Anna Maria  7a',
    '1  7a  van der Meer  Anna Maria',
    'van der Meer;7a;Anna Maria',
    'van der Meer\t7a\tAnna Maria',
    'van der Meer 7a Anna Maria',
  ]) {
    const rows = parseOcrNames(line);
    assert.equal(rows[0].raw, line);
    assert.deepEqual(importableOcrNames(rows), [{ lastName: 'van der Meer', firstName: 'Anna Maria', classFlair: 'a' }], line);
  }
  for (const line of ['11 B  Anna Maria  von Berg', 'Anna Maria  11B  von Berg', 'Anna Maria  von Berg  11\u00a0b']) {
    assert.deepEqual(importableOcrNames(parseOcrNames(line, 'first-last')), [
      { firstName: 'Anna Maria', lastName: 'von Berg', classFlair: 'b' },
    ], line);
  }
  assert.deepEqual(importableOcrNames(parseOcrNames('7a Müller Anna\nBauer Max 11b')), [
    { lastName: 'Müller', firstName: 'Anna', classFlair: 'a' },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'b' },
  ]);
});

test('missing, invalid and conflicting OCR classes stay unassigned and class-only rows are not imported', () => {
  for (const line of ['Müller  Anna', 'Müller  Anna  7h', '7a  Müller  Anna  11b', '7a  Müller  Anna  11a']) {
    assert.deepEqual(importableOcrNames(parseOcrNames(line)), [{ lastName: 'Müller', firstName: 'Anna', classFlair: '' }], line);
  }
  assert.deepEqual(importableOcrNames(parseOcrNames('7a  Müller  Anna  7A')), [
    { lastName: 'Müller', firstName: 'Anna', classFlair: 'a' },
  ]);
  assert.deepEqual(importableOcrNames(parseOcrNames('7a\n11 B')), []);
});

test('misread class letters are recovered and digits never end up in a name', () => {
  for (const line of ['Müller  Tim  90', 'Müller, Tim 9o', 'Müller  Tim  9c.', 'Müller  Tim  9c)', 'Müller Tim 9©']) {
    assert.deepEqual(importableOcrNames(parseOcrNames(line)), [{ lastName: 'Müller', firstName: 'Tim', classFlair: 'c' }], line);
  }
  assert.deepEqual(importableOcrNames(parseOcrNames('Bauer Max 9a\n90 Müller Tim\nLang Lea 9b')), [
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'a' },
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'c' },
    { lastName: 'Lang', firstName: 'Lea', classFlair: 'b' },
  ]);
  assert.deepEqual(importableOcrNames(parseOcrNames('Bauer Max 1a\nMüller Tim 10')), [
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'a' },
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'c' },
  ]);
  for (const line of ['Müller  Tim  10', 'Müller  Tim  9x', 'Müller Tim 20 9a', '20 Müller Tim']) {
    const expected = line.includes('9a') ? 'a' : '';
    assert.deepEqual(importableOcrNames(parseOcrNames(line)), [{ lastName: 'Müller', firstName: 'Tim', classFlair: expected }], line);
  }
  assert.deepEqual(importableOcrNames(parseOcrNames('20 Müller Tim 9a\n21 Bauer Max 9b')), [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a' },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'b' },
  ]);
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
const append = new Function('sourceStudents', 'normalizeGradeTextPart', 'buildGradeStudentNameMatchKey', 'normalizeGradeStudentPortrait', 'compareGradeStudents', 'normalizeGradeClassFlair', appendBody);

test('the shared course/OCR append preserves existing records and metadata and skips duplicate name pairs', () => {
  const existing = { id: 12, lastName: 'Müller', firstName: 'Anna', performanceFlair: 'A', portrait: { existing: true } };
  const meta = { fileName: 'prior.csv' };
  const app = { courseDialogDraft: { students: [existing], importMeta: meta } };
  const result = append.call(app, [
    { lastName: ' MÜLLER ', firstName: 'anna' },
    { lastName: 'Wolf', firstName: 'Tom' },
    { lastName: 'Wolf', firstName: 'Tom' },
  ], (value) => String(value || '').trim().replace(/\s+/g, ' '), buildStudentNameMatchKey, (value) => value || null, (a, b) => a.lastName.localeCompare(b.lastName), normalizeGradeClassFlair);
  assert.deepEqual(result, { added: 1, skipped: 2, classesAdded: 0 });
  assert.equal(app.courseDialogDraft.students[0], existing);
  assert.equal(app.courseDialogDraft.importMeta, meta);
  assert.deepEqual(app.courseDialogDraft.students[1], { id: 0, lastName: 'Wolf', firstName: 'Tom', rufname: '', performanceFlair: '', classFlair: '', portrait: null });
});

test('re-importing known names only fills in missing classes and keeps every existing record intact', () => {
  const withoutClass = { id: 4, lastName: 'Müller', firstName: 'Tim', rufname: 'Timmy', performanceFlair: 'A', classFlair: '', portrait: { existing: true } };
  const withClass = { id: 5, lastName: 'Bauer', firstName: 'Max', performanceFlair: '', classFlair: 'a', portrait: null };
  const app = { courseDialogDraft: { students: [withoutClass, withClass] } };
  const result = append.call(app, [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'c' },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'b' },
    { lastName: 'Lang', firstName: 'Lea', classFlair: 'h' },
  ], (value) => String(value || '').trim().replace(/\s+/g, ' '), buildStudentNameMatchKey, (value) => value || null, (a, b) => a.lastName.localeCompare(b.lastName), normalizeGradeClassFlair);
  assert.deepEqual(result, { added: 1, skipped: 2, classesAdded: 1 });
  const byId = new Map(app.courseDialogDraft.students.map((student) => [student.id, student]));
  assert.deepEqual(byId.get(4), { ...withoutClass, classFlair: 'c' });
  assert.equal(withoutClass.classFlair, '');
  assert.equal(byId.get(5), withClass);
  assert.equal(app.courseDialogDraft.students.length, 3);
});
