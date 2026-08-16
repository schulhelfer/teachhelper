const COURSE_COLLECTIONS = Object.freeze([
  'gradeStructures',
  'gradeAssessments',
  'gradeStudents',
  'gradeOverrides',
  'gradeImports',
  'gradeSeatPlans',
  'gradeAccommodations',
  'gradeNameLearning',
]);

const ALL_COLLECTIONS = Object.freeze([
  ...COURSE_COLLECTIONS,
  'gradeEntries',
]);

function positiveId(value) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireCollection(state, key, courseId) {
  if (state[key] === undefined) return [];
  if (!Array.isArray(state[key])) {
    throw new Error(`Notenkurs ${courseId} enthält eine ungültige Sammlung (${key}).`);
  }
  return state[key];
}

function assertUniquePositiveIds(rows, key, label, courseId) {
  const ids = new Set();
  for (const row of rows) {
    const id = positiveId(row?.[key]);
    if (!isRecord(row) || !id || ids.has(id)) {
      throw new Error(`Notenkurs ${courseId} enthält eine ungültige oder doppelte ${label}.`);
    }
    ids.add(id);
  }
  return ids;
}






export function assertGradeCourseIntegrity(courseId, rawState) {
  const courseKey = positiveId(courseId);
  if (!courseKey) throw new Error('Notenkurs-ID fehlt.');
  if (!isRecord(rawState)) {
    throw new Error(`Notenkurs ${courseKey} hat kein gültiges Datenformat.`);
  }

  const collections = Object.fromEntries(
    ALL_COLLECTIONS.map((key) => [key, requireCollection(rawState, key, courseKey)]),
  );
  for (const key of COURSE_COLLECTIONS) {
    const foreign = collections[key].find(
      (row) => !isRecord(row) || positiveId(row.courseId) !== courseKey,
    );
    if (foreign) {
      throw new Error(`Notenkurs ${courseKey} enthält kursfremde oder unvollständige Daten (${key}).`);
    }
  }

  const studentIds = assertUniquePositiveIds(
    collections.gradeStudents,
    'id',
    'Teilnehmerzeile',
    courseKey,
  );
  const assessmentIds = assertUniquePositiveIds(
    collections.gradeAssessments,
    'id',
    'Leistung',
    courseKey,
  );

  const entryKeys = new Set();
  for (const entry of collections.gradeEntries) {
    const studentId = positiveId(entry?.studentId);
    const assessmentId = positiveId(entry?.assessmentId);
    const entryKey = `${studentId}:${assessmentId}`;
    if (
      !isRecord(entry)
      || !studentIds.has(studentId)
      || !assessmentIds.has(assessmentId)
      || entryKeys.has(entryKey)
    ) {
      throw new Error(
        `Notenkurs ${courseKey} enthält einen fremden, doppelten oder ungültigen Noteneintrag.`,
      );
    }
    entryKeys.add(entryKey);
  }

  for (const override of collections.gradeOverrides) {
    if (!studentIds.has(positiveId(override.studentId))) {
      throw new Error(`Notenkurs ${courseKey} enthält eine fremde Notenüberschreibung.`);
    }
  }
  const accommodationStudents = new Set();
  for (const accommodation of collections.gradeAccommodations) {
    const studentId = positiveId(accommodation.studentId);
    if (!studentIds.has(studentId) || accommodationStudents.has(studentId)) {
      throw new Error(`Notenkurs ${courseKey} enthält einen ungültigen Nachteilsausgleich.`);
    }
    accommodationStudents.add(studentId);
  }
  const nameLearningStudents = new Set();
  for (const progress of collections.gradeNameLearning) {
    const studentId = positiveId(progress.studentId);
    const stage = Number(progress.stage);
    const dueAt = Number(progress.dueAt);
    if (
      !studentIds.has(studentId)
      || nameLearningStudents.has(studentId)
      || !Number.isInteger(stage)
      || stage < 0
      || stage > 10
      || !Number.isFinite(dueAt)
      || dueAt < 0
    ) {
      throw new Error(`Notenkurs ${courseKey} enthält einen ungültigen Namenslernfortschritt.`);
    }
    nameLearningStudents.add(studentId);
  }

  return {
    courseId: courseKey,
    studentIds: [...studentIds].sort((left, right) => left - right),
    assessmentIds: [...assessmentIds].sort((left, right) => left - right),
    entryCount: entryKeys.size,
  };
}

export function assertGradeRosterUnchanged(beforeStudentIds, afterStudentIds) {
  const normalize = (values) => {
    if (!Array.isArray(values)) throw new Error('Teilnehmerstand ist ungültig.');
    const ids = values.map(positiveId);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new Error('Teilnehmerstand enthält ungültige oder doppelte IDs.');
    }
    return ids.sort((left, right) => left - right);
  };
  const before = normalize(beforeStudentIds);
  const after = normalize(afterStudentIds);
  if (before.length !== after.length || before.some((id, index) => id !== after[index])) {
    throw new Error('Eine Notenänderung darf die Teilnehmerliste nicht verändern.');
  }
  return true;
}

function normalizeGradeValue(value, label) {
  if (value === null) return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 15) {
    throw new Error(`${label} ist keine gültige Note.`);
  }
  return normalized;
}






export function validateGradeDelta(changes, {
  studentIds,
  currentValueForStudent,
} = {}) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw new Error('Notenänderungen fehlen.');
  }
  if (!Array.isArray(studentIds) || typeof currentValueForStudent !== 'function') {
    throw new Error('Notenkontext ist unvollständig.');
  }
  const roster = new Set(studentIds.map(positiveId));
  if (roster.has(0) || roster.size !== studentIds.length) {
    throw new Error('Teilnehmerstand ist ungültig.');
  }
  const seen = new Set();
  const normalized = changes.map((change) => {
    const studentId = positiveId(change?.studentId);
    if (!isRecord(change) || !studentId || !roster.has(studentId) || seen.has(studentId)) {
      throw new Error('Notenänderung enthält fremde oder doppelte Teilnehmer.');
    }
    seen.add(studentId);
    if (!Object.prototype.hasOwnProperty.call(change, 'expectedValue')) {
      throw new Error('Notenänderung enthält keinen erwarteten Ausgangswert.');
    }
    if (!Object.prototype.hasOwnProperty.call(change, 'value')) {
      throw new Error('Notenänderung enthält keinen neuen Wert.');
    }
    const expectedValue = normalizeGradeValue(change.expectedValue, 'Erwarteter Notenwert');
    const value = normalizeGradeValue(change.value, 'Neuer Notenwert');
    const currentValue = normalizeGradeValue(
      currentValueForStudent(studentId),
      'Aktueller Notenwert',
    );
    if (!Object.is(currentValue, expectedValue)) {
      throw new Error('Eine Note wurde zwischenzeitlich geändert.');
    }
    if (Object.is(value, expectedValue)) {
      throw new Error('Notenänderung enthält keinen geänderten Wert.');
    }
    return { studentId, expectedValue, value };
  });
  return normalized;
}
