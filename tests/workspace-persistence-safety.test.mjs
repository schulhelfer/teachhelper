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
globalThis.showOpenFilePicker = () => {};
globalThis.showSaveFilePicker = () => {};
globalThis.showDirectoryPicker = () => {};

const [storeUrl, runtimeUrl, thdbUrl] = await Promise.all([
  loadModuleUrl(new URL('../src/modules/workspace/store.js', import.meta.url)),
  loadModuleUrl(new URL('../src/modules/workspace/runtime.js', import.meta.url)),
  loadModuleUrl(new URL('../src/shared/school-data/thdb.js', import.meta.url)),
]);
const { WorkspaceStore } = await import(storeUrl);
const { WorkspaceRuntime } = await import(runtimeUrl);
const { parseThdb1ContainerBytes } = await import(thdbUrl);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createFileHandle(name = 'schule.thdb') {
  let bytes = new Uint8Array();
  let writeDelayMs = 0;
  let writesStarted = 0;
  const writeWaiters = [];
  const notifyWriteStarted = () => {
    writesStarted += 1;
    for (let index = writeWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = writeWaiters[index];
      if (waiter.expected > writesStarted) continue;
      writeWaiters.splice(index, 1);
      waiter.resolve();
    }
  };
  const handle = {
    name,
    kind: 'file',
    async getFile() {
      const current = bytes;
      return {
        name,
        size: current.length,
        async arrayBuffer() { return current.slice().buffer; },
      };
    },
    async createWritable() {
      const chunks = [];
      return {
        async write(chunk) { chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)); },
        async close() {
          notifyWriteStarted();
          if (writeDelayMs) await sleep(writeDelayMs);
          const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
          bytes = merged;
        },
        async abort() {},
      };
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async isSameEntry(other) { return other === handle; },
    read() { return bytes; },
    setBytes(nextBytes) { bytes = new Uint8Array(nextBytes); },
    setWriteDelay(ms) { writeDelayMs = ms; },
    waitForNextWrite() {
      const expected = writesStarted + 1;
      return new Promise((resolve) => writeWaiters.push({ expected, resolve }));
    },
  };
  return handle;
}

function createDirectoryHandle(entries = []) {
  const files = new Map(entries);
  return {
    kind: 'directory',
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async getFileHandle(name, options = {}) {
      const key = String(name || '');
      if (files.has(key)) return files.get(key);
      if (!options.create) {
        const error = new Error(`Datei nicht gefunden: ${key}`);
        error.name = 'NotFoundError';
        throw error;
      }
      const handle = createFileHandle(key);
      files.set(key, handle);
      return handle;
    },
    getFile(name) { return files.get(String(name || '')) || null; },
  };
}

function createRuntime() {
  const store = new WorkspaceStore();
  const runtime = new WorkspaceRuntime(store, { eventTarget: new EventTarget() });
  runtime.storeHandle = async () => true;
  runtime.loadStoredHandle = async () => null;
  runtime.removeStoredHandle = async () => true;
  runtime.openHandleDb = async () => null;
  return { store, runtime };
}

const portrait = (seed) => ({ mime: 'image/webp', data: Buffer.alloc(8 * 1024, seed % 250).toString('base64') });

const parseContainer = (bytes) => parseThdb1ContainerBytes(bytes, {
  schemas: ['teachhelper-db-v2'],
  includePlanningPublic: true,
  includeGradeCourseSegments: true,
});

async function settle(runtime) {
  await runtime.operationTail;
  await sleep(120);
  await runtime.operationTail;
}

async function seedDatabase({ name = 'schule.thdb', courseNames = ['5a', '7b', '9c'] } = {}) {
  const handle = createFileHandle(name);
  const { store, runtime } = createRuntime();
  const year = store.getActiveSchoolYear();
  const courseIds = courseNames.map((courseName) => store.createCourse(year.id, courseName, '#3CB44B', false, false, 'Mathe'));
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  runtime.fileName = handle.name;
  runtime.databaseLoaded = true;
  for (const courseId of courseIds) {
    await runtime.runGradeCourseMutation(
      courseId,
      () => store.replaceGradeStudentsForCourse(
        courseId,
        Array.from({ length: 4 }, (_, index) => ({
          id: 0,
          lastName: `Nachname${index}`,
          firstName: `Vorname${index}`,
          portrait: portrait(index + courseId),
        })),
        null,
        {},
      ),
      { skipAutoSave: true },
    );
  }
  await runtime.saveToConnectedFile('seed');
  return { handle, courseIds, bytes: handle.read(), store, runtime };
}

test('an auto-save fired before the database finished loading never truncates the file', async () => {
  const { handle, courseIds, bytes } = await seedDatabase();
  const { store, runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  runtime.fileName = handle.name;
  handle.setWriteDelay(20);

  assert.equal(runtime.setGradeCourseStudentCounts({}), false);
  store.setSetting('showGradeStudentPortraits', true);
  await sleep(5);
  await runtime.loadBytes(bytes, 'file');
  await settle(runtime);

  const parsed = parseContainer(handle.read());
  assert.deepEqual(parsed.gradeCourseSegments.map((segment) => segment.courseId), courseIds);
  assert.deepEqual(JSON.parse(parsed.planningPublicText).courses.map((course) => Number(course.id)), courseIds);
  assert.deepEqual([...runtime.segmentTexts.keys()], courseIds);
  assert.equal((await runtime.getGradeCourseRosterSummary(courseIds[1])).studentCount, 4);
});

test('no write happens while the connected database has not been loaded', async () => {
  const { handle, bytes } = await seedDatabase();
  const { runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;

  assert.equal(runtime.databaseLoaded, false);
  assert.equal(await runtime.saveToConnectedFile('auto-save'), false);
  assert.deepEqual(handle.read(), bytes);
  await assert.rejects(() => runtime.exportBackup(), /noch nicht vollständig geladen/);
});

test('buildContainer keeps persisted grade segments even when the course list is empty', async () => {
  const { handle, courseIds, bytes } = await seedDatabase();
  const { store, runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  await runtime.loadBytes(bytes, 'file');
  assert.deepEqual([...runtime.persistedCourseIds], courseIds);

  store.state.courses = [];
  const built = await runtime.buildContainer('save');
  assert.deepEqual(built.header.gradeCourseSegments.map((descriptor) => descriptor.courseId), courseIds);
});

test('a save that would drop segments present on disk is refused and reported', async () => {
  const { handle, bytes } = await seedDatabase();
  const { store, runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  await runtime.loadBytes(bytes, 'file');

  runtime.segmentTexts.clear();
  runtime.courseCache.clear();
  runtime.persistedCourseIds.clear();
  store.state.courses = [];

  await assert.rejects(() => runtime.saveToConnectedFile('auto-save'), (error) => {
    assert.equal(error.code, 'PERSISTENCE_INCOMPLETE');
    assert.match(error.message, /Speichern abgebrochen/);
    return true;
  });
  assert.deepEqual(handle.read(), bytes);

  runtime.queueSyncSave('auto-save');
  await settle(runtime);
  const snapshot = runtime.createWorkspaceSnapshot('shell');
  assert.equal(snapshot.persistence.statusError, true);
  assert.match(snapshot.persistence.statusText, /Speichern abgebrochen/);
  assert.ok(snapshot.persistence.statusAt > 0);
  assert.deepEqual(handle.read(), bytes);
});

test('an explicitly deleted course may disappear from the file', async () => {
  const { handle, courseIds, bytes } = await seedDatabase();
  const { runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  await runtime.loadBytes(bytes, 'file');

  await runtime.handleWorkspaceCommand({
    client: 'planning',
    command: 'delete-course',
    payload: { courseId: courseIds[0], destructive: true },
  });
  await settle(runtime);

  const parsed = parseContainer(handle.read());
  assert.deepEqual(parsed.gradeCourseSegments.map((segment) => segment.courseId), courseIds.slice(1));
});

test('a save built before a reload never overwrites the freshly loaded segments', async () => {
  const { handle, courseIds, bytes } = await seedDatabase();
  const { runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  await runtime.loadBytes(bytes, 'file');

  handle.setWriteDelay(40);
  const save = runtime.saveToConnectedFile('grades-auto-save');
  await sleep(5);
  await runtime.loadBytes(bytes, 'file');
  assert.equal(await save, false);
  await settle(runtime);

  assert.deepEqual([...runtime.segmentTexts.keys()], courseIds);
  assert.deepEqual([...runtime.persistedCourseIds], courseIds);
  assert.deepEqual(parseContainer(handle.read()).gradeCourseSegments.map((segment) => segment.courseId), courseIds);
});

test('a reconnect waits for an automatic save and never changes the new database file', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const target = await seedDatabase({ name: 'target.thdb', courseNames: ['Zielkurs'] });
  const targetBytes = target.handle.read().slice();
  source.handle.setWriteDelay(40);

  const writeStarted = source.handle.waitForNextWrite();
  source.store.setSetting('showGradeStudentPortraits', true);
  await writeStarted;

  const reconnect = source.runtime.acceptWorkspaceSyncFileHandle(target.handle, 'existing');
  await sleep(5);
  assert.equal(source.runtime.fileHandle, source.handle);

  assert.equal(await reconnect, true);
  assert.equal(source.runtime.fileHandle, target.handle);
  assert.deepEqual(target.handle.read(), targetBytes);
  assert.deepEqual(
    parseContainer(target.handle.read()).gradeCourseSegments.map((segment) => segment.courseId),
    target.courseIds,
  );
});

test('creating a new empty database waits for an automatic save without deadlocking', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const directory = createDirectoryHandle();
  const targetName = source.runtime.buildNewDatabaseSuggestedName();
  source.handle.setWriteDelay(40);

  const writeStarted = source.handle.waitForNextWrite();
  source.store.setSetting('showGradeStudentPortraits', true);
  await writeStarted;

  const create = source.runtime.createEmptyWorkspaceFileInDirectory(directory, { schoolYearStart: 2026 });
  await sleep(5);
  assert.equal(source.runtime.fileHandle, source.handle);

  assert.equal(await create, true);
  const target = directory.getFile(targetName);
  assert.ok(target);
  assert.equal(source.runtime.fileHandle, target);
  assert.deepEqual(parseContainer(target.read()).gradeCourseSegments, []);
});

test('creating a new empty database leaves the previously connected file byte-for-byte unchanged', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const sourceBytes = source.handle.read().slice();
  const directory = createDirectoryHandle();
  const targetName = source.runtime.buildNewDatabaseSuggestedName();

  assert.equal(await source.runtime.createEmptyWorkspaceFileInDirectory(directory, { schoolYearStart: 2026 }), true);
  const target = directory.getFile(targetName);
  assert.ok(target);
  assert.notEqual(target, source.handle);
  assert.deepEqual(source.handle.read(), sourceBytes);
  assert.equal(source.runtime.fileHandle, target);
  assert.deepEqual(parseContainer(target.read()).gradeCourseSegments, []);
});

test('creating a new empty database refuses an existing (neu) file without changing it', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const targetName = source.runtime.buildNewDatabaseSuggestedName();
  const target = createFileHandle(targetName);
  target.setBytes(Uint8Array.of(1, 2, 3));
  const directory = createDirectoryHandle([[targetName, target]]);

  await assert.rejects(
    () => source.runtime.createEmptyWorkspaceFileInDirectory(directory, { schoolYearStart: 2026 }),
    /existiert bereits/,
  );
  assert.equal(source.runtime.fileHandle, source.handle);
  assert.deepEqual(target.read(), Uint8Array.of(1, 2, 3));
});

test('creating a new empty database aborts when the new target is changed before writing', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const targetName = source.runtime.buildNewDatabaseSuggestedName();
  const directory = createDirectoryHandle();
  const buildEmpty = source.runtime.buildEmptyDatabaseContainer.bind(source.runtime);
  source.runtime.buildEmptyDatabaseContainer = (...args) => {
    directory.getFile(targetName).setBytes(Uint8Array.of(1, 2, 3));
    return buildEmpty(...args);
  };

  await assert.rejects(
    () => source.runtime.createEmptyWorkspaceFileInDirectory(directory, { schoolYearStart: 2026 }),
    /wurde vor dem Schreiben geändert/,
  );
  assert.deepEqual(directory.getFile(targetName).read(), Uint8Array.of(1, 2, 3));
});

test('a stale save uses its original file handle when a reconnect starts at the final save boundary', async () => {
  const source = await seedDatabase({ name: 'source.thdb' });
  const target = await seedDatabase({ name: 'target.thdb', courseNames: ['Zielkurs'] });
  const targetBytes = target.handle.read().slice();
  const assertComplete = source.runtime.assertContainerKeepsPersistedCourses.bind(source.runtime);
  let reconnect = null;

  source.runtime.assertContainerKeepsPersistedCourses = (built, courseIds) => {
    assertComplete(built, courseIds);
    reconnect = source.runtime.acceptWorkspaceSyncFileHandle(target.handle, 'existing');
  };

  assert.equal(await source.runtime.saveToConnectedFile('stale-save-race'), false);
  assert.ok(reconnect);
  assert.equal(await reconnect, true);
  assert.equal(source.runtime.fileHandle, target.handle);
  assert.deepEqual(target.handle.read(), targetBytes);
  assert.deepEqual(
    parseContainer(target.handle.read()).gradeCourseSegments.map((segment) => segment.courseId),
    target.courseIds,
  );
});

test('a reconnect whose load fails does not keep the file connected', async () => {
  const { handle, bytes } = await seedDatabase();
  const { runtime } = createRuntime();
  runtime.readHandleBytes = async () => { throw new Error('Datenbankdatei ist ungültig oder beschädigt.'); };

  await assert.rejects(() => runtime.acceptWorkspaceSyncFileHandle(handle, 'reconnect'), /beschädigt/);
  assert.equal(runtime.fileHandle, null);
  assert.equal(runtime.databaseLoaded, false);
  assert.equal(runtime.queueSyncSave('auto-save'), false);
  assert.deepEqual(handle.read(), bytes);
});

test('editing portraits in one course keeps every other course intact', async () => {
  const { handle, courseIds, bytes } = await seedDatabase();
  const { store, runtime } = createRuntime();
  runtime.fileHandle = handle;
  runtime.storedFileHandle = handle;
  await runtime.loadBytes(bytes, 'file');

  const target = courseIds[1];
  await runtime.ensureGradeCourseLoaded(target);
  const snapshot = await runtime.getGradeCourseStateSnapshot(target);
  const draft = snapshot.gradeStudents
    .filter((student) => Number(student.courseId) === target)
    .map((student) => ({
      id: student.id,
      lastName: student.lastName,
      firstName: student.firstName,
      rufname: student.rufname,
      performanceFlair: student.performanceFlair,
      portrait: student.portrait,
    }));
  draft[0].portrait = null;
  draft[1].portrait = portrait(99);
  await runtime.runGradeCourseMutation(target, () => store.replaceGradeStudentsForCourse(target, draft, null, {
    expectedStudentIds: draft.map((student) => student.id).sort((left, right) => left - right),
    confirmedRemovedStudentIds: [],
  }));
  await settle(runtime);

  const parsed = parseContainer(handle.read());
  assert.deepEqual(parsed.gradeCourseSegments.map((segment) => segment.courseId), courseIds);
  for (const courseId of courseIds) {
    assert.equal((await runtime.getGradeCourseRosterSummary(courseId)).studentCount, 4);
  }
  const edited = JSON.parse(parsed.gradeCourseSegments.find((segment) => segment.courseId === target).text);
  assert.equal(edited.gradeStudents[0].portrait, null);
  assert.ok(edited.gradeStudents[1].portrait.data.length > 0);
});

test('a save refuses a course segment that is unexpectedly emptied in memory', async () => {
  const source = await seedDatabase();
  const target = source.courseIds[1];
  const fields = [
    'gradeStructures',
    'gradeAssessments',
    'gradeStudents',
    'gradeEntries',
    'gradeOverrides',
    'gradeImports',
    'gradeSeatPlans',
    'gradeAccommodations',
    'gradeNameLearning',
  ];

  await source.runtime.runGradeCourseMutation(target, () => {
    for (const field of fields) source.store.gradeVaultState[field] = [];
  }, { skipAutoSave: true });

  await assert.rejects(
    () => source.runtime.saveToConnectedFile('unexpected-empty-segment'),
    (error) => {
      assert.equal(error.code, 'PERSISTENCE_CONTENT_LOSS');
      assert.match(error.message, /Teilnehmende würden ohne ausdrückliche Löschbestätigung entfernt/);
      return true;
    },
  );
  assert.deepEqual(source.handle.read(), source.bytes);
  assert.equal(source.runtime.dirtyCourseIds.has(target), true);
});

test('a save refuses an unconfirmed removal of a persisted participant', async () => {
  const source = await seedDatabase();
  const target = source.courseIds[0];

  await source.runtime.runGradeCourseMutation(target, () => {
    source.store.gradeVaultState.gradeStudents = source.store.gradeVaultState.gradeStudents.slice(1);
  }, { skipAutoSave: true });

  await assert.rejects(
    () => source.runtime.saveToConnectedFile('unconfirmed-student-removal'),
    (error) => {
      assert.equal(error.code, 'PERSISTENCE_CONTENT_LOSS');
      assert.match(error.message, /ohne ausdrückliche Löschbestätigung/);
      return true;
    },
  );
  assert.deepEqual(source.handle.read(), source.bytes);
});

test('a confirmed removal of all participants remains saveable', async () => {
  const source = await seedDatabase();
  const target = source.courseIds[0];
  await source.runtime.ensureGradeCourseLoaded(target);
  const studentIds = source.store.listGradeStudents(target).map((student) => Number(student.id));

  await source.runtime.runGradeCourseMutation(target, () => source.store.replaceGradeStudentsForCourse(
    target,
    [],
    null,
    {
      expectedStudentIds: studentIds,
      confirmedRemovedStudentIds: studentIds,
    },
  ), {
    skipAutoSave: true,
    confirmedRemovedStudentIds: studentIds,
  });

  assert.equal(await source.runtime.saveToConnectedFile('confirmed-student-removal'), true);
  assert.equal(source.runtime.confirmedStudentRemovalsByCourse.size, 0);
  const parsed = parseContainer(source.handle.read());
  const segment = JSON.parse(parsed.gradeCourseSegments.find((entry) => entry.courseId === target).text);
  assert.deepEqual(segment.gradeStudents, []);
});

test('confirmed participant removal never authorizes emptying the rest of a course segment', async () => {
  const source = await seedDatabase({ courseNames: ['7a'] });
  const target = source.courseIds[0];
  await source.runtime.runGradeCourseMutation(target, () => source.store.createGradeAssessment(target, {
    title: 'Klassenarbeit',
    mode: 'grade',
  }), { skipAutoSave: true });
  assert.equal(await source.runtime.saveToConnectedFile('seed-assessment'), true);
  const bytesBeforeRejectedSave = source.handle.read().slice();

  await source.runtime.ensureGradeCourseLoaded(target);
  const studentIds = source.store.listGradeStudents(target).map((student) => Number(student.id));
  await source.runtime.runGradeCourseMutation(target, () => {
    source.store.replaceGradeStudentsForCourse(target, [], null, {
      expectedStudentIds: studentIds,
      confirmedRemovedStudentIds: studentIds,
    });
    source.store.gradeVaultState.gradeAssessments = [];
    source.store.gradeVaultState.gradeStructures = [];
  }, {
    skipAutoSave: true,
    confirmedRemovedStudentIds: studentIds,
  });

  await assert.rejects(
    () => source.runtime.saveToConnectedFile('unexpected-empty-segment-after-confirmation'),
    (error) => {
      assert.equal(error.code, 'PERSISTENCE_CONTENT_LOSS');
      assert.match(error.message, /inhaltlich leer/);
      return true;
    },
  );
  assert.deepEqual(source.handle.read(), bytesBeforeRejectedSave);
});

test('encrypted segments are checked and never written when their contents cannot be verified', async () => {
  const source = await seedDatabase({ courseNames: ['7a'] });
  const target = source.courseIds[0];
  const queueSyncSave = source.runtime.queueSyncSave;
  source.runtime.queueSyncSave = () => false;
  try {
    await source.runtime.setupGradeVault('ausreichend-sicheres-passwort');
    source.runtime.queueSyncSave = queueSyncSave;
    assert.equal(await source.runtime.saveToConnectedFile('encrypt-course-segment'), true);
    const encrypted = JSON.parse(parseContainer(source.handle.read()).gradeCourseSegments[0].text);
    assert.equal(encrypted.schema, 'teachhelper-grade-vault-v1');

    await source.runtime.runGradeCourseMutation(target, () => {
      source.store.gradeVaultState.gradeStudents[0].portrait = null;
    }, { skipAutoSave: true });
    assert.equal(await source.runtime.saveToConnectedFile('encrypted-segment-normal-save'), true);
    const bytesBeforeRejectedSave = source.handle.read().slice();

    await source.runtime.runGradeCourseMutation(target, () => {
      source.store.gradeVaultState.gradeStudents[0].portrait = portrait(99);
    }, { skipAutoSave: true });
    source.runtime.decodeCourseSegmentForPlausibility = async () => {
      throw new Error('Entschlüsselung fehlgeschlagen');
    };
    await assert.rejects(
      () => source.runtime.saveToConnectedFile('encrypted-segment-check'),
      (error) => {
        assert.equal(error.code, 'PERSISTENCE_CONTENT_LOSS');
        assert.match(error.message, /nicht sicher geprüft/);
        return true;
      },
    );
    assert.deepEqual(source.handle.read(), bytesBeforeRejectedSave);
  } finally {
    source.runtime.queueSyncSave = queueSyncSave;
    source.runtime.clearGradeVaultAutoLockTimer();
    source.runtime.clearGradeVaultBackgroundAutoLockTimer();
  }
});
