import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [main, planningApp, gradesApp] = await Promise.all([
  read('../src/main.js'),
  read('../src/modules/planning/app.js'),
  read('../src/modules/grades/app.js'),
]);

function extractClassMethod(source, name) {
  const matcher = new RegExp(`\\n  (?:async )?${name}\\(`, 'g');
  const match = matcher.exec(source);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const signatureEnd = source.indexOf(') {', start);
  assert.ok(signatureEnd > start, `method ${name} must have a body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`method ${name} is incomplete`);
}

const methods = [
  'getPreferredGradesCourseIdForNow',
  'resolveTimetableCourseAutoSelection',
  'isSidebarSelectableGradeCourse',
  'courseAllowsGrades',
  'lessonAllowsGrades',
  'normalizeGradesSubView',
]
  .map((name) => extractClassMethod(gradesApp, name))
  .join(',\n');
const gradesMethods = Function(`"use strict"; return ({${methods}});`)();

const HOURS = [
  { lesson: 1, start: '08:00', end: '08:45' },
  { lesson: 2, start: '08:50', end: '09:35' },
];

function createApp(overrides = {}) {
  const courses = overrides.courses || [
    { id: 1, name: 'Deutsch 7a' },
    { id: 2, name: 'Mathe 8b' },
  ];
  const lessons = overrides.lessons || [];
  const app = {
    locked: false,
    currentView: 'grades',
    gradesSubView: 'overview',
    gradesEntryDraftDirty: false,
    selectedCourseId: 0,
    activeSchoolYear: { id: 9, startDate: '2026-08-01' },
    canAccessGradeVault: () => true,
    store: {
      ensureLessonsForYear: () => {},
      getHoursPerDay: () => HOURS.length,
      getLessonTimes: () => HOURS,
      listLessonsForWeek: () => lessons,
      listCourses: () => courses,
      getSetting: (key, fallback) => (
        key === 'showHiddenSidebarCourses' ? Boolean(overrides.showHiddenSidebarCourses) : fallback
      ),
    },
    ...overrides,
  };
  return Object.assign(app, gradesMethods);
}

globalThis.validateLessonTimes = (lessonTimes) => ({
  valid: true,
  hasAnyValue: true,
  normalized: lessonTimes,
});
globalThis.parseLessonTimeMinutes = (value) => {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
};
globalThis.toIsoDate = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
globalThis.SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT = false;

const lesson = (id, courseId, lessonDate, hour) => ({
  id,
  courseId,
  lessonDate,
  hour,
  canceled: false,
  isEntfall: false,
});

test('the running lesson wins over the last finished one', () => {
  const app = createApp({
    lessons: [
      lesson(10, 1, '2026-08-24', 1),
      lesson(11, 2, '2026-08-24', 2),
    ],
  });
  const during = new Date('2026-08-24T08:55:00');
  assert.equal(app.getPreferredGradesCourseIdForNow(during), 2);
  const between = new Date('2026-08-24T08:47:00');
  assert.equal(app.getPreferredGradesCourseIdForNow(between), 1);
});

test('the overview adopts the timetable course', () => {
  const app = createApp({ lessons: [lesson(10, 1, '2026-08-24', 1)] });
  assert.deepEqual(
    app.resolveTimetableCourseAutoSelection(new Date('2026-08-24T08:10:00')),
    { courseId: 1, subview: 'overview' },
  );
});

test('the auto selection stands down instead of stealing a view or a draft', () => {
  const now = new Date('2026-08-24T08:10:00');
  const lessons = [lesson(10, 1, '2026-08-24', 1)];
  const cases = [
    { label: 'locked', overrides: { locked: true } },
    { label: 'settings view', overrides: { currentView: 'settings' } },
    { label: 'dirty entry draft', overrides: { gradesEntryDraftDirty: true } },
    { label: 'locked vault', overrides: { canAccessGradeVault: () => false } },
    { label: 'already selected', overrides: { selectedCourseId: 1 } },
    { label: 'no school year', overrides: { activeSchoolYear: null } },
    { label: 'course without grades', overrides: { courses: [{ id: 1, noGrades: true }] } },
    { label: 'course without lessons', overrides: { courses: [{ id: 1, noLesson: true }] } },
    { label: 'course hidden in sidebar', overrides: { courses: [{ id: 1, hiddenInSidebar: true }] } },
  ];
  for (const { label, overrides } of cases) {
    const app = createApp({ lessons, ...overrides });
    assert.equal(app.resolveTimetableCourseAutoSelection(now), null, label);
  }
});

test('a hidden course becomes selectable once hidden courses are shown', () => {
  const app = createApp({
    lessons: [lesson(10, 1, '2026-08-24', 1)],
    courses: [{ id: 1, hiddenInSidebar: true }],
    showHiddenSidebarCourses: true,
  });
  assert.deepEqual(
    app.resolveTimetableCourseAutoSelection(new Date('2026-08-24T08:10:00')),
    { courseId: 1, subview: 'overview' },
  );
});

test('an open planning course view beats the timetable course on a tab switch', () => {
  assert.match(
    main,
    /planningCourseViewCourseId = event\?\.detail\?\.courseViewOpen && courseId \? courseId : 0/,
  );
  assert.match(
    main,
    /if \(planningCourseViewCourseId\) \{\s*bridgeController\?\.dispatchGradesNavigation\?\.\(\{\s*courseId: planningCourseViewCourseId,\s*source: 'course-context',\s*\}\);/,
  );
  assert.match(
    main,
    /if \(Date\.now\(\) >= gradesCourseAutoSelectSuppressedUntil\) \{\s*bridgeController\?\.dispatchGradesNavigation\?\.\(\{\s*autoSelectCourse: true,\s*source: 'course-context',\s*\}\);/,
  );
  assert.match(planningApp, /courseViewOpen: normalizedCourseViewOpen/);
});

test('the timetable auto selection never opens the vault dialog on a tab switch', () => {
  const apply = extractClassMethod(gradesApp, 'applyTimetableCourseAutoSelection');
  assert.doesNotMatch(apply, /openGradeVaultDialog/);
  assert.match(
    apply,
    /if \(!this\.canAccessGradeVault\(\)\) \{[\s\S]*?canReplaceGradeVaultContinuationWithCourseContext\(\)[\s\S]*?type: "course-context"[\s\S]*?return false;/,
  );
  assert.match(
    apply,
    /navigateToGradesOverviewCourse\(selection\.courseId, \{ shareCourseContext: false \}\)/,
  );
  assert.match(gradesApp, /if \(options\.shareCourseContext !== false\) \{\s*this\.notifyParentCourseContext\(normalizedCourseId\);/);
  assert.match(
    gradesApp,
    /navigation\.source === "course-context" && navigation\.autoSelectCourse === true\) \{\s*return this\.applyTimetableCourseAutoSelection\(\);/,
  );
});

test('the entry view keeps its own one-shot auto selection', () => {
  const apply = extractClassMethod(gradesApp, 'applyPendingGradesEntryCourseAutoSelection');
  assert.match(apply, /this\.normalizeGradesSubView\(this\.gradesSubView\) !== "entry"/);
  assert.match(apply, /this\.getPreferredGradesCourseIdForNow\(new Date\(\)\)/);
  assert.match(apply, /this\.isSidebarSelectableGradeCourse\(course\)/);
});
