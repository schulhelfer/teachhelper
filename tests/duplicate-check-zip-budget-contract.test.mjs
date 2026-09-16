import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const [source, workerSource] = await Promise.all([
  readFile(new URL('../src/modules/duplicate-check/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-processing-worker.js', import.meta.url), 'utf8'),
]);

function readFunctionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1, `${name} nicht gefunden`);
  assert.notEqual(end, -1, `${nextName} nicht gefunden`);
  return source.slice(start, end);
}

test('die ZIP-Analyse läuft in einem terminierbaren Worker', () => {
  const collect = readFunctionBody('collectZipRecords', 'handleFile');

  assert.match(collect, /runFileProcessingTask\('zip-analyze'/);
  assert.match(workerSource, /async function readEntry\(entry, maxBytes, total\)/);
  assert.match(workerSource, /total \+ size > FILE_LIMITS\.ZIP_TOTAL_UNCOMPRESSED_BYTES/);
});

test('die Gesamtsumme wird aus den tatsächlich entpackten Bytes gebildet, nicht aus den deklarierten', () => {
  assert.match(workerSource, /const output = await readEntry\(entry, FILE_LIMITS\.ZIP_ENTRY_BYTES, total\);/);
  assert.match(workerSource, /total \+= output\.byteLength;/);
  assert.doesNotMatch(workerSource, /total \+= .*uncompressedSize/);
});

test('der Worker stoppt den ZIP-Stream bei erschöpftem Gesamtbudget', async () => {
  const start = workerSource.indexOf('async function readEntry(');
  const end = workerSource.indexOf('function imageMime(', start);
  assert.ok(start >= 0 && end > start);
  const readEntry = vm.runInNewContext(`(${workerSource.slice(start, end).trim()})`, {
    FILE_LIMITS: { ZIP_TOTAL_UNCOMPRESSED_BYTES: 10 },
    Uint8Array,
  });
  const handlers = {};
  let paused = false;
  const stream = {
    on(type, handler) { handlers[type] = handler; return this; },
    pause() { paused = true; },
    resume() { handlers.data(new Uint8Array(4)); },
  };
  const entry = { internalStream: () => stream };

  await assert.rejects(readEntry(entry, 100, 8), /Das ZIP ist entpackt zu groß/);
  assert.equal(paused, true);
});
