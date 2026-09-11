import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [csvSource, fileGuardsSource] = await Promise.all([
  readFile(new URL('../src/shared/csv.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-guards.js', import.meta.url), 'utf8'),
]);
const fileGuardsUrl = `data:text/javascript;base64,${Buffer.from(fileGuardsSource).toString('base64')}`;
const csvUrl = `data:text/javascript;base64,${Buffer.from(
  csvSource.replace("'./file-guards.js'", JSON.stringify(fileGuardsUrl)),
).toString('base64')}`;
const {
  detectDelimiter,
  normalizeCsvCell,
  normalizeCsvHeader,
  parseCSV,
} = await import(csvUrl);
const { FILE_LIMITS } = await import(fileGuardsUrl);

test('detectDelimiter recognizes semicolon, comma, and tab separated CSV', () => {
  assert.equal(detectDelimiter('Nachname;Vorname\nMuster;Mia'), ';');
  assert.equal(detectDelimiter('Nachname,Vorname\nMuster,Mia'), ',');
  assert.equal(detectDelimiter('Nachname\tVorname\nMuster\tMia'), '\t');
});

test('detectDelimiter ignores blank and separator declaration rows', () => {
  const text = '\nsep=;\nNachname,Vorname\nMuster,Mia';
  assert.equal(detectDelimiter(text), ',');
});

test('parseCSV returns rows and the detected delimiter without external state', () => {
  const result = parseCSV('\uFEFFNachname;Vorname\r\n"Mustermann";"Anna ""Anni"""');

  assert.deepEqual(result, {
    delimiter: ';',
    rows: [
      ['\uFEFFNachname', 'Vorname'],
      ['Mustermann', 'Anna "Anni"'],
    ],
  });
  assert.equal(normalizeCsvCell(result.rows[0][0]), 'Nachname');
  assert.equal(normalizeCsvHeader('  VORNAME  '), 'vorname');
});

test('parseCSV preserves embedded delimiters and line breaks in quoted cells', () => {
  const result = parseCSV('Nachname,Vorname\n"Muster, Beispiel","Mia\nMarie"');

  assert.deepEqual(result.rows, [
    ['Nachname', 'Vorname'],
    ['Muster, Beispiel', 'Mia\nMarie'],
  ]);
});

test('parseCSV enforces the existing row limit and message', () => {
  const text = Array.from({ length: FILE_LIMITS.CSV_MAX_ROWS + 1 }, () => 'Wert').join('\n');
  assert.throws(
    () => parseCSV(text),
    new Error(`CSV enthält zu viele Zeilen: maximal ${FILE_LIMITS.CSV_MAX_ROWS}.`),
  );
});

test('parseCSV enforces the existing column limit and message', () => {
  const text = Array.from({ length: FILE_LIMITS.CSV_MAX_COLUMNS + 1 }, () => 'Wert').join(';');
  assert.throws(
    () => parseCSV(text),
    new Error(`CSV enthält zu viele Spalten: maximal ${FILE_LIMITS.CSV_MAX_COLUMNS}.`),
  );
});

test('parseCSV enforces the existing cell length limit and message', () => {
  const text = 'x'.repeat(FILE_LIMITS.CSV_MAX_CELL_CHARS + 1);
  assert.throws(
    () => parseCSV(text),
    new Error(`CSV-Zelle ist zu lang: maximal ${FILE_LIMITS.CSV_MAX_CELL_CHARS} Zeichen.`),
  );
});
