import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/modules/duplicate-check/app.js', import.meta.url), 'utf8');

function readFunctionBody(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1, `${name} nicht gefunden`);
  assert.notEqual(end, -1, `${nextName} nicht gefunden`);
  return source.slice(start, end);
}

test('das Entpacken führt eine laufende Gesamtsumme mit, statt nur pro Eintrag zu begrenzen', () => {
  const collect = readFunctionBody('collectZipRecords', 'handleFile');

  assert.match(collect, /let inflatedTotal = 0;/);
  assert.match(
    collect,
    /const remainingTotalBytes = Math\.max\(0, FILE_LIMITS\.ZIP_TOTAL_UNCOMPRESSED_BYTES - inflatedTotal\);/
  );
  assert.match(collect, /if \(remainingTotalBytes <= 0\) \{[\s\S]*?entpackt zu groß/);
  assert.match(
    collect,
    /const maxBytes = Math\.min\([\s\S]*?FILE_LIMITS\.ZIP_ENTRY_BYTES,[\s\S]*?remainingTotalBytes[\s\S]*?\);/
  );
  assert.match(collect, /inflatedTotal \+= bytes\.byteLength;/);
});

test('die Gesamtsumme wird aus den tatsächlich entpackten Bytes gebildet, nicht aus den deklarierten', () => {
  const collect = readFunctionBody('collectZipRecords', 'handleFile');
  const budgetUpdate = collect.slice(collect.indexOf('inflatedTotal +='));

  assert.doesNotMatch(budgetUpdate.slice(0, 60), /knownSize/);
  assert.ok(
    collect.indexOf('bytes = await readZipEntryCapped') < collect.indexOf('inflatedTotal +='),
    'Das Budget muss nach dem Lesen des Eintrags fortgeschrieben werden.'
  );
});

test('readZipEntryCapped meldet ein erschöpftes Gesamtbudget als ZIP-Fehler statt als Eintragsfehler', () => {
  const reader = readFunctionBody('readZipEntryCapped', 'getBasename');

  assert.match(reader, /options\.overflowMessage/);
  assert.match(reader, /\|\|\s*`"\$\{entry\.name\}" ist entpackt zu groß/);
});
