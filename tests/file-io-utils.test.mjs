import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/shared/file-io.js', import.meta.url), 'utf8');
const {
  dataTransferHasFiles,
  ensureFileExtension,
  isCsvFile,
  isJsonFile,
  sanitizeExportFileName,
  stripFileExtension,
  triggerBlobDownload,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

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

test('filename helpers preserve existing sanitizing and extension behavior', () => {
  assert.equal(sanitizeExportFileName('  Klasse 5/A: Plan?.json  '), 'Klasse 5-A- Plan-.json');
  assert.equal(sanitizeExportFileName(null), '');
  assert.equal(ensureFileExtension('Plan', '.json', 'Gruppen'), 'Plan.json');
  assert.equal(ensureFileExtension('Plan.JSON', 'json', 'Gruppen'), 'Plan.JSON');
  assert.equal(ensureFileExtension('', '.json', 'Gruppen'), 'Gruppen.json');
  assert.equal(stripFileExtension(' Klasse 5.csv '), 'Klasse 5');
  assert.equal(stripFileExtension('.namensliste'), '.namensliste');
  assert.equal(stripFileExtension('ohne-endung'), 'ohne-endung');
});

test('dataTransferHasFiles supports file lists and common type collections', () => {
  assert.equal(dataTransferHasFiles(null), false);
  assert.equal(dataTransferHasFiles({ files: [{ name: 'liste.csv' }] }), true);
  assert.equal(dataTransferHasFiles({ files: [], types: ['Files'] }), true);
  assert.equal(dataTransferHasFiles({ files: [], types: { contains: value => value === 'Files' } }), true);
  assert.equal(dataTransferHasFiles({ files: [], types: new Set(['text/plain', 'Files']) }), true);
  assert.equal(dataTransferHasFiles({ files: [], types: ['text/plain'] }), false);
});

test('file predicates recognize names and supported MIME types', () => {
  assert.equal(isCsvFile({ name: 'NAMEN.CSV', type: '' }), true);
  assert.equal(isCsvFile({ name: 'namen.txt', type: 'application/vnd.ms-excel' }), true);
  assert.equal(isCsvFile({ name: 'namen.txt', type: 'text/plain' }), false);
  assert.equal(isJsonFile({ name: 'PLAN.JSON', type: '' }), true);
  assert.equal(isJsonFile({ name: 'plan.txt', type: 'text/json' }), true);
  assert.equal(isJsonFile({ name: 'plan.txt', type: 'text/plain' }), false);
  assert.equal(isCsvFile(null), false);
  assert.equal(isJsonFile(null), false);
});

test('triggerBlobDownload starts a download and cleans up after the requested delay', () => {
  const calls = [];
  let cleanup = null;
  const parent = {
    appendChild(link) {
      calls.push(['append', link]);
      link.parentNode = this;
    },
  };
  const link = {
    style: {},
    click() {
      calls.push(['click']);
    },
    remove() {
      calls.push(['remove']);
      this.parentNode = null;
    },
  };
  const restore = [
    replaceGlobal('URL', {
      createObjectURL(blob) {
        calls.push(['create', blob]);
        return 'blob:test';
      },
      revokeObjectURL(url) {
        calls.push(['revoke', url]);
      },
    }),
    replaceGlobal('document', {
      body: parent,
      documentElement: null,
      createElement(tagName) {
        assert.equal(tagName, 'a');
        return link;
      },
    }),
    replaceGlobal('setTimeout', (callback, delay) => {
      cleanup = callback;
      calls.push(['timeout', delay]);
      return 1;
    }),
  ];

  try {
    const blob = { kind: 'test' };
    triggerBlobDownload(blob, '  plan.json  ', { cleanupDelay: 42 });
    assert.equal(link.href, 'blob:test');
    assert.equal(link.download, 'plan.json');
    assert.equal(link.rel, 'noopener');
    assert.equal(link.style.display, 'none');
    assert.deepEqual(calls.slice(0, 4), [
      ['create', blob],
      ['append', link],
      ['click'],
      ['timeout', 42],
    ]);

    cleanup();
    assert.deepEqual(calls.slice(4), [
      ['remove'],
      ['revoke', 'blob:test'],
    ]);
  } finally {
    restore.reverse().forEach(restoreGlobal => restoreGlobal());
  }
});

test('triggerBlobDownload uses the event fallback and reports configured errors', () => {
  const events = [];
  const warnings = [];
  let cleanup = null;
  class FakeMouseEvent {
    constructor(type, options) {
      this.type = type;
      this.options = options;
    }
  }
  const fallbackLink = {
    style: {},
    dispatchEvent(event) {
      events.push(event);
    },
    remove() {
      this.parentNode = null;
    },
  };
  const errorLink = {
    style: {},
    click() {
      throw new Error('blocked');
    },
    remove() {
      this.parentNode = null;
    },
  };
  let activeLink = fallbackLink;
  const parent = {
    appendChild(link) {
      link.parentNode = this;
    },
  };
  const restore = [
    replaceGlobal('URL', {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => {},
    }),
    replaceGlobal('document', {
      body: parent,
      documentElement: null,
      createElement: () => activeLink,
    }),
    replaceGlobal('window', { name: 'test-window' }),
    replaceGlobal('MouseEvent', FakeMouseEvent),
    replaceGlobal('setTimeout', callback => {
      cleanup = callback;
      return 1;
    }),
  ];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    triggerBlobDownload({}, '', { defaultName: 'fallback.csv' });
    assert.equal(fallbackLink.download, 'fallback.csv');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'click');
    assert.equal(events[0].options.view, globalThis.window);
    cleanup();

    activeLink = errorLink;
    triggerBlobDownload({}, 'plan.json', { onErrorMessage: 'Eigener Fehler:' });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], 'Eigener Fehler:');
    assert.equal(warnings[0][1].message, 'blocked');
    cleanup();
  } finally {
    console.warn = originalWarn;
    restore.reverse().forEach(restoreGlobal => restoreGlobal());
  }
});
