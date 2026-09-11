import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('readZipEntryCapped meldet ein erschöpftes Gesamtbudget als ZIP-Fehler statt als Eintragsfehler', () => {
  const reader = readFunctionBody('readZipEntryCapped', 'getBasename');

  assert.match(reader, /options\.overflowMessage/);
  assert.match(reader, /\|\|\s*`"\$\{entry\.name\}" ist entpackt zu groß/);
});
