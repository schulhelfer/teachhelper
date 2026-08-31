import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const toDataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const searchSource = await readFile(new URL('../src/shared/learner-search.js', import.meta.url), 'utf8');
const dialogSource = (await readFile(new URL('../src/shared/learner-search-dialog.js', import.meta.url), 'utf8'))
  .replace("'./learner-search.js'", JSON.stringify(toDataUrl(searchSource)));

class StubElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this.open = false;
    this.focusCount = 0;
    this.style = { properties: new Map(), setProperty: (name, value) => this.style.properties.set(name, value) };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type) { this.listeners.get(type)?.(); }
  focus() { this.focusCount += 1; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function installDom() {
  const body = new StubElement('body');
  globalThis.document = { body, createElement: (tagName) => new StubElement(tagName) };
  globalThis.requestAnimationFrame = (callback) => callback();
  return body;
}

const roster = [
  { studentId: 1, courseId: 10, courseName: 'Deutsch', courseColor: '#ff0000', firstName: 'Märta', lastName: 'Müller' },
  { studentId: 2, courseId: 11, courseName: 'Mathe', firstName: 'Märta', lastName: 'Müller' },
  { studentId: 3, courseId: 12, courseName: 'Bio', firstName: 'Tom', lastName: 'Berger' },
];

const body = installDom();
const { createLearnerSearchDialog, LEARNER_SEARCH_MESSAGES } = await import(toDataUrl(dialogSource));

function setup() {
  body.children = [];
  const selected = [];
  const controller = createLearnerSearchDialog({ onSelectCourse: (course) => selected.push(course) });
  const [dialogBody] = controller.dialog.children;
  const [, , status, results] = dialogBody.children;
  return { controller, status, results, selected };
}

test('the shared dialog mounts a modal with input, status and result list', () => {
  const { controller, status, results } = setup();
  assert.equal(body.children.length, 1);
  assert.equal(controller.dialog.id, 'learner-search-dialog');
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.prompt);
  assert.equal(results.id, 'learner-search-results');
  controller.open();
  assert.equal(controller.dialog.open, true);
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.loading);
});

test('matching learners are listed without a hit counter, one pill per course', () => {
  const { controller, status, results, selected } = setup();
  controller.open();
  controller.input.value = 'müller';
  controller.setRoster(roster);
  assert.equal(status.textContent, '');
  assert.equal(results.children.length, 1);
  const [name, pills] = results.children[0].children;
  assert.equal(name.textContent, 'Märta Müller');
  assert.deepEqual(pills.children.map((pill) => pill.textContent), ['Deutsch', 'Mathe']);
  assert.equal(pills.children[0].style.properties.get('--learner-course-color'), '#ff0000');
  assert.equal(pills.children[1].style.properties.get('--learner-course-color'), '#64748b');
  pills.children[0].dispatch('click');
  assert.equal(controller.dialog.open, false);
  assert.deepEqual(selected, [{ courseId: 10, courseName: 'Deutsch', courseColor: '#ff0000', studentId: 1 }]);
});

test('typing re-renders and empty or unknown queries explain themselves', () => {
  const { controller, status, results } = setup();
  controller.setRoster(roster);
  controller.input.value = 'zzz';
  controller.input.dispatch('input');
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.noMatches);
  assert.equal(results.children.length, 0);
  controller.input.value = '  ';
  controller.input.dispatch('input');
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.prompt);
});

test('a status message drops the roster so stale results cannot reappear', () => {
  const { controller, status, results } = setup();
  controller.input.value = 'müller';
  controller.setRoster(roster);
  assert.equal(results.children.length, 1);
  controller.setStatus(LEARNER_SEARCH_MESSAGES.locked);
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.locked);
  assert.equal(results.children.length, 0);
  controller.input.dispatch('input');
  assert.equal(results.children.length, 0);
  assert.equal(status.textContent, LEARNER_SEARCH_MESSAGES.noMatches);
});

test('the dialog closes by script instead of a form submission that sandboxed frames block', () => {
  const { controller } = setup();
  const [dialogBody] = controller.dialog.children;
  const [header] = dialogBody.children;
  const closeButton = header.children[1];
  assert.equal(dialogBody.tagName, 'div');
  assert.equal(closeButton.type, 'button');
  controller.open();
  closeButton.dispatch('click');
  assert.equal(controller.dialog.open, false);
});
