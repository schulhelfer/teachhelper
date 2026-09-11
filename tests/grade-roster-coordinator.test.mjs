import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [coordinatorModuleSource, studentSyncSource, tabsSource] = await Promise.all([
  readFile(new URL('../src/app/grade-roster-coordinator.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/student-sync-bus.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shell/tabs.js', import.meta.url), 'utf8'),
]);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const studentSyncUrl = dataUrl(studentSyncSource);
const tabsUrl = dataUrl(tabsSource);
const coordinatorUrl = dataUrl(
  coordinatorModuleSource
    .replace("'../shared/student-sync-bus.js'", JSON.stringify(studentSyncUrl))
    .replace("'../shell/tabs.js'", JSON.stringify(tabsUrl)),
);
const { createGradeRosterCoordinator } = await import(coordinatorUrl);
const {
  GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT,
  GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT,
  GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT,
  TAB_GROUPS,
  TAB_RANDOM_PICKER,
} = await import(tabsUrl);

class TestClassList {
  constructor() {
    this.values = new Set();
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

class TestStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, value);
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class TestElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.classList = new TestClassList();
    this.style = new TestStyle();
    this.hidden = false;
    this.clientWidth = 300;
    this.clientHeight = 30;
    this.scrollWidth = 300;
    this.scrollHeight = 30;
    this.offsetTop = 0;
    this.parentElement = null;
    this.rosterRow = null;
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      this.children.push(child);
    });
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  closest(selector) {
    if (selector === '.roster-import-row') return this.rosterRow;
    if (selector === '.grade-roster-import' && this.insideGradeRosterImport) return this;
    return null;
  }
}

class TestDocument extends EventTarget {
  createElement(tagName) {
    return new TestElement(tagName);
  }
}

function createHarness({ activeTab = TAB_GROUPS, tutorialDemo = false, rosterLabel = '' } = {}) {
  const documentBus = new TestDocument();
  const row = new TestElement();
  const surface = new TestElement();
  const pills = new TestElement();
  pills.parentElement = surface;
  pills.rosterRow = row;
  const menu = new TestElement();
  menu.hidden = true;
  const trigger = new TestElement('button');
  const reset = new TestElement('button');
  reset.hidden = true;
  const resizeTarget = new TestElement();
  const courseRequests = [];
  const importRequests = [];
  const saveRequests = [];
  const messages = [];
  const activatedTabs = [];
  let pickerBindingChanges = 0;
  let disconnected = false;
  let observedTarget = null;
  let resizeCallback = null;
  let currentTab = activeTab;
  let currentTutorialDemo = tutorialDemo;
  let currentRosterLabel = rosterLabel;

  class TestResizeObserver {
    constructor(callback) {
      resizeCallback = callback;
    }

    observe(target) {
      observedTarget = target;
    }

    disconnect() {
      disconnected = true;
    }
  }

  const coordinator = createGradeRosterCoordinator({
    documentBus,
    view: {
      CustomEvent,
      Element: TestElement,
      ResizeObserver: TestResizeObserver,
      matchMedia: () => ({ matches: false }),
    },
    elements: {
      gradeRosterImportMenu: menu,
      gradeRosterImportTrigger: trigger,
      gradeRosterPills: pills,
      randomPickerCourseReset: reset,
      resizeTarget,
    },
    bridge: {
      requestGradeRosterCourses: (detail) => courseRequests.push(detail),
      requestGradeRosterImport: (detail) => importRequests.push(detail),
      requestGradePickerConfigSave: (detail) => saveRequests.push(detail),
    },
    getActiveTab: () => currentTab,
    setActiveTab: (tab) => {
      currentTab = tab;
      activatedTabs.push(tab);
    },
    getRosterLabel: () => currentRosterLabel,
    isRandomPickerActive: () => currentTab === TAB_RANDOM_PICKER,
    isTutorialDemoActive: () => currentTutorialDemo,
    normalizePickerWeight: (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    },
    showMessage: (...args) => messages.push(args),
    onPickerBindingChange: () => {
      pickerBindingChanges += 1;
    },
  });

  return {
    coordinator,
    documentBus,
    elements: { menu, pills, reset, row, surface, trigger, resizeTarget },
    courseRequests,
    importRequests,
    saveRequests,
    messages,
    activatedTabs,
    get pickerBindingChanges() {
      return pickerBindingChanges;
    },
    setTab(tab) {
      currentTab = tab;
    },
    setTutorialDemo(value) {
      currentTutorialDemo = value;
    },
    setRosterLabel(value) {
      currentRosterLabel = value;
    },
    get observedTarget() {
      return observedTarget;
    },
    get disconnected() {
      return disconnected;
    },
    runResize() {
      resizeCallback?.();
    },
  };
}

function dispatchResult(documentBus, type, detail) {
  documentBus.dispatchEvent(new CustomEvent(type, { detail }));
}

function loadCourses(harness, courses, extra = {}) {
  harness.coordinator.requestCourses();
  const requestId = harness.courseRequests.at(-1).requestId;
  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, {
    requestId,
    ok: true,
    hasCourses: courses.length > 0,
    courses,
    ...extra,
  });
}

test('Kursabfragen korrelieren Antworten und behalten Entsperrungsnavigation und UI-Zustände', () => {
  const harness = createHarness();
  assert.equal(harness.observedTarget, harness.elements.resizeTarget);
  assert.equal(harness.coordinator.requestCourses(), true);
  assert.equal(harness.coordinator.requestCourses(), false);
  assert.equal(harness.courseRequests.length, 1);
  assert.deepEqual(
    Object.keys(harness.courseRequests[0]).sort(),
    ['interactive', 'requestId', 'restoreTabAfterUnlock', 'returnTab', 'unlock'].sort(),
  );

  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, {
    requestId: 'stale',
    ok: true,
    courses: [{ id: 8, name: 'Alt' }],
  });
  assert.equal(harness.coordinator.requestCourses(), false);

  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, {
    requestId: harness.courseRequests[0].requestId,
    ok: true,
    courses: [{ id: 9, name: 'Biologie', color: '#fff' }],
    hasCourses: true,
    restoreTabAfterUnlock: true,
    returnTab: TAB_RANDOM_PICKER,
  });
  assert.equal(harness.activatedTabs.at(-1), TAB_RANDOM_PICKER);
  assert.equal(harness.elements.pills.children.length, 1);
  assert.equal(harness.elements.pills.children[0].textContent, 'Biologie');
  assert.equal(harness.coordinator.requestCourses({ interactive: true, unlock: true }), true);
  assert.equal(harness.courseRequests.at(-1).interactive, true);
  assert.equal(harness.courseRequests.at(-1).unlock, true);
  assert.equal(harness.elements.pills.children[0].textContent, 'Notenkurse werden geladen …');
});

test('Picker-Import übernimmt die gespeicherte Bindung und persistiert Änderungen unverändert', () => {
  const harness = createHarness({ activeTab: TAB_RANDOM_PICKER });
  loadCourses(harness, [{ id: 12, name: 'Physik', color: '#abc' }]);
  harness.elements.pills.children[0].dispatchEvent(new Event('click'));
  const importRequest = harness.importRequests.at(-1);
  assert.equal(importRequest.courseId, 12);
  assert.equal(importRequest.mode, 'picker');
  assert.equal(importRequest.returnTab, TAB_RANDOM_PICKER);

  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_IMPORT_RESULT_EVENT, {
    requestId: importRequest.requestId,
    ok: true,
    mode: 'picker',
    courseId: 12,
    courseName: 'Physik',
    rosterToken: 'roster-12',
    students: [{ id: 'a', first: 'Ada' }, { id: 'b', first: 'Bo' }],
    pickerConfig: {
      weightsByStudentId: { a: 3, b: 0 },
      autoDisableSelected: true,
    },
  });

  const fallback = [{ id: 'fallback' }];
  const boundStudents = harness.coordinator.getPickerStudents(fallback);
  assert.deepEqual(boundStudents.map((student) => student.randomWeight), [3, 1]);
  assert.equal(harness.coordinator.getPickerAutoDisableSelected(false), true);
  assert.equal(harness.elements.reset.hidden, false);
  assert.match(harness.elements.reset.title, /Physik/);
  assert.equal(harness.pickerBindingChanges, 1);

  assert.equal(harness.coordinator.setPickerAutoDisableSelected(false, { deferSave: true }), true);
  assert.equal(harness.saveRequests.length, 0);
  boundStudents[0].randomWeight = 4;
  assert.equal(harness.coordinator.savePickerConfig(), true);
  assert.deepEqual(harness.saveRequests[0], {
    requestId: harness.saveRequests[0].requestId,
    courseId: 12,
    rosterToken: 'roster-12',
    config: {
      weightsByStudentId: { a: 4, b: 1 },
      autoDisableSelected: false,
    },
  });

  dispatchResult(harness.documentBus, GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, {
    requestId: 'stale-save',
    ok: false,
    message: 'Alt',
  });
  assert.equal(harness.messages.some(([message]) => message === 'Alt'), false);
  dispatchResult(harness.documentBus, GRADES_COURSE_PICKER_CONFIG_SAVE_RESULT_EVENT, {
    requestId: harness.saveRequests[0].requestId,
    ok: false,
    message: 'Speichern fehlgeschlagen',
  });
  assert.deepEqual(harness.messages.at(-1), ['Speichern fehlgeschlagen', 'warn']);

  assert.equal(harness.coordinator.clearPickerBinding(), true);
  assert.equal(harness.coordinator.getPickerStudents(fallback), fallback);
  assert.equal(harness.coordinator.getPickerAutoDisableSelected(true), true);
  assert.equal(harness.elements.reset.hidden, true);
  assert.equal(harness.pickerBindingChanges, 2);
  assert.equal(harness.coordinator.savePickerConfig(), false);
});

test('Roster-Auswahl, Dateinamen-Fallback und Kursimport bleiben vom Picker getrennt', () => {
  const harness = createHarness({ rosterLabel: 'Chemie (Notenmodul)' });
  loadCourses(harness, [
    { id: 20, name: 'Chemie' },
    { id: 21, name: 'Mathematik' },
  ]);
  assert.equal(harness.elements.pills.children[0].classList.contains('is-imported'), true);
  assert.equal(harness.elements.pills.children[1].classList.contains('is-imported'), false);

  harness.setRosterLabel('');
  harness.coordinator.updateSharedRosterSelection({
    source: 'grades',
    gradeCourseId: 21,
    gradeCourseName: 'Mathematik',
  });
  harness.coordinator.refreshLayout();
  assert.equal(harness.elements.pills.children[0].classList.contains('is-imported'), false);
  assert.equal(harness.elements.pills.children[1].classList.contains('is-imported'), true);

  harness.elements.pills.children[1].dispatchEvent(new Event('click'));
  assert.equal(harness.importRequests.at(-1).mode, 'roster');
  harness.coordinator.updateSharedRosterSelection({ source: 'groups' });
  harness.coordinator.refreshLayout();
  assert.equal(harness.elements.pills.children[1].classList.contains('is-imported'), false);
});

test('Demo-Schutz, leere Kurslisten, technische Fehler und Dispose bleiben gekapselt', () => {
  const harness = createHarness({ tutorialDemo: true });
  harness.elements.trigger.dispatchEvent(new Event('click'));
  assert.equal(harness.courseRequests.length, 0);
  assert.match(harness.messages[0][0], /^Demo:/);

  harness.setTutorialDemo(false);
  harness.elements.trigger.dispatchEvent(new Event('click'));
  const requestId = harness.courseRequests[0].requestId;
  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, {
    requestId,
    ok: true,
    courses: [],
    hasCourses: false,
  });
  assert.equal(harness.elements.surface.hidden, true);
  assert.equal(harness.elements.trigger.hidden, true);

  harness.coordinator.requestCourses({ interactive: true });
  dispatchResult(harness.documentBus, GRADES_GRADE_ROSTER_COURSES_RESULT_EVENT, {
    requestId: harness.courseRequests.at(-1).requestId,
    ok: false,
    message: 'Kurse fehlen',
  });
  assert.equal(harness.elements.menu.children[0].textContent, 'Kurse fehlen');
  harness.runResize();
  harness.coordinator.dispose();
  assert.equal(harness.disconnected, true);
  const requestCount = harness.courseRequests.length;
  harness.elements.trigger.dispatchEvent(new Event('click'));
  assert.equal(harness.courseRequests.length, requestCount);
});

test('die neue Modulgrenze hält Featurelogik aus dem Coordinator und wird offline abgesichert', async () => {
  const [coordinatorSource, mainSource, serviceWorker, audit] = await Promise.all([
    readFile(new URL('../src/app/grade-roster-coordinator.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/app-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/audit.py', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(coordinatorSource, /modules\/(?:grades|random-picker|groups|work-phase)/);
  assert.doesNotMatch(coordinatorSource, /\b(?:groupsController|randomPickerController|workPhaseController|state)\b/);
  assert.match(mainSource, /from '\.\/grade-roster-coordinator\.js'/);
  assert.match(mainSource, /gradeRosterCoordinator\?\.updateSharedRosterSelection\(detail\)/);
  assert.doesNotMatch(mainSource, /\b(?:gradePickerBinding|renderGradeRosterPills|requestGradeRosterCourses)\b/);
  assert.match(serviceWorker, /'\.\/src\/app\/grade-roster-coordinator\.js'/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'grade-roster-coordinator\.js'/);
});
