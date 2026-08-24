import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);
const cssSource = await readFile(
  new URL('../src/modules/planning/app.css', import.meta.url),
  'utf8',
);
const runtimeSource = await readFile(
  new URL('../src/modules/workspace/runtime.js', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(appSource);
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

function extractTopLevelFunction(source, name) {
  const match = new RegExp(`\\nfunction ${name}\\(`).exec(source);
  assert.ok(match, `function ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`function ${name} is incomplete`);
}

const PERFORMANCE_STATUS_SYMBOLS = {
  locked: '🔒',
  'has-assessment': '✓',
  'missing-assessment': '❓',
};
const SEATPLAN_STATUS_CLASSES = {
  locked: 'is-locked',
  unresolved: 'is-unresolved',
  'no-plan': 'has-no-plan',
  'has-assessment': 'has-existing-assessment',
  'missing-assessment': 'is-missing-assessment',
};

const getSeatplanNavigationStateForLesson = Function(
  'SEATPLAN_TRIGGER_LABEL',
  'SEATPLAN_STATUS_SYMBOL_NO_PLAN',
  'SEATPLAN_STATUS_CLASSES',
  'PERFORMANCE_STATUS_SYMBOLS',
  'ARCHIVE_LOCKED_TOOLTIP',
  `"use strict"; return ({${extractClassMethod('getSeatplanNavigationStateForLesson')}}).getSeatplanNavigationStateForLesson;`,
)('Kurs-Sitzplan öffnen', '⚠️', SEATPLAN_STATUS_CLASSES, PERFORMANCE_STATUS_SYMBOLS, 'Notenmodul ist gesperrt');

const courseStateHasSeatPlan = Function(
  `"use strict"; ${extractTopLevelFunction(runtimeSource, 'courseStateHasSeatPlan')} return courseStateHasSeatPlan;`,
)();

function createHarness({ resolvedCourseIds = [7], seatplanCourseIds = [7], hasAssessment = false, locked = false } = {}) {
  return {
    seatplanCourseIds: new Set(seatplanCourseIds),
    isGradeVaultLocked() {
      return locked;
    },
    getPerformanceTitleSetForCourse(courseId) {
      return resolvedCourseIds.includes(Number(courseId)) ? new Set() : null;
    },
    getPerformanceNavigationStateForLesson() {
      return { hasExistingAssessment: hasAssessment };
    },
  };
}

const lesson = { courseId: 7, lessonDate: '2026-01-30' };

test('ohne Kurs gibt es keinen Sitzplan-Trigger', () => {
  assert.equal(getSeatplanNavigationStateForLesson.call(createHarness(), { lessonDate: '2026-01-30' }), null);
});

test('solange der Kurs nicht aufgelöst ist, behauptet der Stuhl nichts', () => {
  const state = getSeatplanNavigationStateForLesson.call(
    createHarness({ resolvedCourseIds: [] }),
    lesson,
  );

  assert.equal(state.status, 'unresolved');
  assert.equal(state.symbol, '');
  assert.equal(state.statusClass, 'is-unresolved');
  assert.equal(state.title, 'Kurs-Sitzplan öffnen');
});

test('ohne gespeicherten Sitzplan zeigt der Stuhl die Warnung', () => {
  const state = getSeatplanNavigationStateForLesson.call(
    createHarness({ seatplanCourseIds: [], hasAssessment: true }),
    lesson,
  );

  assert.equal(state.status, 'no-plan');
  assert.equal(state.symbol, '⚠️');
  assert.equal(state.statusClass, 'has-no-plan');
  assert.match(state.title, /für diesen Kurs ist noch kein Sitzplan gespeichert/);
});

test('mit Sitzplan folgt der Stuhl dem Würfel', () => {
  const withAssessment = getSeatplanNavigationStateForLesson.call(
    createHarness({ hasAssessment: true }),
    lesson,
  );
  const withoutAssessment = getSeatplanNavigationStateForLesson.call(
    createHarness({ hasAssessment: false }),
    lesson,
  );

  assert.equal(withAssessment.symbol, '✓');
  assert.equal(withAssessment.statusClass, 'has-existing-assessment');
  assert.equal(withoutAssessment.symbol, '❓');
  assert.equal(withoutAssessment.statusClass, 'is-missing-assessment');
});

test('das gesperrte Notenmodul schlägt jeden anderen Stuhl-Zustand', () => {
  for (const options of [
    { seatplanCourseIds: [] },
    { resolvedCourseIds: [] },
    { hasAssessment: true },
  ]) {
    const state = getSeatplanNavigationStateForLesson.call(
      createHarness({ ...options, locked: true }),
      lesson,
    );
    assert.equal(state.symbol, '🔒', JSON.stringify(options));
    assert.equal(state.statusClass, 'is-locked', JSON.stringify(options));
    assert.match(state.title, /Notenmodul ist gesperrt/);
  }
});

test('nur ein echt gespeicherter Sitzplan zählt als vorhanden', () => {
  assert.equal(courseStateHasSeatPlan(undefined), false);
  assert.equal(courseStateHasSeatPlan({ gradeSeatPlans: [] }), false);
  assert.equal(courseStateHasSeatPlan({ gradeSeatPlans: [{ courseId: 7, plan: null }] }), false);
  assert.equal(
    courseStateHasSeatPlan({ gradeSeatPlans: [{ courseId: 7, plan: { activeSeats: [] } }] }),
    false,
  );
  assert.equal(
    courseStateHasSeatPlan({ gradeSeatPlans: [{ courseId: 7, plan: { activeSeats: ['a1'] } }] }),
    true,
  );
});

test('die Sitzplan-Präsenz reist auf dem vorhandenen Leistungs-Index mit', () => {
  assert.match(runtimeSource, /this\.seatplanPresenceCache = new Map\(\);/);
  assert.match(
    runtimeSource,
    /this\.performanceIndexCache\.set\(id, items\);\s+this\.seatplanPresenceCache\.set\(id, courseStateHasSeatPlan\(state\)\);/,
    'rememberPerformanceIndex muss beide Caches füllen, damit alle Aufrufstellen abgedeckt sind',
  );
  assert.match(runtimeSource, /seatplanCourseIds: this\.buildSeatplanCourseIds\(payload\.courseIds\),/);
  assert.match(
    runtimeSource,
    /seatplanCourseIds: this\.buildSeatplanCourseIds\(\[\.\.\.this\.performanceIndexCache\.keys\(\)\]\),/,
  );

  const clears = runtimeSource.match(/this\.performanceIndexCache\.clear\(\);\s+this\.seatplanPresenceCache\.clear\(\);/g) || [];
  assert.equal(clears.length, 2, 'beide Reset-Stellen müssen den Sitzplan-Cache mitleeren');
  assert.match(
    runtimeSource,
    /this\.performanceIndexCache\.delete\(courseId\);\s+this\.seatplanPresenceCache\.delete\(courseId\);/,
  );

  assert.doesNotMatch(
    appSource,
    /getGradeSeatPlan/,
    'das Planungsmodul darf den Sitzplan nicht direkt aus dem Store lesen',
  );
});

test('das Planungsmodul übernimmt den Sitzplan-Index aus beiden Quellen', () => {
  assert.match(appSource, /this\.seatplanCourseIds = new Set\(\);/);
  assert.match(
    extractClassMethod('handleWorkspaceState'),
    /this\.replaceSeatplanIndex\(detail\.snapshot\.seatplanCourseIds\);/,
  );
  assert.match(
    extractClassMethod('ensureWeekPerformanceIndexLoaded'),
    /this\.mergeSeatplanIndex\(result\.data\?\.seatplanCourseIds, missingCourseIds\);/,
  );
  assert.match(
    extractClassMethod('_createWeekLessonCard'),
    /this\.getSeatplanNavigationStateForLesson\(block\.topLesson, performanceLookup\)/,
  );
});

test('der Stuhl trägt sein Icon im ::before und alle vier Zustandsfarben', () => {
  const before = cssSource.match(
    /\.lesson-block \.lesson-block-seatplan-trigger::before \{([\s\S]*?)\n        \}/,
  )?.[1] || '';

  assert.match(before, /content: "🪑";/);
  assert.match(before, /z-index: -1;/);
  for (const state of ['has-existing-assessment', 'is-missing-assessment', 'has-no-plan', 'is-unresolved']) {
    assert.match(
      cssSource,
      new RegExp(`\\.lesson-block \\.lesson-block-seatplan-trigger\\.${state} \\{`),
      `Zustand ${state} braucht eine Regel`,
    );
  }
  assert.match(
    cssSource,
    /\.lesson-block\.has-seatplan-trigger \.lesson-block-details-trigger \{\s+left: calc\(2\.46rem/,
    'die Position des Detail-Triggers darf sich nicht verschieben',
  );
  assert.match(
    cssSource,
    /\.lesson-block \.lesson-block-seatplan-trigger\.has-no-plan \{?\s*\n?\s*font-size: calc\(1\.5rem \* var\(--week-table-scale, 1\)\);/,
    'die Warnung für einen fehlenden Sitzplan muss dieselbe kleine Größe wie die übrigen Statussymbole haben',
  );
});
