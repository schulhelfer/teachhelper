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

test('a printed table rendered in a real font keeps classes out of the names and never silently mangles Lê', { timeout: 120000 }, async (t) => {
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
        .map(({ lastName, firstName, classFlair, notes }) => ({ lastName, firstName, classFlair, notes })));
    }
    return output;
  }, TABLE);
  for (const rows of results) {
    assert.equal(rows.length, TABLE.length);
    rows.forEach((row, index) => {
      const nameWords = `${row.lastName} ${row.firstName}`.split(' ');
      assert.equal(nameWords.length, 2, `class cell leaked into ${row.lastName}, ${row.firstName}`);
      const expectedClass = TABLE[index][2].slice(-1);
      if (row.classFlair !== expectedClass) assert.ok(row.notes.length > 0, `unflagged wrong class in row ${index + 1}`);
    });
    const first = rows[0];
    const flagged = first.notes.some((note) => note.includes(`„${first.lastName}“`));
    assert.ok(first.lastName === 'Lê' || flagged, `Lê became ${first.lastName} without a hint`);
    assert.equal(first.classFlair, 'a');
  }
  assert.ok(results.some((rows) => rows[0].lastName === 'Lê'), 'Lê is recognized exactly in at least one rendering');
  for (const rows of results) {
    rows.slice(1).forEach((row, index) => {
      assert.equal(`${row.lastName} ${row.firstName}`, `${TABLE[index + 1][0]} ${TABLE[index + 1][1]}`);
      assert.equal(row.classFlair, TABLE[index + 1][2].slice(-1));
    });
  }
});
