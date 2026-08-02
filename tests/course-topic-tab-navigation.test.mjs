import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`, 'g');
  const match = matcher.exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

const methodNames = [
  'getCourseTopicInputs',
  'saveCourseTopicInput',
  'findCourseTableBoundaryFocusTarget',
  'handleCourseTopicInputKeyDown',
];
const courseNavigationMethods = Function(
  `"use strict"; return ({${methodNames.map(extractClassMethod).join(',\n')}});`,
)();

class FakeElement {
  constructor({ inTable = false } = {}) {
    this.inTable = inTable;
    this.hidden = false;
    this.focused = false;
  }

  closest() {
    return null;
  }

  getClientRects() {
    return [{}];
  }

  focus() {
    this.focused = true;
  }
}

class FakeTopicInput extends FakeElement {
  constructor(lessonId, value = '', disabled = false) {
    super({ inTable: true });
    this.dataset = { lessonId: String(lessonId) };
    this.value = value;
    this.disabled = disabled;
  }

  closest(selector) {
    return selector === 'input.course-topic-input' ? this : null;
  }
}

globalThis.HTMLElement = FakeElement;

function createHarness(inputs) {
  const table = {
    inputs,
    querySelectorAll(selector) {
      assert.equal(selector, 'input.course-topic-input:not(:disabled)');
      return this.inputs.filter((input) => !input.disabled);
    },
    contains(element) {
      return Boolean(element?.inTable);
    },
  };
  const updates = [];
  const harness = {
    ...courseNavigationMethods,
    refs: { courseTable: table },
    store: {
      updateLessonBlock(lessonId, patch) {
        updates.push({ lessonId, patch });
      },
    },
    renderWeekSection() {},
    renderLessonSection() {},
    renderCourseTimeline() {
      table.inputs = table.inputs.map((input) => new FakeTopicInput(
        input.dataset.lessonId,
        input.value,
        input.disabled,
      ));
    },
  };
  return { harness, table, updates };
}

function tabEvent(input, { shiftKey = false } = {}) {
  return {
    key: 'Tab',
    target: input,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

test('Tab speichert das Thema und fokussiert das nächste editierbare Themenfeld', () => {
  const first = new FakeTopicInput(10, 'Neu');
  const skipped = new FakeTopicInput(20, 'Entfall', true);
  const third = new FakeTopicInput(30, 'Nächstes Thema');
  const { harness, table, updates } = createHarness([first, skipped, third]);

  const event = tabEvent(first);
  assert.equal(harness.handleCourseTopicInputKeyDown(event), true);

  assert.equal(event.prevented, true);
  assert.deepEqual(updates, [{ lessonId: 10, patch: { topic: 'Neu' } }]);
  assert.equal(table.inputs[2].focused, true);
  assert.equal(table.inputs[0].focused, false);
});

test('Shift+Tab fokussiert das vorherige editierbare Themenfeld', () => {
  const first = new FakeTopicInput(10, 'Erstes Thema');
  const skipped = new FakeTopicInput(20, 'Klassenarbeit', true);
  const third = new FakeTopicInput(30, 'Geändert');
  const { harness, table, updates } = createHarness([first, skipped, third]);

  const event = tabEvent(third, { shiftKey: true });
  assert.equal(harness.handleCourseTopicInputKeyDown(event), true);

  assert.equal(event.prevented, true);
  assert.deepEqual(updates, [{ lessonId: 30, patch: { topic: 'Geändert' } }]);
  assert.equal(table.inputs[0].focused, true);
});

test('am Tabellenende wird ein Fokusziel außerhalb der Kurs-Tabelle verwendet', () => {
  const onlyInput = new FakeTopicInput(10, 'Letztes Thema');
  const notesButton = new FakeElement({ inTable: true });
  const followingControl = new FakeElement();
  globalThis.document = {
    querySelectorAll() {
      return [onlyInput, notesButton, followingControl];
    },
  };
  const { harness, updates } = createHarness([onlyInput]);

  const event = tabEvent(onlyInput);
  assert.equal(harness.handleCourseTopicInputKeyDown(event), true);

  assert.equal(event.prevented, true);
  assert.deepEqual(updates, [{ lessonId: 10, patch: { topic: 'Letztes Thema' } }]);
  assert.equal(notesButton.focused, false);
  assert.equal(followingControl.focused, true);
});
