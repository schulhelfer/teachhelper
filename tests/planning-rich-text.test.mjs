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

const DEEP_NESTING = 10_000;

function deepListBlock(depth, text = 'Ende') {
  let block = { type: 'paragraph', children: [{ text }] };
  for (let index = 0; index < depth; index += 1) {
    block = { type: 'list', ordered: false, items: [[block]] };
  }
  return block;
}

function createDomNode(tagName, childNodes = []) {
  return {
    nodeType: 1,
    tagName,
    childNodes,
    children: childNodes.filter((node) => node.nodeType === 1),
    classList: [],
    className: '',
    style: {},
    hasAttribute: () => false,
    getAttribute: () => null,
  };
}

function createDeepListElement(depth) {
  let child = { nodeType: 3, textContent: 'DOM-Ende' };
  for (let index = 0; index < depth; index += 1) {
    child = createDomNode('UL', [createDomNode('LI', [child])]);
  }
  return { childNodes: [child] };
}

function createRenderingDocument() {
  const documentRef = {
    createElement(tagName) {
      return {
        tagName,
        children: [],
        append(...nodes) { this.children.push(...nodes); },
      };
    },
    createTextNode(textContent) { return { textContent }; },
  };
  const root = documentRef.createElement('root');
  root.ownerDocument = documentRef;
  root.replaceChildren = function replaceChildren(...nodes) { this.children = nodes; };
  return { documentRef, root };
}

globalThis.Node ??= { TEXT_NODE: 3, ELEMENT_NODE: 1 };

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

test('tiefe JSON-Listen werden ohne Stack Overflow normalisiert, verlinkt und als Klartext exportiert', () => {
  const normalized = richText.normalizePlanningRichText({ blocks: [deepListBlock(DEEP_NESTING, 'https://example.com')] });
  let block = normalized.blocks[0];
  for (let index = 0; index < DEEP_NESTING; index += 1) {
    assert.equal(block.type, 'list');
    block = block.items[0][0];
  }
  assert.deepEqual(block, { type: 'paragraph', children: [{ text: 'https://example.com' }] });

  const linked = richText.linkifyPlanningRichText(normalized);
  let linkedBlock = linked.blocks[0];
  for (let index = 0; index < DEEP_NESTING; index += 1) linkedBlock = linkedBlock.items[0][0];
  assert.equal(linkedBlock.children[0].link, 'https://example.com');

  const plainText = richText.planningRichTextToPlainText(normalized);
  assert.ok(plainText.endsWith('https://example.com'));
  assert.equal((plainText.match(/•/g) || []).length, DEEP_NESTING);
});

test('tiefe DOM-Listen und Inline-Wrapper werden ohne Stack Overflow übernommen', () => {
  const listValue = richText.planningRichTextFromElement(createDeepListElement(DEEP_NESTING));
  let block = listValue.blocks[0];
  for (let index = 0; index < DEEP_NESTING; index += 1) block = block.items[0][0];
  assert.deepEqual(block, { type: 'paragraph', children: [{ text: 'DOM-Ende' }] });

  let inline = { nodeType: 3, textContent: 'Inline-Ende' };
  for (let index = 0; index < DEEP_NESTING; index += 1) inline = createDomNode('SPAN', [inline]);
  const inlineValue = richText.planningRichTextFromElement({ childNodes: [inline] });
  assert.deepEqual(inlineValue.blocks, [{ type: 'paragraph', children: [{ text: 'Inline-Ende' }] }]);
});

test('tiefe Rich-Text-Listen werden ohne Stack Overflow gerendert', () => {
  const { root } = createRenderingDocument();
  richText.renderPlanningRichText(root, { blocks: [deepListBlock(DEEP_NESTING)] });
  let node = root.children[0];
  for (let index = 0; index < DEEP_NESTING; index += 1) {
    assert.equal(node.tagName, 'ul');
    node = node.children[0].children[0];
  }
  assert.equal(node.tagName, 'p');
});
