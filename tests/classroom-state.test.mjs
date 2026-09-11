import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const [classroomFileSource, rosterStoreSource, studentSyncSource] = await Promise.all([
  read('../src/app/classroom-state.js'),
  read('../src/shared/roster-store.js'),
  read('../src/shared/student-sync-bus.js'),
]);
const studentSyncUrl = dataUrl(studentSyncSource);
const rosterStoreUrl = dataUrl(
  rosterStoreSource.replace("'./student-sync-bus.js'", `'${studentSyncUrl}'`)
);
const classroomSource = classroomFileSource
  .replace("'../shared/roster-store.js'", `'${rosterStoreUrl}'`)
  .replace("'../shared/student-sync-bus.js'", `'${studentSyncUrl}'`);
const [classroomModule, studentSync] = await Promise.all([
  import(dataUrl(classroomSource)),
  import(studentSyncUrl),
]);

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

globalThis.CustomEvent = TestCustomEvent;

function createBus() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.forEach(listener => listener(event));
      return true;
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function createHarness(options = {}) {
  const bus = createBus();
  const observed = [];
  const applied = [];
  let clock = options.now ?? 100;
  const classroom = classroomModule.createClassroomState({
    documentBus: bus,
    initialState: options.initialState || {
      students: [{
        id: '  ',
        first: 'Ada',
        last: 'Lovelace',
        performanceFlair: ' a ',
        portrait: { mime: 'image/webp', data: 'hidden' },
        buddies: [2, ''],
        foes: [3],
        randomWeight: '3',
      }],
      headers: ['Nachname', 'Vorname'],
      delim: ';',
      csvName: 'Klasse 1',
      performanceFlairCount: 4,
    },
    now: () => clock,
    normalizePerformanceFlair: value => String(value || '').trim().toUpperCase(),
    normalizeRandomPickerWeight: value => Math.max(0, Math.min(4, Number.parseInt(value, 10) || 0)),
    clampPerformanceFlairCount: (value, fallback = 4) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 2 ? Math.min(10, parsed) : fallback;
    },
    sanitizeCsvName: value => String(value || '').replace(/[<>]/g, '').trim(),
    onRosterObserved: detail => observed.push(detail),
    onRosterApplied: (detail, state) => applied.push({ detail, state }),
  });
  return {
    bus,
    classroom,
    observed,
    applied,
    setClock(value) {
      clock = value;
    },
  };
}

test('initialisiert Arbeitsstand und Shared-Roster mit der bisherigen Normalisierung', () => {
  const { classroom } = createHarness();
  assert.deepEqual(classroom.getState(), {
    students: [{
      id: '  ',
      first: 'Ada',
      last: 'Lovelace',
      performanceFlair: ' a ',
      portrait: { mime: 'image/webp', data: 'hidden' },
      buddies: [2, ''],
      foes: [3],
      randomWeight: '3',
    }],
    headers: ['Nachname', 'Vorname'],
    delim: ';',
    csvName: 'Klasse 1',
    performanceFlairCount: 4,
  });
  assert.deepEqual(classroom.rosterStore.getState(), {
    source: studentSync.STUDENTS_SYNC_SOURCE_GROUPS,
    students: [{
      id: '01',
      first: 'Ada',
      last: 'Lovelace',
      performanceFlair: 'A',
      portrait: null,
      buddies: ['2'],
      foes: ['3'],
      randomWeight: 3,
    }],
    performanceFlairCount: 4,
    csvName: 'Klasse 1',
    headers: ['Nachname', 'Vorname'],
    delim: ';',
    gradeCourseId: 0,
    gradeCourseName: '',
    importedAt: 100,
  });
});

test('hält lokale Updates zurück und veröffentlicht erst bei explizitem Sync', () => {
  const harness = createHarness({ initialState: {} });
  const students = [{ id: '', first: 'Kim', last: 'Test', randomWeight: 9 }];
  harness.classroom.updateState({
    students,
    headers: ['Name'],
    delim: '\t',
    csvName: 'Neu',
    performanceFlairCount: 6,
  });
  assert.equal(harness.observed.length, 0);
  assert.equal(harness.classroom.rosterStore.getState().students.length, 0);

  const result = harness.classroom.sync({ importedAt: 250 });
  assert.equal(result.source, studentSync.STUDENTS_SYNC_SOURCE_GROUPS);
  assert.equal(result.importedAt, 250);
  assert.deepEqual(result.students, [{
    id: '01',
    first: 'Kim',
    last: 'Test',
    performanceFlair: '',
    portrait: null,
    buddies: [],
    foes: [],
    randomWeight: 4,
  }]);
  assert.equal(harness.observed.length, 1);
  assert.equal(harness.applied.length, 1);
  assert.equal(harness.applied[0].detail, harness.observed[0]);
});

test('beobachtet alte Kursmetadaten, übernimmt aber nur neuere Roster-Stände', () => {
  const harness = createHarness({ initialState: {} });
  harness.classroom.rosterStore.dispatch({
    source: studentSync.STUDENTS_SYNC_SOURCE_GRADES,
    students: [{ id: '7', first: 'Neu', performanceFlair: 'b', randomWeight: 2 }],
    performanceFlairCount: 5,
    csvName: ' <Kurs Neu> ',
    headers: ['Neu'],
    delim: ';',
    gradeCourseId: 7,
    gradeCourseName: 'Mathematik',
    importedAt: 500,
  });
  const acceptedState = harness.classroom.getState();
  assert.equal(acceptedState.csvName, 'Kurs Neu');
  assert.equal(acceptedState.students[0].performanceFlair, 'B');
  assert.equal(harness.applied.length, 1);

  harness.classroom.rosterStore.dispatch({
    source: studentSync.STUDENTS_SYNC_SOURCE_SEATPLAN,
    students: [{ id: '8', first: 'Alt' }],
    csvName: 'Alt',
    importedAt: 500,
  });
  harness.classroom.rosterStore.dispatch({
    source: studentSync.STUDENTS_SYNC_SOURCE_GROUPS,
    students: [{ id: '9', first: 'Älter' }],
    csvName: 'Älter',
    importedAt: 400,
  });
  assert.equal(harness.observed.length, 3);
  assert.equal(harness.applied.length, 1);
  assert.equal(harness.classroom.getState(), acceptedState);
  assert.equal(harness.classroom.getState().students[0].first, 'Neu');
});

test('isoliert den Demo-State und stellt Arbeitsstand sowie Shared-Roster wieder her', () => {
  const harness = createHarness();
  const realState = harness.classroom.getState();
  const previousRoster = harness.classroom.rosterStore.getState();
  const restore = harness.classroom.activateDemoState({
    students: [{ id: 'D', first: 'Demo' }],
    csvName: 'Demo',
  });
  assert.equal(harness.classroom.isDemoActive(), true);
  assert.equal(harness.classroom.getState().csvName, 'Demo');

  harness.classroom.updateState({ headers: ['Demoheader'] });
  const duringSync = harness.classroom.sync({ importedAt: 800 });
  assert.deepEqual(duringSync, previousRoster);
  harness.classroom.rosterStore.dispatch({
    source: studentSync.STUDENTS_SYNC_SOURCE_GRADES,
    students: [{ id: 'X', first: 'Extern' }],
    csvName: 'Extern',
    importedAt: 900,
  });
  assert.equal(harness.observed.length, 0);
  assert.equal(harness.applied.length, 0);

  restore();
  restore();
  assert.equal(harness.classroom.isDemoActive(), false);
  assert.equal(harness.classroom.getState(), realState);
  assert.deepEqual(harness.classroom.rosterStore.getState(), previousRoster);
});

test('entfernt den Shared-Roster-Listener idempotent', () => {
  const harness = createHarness({ initialState: {} });
  assert.equal(harness.bus.listenerCount(studentSync.STUDENTS_UPDATED_EVENT), 1);
  harness.classroom.dispose();
  harness.classroom.dispose();
  assert.equal(harness.bus.listenerCount(studentSync.STUDENTS_UPDATED_EVENT), 0);
  harness.bus.dispatchEvent(new TestCustomEvent(studentSync.STUDENTS_UPDATED_EVENT, {
    detail: { students: [{ id: '1', first: 'Ignored' }], importedAt: 1000 },
  }));
  assert.equal(harness.classroom.getState().students.length, 0);
});

test('hält Classroom-State, Feature-Module und Offline-Grenzen getrennt', async () => {
  const [mainSource, serviceWorker, audit] = await Promise.all([
    read('../src/app/app-runtime.js'),
    read('../sw.js'),
    read('../scripts/audit.py'),
  ]);
  assert.match(mainSource, /from '\.\/classroom-state\.js'/);
  assert.match(mainSource, /classroomState = createClassroomState\(\{/);
  assert.doesNotMatch(mainSource, /createSharedRosterStore|syncSharedRosterState|cloneStudentsForSync|lastRosterImportedAt/);
  assert.doesNotMatch(mainSource, /state\.(?:students|headers|delim|csvName|performanceFlairCount)/);
  assert.doesNotMatch(classroomFileSource, /\.\.\/modules\//);
  assert.match(serviceWorker, /\.\/src\/app\/classroom-state\.js/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'classroom-state\.js'/);
});
