import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [persistenceSource, formatSource, fileGuardsSource, fileIoSource] = await Promise.all([
  readFile(new URL('../src/app/plan-persistence.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/plan-format.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-guards.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-io.js', import.meta.url), 'utf8'),
]);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fileGuardsUrl = dataUrl(fileGuardsSource);
const fileIoUrl = dataUrl(fileIoSource);
const formatUrl = dataUrl(formatSource.replace("'../shared/file-guards.js'", JSON.stringify(fileGuardsUrl)));
const persistenceUrl = dataUrl(
  persistenceSource
    .replace("'../shared/file-guards.js'", JSON.stringify(fileGuardsUrl))
    .replace("'../shared/file-io.js'", JSON.stringify(fileIoUrl))
    .replace("'./plan-format.js'", JSON.stringify(formatUrl)),
);
const { loadPlan, pickPlanFile, savePlan } = await import(persistenceUrl);
const { createPlanSnapshot, serializePlan } = await import(formatUrl);
const { FILE_LIMITS } = await import(fileGuardsUrl);

const plan = createPlanSnapshot({
  generatedAt: '2026-09-11T10:15:30.000Z',
  roster: { students: [], headers: [], delimiter: ';', csvName: 'Klasse 7a' },
  groups: {
    grid: { rows: 1, cols: 1 },
    activeSeats: ['1-1'],
    lockedSeats: [],
    seats: { '1-1': [] },
    seatTopics: {},
    performanceFlairCount: 4,
    minGroupSize: 1,
    maxGroupSize: 1,
  },
  randomPicker: { autoDisableSelected: false },
  workPhase: null,
});

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  };
}

function installDownloadEnvironment() {
  const downloads = [];
  const delays = [];
  const cleanups = [];
  const parent = {
    appendChild(link) {
      link.parentNode = this;
    },
  };
  const restore = [
    replaceGlobal('URL', {
      createObjectURL: () => 'blob:plan',
      revokeObjectURL: () => {},
    }),
    replaceGlobal('document', {
      body: parent,
      documentElement: null,
      createElement() {
        return {
          style: {},
          click() {
            downloads.push({ filename: this.download, href: this.href });
          },
          remove() {
            this.parentNode = null;
          },
        };
      },
    }),
    replaceGlobal('setTimeout', (callback, delay) => {
      cleanups.push(callback);
      delays.push(delay);
      return 1;
    }),
  ];
  return {
    downloads,
    delays,
    restore() {
      cleanups.forEach(cleanup => cleanup());
      restore.reverse().forEach(restoreGlobal => restoreGlobal());
    },
  };
}

test('loadPlan checks the file size before reading', async () => {
  let read = false;
  const file = {
    size: FILE_LIMITS.JSON_BYTES + 1,
    async text() {
      read = true;
      return '{}';
    },
  };

  await assert.rejects(() => loadPlan(file), /JSON-Datei ist zu groß/);
  assert.equal(read, false);
});

test('loadPlan reads and deserializes a valid plan', async () => {
  const loaded = await loadPlan({
    size: 100,
    text: async () => serializePlan(plan),
  });
  assert.deepEqual(loaded, plan);
  await assert.rejects(
    () => loadPlan({ size: 1, text: async () => '{' }),
    new Error('Datei ist kein gültiges JSON.'),
  );
});

test('savePlan writes the serialized plan through the native picker', async () => {
  const writes = [];
  const handle = {
    async createWritable() {
      return {
        async write(blob) {
          writes.push(blob);
        },
        async close() {
          writes.push('closed');
        },
      };
    },
  };
  let pickerOptions = null;
  const restoreWindow = replaceGlobal('window', {
    async showSaveFilePicker(options) {
      pickerOptions = options;
      return handle;
    },
  });

  try {
    const result = await savePlan(plan, {
      filename: 'Klasse 7a',
      fallbackName: 'Gruppen',
      directoryHandle: { name: 'previous' },
      pickerDescription: 'Gruppen JSON',
    });
    assert.deepEqual(result, { status: 'saved', handle });
    assert.equal(pickerOptions.suggestedName, 'Klasse 7a.json');
    assert.equal(pickerOptions.startIn.name, 'previous');
    assert.equal(pickerOptions.types[0].description, 'Gruppen JSON');
    assert.equal(writes[0].type, 'application/json');
    assert.equal(await writes[0].text(), serializePlan(plan));
    assert.equal(writes[1], 'closed');
  } finally {
    restoreWindow();
  }
});

test('savePlan downloads when the native picker is unavailable', async () => {
  const environment = installDownloadEnvironment();
  const restoreWindow = replaceGlobal('window', {});

  try {
    const result = await savePlan(plan, {
      filename: '',
      fallbackName: 'Picker',
      cleanupDelay: 4000,
    });
    assert.deepEqual(result, { status: 'downloaded', handle: null });
    assert.deepEqual(environment.downloads, [{ filename: 'Picker.json', href: 'blob:plan' }]);
    assert.deepEqual(environment.delays, [4000]);
  } finally {
    restoreWindow();
    environment.restore();
  }
});

test('savePlan downloads after a technical picker failure and logs the fallback', async () => {
  const environment = installDownloadEnvironment();
  const warnings = [];
  const restoreWindow = replaceGlobal('window', {
    async showSaveFilePicker() {
      throw new Error('blocked');
    },
  });
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    const result = await savePlan(plan, { filename: 'Plan.json' });
    assert.deepEqual(result, { status: 'downloaded', handle: null });
    assert.equal(environment.downloads.length, 1);
    assert.equal(warnings[0][0], 'Fallback auf Download, Speichern via Picker fehlgeschlagen:');
    assert.equal(warnings[0][1].message, 'blocked');
  } finally {
    console.warn = originalWarn;
    restoreWindow();
    environment.restore();
  }
});

test('savePlan treats a picker cancellation as an abort without downloading', async () => {
  const restoreWindow = replaceGlobal('window', {
    async showSaveFilePicker() {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    },
  });

  try {
    assert.deepEqual(
      await savePlan(plan, { filename: 'Plan' }),
      { status: 'aborted', handle: null },
    );
  } finally {
    restoreWindow();
  }
});

test('pickPlanFile reports unsupported and successful picker outcomes', async () => {
  let restoreWindow = replaceGlobal('window', {});
  try {
    assert.deepEqual(await pickPlanFile(), { supported: false });
  } finally {
    restoreWindow();
  }

  const file = { name: 'Plan.json' };
  const handle = { getFile: async () => file };
  let pickerOptions = null;
  restoreWindow = replaceGlobal('window', {
    async showOpenFilePicker(options) {
      pickerOptions = options;
      return [handle];
    },
  });
  try {
    const directoryHandle = { name: 'downloads' };
    assert.deepEqual(await pickPlanFile({ directoryHandle }), { supported: true, file, handle });
    assert.equal(pickerOptions.startIn, directoryHandle);
    assert.equal(pickerOptions.multiple, false);
    assert.equal(pickerOptions.excludeAcceptAllOption, true);
  } finally {
    restoreWindow();
  }
});

test('pickPlanFile keeps cancellations and technical errors silent to the caller', async () => {
  let restoreWindow = replaceGlobal('window', {
    async showOpenFilePicker() {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    },
  });
  try {
    assert.deepEqual(await pickPlanFile(), { supported: true, aborted: true });
  } finally {
    restoreWindow();
  }

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  restoreWindow = replaceGlobal('window', {
    async showOpenFilePicker() {
      throw new Error('blocked');
    },
  });
  try {
    assert.deepEqual(await pickPlanFile(), { supported: true, aborted: true });
    assert.equal(warnings[0][0], 'showOpenFilePicker fehlgeschlagen, fallback auf klassische Datei-Auswahl');
    assert.equal(warnings[0][1].message, 'blocked');
  } finally {
    restoreWindow();
    console.warn = originalWarn;
  }
});
