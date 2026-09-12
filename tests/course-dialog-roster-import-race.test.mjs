import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/grades/app.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`, 'g');
  const match = matcher.exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const signatureEnd = appSource.indexOf(') {', start);
  assert.ok(signatureEnd > start, `method ${name} must have a body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    const char = appSource[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return appSource.slice(start, index + 1);
    }
  }
  throw new Error(`method ${name} is incomplete`);
}

const methodNames = [
  'resetCourseDialogRosterImport',
  'refreshCourseDialogRosterImportCourses',
  'renderCourseDialogRosterImport',
];
const methods = methodNames.map(extractClassMethod).join(',\n');
const rosterMethods = Function(
  'normalizeCourseColor',
  'document',
  `"use strict"; return ({${methods}});`,
)(
  (color, noLesson) => (noLesson ? '#no-lesson' : String(color || '#default')),
  {
    createElement(tagName) {
      return new TestElement(tagName);
    },
  },
);

class TestClassList {
  constructor() {
    this.values = new Set();
  }

  add(name) {
    this.values.add(name);
  }

  remove(name) {
    this.values.delete(name);
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
    return Boolean(force);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class TestElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.classList = new TestClassList();
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.className = '';
    this.disabled = false;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createHarness(candidates) {
  const pendingSummaries = new Map();
  const startedSummaries = [];
  const pills = new TestElement('div');
  const importRow = new TestElement('div');
  const harness = {
    ...rosterMethods,
    courseDialogRosterImportCourses: [],
    courseDialogRosterImportState: 'idle',
    courseDialogRosterImportToken: 0,
    courseDialogRosterImportedCourseIds: new Set(),
    courseDialogRosterImportBusy: false,
    courseStudentCounts: new Map(),
    refs: { courseDialogRosterPills: pills, courseStudentsImportRow: importRow },
    canAccessGradeVault() { return true; },
    listCourseDialogRosterImportCandidates() { return candidates; },
    getWorkspaceOwnerApp() {
      return {
        getGradeCourseRosterSummary: (courseId) => {
          const id = Number(courseId);
          startedSummaries.push(id);
          return new Promise((resolve, reject) => {
            pendingSummaries.set(id, { resolve, reject });
          });
        },
      };
    },
  };
  return { harness, pendingSummaries, startedSummaries, pills, importRow };
}

async function waitForPendingSummary(pendingSummaries, courseId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pending = pendingSummaries.get(Number(courseId));
    if (pending) return pending;
    await Promise.resolve();
  }
  assert.fail(`summary for course ${courseId} was not requested`);
}

function noteText(pills) {
  const note = pills.children.find((child) => child.className === 'course-dialog-roster-pills-note');
  return note ? note.textContent : null;
}

const candidates = [
  { id: 2, name: 'Kurs B', color: '#aaa' },
  { id: 3, name: 'Kurs C', color: '#bbb' },
];

test('all roster summaries are requested in parallel, not one after another', async () => {
  const { harness, pendingSummaries, startedSummaries } = createHarness(candidates);

  const refresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);

  assert.deepEqual(
    startedSummaries,
    [2, 3],
    'every candidate must be requested before any summary resolves',
  );

  pendingSummaries.get(2).resolve({ studentCount: 4 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await refresh;
});

test('a pending refresh shows the loading note instead of hiding the column', async () => {
  const { harness, pendingSummaries, pills, importRow } = createHarness(candidates);

  const refresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);

  assert.equal(noteText(pills), 'Kurse werden geladen …');
  assert.equal(importRow.classList.contains('roster-import-unavailable'), false);

  pendingSummaries.get(2).resolve({ studentCount: 4 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await refresh;
});

test('reopening the dialog mid-refresh leaves the box neither hidden nor stuck on loading', async () => {
  const { harness, pendingSummaries, pills, importRow } = createHarness(candidates);

  const staleRefresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);

  harness.resetCourseDialogRosterImport();

  pendingSummaries.get(2).resolve({ studentCount: 4 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await staleRefresh;

  assert.notEqual(
    harness.courseDialogRosterImportState,
    'loading',
    'a superseded run must not strand the state on loading',
  );
  assert.equal(importRow.classList.contains('roster-import-unavailable'), false);

  const freshRefresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);
  pendingSummaries.get(2).resolve({ studentCount: 4 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await freshRefresh;

  assert.equal(harness.courseDialogRosterImportState, 'ready');
  assert.deepEqual(harness.courseDialogRosterImportCourses.map((course) => course.id), [2, 3]);
  assert.equal(noteText(pills), null);
  assert.equal(pills.children.length, 2);
});

test('a superseded run writes no course state at all', async () => {
  const { harness, pendingSummaries } = createHarness(candidates);

  const staleRefresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);

  harness.courseDialogRosterImportToken += 1;

  pendingSummaries.get(2).resolve({ studentCount: 4 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await staleRefresh;

  assert.deepEqual(harness.courseDialogRosterImportCourses, []);
});

test('courses keep candidate order and only those with participants are offered', async () => {
  const { harness, pendingSummaries, pills } = createHarness(candidates);

  const refresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);
  pendingSummaries.get(2).resolve({ studentCount: 0 });
  pendingSummaries.get(3).resolve({ studentCount: 7 });
  await refresh;

  assert.deepEqual(harness.courseDialogRosterImportCourses.map((course) => course.id), [3]);
  assert.equal(pills.children.length, 1);
  assert.equal(pills.children[0].textContent, 'Kurs C');
});

test('a failing summary falls back to the cached student count', async () => {
  const { harness, pendingSummaries } = createHarness(candidates);
  harness.courseStudentCounts.set(2, 5);

  const refresh = harness.refreshCourseDialogRosterImportCourses();
  await waitForPendingSummary(pendingSummaries, 2);
  pendingSummaries.get(2).reject(new Error('decode failed'));
  pendingSummaries.get(3).resolve({ studentCount: 0 });
  await refresh;

  assert.deepEqual(harness.courseDialogRosterImportCourses.map((course) => course.id), [2]);
  assert.equal(harness.courseDialogRosterImportCourses[0].count, 5);
});

test('a genuinely empty roster import shows a note and keeps the column visible', async () => {
  const { harness, pills, importRow } = createHarness([]);

  await harness.refreshCourseDialogRosterImportCourses();

  assert.equal(harness.courseDialogRosterImportState, 'ready');
  assert.equal(noteText(pills), 'Keine anderen Kurse mit Teilnehmenden');
  assert.equal(importRow.classList.contains('roster-import-unavailable'), false);
});

test('resetting the roster import never hides the column', () => {
  const { harness, importRow } = createHarness(candidates);
  importRow.classList.add('roster-import-unavailable');

  harness.resetCourseDialogRosterImport();

  assert.equal(importRow.classList.contains('roster-import-unavailable'), false);
});
