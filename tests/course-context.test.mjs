import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const [courseContextFileSource, tabsSource] = await Promise.all([
  read('../src/app/course-context.js'),
  read('../src/shell/tabs.js'),
]);
const tabsUrl = dataUrl(tabsSource);
const courseContextSource = courseContextFileSource
  .replace("'../shell/tabs.js'", `'${tabsUrl}'`);
const [courseContextModule, tabs] = await Promise.all([
  import(dataUrl(courseContextSource)),
  import(tabsUrl),
]);

class TestCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.forEach(listener => listener(event));
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    },
  };
}

function createHarness() {
  const eventTarget = createEventTarget();
  const frames = new Map();
  const cancelledFrames = [];
  const grades = [];
  const planning = [];
  const seatplan = [];
  const initialized = [];
  const selectedTabs = [];
  let frameSequence = 0;
  let clock = 100;
  let activeTab = tabs.TAB_GROUPS;
  const view = {
    CustomEvent: TestCustomEvent,
    requestAnimationFrame(callback) {
      const id = ++frameSequence;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    setTimeout(callback) {
      const id = ++frameSequence;
      frames.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      frames.delete(id);
    },
  };
  const context = courseContextModule.createCourseContext({
    eventTarget,
    view,
    now: () => clock,
    getActiveTab: () => activeTab,
    setActiveTab: tab => selectedTabs.push(tab),
    dispatchGradesNavigation: detail => grades.push(detail),
    dispatchPlanningViewRequest: detail => planning.push(detail),
    ensureSeatplanInitialized: () => initialized.push(true),
    sendCourseSeatplanContext: detail => seatplan.push(detail),
  });
  return {
    eventTarget,
    view,
    context,
    grades,
    planning,
    seatplan,
    initialized,
    selectedTabs,
    cancelledFrames,
    emit(type, detail) {
      eventTarget.dispatchEvent(new TestCustomEvent(type, { detail }));
    },
    setClock(value) {
      clock = value;
    },
    setActiveTab(tab) {
      activeTab = tab;
    },
    flushFrame() {
      const entry = frames.entries().next().value;
      if (!entry) return false;
      const [id, callback] = entry;
      frames.delete(id);
      callback();
      return true;
    },
    frameCount: () => frames.size,
  };
}

test('übernimmt Planning- und Grades-Kontext mit unveränderten Navigationspayloads', () => {
  const harness = createHarness();
  harness.emit(tabs.PLANNING_COURSE_CONTEXT_EVENT, { courseId: 7, courseViewOpen: true });
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  assert.deepEqual(harness.grades, [{ courseId: 7, source: 'course-context' }]);

  harness.emit(tabs.PLANNING_COURSE_CONTEXT_EVENT, { courseId: 7, courseViewOpen: false });
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  assert.deepEqual(harness.grades[1], { autoSelectCourse: true, source: 'course-context' });

  harness.emit(tabs.GRADES_COURSE_CONTEXT_EVENT, { courseId: 9 });
  harness.emit(tabs.GRADES_COURSE_CONTEXT_EVENT, { courseId: 0 });
  harness.context.handleTabActivating(tabs.TAB_PLANNING);
  assert.deepEqual(harness.planning, [{
    view: 'course',
    courseId: 9,
    source: 'course-context',
  }]);
});

test('unterdrückt die automatische Notenkurswahl exakt für zwei Sekunden', () => {
  const harness = createHarness();
  harness.context.suppressGradesAutoSelect();
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  harness.setClock(2099);
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  assert.equal(harness.grades.length, 0);
  harness.setClock(2100);
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  assert.deepEqual(harness.grades, [{ autoSelectCourse: true, source: 'course-context' }]);

  harness.emit(tabs.PLANNING_COURSE_CONTEXT_EVENT, { courseId: 4, courseViewOpen: true });
  harness.context.suppressGradesAutoSelect();
  harness.context.handleTabActivating(tabs.TAB_GRADES);
  assert.deepEqual(harness.grades[1], { courseId: 4, source: 'course-context' });
});

test('übergibt Course-Seatplan-Kontext nach dem Tabwechsel ohne Payload-Kopie', () => {
  const harness = createHarness();
  const first = { courseId: 5, source: 'planning' };
  const latest = { courseId: 6, source: 'grades' };
  harness.emit(tabs.PLANNING_COURSE_SEATPLAN_OPEN_EVENT, first);
  assert.deepEqual(harness.selectedTabs, [tabs.TAB_SEATPLAN]);
  assert.equal(harness.initialized.length, 1);
  harness.context.handleTabActivating(tabs.TAB_SEATPLAN);
  assert.equal(harness.frameCount(), 1);

  harness.emit(tabs.GRADES_COURSE_SEATPLAN_OPEN_EVENT, latest);
  harness.context.handleTabActivating(tabs.TAB_SEATPLAN);
  harness.setActiveTab(tabs.TAB_SEATPLAN);
  assert.equal(harness.flushFrame(), true);
  assert.equal(harness.seatplan.length, 1);
  assert.equal(harness.seatplan[0], latest);
  assert.equal(harness.initialized.length, 3);
});

test('liefert Sitzplan-Kontext im bereits aktiven Sitzplan unmittelbar aus', () => {
  const harness = createHarness();
  const detail = { courseId: 3 };
  harness.setActiveTab(tabs.TAB_SEATPLAN);
  harness.emit(tabs.PLANNING_COURSE_SEATPLAN_OPEN_EVENT, detail);
  assert.equal(harness.seatplan[0], detail);
  assert.equal(harness.initialized.length, 2);
  assert.equal(harness.selectedTabs.length, 0);
});

test('ignoriert ungültige Sitzplan-Events und entfernt alle Listener beim Dispose', () => {
  const harness = createHarness();
  harness.eventTarget.dispatchEvent({
    type: tabs.PLANNING_COURSE_SEATPLAN_OPEN_EVENT,
    detail: { courseId: 2 },
  });
  harness.emit(tabs.GRADES_COURSE_SEATPLAN_OPEN_EVENT, null);
  assert.equal(harness.initialized.length, 0);
  assert.equal(harness.eventTarget.listenerCount(), 4);

  harness.emit(tabs.PLANNING_COURSE_SEATPLAN_OPEN_EVENT, { courseId: 8 });
  harness.context.handleTabActivating(tabs.TAB_SEATPLAN);
  assert.equal(harness.frameCount(), 1);
  harness.context.dispose();
  harness.context.dispose();
  assert.equal(harness.eventTarget.listenerCount(), 0);
  assert.equal(harness.frameCount(), 0);
  assert.equal(harness.cancelledFrames.length, 1);
});

test('hält Course-Context, Feature-Module und Offline-Grenzen getrennt', async () => {
  const [mainSource, serviceWorker, audit] = await Promise.all([
    read('../src/app/app-runtime.js'),
    read('../sw.js'),
    read('../scripts/audit.py'),
  ]);
  assert.match(mainSource, /from '\.\/course-context\.js'/);
  assert.match(mainSource, /courseContext = createCourseContext\(\{/);
  assert.doesNotMatch(mainSource, /rememberSharedCourseContext|applySharedCourseContext|pendingCourseSeatplanContext/);
  assert.doesNotMatch(courseContextFileSource, /\.\.\/modules\//);
  assert.match(serviceWorker, /\.\/src\/app\/course-context\.js/);
  assert.match(audit, /ROOT \/ 'src' \/ 'app' \/ 'course-context\.js'/);
});
