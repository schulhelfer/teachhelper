function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeNameLearningDueSummary(value = null, validCourseIds = null) {
  const source = asRecord(value);
  const allowed = validCourseIds instanceof Set ? validCourseIds : null;
  const courses = {};
  Object.entries(asRecord(source.courses)).forEach(([courseId, rawBuckets]) => {
    const id = Number(courseId) || 0;
    if (!id || (allowed && !allowed.has(id))) return;
    const grouped = new Map();
    (Array.isArray(rawBuckets) ? rawBuckets : []).forEach((bucket) => {
      const dueAt = Math.max(0, Number(bucket?.dueAt) || 0);
      const count = Math.max(0, Math.floor(Number(bucket?.count) || 0));
      if (!count) return;
      grouped.set(dueAt, (grouped.get(dueAt) || 0) + count);
    });
    courses[String(id)] = [...grouped.entries()]
      .map(([dueAt, count]) => ({ dueAt, count }))
      .sort((left, right) => left.dueAt - right.dueAt);
  });
  return { complete: source.complete === true, courses };
}

export function buildNameLearningDueBuckets(gradeState = null, courseId = null) {
  const id = Number(courseId) || 0;
  if (!id) return [];
  const studentIds = new Set((Array.isArray(gradeState?.gradeStudents) ? gradeState.gradeStudents : [])
    .filter((student) => Number(student?.courseId) === id && Number(student?.id) > 0 && student?.portrait)
    .map((student) => Number(student.id)));
  const dueByStudentId = new Map((Array.isArray(gradeState?.gradeNameLearning) ? gradeState.gradeNameLearning : [])
    .filter((progress) => Number(progress?.courseId) === id && studentIds.has(Number(progress?.studentId)))
    .map((progress) => [Number(progress.studentId), Math.max(0, Number(progress?.dueAt) || 0)]));
  const grouped = new Map();
  studentIds.forEach((studentId) => {
    const dueAt = dueByStudentId.get(studentId) || 0;
    grouped.set(dueAt, (grouped.get(dueAt) || 0) + 1);
  });
  return [...grouped.entries()]
    .map(([dueAt, count]) => ({ dueAt, count }))
    .sort((left, right) => left.dueAt - right.dueAt);
}

export function countPublicNameLearningDueCards(summary = null, courses = [], activeSchoolYearId = null, now = Date.now()) {
  const normalized = normalizeNameLearningDueSummary(summary);
  if (!normalized.complete) return null;
  const activeYearId = Number(activeSchoolYearId) || 0;
  const eligibleIds = new Set((Array.isArray(courses) ? courses : [])
    .filter((course) => (
      Number(course?.schoolYearId) === activeYearId
      && !course?.noLesson
      && !course?.noGrades
    ))
    .map((course) => String(Number(course.id) || 0))
    .filter((courseId) => courseId !== '0'));
  let count = 0;
  eligibleIds.forEach((courseId) => {
    (normalized.courses[courseId] || []).forEach((bucket) => {
      if (bucket.dueAt <= now) count += bucket.count;
    });
  });
  return count;
}
