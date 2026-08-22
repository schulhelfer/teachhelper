import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/shared/school-data/grade-integrity.js', import.meta.url),
  'utf8',
);
const integrity = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const thdbSource = await readFile(
  new URL('../src/shared/school-data/thdb.js', import.meta.url),
  'utf8',
);
const thdb = await import(`data:text/javascript;base64,${Buffer.from(thdbSource).toString('base64')}`);

function courseState(courseId = 2) {
  return {
    gradeStructures: [{ courseId, periods: [] }],
    gradeAssessments: [
      { id: 21, courseId, title: 'Mündlich' },
      { id: 22, courseId, title: 'Test' },
    ],
    gradeStudents: [
      { id: 201, courseId, firstName: 'Ada', lastName: 'Lovelace' },
      { id: 202, courseId, firstName: 'Grace', lastName: 'Hopper' },
    ],
    gradeEntries: [
      { studentId: 201, assessmentId: 21, value: 12 },
      { studentId: 202, assessmentId: 22, value: 14 },
    ],
    gradeOverrides: [{ studentId: 201, courseId, scope: 'year', value: 13 }],
    gradeImports: [],
    gradeSeatPlans: [],
    gradeAccommodations: [{ studentId: 202, courseId, text: 'Zeitverlängerung' }],
  };
}

function clone(value) {
  return structuredClone(value);
}

test('a complete isolated grade-course segment is accepted without mutation', () => {
  const state = courseState();
  const original = clone(state);
  assert.deepEqual(integrity.assertGradeCourseIntegrity(2, state), {
    courseId: 2,
    studentIds: [201, 202],
    assessmentIds: [21, 22],
    entryCount: 2,
  });
  assert.deepEqual(state, original);
});

test('foreign cached rows fail closed instead of being filtered into an empty course', () => {
  for (const collection of [
    'gradeStructures',
    'gradeAssessments',
    'gradeStudents',
    'gradeOverrides',
    'gradeImports',
    'gradeSeatPlans',
    'gradeAccommodations',
  ]) {
    const state = courseState();
    state[collection][0] = { ...state[collection][0], courseId: 1 };
    assert.throws(
      () => integrity.assertGradeCourseIntegrity(2, state),
      /kursfremde oder unvollständige Daten/,
      collection,
    );
  }
});

test('orphaned and duplicate grade entries reject the whole segment', () => {
  const orphanedStudent = courseState();
  orphanedStudent.gradeEntries[0].studentId = 999;
  assert.throws(
    () => integrity.assertGradeCourseIntegrity(2, orphanedStudent),
    /fremden, doppelten oder ungültigen Noteneintrag/,
  );

  const orphanedAssessment = courseState();
  orphanedAssessment.gradeEntries[0].assessmentId = 999;
  assert.throws(
    () => integrity.assertGradeCourseIntegrity(2, orphanedAssessment),
    /fremden, doppelten oder ungültigen Noteneintrag/,
  );

  const duplicate = courseState();
  duplicate.gradeEntries.push({ ...duplicate.gradeEntries[0], value: 7 });
  assert.throws(
    () => integrity.assertGradeCourseIntegrity(2, duplicate),
    /fremden, doppelten oder ungültigen Noteneintrag/,
  );
});

test('grade-only mutations cannot add, remove, replace, or duplicate students', () => {
  assert.equal(integrity.assertGradeRosterUnchanged([202, 201], [201, 202]), true);
  assert.throws(
    () => integrity.assertGradeRosterUnchanged([201, 202], [201]),
    /darf die Teilnehmendenliste nicht verändern/,
  );
  assert.throws(
    () => integrity.assertGradeRosterUnchanged([201, 202], [201, 203]),
    /darf die Teilnehmendenliste nicht verändern/,
  );
  assert.throws(
    () => integrity.assertGradeRosterUnchanged([201, 202], [201, 202, 202]),
    /ungültige oder doppelte IDs/,
  );
});

test('grade deltas use compare-and-set and validate fully before application', () => {
  const stored = new Map([[201, 10], [202, null]]);
  const normalized = integrity.validateGradeDelta([
    { studentId: 201, expectedValue: 10, value: 11 },
    { studentId: 202, expectedValue: null, value: 8 },
  ], {
    studentIds: [201, 202],
    currentValueForStudent: (studentId) => stored.get(studentId),
  });
  assert.deepEqual(normalized, [
    { studentId: 201, expectedValue: 10, value: 11 },
    { studentId: 202, expectedValue: null, value: 8 },
  ]);
  assert.deepEqual([...stored], [[201, 10], [202, null]], 'validation must not mutate storage');

  assert.throws(() => integrity.validateGradeDelta([
    { studentId: 201, expectedValue: 9, value: 11 },
    { studentId: 202, expectedValue: null, value: 8 },
  ], {
    studentIds: [201, 202],
    currentValueForStudent: (studentId) => stored.get(studentId),
  }), /zwischenzeitlich geändert/);
  assert.deepEqual([...stored], [[201, 10], [202, null]], 'a stale delta must leave every row untouched');
});

test('grade deltas reject foreign, duplicate, missing, invalid, and no-op values', () => {
  const context = {
    studentIds: [201, 202],
    currentValueForStudent: (studentId) => (studentId === 201 ? 10 : null),
  };
  assert.throws(
    () => integrity.validateGradeDelta([{ studentId: 999, expectedValue: null, value: 8 }], context),
    /fremde oder doppelte Teilnehmende/,
  );
  assert.throws(() => integrity.validateGradeDelta([
    { studentId: 201, expectedValue: 10, value: 11 },
    { studentId: 201, expectedValue: 10, value: 12 },
  ], context), /fremde oder doppelte Teilnehmende/);
  assert.throws(
    () => integrity.validateGradeDelta([{ studentId: 201, value: 11 }], context),
    /keinen erwarteten Ausgangswert/,
  );
  assert.throws(
    () => integrity.validateGradeDelta([{ studentId: 201, expectedValue: 10, value: 10 }], context),
    /keinen geänderten Wert/,
  );
  assert.throws(
    () => integrity.validateGradeDelta([{ studentId: 201, expectedValue: 10, value: 16 }], context),
    /keine gültige Note/,
  );
  assert.throws(() => integrity.validateGradeDelta([], context), /Notenänderungen fehlen/);
});

test('editing existing and new assessments in course B keeps course A and both rosters intact after reload', () => {
  const courseA = courseState(1);
  courseA.gradeStudents = courseA.gradeStudents.map((student, index) => ({
    ...student,
    id: 101 + index,
    courseId: 1,
  }));
  courseA.gradeAssessments = courseA.gradeAssessments.map((assessment, index) => ({
    ...assessment,
    id: 11 + index,
    courseId: 1,
  }));
  courseA.gradeEntries = [
    { studentId: 101, assessmentId: 11, value: 9 },
    { studentId: 102, assessmentId: 12, value: 13 },
  ];
  courseA.gradeOverrides = [{ studentId: 101, courseId: 1, scope: 'year', value: 10 }];
  courseA.gradeAccommodations = [{ studentId: 102, courseId: 1, text: 'Hilfsmittel' }];
  const courseB = courseState(2);
  const courseABytesBefore = JSON.stringify(courseA);
  const courseBRosterBefore = integrity.assertGradeCourseIntegrity(2, courseB).studentIds;

  const storedValues = new Map(courseB.gradeEntries.map((entry) => [entry.studentId, entry.value]));
  const existingChanges = integrity.validateGradeDelta([
    { studentId: 201, expectedValue: 12, value: 15 },
  ], {
    studentIds: courseBRosterBefore,
    currentValueForStudent: (studentId) => storedValues.get(studentId) ?? null,
  });
  for (const change of existingChanges) {
    const entry = courseB.gradeEntries.find((row) => (
      row.studentId === change.studentId && row.assessmentId === 21
    ));
    entry.value = change.value;
  }

  courseB.gradeAssessments.push({ id: 23, courseId: 2, title: 'Neue Einzelleistung' });
  courseB.gradeEntries.push({ studentId: 202, assessmentId: 23, value: 8 });
  integrity.assertGradeRosterUnchanged(
    courseBRosterBefore,
    integrity.assertGradeCourseIntegrity(2, courseB).studentIds,
  );
  assert.equal(JSON.stringify(courseA), courseABytesBefore);

  const built = thdb.buildThdb1ContainerBytes({
    schema: 'test-two-courses-v2',
    startupShellText: '{"activeCourseId":1}',
    planningPublicText: '{"courses":[{"id":1},{"id":2}]}',
    gradeVaultConfigText: '{"configured":true}',
    gradeCourseSegments: [
      { courseId: 1, text: JSON.stringify(courseA) },
      { courseId: 2, text: JSON.stringify(courseB) },
    ],
    revision: 4,
  });
  const reloaded = thdb.parseThdb1ContainerBytes(built.bytes, {
    schemas: ['test-two-courses-v2'],
    includeGradeCourseSegments: true,
    requireIntegrity: true,
  });
  assert.ok(reloaded);
  const reloadedByCourse = new Map(
    reloaded.gradeCourseSegments.map((segment) => [segment.courseId, JSON.parse(segment.text)]),
  );
  assert.equal(JSON.stringify(reloadedByCourse.get(1)), courseABytesBefore);
  assert.deepEqual(
    integrity.assertGradeCourseIntegrity(2, reloadedByCourse.get(2)).studentIds,
    courseBRosterBefore,
  );
  assert.equal(
    reloadedByCourse.get(2).gradeEntries.find((entry) => (
      entry.studentId === 201 && entry.assessmentId === 21
    )).value,
    15,
  );
  assert.equal(
    reloadedByCourse.get(2).gradeEntries.find((entry) => entry.assessmentId === 23).value,
    8,
  );
});
