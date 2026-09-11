import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'src/app/app-runtime.js'), 'utf8');
const csv = fs.readFileSync(path.join(root, 'src/shared/csv.js'), 'utf8');
const fileIo = fs.readFileSync(path.join(root, 'src/shared/file-io.js'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const audit = fs.readFileSync(path.join(root, 'scripts/audit.py'), 'utf8');

test('main consumes shared CSV and file utilities without local duplicates', () => {
  assert.match(main, /from '\.\.\/shared\/csv\.js';/);
  assert.match(main, /from '\.\.\/shared\/file-io\.js';/);
  assert.doesNotMatch(main, /function\s+(?:detectDelimiter|parseCSV|normalizeCsvCell|normalizeCsvHeader)\s*\(/);
  assert.doesNotMatch(main, /function\s+(?:sanitizeExportFileName|stripFileExtension|dataTransferHasFiles|isCsvFile|isJsonFile|triggerBlobDownload)\s*\(/);
  assert.match(main, /const parsedCsv = parseCSV\(text\);\s*classroomState\.updateState\(\{ delim: parsedCsv\.delimiter \}\);\s*let rows = parsedCsv\.rows;/);
  assert.doesNotMatch(csv, /\bstate\s*\./);
  assert.doesNotMatch(fileIo, /\bstate\s*\.|isIOSDevice/);
});

test('shared CSV and file utilities are required app-shell assets', () => {
  assert.match(serviceWorker, /'\.\/src\/shared\/csv\.js'/);
  assert.match(serviceWorker, /'\.\/src\/shared\/file-io\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'shared' \/ 'csv\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'shared' \/ 'file-io\.js'/);
});
