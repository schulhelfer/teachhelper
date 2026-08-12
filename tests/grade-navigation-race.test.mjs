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
  'loadGradeCourseNavigationTargetAtomically',
  'beginGradeCourseNavigationLoad',
  'isGradeCourseNavigationLoadCurrent',
  'isGradeCourseNavigationUiLocked',
  'isGradeCourseNavigationEventBlocked',
  'setGradeCourseNavigationUiLocked',
  'ensureGradeCourseLoadedForNavigation',
];
const methods = methodNames.map(extractClassMethod).join(',\n');
const navigationMethods = Function(`"use strict"; return ({${methods}});`)();

class FakeNode {
  constructor() {
    this.parent = null;
  }

  contains(candidate) {
    for (let current = candidate; current; current = current.parent) {
      if (current === this) return true;
    }
    return false;
  }
}

class FakeElement extends FakeNode {
  constructor() {
    super();
    this.inert = false;
    this.dataset = {};
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

globalThis.Node = FakeNode;
globalThis.HTMLElement = FakeElement;

function createHarness() {
  const pendingLoads = new Map();
  const roots = {
    gradesEntryContent: new FakeElement(),
    gradesTable: new FakeElement(),
    gradesTitleDatePicker: new FakeElement(),
    gradePicker: new FakeElement(),
  };
  const harness = {
    ...navigationMethods,
    gradeCourseLoadGeneration: 0,
    gradeCourseLoadUiGeneration: 0,
    pendingGradesRenderAfterCourseLoad: false,
    gradeCourseMutationActiveCourseId: null,
    gradeCourseOperationTail: Promise.resolve(),
    loadedCourseId: 1,
    gradeVaultSession: { loadedGradeCourseId: 1 },
    refs: roots,
    canAccessGradeVault() { return true; },
    getWorkspaceOwnerApp() {
      return {
        loadGradeCourseNavigationTargetAtomically: async (courseId, fallbackCourseId = null) => {
          const loaded = await this.ensureGradeCourseLoadedNow(courseId);
          if (loaded) return true;
          if (fallbackCourseId) await this.ensureGradeCourseLoadedNow(fallbackCourseId);
          throw new Error('Notenkurs konnte nicht geladen werden.');
        },
      };
    },
    enqueueGradeCourseOperation(operation) {
      const queued = this.gradeCourseOperationTail.then(operation, operation);
      this.gradeCourseOperationTail = queued.then(() => undefined, () => undefined);
      return queued;
    },
    hideGradePicker() {},
    hideGradesTitleDatePicker() {},
    removeGradesEntryDistributionOverlay() {},
    async ensureGradeCourseLoadedNow(courseId) {
      if (Number(courseId) === 1) {
        this.loadedCourseId = 1;
        return true;
      }
      return new Promise((resolve) => {
        pendingLoads.set(Number(courseId), {
          resolve: (loaded) => {
            if (loaded) this.loadedCourseId = Number(courseId);
            resolve(loaded);
          },
          reject: (error) => {
            throw error;
          },
        });
      });
    },
  };
  return { harness, pendingLoads, roots };
}

async function waitForPendingLoad(pendingLoads, courseId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pendingLoad = pendingLoads.get(Number(courseId));
    if (pendingLoad) {
      return pendingLoad;
    }
    await Promise.resolve();
  }
  assert.fail(`pending load for course ${courseId} was not started`);
}

test('a newer course navigation suppresses the late selection and render of the older load', async () => {
  const { harness, pendingLoads, roots } = createHarness();
  const rendered = [];

  async function navigate(courseId) {
    const generation = harness.beginGradeCourseNavigationLoad();
    const loaded = await harness.ensureGradeCourseLoadedForNavigation(courseId, generation);
    if (!loaded || !harness.isGradeCourseNavigationLoadCurrent(generation)) {
      return false;
    }
    harness.selectedCourseId = courseId;
    rendered.push(courseId);
    return true;
  }

  const navigationB = navigate(2);
  const navigationC = navigate(3);
  assert.equal(roots.gradesEntryContent.inert, true);
  assert.equal(roots.gradesTable.inert, true);

  (await waitForPendingLoad(pendingLoads, 2)).resolve(true);
  assert.equal(await navigationB, false);
  assert.equal(harness.selectedCourseId, undefined);
  assert.deepEqual(rendered, []);
  assert.equal(roots.gradesEntryContent.inert, true, 'old completion must not unlock the newer load');

  (await waitForPendingLoad(pendingLoads, 3)).resolve(true);
  assert.equal(await navigationC, true);
  assert.equal(harness.selectedCourseId, 3);
  assert.deepEqual(rendered, [3]);
  assert.equal(roots.gradesEntryContent.inert, false);
  assert.equal(roots.gradesTable.inert, false);
});

test('draft events are rejected while a grade-course navigation load is active', async () => {
  const { harness, pendingLoads, roots } = createHarness();
  const generation = harness.beginGradeCourseNavigationLoad();
  const load = harness.ensureGradeCourseLoadedForNavigation(2, generation);
  const oldDraftInput = new FakeElement();
  oldDraftInput.parent = roots.gradesEntryContent;

  assert.equal(harness.isGradeCourseNavigationEventBlocked({ target: oldDraftInput }), true);
  (await waitForPendingLoad(pendingLoads, 2)).resolve(true);
  assert.equal(await load, true);
  assert.equal(harness.isGradeCourseNavigationEventBlocked({ target: oldDraftInput }), false);
});

test('a failed latest load restores the pre-navigation course before unlocking the UI', async () => {
  const { harness, pendingLoads, roots } = createHarness();
  const navigationB = harness.ensureGradeCourseLoadedForNavigation(
    2,
    harness.beginGradeCourseNavigationLoad(),
    { fallbackCourseId: 1 },
  );
  const navigationC = harness.ensureGradeCourseLoadedForNavigation(
    3,
    harness.beginGradeCourseNavigationLoad(),
    { fallbackCourseId: 1 },
  );

  (await waitForPendingLoad(pendingLoads, 2)).resolve(true);
  assert.equal(await navigationB, false);
  assert.equal(harness.loadedCourseId, 2, 'stale B may exist only while the newer UI lock is active');
  assert.equal(roots.gradesEntryContent.inert, true);

  (await waitForPendingLoad(pendingLoads, 3)).resolve(false);
  await assert.rejects(navigationC, /Notenkurs konnte nicht geladen werden/);
  assert.equal(harness.loadedCourseId, 1);
  assert.equal(roots.gradesEntryContent.inert, false);
  assert.equal(roots.gradesTable.inert, false);
});

test('course context actions bind participant management to the right-clicked course', () => {
  const studentsDialog = extractClassMethod('openCourseStudentsDialog');
  const structureDialog = extractClassMethod('openCourseStructureDialog');
  const contextMenu = extractClassMethod('openCourseContextMenu');
  assert.match(studentsDialog, /this\.selectedCourseId = id;[\s\S]*?await this\.ensureGradeCourseLoaded\(id\)/);
  assert.match(structureDialog, /this\.selectedCourseId = id;[\s\S]*?await this\.ensureGradeCourseLoaded\(id\)/);
  assert.match(contextMenu, /if \(!course\.noLesson\) \{\s*this\.selectedCourseId = id;/);
});
