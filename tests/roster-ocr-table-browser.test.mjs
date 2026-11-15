import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

const TABLE = [
  ['Lê', 'Anna', '9a'],
  ['Müller', 'Tim', '9b'],
  ['Nguyễn', 'Minh', '9a'],
  ['Schröder', 'Jörg', '9c'],
  ['Trần', 'Bảo', '9b'],
  ['Weiß', 'Léa', '9a'],
];

test('a printed table rendered in a real font keeps classes out of the names, reads German and French names exactly and flags lost Vietnamese accents', { timeout: 120000 }, async (t) => {
  const evaluate = await openDomBrowser(t, { viewport: { width: 1200, height: 800 } });
  const results = await evaluate(async (table) => {
    const { recognizeLocalNames } = await import('/src/shared/ocr-vendor.js');
    const { ocrLinesFromTsv, parseOcrLayout } = await import('/src/modules/grades/roster-ocr-data.js');
    const output = [];
    for (const [size, scale] of [[20, 2], [28, 1]]) {
      const small = document.createElement('canvas');
      small.width = size * 28;
      small.height = size * 2 * (table.length + 1);
      const context = small.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, small.width, small.height);
      context.fillStyle = 'black';
      context.font = `${size}px Arial, "Liberation Sans", sans-serif`;
      table.forEach((row, index) => {
        const y = size * 2 * (index + 1);
        context.fillText(row[0], size, y);
        context.fillText(row[1], size * 10, y);
        context.fillText(row[2], size * 19, y);
      });
      const canvas = document.createElement('canvas');
      canvas.width = small.width * scale;
      canvas.height = small.height * scale;
      const scaled = canvas.getContext('2d');
      scaled.imageSmoothingQuality = 'high';
      scaled.drawImage(small, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const recognized = await recognizeLocalNames(await blob.arrayBuffer());
      output.push(parseOcrLayout(ocrLinesFromTsv(recognized.tsv))
        .map(({ lastName, firstName, classFlair, notes, fieldNotes }) => ({ lastName, firstName, classFlair, notes, fieldNotes })));
    }
    return output;
  }, TABLE);
  const exactRows = [1, 3, 5];
  const flaggedUnlessExact = [0, 2];
  for (const rows of results) {
    assert.equal(rows.length, TABLE.length);
    rows.forEach((row, index) => {
      const nameWords = `${row.lastName} ${row.firstName}`.split(' ');
      assert.equal(nameWords.length, 2, `class cell leaked into ${row.lastName}, ${row.firstName}`);
      assert.equal(row.classFlair, TABLE[index][2].slice(-1), `wrong class in row ${index + 1}`);
    });
    for (const index of exactRows) {
      assert.equal(`${rows[index].lastName} ${rows[index].firstName}`, `${TABLE[index][0]} ${TABLE[index][1]}`);
    }
    for (const index of flaggedUnlessExact) {
      const row = rows[index];
      const flagged = row.fieldNotes.lastName.length > 0;
      assert.ok(row.lastName === TABLE[index][0] || flagged, `${TABLE[index][0]} became ${row.lastName} without a hint`);
    }
  }
});
