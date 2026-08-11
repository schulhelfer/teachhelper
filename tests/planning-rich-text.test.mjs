import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [linksSource, richTextSource] = await Promise.all([
  readFile(new URL('../src/shared/planning-note-links.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/planning-rich-text.js', import.meta.url), 'utf8'),
]);
const linksUrl = `data:text/javascript;base64,${Buffer.from(linksSource).toString('base64')}`;
const richTextUrl = `data:text/javascript;base64,${Buffer.from(
  richTextSource.replace('"./planning-note-links.js"', JSON.stringify(linksUrl)),
).toString('base64')}`;
const richText = await import(richTextUrl);

test('Rich-Text-Notizen behalten erlaubte Strukturen und erzeugen Klartext für Bestandsansichten', () => {
  const value = richText.normalizePlanningRichText({
    version: 99,
    blocks: [
      { type: 'paragraph', children: [{ text: 'Wichtig', bold: true, size: 18 }, { text: '!' }] },
      { type: 'list', ordered: false, items: [[{ type: 'paragraph', children: [{ text: 'Material' }] }]] },
      { type: 'table', rows: [[[{ type: 'paragraph', children: [{ text: 'Phase' }] }], [{ type: 'paragraph', children: [{ text: 'Zeit' }] }]]] },
    ],
  });

  assert.equal(value.version, richText.PLANNING_RICH_TEXT_VERSION);
  assert.deepEqual(value.blocks[0].children[0], { text: 'Wichtig', bold: true, size: 18 });
  assert.equal(richText.planningRichTextToPlainText(value), 'Wichtig!\n• Material\nPhase\tZeit');
});

test('Alte Klartext-Notizen erhalten beim Rich-Text-Fallback jeden Absatz', () => {
  const value = richText.normalizePlanningRichText(null, 'Ablauf\nMaterial');
  assert.equal(value.blocks.length, 2);
  assert.equal(richText.planningRichTextToPlainText(value), 'Ablauf\nMaterial');
});

test('Ungültige Markierungen und Links werden aus dem gespeicherten Dokument entfernt', () => {
  const value = richText.normalizePlanningRichText({
    blocks: [{ type: 'paragraph', children: [{ text: 'Link', size: 999, link: 'javascript:alert(1)', color: '#ff00ff' }] }],
  });
  assert.deepEqual(value.blocks[0].children, [{ text: 'Link' }]);
});

test('Textfarben sind auf die feste Palette begrenzt und die Standardfarbe hebt sie auf', () => {
  const value = richText.normalizePlanningRichText({
    blocks: [{
      type: 'paragraph',
      children: [
        { text: 'Blau', color: 'blue' },
        { text: ' Türkis', color: 'teal' },
        { text: ' Standard', color: null },
        { text: ' Unsicher', color: '#ff00ff' },
      ],
    }],
  });
  assert.deepEqual(value.blocks[0].children, [
    { text: 'Blau', color: 'blue' },
    { text: ' Türkis', color: 'teal' },
    { text: ' Standard', color: null },
    { text: ' Unsicher' },
  ]);
});

test('Mehrere Schriftgrößen bleiben innerhalb eines Absatzes getrennt erhalten', () => {
  const value = richText.normalizePlanningRichText({
    blocks: [{
      type: 'paragraph',
      children: [
        { text: 'Klein', size: 12 },
        { text: ' normal' },
        { text: ' groß', size: 22 },
        { text: ' wieder klein', size: 12 },
      ],
    }],
  });

  assert.deepEqual(value.blocks[0].children, [
    { text: 'Klein', size: 12 },
    { text: ' normal' },
    { text: ' groß', size: 22 },
    { text: ' wieder klein', size: 12 },
  ]);
});
