import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const moduleCache = new Map();
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

async function loadModuleUrl(fileUrl) {
  const key = fileUrl.href;
  if (moduleCache.has(key)) return moduleCache.get(key);
  if (key.includes('archive-pdf')) {
    const url = dataUrl(`
      export async function buildWorkspaceArchivePdfBytes() { return new Uint8Array(); }
      export function downloadWorkspaceArchivePdf() {}
    `);
    moduleCache.set(key, url);
    return url;
  }
  let source;
  try {
    source = await readFile(fileUrl, 'utf8');
  } catch {
    const url = dataUrl('export default {};');
    moduleCache.set(key, url);
    return url;
  }
  const specifiers = [...new Set([...source.matchAll(/["'](\.\.?\/[^"']+)["']/g)].map((match) => match[1]))]
    .sort((left, right) => right.length - left.length);
  moduleCache.set(key, 'pending');
  for (const specifier of specifiers) {
    const url = await loadModuleUrl(new URL(specifier, fileUrl));
    source = source.split(specifier).join(url);
  }
  const url = dataUrl(source);
  moduleCache.set(key, url);
  return url;
}

globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  createElement: () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    setAttribute() {},
    click() {},
  }),
  body: { appendChild() {}, removeChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const storeUrl = await loadModuleUrl(new URL('../src/modules/workspace/store.js', import.meta.url));
const { WorkspaceStore } = await import(storeUrl);

const SERIES_START = '2025-09-01';
const SERIES_END = '2025-12-19';

function createStore() {
  const store = new WorkspaceStore();
  store._save = () => {};
  return store;
}

function setupSeries(dayOfWeek) {
  const store = createStore();
  const year = store.createSchoolYear(2025);
  assert.ok(year, 'Schuljahr muss angelegt werden');
  const yearId = year.id;
  store.setActiveSchoolYear(yearId);
  store.state.freeRanges = [];
  store.state.specialDays = [];
  const courseId = store.createCourse(yearId, 'Mathe');
  assert.ok(courseId, 'Kurs muss angelegt werden');
  const slotId = store.createSlot(courseId, dayOfWeek, 3, 1, SERIES_START, SERIES_END, 0, 'lesson', yearId);
  assert.ok(slotId, 'Slot muss angelegt werden');
  return { store, yearId, courseId, slotId };
}

function lessonDatesForSlot(store, slotId) {
  return store.state.lessons
    .filter((lesson) => lesson.slotId === slotId)
    .map((lesson) => lesson.lessonDate)
    .sort();
}

function setTopics(store, slotId, fromDate, topics) {
  const rows = store.state.lessons
    .filter((lesson) => lesson.slotId === slotId && lesson.lessonDate >= fromDate)
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));
  topics.forEach((topic, index) => {
    if (rows[index]) rows[index].topic = topic;
  });
}

test('Rückwärts-Verschiebung (Do auf Di) lässt keine Lücke in der Übergangswoche', () => {
  const { store, yearId, courseId, slotId } = setupSeries(4);
  const clicked = '2025-09-11';
  assert.ok(lessonDatesForSlot(store, slotId).includes(clicked));

  const result = store.splitSlotFromDate(yearId, slotId, clicked, courseId, 2, 3, 1, SERIES_END, 0);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'split');

  const oldDates = lessonDatesForSlot(store, slotId);
  const newDates = lessonDatesForSlot(store, result.newSlotId);

  assert.equal(oldDates.at(-1), clicked);
  assert.equal(newDates[0], '2025-09-16');

  const week = ['2025-09-08', '2025-09-09', '2025-09-10', '2025-09-11', '2025-09-12'];
  const inWeek = [...oldDates, ...newDates].filter((date) => week.includes(date));
  assert.deepEqual(inWeek, [clicked]);
});

test('Vorwärts-Verschiebung (Di auf Do) greift weiterhin in derselben Woche', () => {
  const { store, yearId, courseId, slotId } = setupSeries(2);
  const clicked = '2025-09-09';

  const result = store.splitSlotFromDate(yearId, slotId, clicked, courseId, 4, 3, 1, SERIES_END, 0);
  assert.equal(result.ok, true);

  const oldDates = lessonDatesForSlot(store, slotId);
  const newDates = lessonDatesForSlot(store, result.newSlotId);

  assert.equal(oldDates.at(-1), clicked);
  assert.equal(newDates[0], '2025-09-11');

  const week = ['2025-09-08', '2025-09-09', '2025-09-10', '2025-09-11', '2025-09-12'];
  const inWeek = [...oldDates, ...newDates].filter((date) => week.includes(date)).sort();
  assert.deepEqual(inWeek, [clicked, '2025-09-11']);
});

test('gleicher Wochentag schneidet unverändert exakt am gewählten Datum', () => {
  const { store, yearId, courseId, slotId } = setupSeries(2);
  const clicked = '2025-09-09';

  const result = store.splitSlotFromDate(yearId, slotId, clicked, courseId, 2, 5, 1, SERIES_END, 0);
  assert.equal(result.ok, true);

  const oldDates = lessonDatesForSlot(store, slotId);
  const newDates = lessonDatesForSlot(store, result.newSlotId);

  assert.equal(oldDates.at(-1), '2025-09-02');
  assert.equal(newDates[0], clicked);
  assert.equal(store.getSlot(result.newSlotId).startHour, 5);
});

test('Themen wandern ohne Versatz an die neuen Termine', () => {
  const { store, yearId, courseId, slotId } = setupSeries(4);
  const clicked = '2025-09-11';
  setTopics(store, slotId, '2025-09-18', ['Thema A', 'Thema B', 'Thema C']);

  const result = store.splitSlotFromDate(yearId, slotId, clicked, courseId, 2, 3, 1, SERIES_END, 0);
  assert.equal(result.ok, true);

  const newRows = store.state.lessons
    .filter((lesson) => lesson.slotId === result.newSlotId)
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));

  assert.deepEqual(
    newRows.slice(0, 3).map((row) => [row.lessonDate, row.topic]),
    [
      ['2025-09-16', 'Thema A'],
      ['2025-09-23', 'Thema B'],
      ['2025-09-30', 'Thema C'],
    ],
  );
});

test('"alle Termine" behält die Startwoche beim Wechsel auf einen früheren Wochentag', () => {
  const { store, yearId, courseId, slotId } = setupSeries(4);
  assert.equal(lessonDatesForSlot(store, slotId)[0], '2025-09-04');

  store.updateSlot(slotId, courseId, 2, 3, 1, '2025-09-11', SERIES_END, 0, 'lesson', yearId);

  const dates = lessonDatesForSlot(store, slotId);
  assert.equal(dates[0], '2025-09-09');
  assert.equal(store.getSlot(slotId).startDate, '2025-09-09');
});

test('"alle Termine" verschiebt eine Halbjahresserie ohne die Startwoche zu verlieren', () => {
  const store = createStore();
  const year = store.createSchoolYear(2025);
  store.setActiveSchoolYear(year.id);
  store.state.freeRanges = [];
  store.state.specialDays = [];
  const courseId = store.createCourse(year.id, 'Deutsch');
  const slotId = store.createSlot(courseId, 5, 3, 1, '2026-02-06', '2026-06-30', 0, 'lesson', year.id);

  store.updateSlot(slotId, courseId, 1, 3, 1, '2026-02-06', '2026-06-30', 0, 'lesson', year.id);

  assert.equal(lessonDatesForSlot(store, slotId)[0], '2026-02-02');
});

test('"alle Termine" zieht das Startdatum nicht vor den Schuljahresbeginn', () => {
  const store = createStore();
  const year = store.createSchoolYear(2025);
  store.setActiveSchoolYear(year.id);
  store.state.freeRanges = [];
  store.state.specialDays = [];
  const courseId = store.createCourse(year.id, 'Physik');
  const slotId = store.createSlot(courseId, 1, 3, 1, year.startDate, SERIES_END, 0, 'lesson', year.id);

  store.updateSlot(slotId, courseId, 5, 3, 1, year.startDate, SERIES_END, 0, 'lesson', year.id);

  assert.ok(store.getSlot(slotId).startDate >= year.startDate);
  assert.ok(lessonDatesForSlot(store, slotId)[0] >= year.startDate);
});

test('gleicher Wochentag lässt das Startdatum bei "alle Termine" unangetastet', () => {
  const { store, yearId, courseId, slotId } = setupSeries(4);

  store.updateSlot(slotId, courseId, 4, 5, 1, '2025-09-11', SERIES_END, 0, 'lesson', yearId);

  assert.equal(store.getSlot(slotId).startDate, '2025-09-11');
  assert.equal(lessonDatesForSlot(store, slotId)[0], '2025-09-11');
});

test('alter und neuer Slot überlappen an keinem Datum', () => {
  const { store, yearId, courseId, slotId } = setupSeries(4);

  const result = store.splitSlotFromDate(yearId, slotId, '2025-09-11', courseId, 2, 3, 1, SERIES_END, 0);
  assert.equal(result.ok, true);

  const oldDates = new Set(lessonDatesForSlot(store, slotId));
  const overlap = lessonDatesForSlot(store, result.newSlotId).filter((date) => oldDates.has(date));
  assert.deepEqual(overlap, []);
});

test('schiefe Bestands-Slots werden auf ihren Wochentag geradegezogen', () => {
  const { store, yearId, slotId } = setupSeries(4);
  store.getSlot(slotId).startDate = '2025-09-05';

  const repaired = store.realignSlotStartDates(yearId);

  assert.equal(repaired.length, 1);
  assert.deepEqual(repaired[0], { slotId, from: '2025-09-05', to: '2025-09-11' });
  assert.equal(store.getSlot(slotId).startDate, '2025-09-11');
});

test('passende Slots bleiben bei der Reparatur unangetastet', () => {
  const { store, yearId, slotId } = setupSeries(4);
  const before = store.getSlot(slotId).startDate;

  assert.deepEqual(store.realignSlotStartDates(yearId), []);
  assert.equal(store.getSlot(slotId).startDate, before);
});

test('die Reparatur schiebt einen Slot nicht über sein Enddatum hinaus', () => {
  const { store, yearId, courseId } = setupSeries(4);
  const shortId = store.createSlot(courseId, 4, 5, 1, '2025-09-05', '2025-09-09', 0, 'lesson', yearId);

  assert.deepEqual(store.realignSlotStartDates(yearId), []);
  assert.equal(store.getSlot(shortId).startDate, '2025-09-05');
});

test('beim Laden einer Datenbank wird ein schiefer Slot repariert', () => {
  const { store, yearId, slotId } = setupSeries(4);
  store.getSlot(slotId).startDate = '2025-09-05';
  const snapshot = JSON.parse(JSON.stringify(store.exportPublicStateSnapshot()));

  const loaded = createStore();
  const result = loaded.importDatabaseState(snapshot, null, {});
  assert.equal(result.ok, true);

  assert.equal(loaded.getSlot(slotId).startDate, '2025-09-11');
  assert.equal(lessonDatesForSlot(loaded, slotId)[0], '2025-09-11');
  assert.ok(yearId);
});
