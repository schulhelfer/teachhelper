import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/shared/school-data/index.js', import.meta.url),
  'utf8',
);
const schoolData = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function states() {
  return {
    publicState: {
      courses: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      slots: [{ id: 11, courseId: 1 }, { id: 21, courseId: 2 }],
      lessons: [
        { id: 111, courseId: 1, slotId: 11 },
        { id: 211, courseId: 2, slotId: 21 },
      ],
      unrelated: { preserved: true },
    },
    gradeState: {
      gradeStructures: [{ courseId: 1, name: 'A' }, { courseId: 2, name: 'B' }],
      gradeAssessments: [{ id: 101, courseId: 1 }, { id: 201, courseId: 2 }],
      gradeStudents: [{ id: 1001, courseId: 1 }, { id: 2001, courseId: 2 }],
      gradeEntries: [
        { studentId: 1001, assessmentId: 101, value: 10 },
        { studentId: 2001, assessmentId: 201, value: 12 },
      ],
      gradeOverrides: [
        { studentId: 1001, courseId: 1, value: 11 },
        { studentId: 2001, courseId: 2, value: 13 },
      ],
      gradeImports: [{ courseId: 1 }, { courseId: 2 }],
      gradeSeatPlans: [{ courseId: 1 }, { courseId: 2 }],
      gradeAccommodations: [{ studentId: 1001, courseId: 1 }, { studentId: 2001, courseId: 2 }],
      unrelated: { preserved: true },
    },
  };
}

test('an explicit course deletion removes exactly that course cascade', () => {
  const { publicState, gradeState } = states();
  const publicCourseA = structuredClone({
    course: publicState.courses[0],
    slot: publicState.slots[0],
    lesson: publicState.lessons[0],
  });
  const gradeCourseA = structuredClone({
    structure: gradeState.gradeStructures[0],
    assessment: gradeState.gradeAssessments[0],
    student: gradeState.gradeStudents[0],
    entry: gradeState.gradeEntries[0],
    override: gradeState.gradeOverrides[0],
    importRow: gradeState.gradeImports[0],
    seatPlan: gradeState.gradeSeatPlans[0],
    accommodation: gradeState.gradeAccommodations[0],
  });

  const result = schoolData.deleteCourseCascadeInPlace(publicState, gradeState, 2);

  assert.deepEqual(result, {
    changed: true,
    courseId: 2,
    studentIds: [2001],
    assessmentIds: [201],
  });
  assert.deepEqual(publicState.courses, [publicCourseA.course]);
  assert.deepEqual(publicState.slots, [publicCourseA.slot]);
  assert.deepEqual(publicState.lessons, [publicCourseA.lesson]);
  assert.deepEqual(gradeState.gradeStructures, [gradeCourseA.structure]);
  assert.deepEqual(gradeState.gradeAssessments, [gradeCourseA.assessment]);
  assert.deepEqual(gradeState.gradeStudents, [gradeCourseA.student]);
  assert.deepEqual(gradeState.gradeEntries, [gradeCourseA.entry]);
  assert.deepEqual(gradeState.gradeOverrides, [gradeCourseA.override]);
  assert.deepEqual(gradeState.gradeImports, [gradeCourseA.importRow]);
  assert.deepEqual(gradeState.gradeSeatPlans, [gradeCourseA.seatPlan]);
  assert.deepEqual(gradeState.gradeAccommodations, [gradeCourseA.accommodation]);
  assert.deepEqual(publicState.unrelated, { preserved: true });
  assert.deepEqual(gradeState.unrelated, { preserved: true });
});

test('a missing public course cannot implicitly delete a grade-course segment', () => {
  const { publicState, gradeState } = states();
  publicState.courses = publicState.courses.filter((course) => course.id !== 2);
  const beforePublic = structuredClone(publicState);
  const beforeGrades = structuredClone(gradeState);

  const result = schoolData.deleteCourseCascadeInPlace(publicState, gradeState, 2);

  assert.deepEqual(result, {
    changed: false,
    courseId: 2,
    studentIds: [],
    assessmentIds: [],
  });
  assert.deepEqual(publicState, beforePublic);
  assert.deepEqual(gradeState, beforeGrades);
});

test('normalizing grade-course relations never filters an existing collection', () => {
  const input = {
    gradeStudents: [{ id: 1 }, { id: 0 }, null],
    gradeAssessments: [{ id: 2 }, { malformed: true }],
    gradeEntries: [{ studentId: 1, assessmentId: 2 }, { orphaned: true }],
    custom: { keep: true },
  };
  const normalized = schoolData.normalizeGradeCourseRelations(input);
  assert.equal(normalized.gradeStudents.length, input.gradeStudents.length);
  assert.equal(normalized.gradeAssessments.length, input.gradeAssessments.length);
  assert.equal(normalized.gradeEntries.length, input.gradeEntries.length);
  assert.deepEqual(normalized.custom, { keep: true });
  assert.notEqual(normalized, input);
});
