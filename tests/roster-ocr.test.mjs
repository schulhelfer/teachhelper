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
const { parseOcrNames, parseOcrLayout, ocrLinesFromTsv, importableOcrNames, boundCrop, changeCrop, cropPixels, ocrOutputSize } = await loadModule('../src/modules/grades/roster-ocr-data.js');
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
    worker.onmessage({ data: { type, text: 'Müller Anna', tsv: '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tMüller' } });
    if (type === 'error') await assert.rejects(promise, /lokale Texterkennung/);
    else assert.deepEqual(await promise, { text: 'Müller Anna', tsv: '5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\tMüller' });
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

const tsvWord = (line, index, left, width, text, height = 20) => `5\t1\t1\t1\t${line}\t${index}\t${left}\t${line * 30}\t${width}\t${height}\t90\t${text}`;
const tsvTable = (rows) => rows.flatMap((words, line) => words.map(([left, width, text], index) => tsvWord(line + 1, index + 1, left, width, text))).join('\n');
const layoutRows = (rows, order) => parseOcrLayout(ocrLinesFromTsv(tsvTable(rows)), order)
  .map(({ lastName, firstName, classFlair, notes }) => ({ lastName, firstName, classFlair, notes }));

test('TSV words are grouped into lines in reading order and non-word rows are ignored', () => {
  const tsv = [
    '1\t1\t0\t0\t0\t0\t0\t0\t752\t180\t-1\t',
    '4\t1\t1\t1\t1\t0\t40\t72\t664\t56\t-1\t',
    '5\t1\t1\t1\t1\t2\t376\t72\t136\t56\t83.2\tMIA',
    '5\t1\t1\t1\t1\t1\t40\t72\t232\t56\t90.4\tMEIER',
    '5\t1\t1\t1\t2\t1\t40\t140\t200\t56\t91.0\tBAUER',
    '5\t1\t1\t1\t2\t2\t300\t140\t20\t56\t10.0\t ',
  ].join('\n');
  assert.deepEqual(ocrLinesFromTsv(tsv), [
    { words: [{ text: 'MEIER', left: 40, right: 272, height: 56 }, { text: 'MIA', left: 376, right: 512, height: 56 }] },
    { words: [{ text: 'BAUER', left: 40, right: 240, height: 56 }] },
  ]);
  assert.deepEqual(ocrLinesFromTsv(''), []);
});

test('a class column in a printed table is recognized even where single cells were misread', () => {
  assert.deepEqual(layoutRows([
    [[10, 80, 'Nachname'], [200, 70, 'Vorname'], [400, 60, 'Klasse']],
    [[10, 70, 'Müller'], [200, 40, 'Tim'], [405, 30, '9a']],
    [[10, 60, 'Bauer'], [200, 40, 'Max'], [404, 30, 'sa']],
    [[10, 40, 'van'], [55, 35, 'der'], [95, 50, 'Meer'], [200, 50, 'Anna'], [255, 60, 'Maria'], [406, 28, '9b']],
    [[10, 60, 'Lang'], [200, 40, 'Lea'], [403, 32, '9x']],
    [[10, 60, 'Wolf'], [200, 40, 'Tom']],
    [[10, 60, 'Kern'], [200, 40, 'Ida'], [405, 30, '90']],
  ]), [
    { lastName: 'Nachname', firstName: 'Vorname', classFlair: '', notes: [] },
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a', notes: [] },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'a', notes: ['„sa“ als Klasse a gelesen'] },
    { lastName: 'van der Meer', firstName: 'Anna Maria', classFlair: 'b', notes: [] },
    { lastName: 'Lang', firstName: 'Lea', classFlair: '', notes: ['„9x“ entfernt – keine gültige Klasse'] },
    { lastName: 'Wolf', firstName: 'Tom', classFlair: '', notes: [] },
    { lastName: 'Kern', firstName: 'Ida', classFlair: 'c', notes: ['„90“ als Klasse c gelesen'] },
  ]);
});

test('the class column may stand before or between the name columns', () => {
  assert.deepEqual(layoutRows([
    [[10, 30, '7a'], [100, 70, 'Müller'], [300, 40, 'Tim']],
    [[12, 28, 'Ta'], [100, 60, 'Bauer'], [300, 40, 'Max']],
    [[11, 30, '7b'], [100, 60, 'Lang'], [300, 40, 'Lea']],
  ]), [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a', notes: [] },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'a', notes: ['„Ta“ als Klasse a gelesen'] },
    { lastName: 'Lang', firstName: 'Lea', classFlair: 'b', notes: [] },
  ]);
  assert.deepEqual(layoutRows([
    [[10, 40, 'Anna'], [200, 30, '9c'], [300, 60, 'Berg']],
    [[10, 40, 'Ben'], [202, 28, 'so'], [300, 60, 'Kurz']],
    [[10, 40, 'Ida'], [201, 30, '9a'], [300, 60, 'Hahn']],
  ], 'first-last'), [
    { firstName: 'Anna', lastName: 'Berg', classFlair: 'c', notes: [] },
    { firstName: 'Ben', lastName: 'Kurz', classFlair: 'c', notes: ['„so“ als Klasse c gelesen'] },
    { firstName: 'Ida', lastName: 'Hahn', classFlair: 'a', notes: [] },
  ]);
});

test('without a recognizable class column the layout falls back to the text rules', () => {
  const rows = [
    [[10, 70, 'Müller'], [200, 40, 'Tim'], [400, 30, '9a']],
    [[10, 60, 'Bauer'], [200, 40, 'Max'], [400, 30, '90']],
  ];
  assert.deepEqual(layoutRows([rows[0], [[10, 60, 'Bauer'], [200, 40, 'Max']]]), [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a', notes: [] },
    { lastName: 'Bauer', firstName: 'Max', classFlair: '', notes: [] },
  ]);
  assert.deepEqual(layoutRows([[[10, 40, 'van'], [55, 35, 'der'], [95, 50, 'Meer'], [200, 40, 'Léa']]]), [
    { lastName: 'van der Meer', firstName: 'Léa', classFlair: '', notes: [] },
  ]);
  assert.equal(layoutRows(rows)[1].classFlair, 'c');
});

test('text-based parsing explains every change it makes to the recognized names', () => {
  const notes = (text) => parseOcrNames(text).map((row) => row.notes);
  assert.deepEqual(notes('Müller  Tim  9a\n1. Bauer, Max'), [[], []]);
  assert.deepEqual(notes('Müller  Tim  90'), [['„90“ als Klasse c gelesen']]);
  assert.deepEqual(notes('Müller  Tim  9o'), [['„9o“ als Klasse c gelesen']]);
  assert.deepEqual(notes('Müller  Tim  7h'), [['„7h“ entfernt – keine gültige Klasse']]);
  assert.deepEqual(notes('7a  Müller  Tim  11b'), [['Mehrere Klassen erkannt („7a“, „11b“) – keine übernommen']]);
  assert.deepEqual(notes('Müller  Tim  20'), [['„20“ als Klasse c gelesen']]);
  assert.deepEqual(notes('Müller  Tim  123'), [['„123“ aus dem Namen entfernt']]);
});

test('one clearly read class anchors the column when other rows have short words right below it', () => {
  assert.deepEqual(layoutRows([
    [[10, 70, 'Müller'], [200, 40, 'Tim'], [404, 30, 'sa']],
    [[10, 60, 'Bauer'], [200, 40, 'Max'], [405, 30, '9a']],
    [[10, 60, 'Lang'], [200, 40, 'Lea'], [403, 32, 'Se']],
  ]), [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a', notes: ['„sa“ als Klasse a gelesen'] },
    { lastName: 'Bauer', firstName: 'Max', classFlair: 'a', notes: [] },
    { lastName: 'Lang', firstName: 'Lea', classFlair: 'e', notes: ['„Se“ als Klasse e gelesen'] },
  ]);
  assert.deepEqual(layoutRows([
    [[10, 70, 'Müller'], [200, 40, 'Tim'], [404, 30, '9a']],
    [[10, 60, 'Bauer'], [200, 40, 'Max']],
    [[10, 60, 'Lang'], [200, 90, 'Leonie']],
  ]), [
    { lastName: 'Müller', firstName: 'Tim', classFlair: 'a', notes: [] },
    { lastName: 'Bauer', firstName: 'Max', classFlair: '', notes: [] },
    { lastName: 'Lang', firstName: 'Leonie', classFlair: '', notes: [] },
  ]);
});

test('uncertain symbols stay visible in the name and are flagged instead of being silently dropped', () => {
  const rows = parseOcrNames('L&  Anna\nNguy&n  Minh\nL€, Bao');
  assert.deepEqual(rows.map(({ lastName, firstName, notes }) => ({ lastName, firstName, notes })), [
    { lastName: 'L&', firstName: 'Anna', notes: ['„L&“ enthält ein unsicher erkanntes Zeichen („&“) – bitte prüfen'] },
    { lastName: 'Nguy&n', firstName: 'Minh', notes: ['„Nguy&n“ enthält ein unsicher erkanntes Zeichen („&“) – bitte prüfen'] },
    { lastName: 'L€', firstName: 'Bao', notes: ['„L€“ enthält ein unsicher erkanntes Zeichen („€“) – bitte prüfen'] },
  ]);
  assert.deepEqual(
    parseOcrNames('Müller,  Anna .\n• Bauer   Max\n|Lang:   Lea\nSt. Clair  Tom\nO’Neill  Max\nMüller-Schön  Anna').map((row) => row.notes),
    [[], [], [], [], [], []],
  );
});

test('Vietnamese names pass unflagged while German names with a misread tilde get a suggestion', () => {
  const rows = parseOcrNames('Lê  Anna\nNguyễn  Minh\nTrần  Bảo\nVũ  Lan\nPhạm  Thị Hồng\nMũller  Tim\nSchrõder  Jörg\nWeiß  Gaẽlle');
  assert.deepEqual(rows.map((row) => row.notes), [
    [], [], [], [], [],
    ['„Mũller“ – Akzent prüfen (evtl. „Müller“)'],
    ['„Schrõder“ – Akzent prüfen (evtl. „Schröder“)'],
    ['„Gaẽlle“ – Akzent prüfen (evtl. „Gaëlle“)'],
  ]);
  assert.deepEqual(importableOcrNames(rows).slice(0, 2), [
    { lastName: 'Lê', firstName: 'Anna', classFlair: '' },
    { lastName: 'Nguyễn', firstName: 'Minh', classFlair: '' },
  ]);
  assert.equal(rows[5].lastName, 'Mũller');
});

test('a single word in capitals inside a normally written list is flagged as a possibly lost accent', () => {
  const rows = parseOcrNames('LE  Anna\nMüller  Tim\nNguyễn  Minh\nTrần  Bảo');
  assert.deepEqual(rows.map((row) => row.notes), [
    ['„LE“ in Großbuchstaben erkannt – evtl. Akzent verloren, bitte prüfen'], [], [], [],
  ]);
  assert.equal(rows[0].lastName, 'LE');
  assert.deepEqual(parseOcrNames('MÜLLER  Tim\nBAUER  Max\nLE  Anna').map((row) => row.notes), [[], [], []]);
  assert.deepEqual(parseOcrNames('Müller  T. J.\nBauer  Max').map((row) => row.notes), [[], []]);
  assert.deepEqual(layoutRows([
    [[10, 40, 'LE'], [200, 50, 'Anna'], [405, 30, '9a']],
    [[10, 70, 'Müller'], [200, 40, 'Tim'], [404, 30, '9b']],
  ]).map((row) => row.notes), [['„LE“ in Großbuchstaben erkannt – evtl. Akzent verloren, bitte prüfen'], []]);
});
