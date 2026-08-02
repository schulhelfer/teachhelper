import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/modules/planning/note-links.js', import.meta.url),
  'utf8',
);
const {
  appendPlanningNoteWithLinks,
  isAllowedPlanningNoteLink,
  normalizePlanningNoteText,
  tokenizePlanningNoteLinks,
} = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const [planningHtml, planningSource] = await Promise.all([
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
]);

class FakeNode {
  constructor(type, value = '') {
    this.type = type;
    this.value = value;
    this.children = [];
  }

  append(node) {
    this.children.push(node);
  }
}

class FakeAnchor extends FakeNode {
  constructor() {
    super('anchor');
  }
}

test('erkennt Web- und OneNote-Links, ohne ihren gespeicherten Text zu verändern', () => {
  const oneNoteLink = 'onenote:https://d.docs.live.net/example/Dokumente/Unterricht.one#Stunde&section-id={A}&page-id={B}&end';
  const tokens = tokenizePlanningNoteLinks(
    `Material: https://example.org/ablauf\nOneNote: ${oneNoteLink}.`,
  );

  assert.deepEqual(tokens, [
    { type: 'text', value: 'Material: ' },
    { type: 'link', value: 'https://example.org/ablauf', href: 'https://example.org/ablauf' },
    { type: 'text', value: '\nOneNote: ' },
    { type: 'link', value: oneNoteLink, href: oneNoteLink },
    { type: 'text', value: '.' },
  ]);
  assert.equal(isAllowedPlanningNoteLink('http://example.org'), true);
  assert.equal(isAllowedPlanningNoteLink('https://example.org'), true);
  assert.equal(isAllowedPlanningNoteLink(oneNoteLink), true);
  assert.equal(normalizePlanningNoteText('Erste Zeile\r\nZweite Zeile\rDritte Zeile'), 'Erste Zeile\nZweite Zeile\nDritte Zeile');
});

test('lässt nicht erlaubte oder ungültige Link-Kandidaten als Text stehen', () => {
  const note = 'javascript:alert(1) data:text/plain,Test https://';

  assert.equal(isAllowedPlanningNoteLink('javascript:alert(1)'), false);
  assert.equal(isAllowedPlanningNoteLink('data:text/plain,Test'), false);
  assert.equal(isAllowedPlanningNoteLink('https://'), false);
  assert.deepEqual(tokenizePlanningNoteLinks(note), [{ type: 'text', value: note }]);
});

test('rendert Links mit sicheren Attributen und Textknoten statt HTML-Markup', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createTextNode(value) {
      return new FakeNode('text', value);
    },
    createElement(name) {
      assert.equal(name, 'a');
      return new FakeAnchor();
    },
  };

  try {
    const container = new FakeNode('container');
    appendPlanningNoteWithLinks(container, 'Siehe onenote:mein-notizbuch und https://example.org.', {
      linkContentEditable: false,
    });

    assert.equal(container.children[0].type, 'text');
    assert.equal(container.children[1].type, 'anchor');
    assert.equal(container.children[1].href, 'onenote:mein-notizbuch');
    assert.equal(container.children[1].target, '_blank');
    assert.equal(container.children[1].rel, 'noopener noreferrer');
    assert.equal(container.children[1].referrerPolicy, 'no-referrer');
    assert.equal(container.children[1].contentEditable, 'false');
    assert.equal(container.children[3].type, 'anchor');
    assert.equal(container.children[3].href, 'https://example.org');
    assert.equal(container.children[4].value, '.');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('bietet ein Rich-Text-Feld für die Detailplanung ohne Ansichtsumschalter', () => {
  assert.match(planningHtml, /id="topic-dialog-notes"[^>]*contenteditable="true"/);
  assert.match(planningHtml, /id="topic-dialog-notes"[^>]*role="textbox"/);
  assert.doesNotMatch(planningHtml, /id="topic-dialog-notes-edit"/);
  assert.doesNotMatch(planningHtml, /id="topic-dialog-notes-preview"/);
  assert.doesNotMatch(planningHtml, /<textarea id="topic-dialog-notes"/);
  assert.match(planningSource, /appendPlanningNoteWithLinks\(editor, text, \{ linkContentEditable: false \}\)/);
  assert.match(planningSource, /insertTopicDialogNotesPlainText/);
  assert.match(planningSource, /openTopicDialogNoteLink/);
  assert.match(planningSource, /window\.open\(target\.href, "_blank", "noopener,noreferrer"\)/);
  assert.match(planningSource, /notes: this\.getTopicDialogNotesText\(\)/);
  assert.doesNotMatch(planningSource, /setTopicDialogNotesMode/);
  assert.doesNotMatch(planningSource, /appendPlanningNoteWithLinks\(preview, notesPreview\)/);
  assert.match(planningSource, /notesEditButton\.className = "course-notes-edit"/);
  assert.match(planningSource, /notesEditButton\.classList\.toggle\("is-empty", !hasNotes\)/);
  assert.match(planningSource, /notesEditButton\.textContent = "🔎"/);
  assert.match(planningSource, /<th>Noten<\/th>\s*<th>Details<\/th>\s*<th>Thema<\/th>/);
  assert.match(planningSource, /tr\.append\(dateCell, dayCell, durCell, gradeCell, notesCell, topicCell\)/);
  assert.match(planningSource, /notesCell\.className = "course-details-cell"/);
  assert.match(planningSource, /button\.course-notes-edit\[data-lesson-id\]/);
  assert.doesNotMatch(planningSource, /button\.course-notes-preview\[data-lesson-id\]/);
});
