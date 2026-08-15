function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}






export function normalizePublicSchoolData(rawState = null, options = {}) {
  const source = asRecord(rawState);
  const base = cloneJson(options.baseState, {
    settings: {},
    counters: {},
    schoolYears: [],
    courses: [],
    slots: [],
    freeRanges: [],
    specialDays: [],
    lessons: [],
  });
  const normalizeCourseColor = typeof options.normalizeCourseColor === 'function'
    ? options.normalizeCourseColor
    : (value) => value == null ? null : String(value);
  const normalizeLessonTimes = typeof options.normalizeLessonTimes === 'function'
    ? options.normalizeLessonTimes
    : (value) => Array.isArray(value) ? cloneJson(value, []) : [];
  const normalizeGradeTestScaleSettings = typeof options.normalizeGradeTestScaleSettings === 'function'
    ? options.normalizeGradeTestScaleSettings
    : (value) => cloneJson(asRecord(value), {});
  const normalizeDefaultGradeStructureSetting = typeof options.normalizeDefaultGradeStructureSetting === 'function'
    ? options.normalizeDefaultGradeStructureSetting
    : (value) => cloneJson(asRecord(value), {});
  const normalizeExpectationHorizonCommentTemplate = typeof options.normalizeExpectationHorizonCommentTemplate === 'function'
    ? options.normalizeExpectationHorizonCommentTemplate
    : (value) => String(value || '');
  const hoursPerDayDefault = Math.max(1, Number(options.hoursPerDayDefault) || 8);
  const maxBy = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const normalized = {
    ...base,
    settings: { ...asRecord(base.settings), ...asRecord(source.settings) },
    counters: { ...asRecord(base.counters), ...asRecord(source.counters) },
    schoolYears: Array.isArray(source.schoolYears) ? source.schoolYears.map((raw) => {
      const item = asRecord(raw);
      return {
        id: Number(item.id),
        name: String(item.name || ''),
        startDate: String(item.startDate || ''),
        endDate: String(item.endDate || ''),
      };
    }) : [],
    courses: Array.isArray(source.courses) ? source.courses.map((raw) => {
      const item = asRecord(raw);
      const noLesson = Boolean(item.noLesson);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        name: String(item.name || ''),
        subject: noLesson ? '' : String(item.subject || ''),
        color: normalizeCourseColor(item.color, noLesson),
        previousColor: item.previousColor == null ? null : normalizeCourseColor(item.previousColor, false),
        noLesson,
        noGrades: Boolean(item.noGrades),
        hiddenInSidebar: Boolean(item.hiddenInSidebar),
        sortOrder: Number(item.sortOrder || 0),
      };
    }) : [],
    slots: Array.isArray(source.slots) ? source.slots.map((raw) => {
      const item = asRecord(raw);
      return {
        id: Number(item.id),
        courseId: Number(item.courseId) || 0,
        schoolYearId: Number(item.schoolYearId) || 0,
        label: String(item.label || ''),
        dayOfWeek: Number(item.dayOfWeek),
        startHour: Number(item.startHour),
        duration: Math.max(1, Number(item.duration || 1)),
        startDate: item.startDate || null,
        endDate: item.endDate || null,
        weekParity: Number(item.weekParity || 0),
        placement: item.placement === 'break' ? 'break' : 'lesson',
      };
    }) : [],
    freeRanges: Array.isArray(source.freeRanges) ? source.freeRanges.map((raw) => {
      const item = asRecord(raw);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        label: String(item.label || ''),
        startDate: String(item.startDate || ''),
        endDate: String(item.endDate || ''),
      };
    }) : [],
    specialDays: Array.isArray(source.specialDays) ? source.specialDays.map((raw) => {
      const item = asRecord(raw);
      return {
        id: Number(item.id),
        name: String(item.name || ''),
        dayDate: String(item.dayDate || ''),
      };
    }) : [],
    lessons: Array.isArray(source.lessons) ? source.lessons.map((raw) => {
      const item = asRecord(raw);
      return {
        id: Number(item.id),
        schoolYearId: Number(item.schoolYearId),
        slotId: Number(item.slotId),
        courseId: Number(item.courseId),
        lessonDate: String(item.lessonDate || ''),
        dayOfWeek: Number(item.dayOfWeek),
        hour: Number(item.hour),
        topic: String(item.topic || ''),
        notes: String(item.notes || ''),
        notesRichText: cloneJson(item.notesRichText, null),
        canceled: Boolean(item.canceled),
        cancelLabel: String(item.cancelLabel || ''),
        isEntfall: Boolean(item.isEntfall),
        isWrittenExam: Boolean(item.isWrittenExam),
      };
    }) : [],
  };

  const hoursPerDay = clampNumber(normalized.settings.hoursPerDay || hoursPerDayDefault, 1, 12);
  normalized.settings.hoursPerDay = hoursPerDay;
  delete normalized.settings.gradeDisplaySystem;
  normalized.settings.lessonTimes = normalizeLessonTimes(normalized.settings.lessonTimes, hoursPerDay);
  normalized.settings.gradeTestScaleSettings = normalizeGradeTestScaleSettings(normalized.settings.gradeTestScaleSettings);
  normalized.settings.defaultGradeStructure = normalizeDefaultGradeStructureSetting(normalized.settings.defaultGradeStructure);
  normalized.settings.expectationHorizonCommentTemplate = normalizeExpectationHorizonCommentTemplate(
    normalized.settings.expectationHorizonCommentTemplate,
  );
  normalized.settings.gradeVaultEncryptionEnabled = Boolean(normalized.settings.gradeVaultEncryptionEnabled);
  normalized.settings.showGradeStudentPortraits = Boolean(normalized.settings.showGradeStudentPortraits);

  normalized.schoolYears = normalized.schoolYears.filter(
    (item) => item.id > 0 && item.name && item.startDate && item.endDate,
  );
  normalized.courses = normalized.courses.filter(
    (item) => item.id > 0 && item.schoolYearId > 0 && item.name,
  );
  normalized.slots = normalized.slots.filter(
    (item) => (
      item.id > 0
      && item.dayOfWeek >= 1
      && item.dayOfWeek <= 5
      && (item.courseId > 0 || (item.placement === 'break' && item.schoolYearId > 0 && item.label))
    ),
  );
  const breakSlotIds = new Set(
    normalized.slots.filter((item) => item.placement === 'break').map((item) => item.id),
  );
  normalized.freeRanges = normalized.freeRanges.filter((item) => {
    if (!(item.id > 0 && item.schoolYearId > 0 && item.label)) return false;
    if (String(item.label).trim().toLowerCase() === 'sommerferien') {
      return Boolean(item.startDate) || Boolean(item.endDate);
    }
    return Boolean(item.startDate) && Boolean(item.endDate);
  });
  normalized.specialDays = normalized.specialDays.filter(
    (item) => item.id > 0 && item.name && item.dayDate,
  );
  normalized.lessons = normalized.lessons.filter(
    (item) => (
      item.id > 0
      && item.schoolYearId > 0
      && item.slotId > 0
      && (item.courseId > 0 || breakSlotIds.has(item.slotId))
    ),
  );
  normalized.counters = {
    schoolYear: Math.max(Number(normalized.counters.schoolYear) || 1, maxBy(normalized.schoolYears) + 1),
    course: Math.max(Number(normalized.counters.course) || 1, maxBy(normalized.courses) + 1),
    slot: Math.max(Number(normalized.counters.slot) || 1, maxBy(normalized.slots) + 1),
    freeRange: Math.max(Number(normalized.counters.freeRange) || 1, maxBy(normalized.freeRanges) + 1),
    specialDay: Math.max(Number(normalized.counters.specialDay) || 1, maxBy(normalized.specialDays) + 1),
    lesson: Math.max(Number(normalized.counters.lesson) || 1, maxBy(normalized.lessons) + 1),
    gradeCategory: Math.max(Number(normalized.counters.gradeCategory) || 1, 1),
    gradeSubcategory: Math.max(Number(normalized.counters.gradeSubcategory) || 1, 1),
    gradeAssessment: Math.max(Number(normalized.counters.gradeAssessment) || 1, 1),
  };
  return normalized;
}

export function normalizeGradeCourseRelations(rawState = null) {
  const source = asRecord(rawState);
  const result = cloneJson(source, {});
  const arrays = [
    'gradeStructures',
    'gradeAssessments',
    'gradeStudents',
    'gradeEntries',
    'gradeOverrides',
    'gradeImports',
    'gradeSeatPlans',
    'gradeAccommodations',
  ];
  for (const key of arrays) {
    result[key] = Array.isArray(result[key]) ? result[key] : [];
  }
  result.counters = {
    gradeStudent: Math.max(1, Number(result.counters?.gradeStudent) || 1),
    gradeAssessment: Math.max(1, Number(result.counters?.gradeAssessment) || 1),
  };
  return result;
}


export function deleteCourseCascadeInPlace(publicState, gradeState, courseId) {
  const courseKey = Number(courseId) || 0;
  if (!courseKey || !asRecord(publicState) || !asRecord(gradeState)) {
    return { changed: false, courseId: courseKey, studentIds: [], assessmentIds: [] };
  }
  const courseExists = Array.isArray(publicState.courses)
    && publicState.courses.some((item) => Number(item?.id) === courseKey);
  if (!courseExists) {
    return { changed: false, courseId: courseKey, studentIds: [], assessmentIds: [] };
  }
  const slotIds = new Set(
    (Array.isArray(publicState.slots) ? publicState.slots : [])
      .filter((slot) => Number(slot?.courseId) === courseKey)
      .map((slot) => Number(slot.id)),
  );
  const studentIds = new Set(
    (Array.isArray(gradeState.gradeStudents) ? gradeState.gradeStudents : [])
      .filter((student) => Number(student?.courseId) === courseKey)
      .map((student) => Number(student.id)),
  );
  const assessmentIds = new Set(
    (Array.isArray(gradeState.gradeAssessments) ? gradeState.gradeAssessments : [])
      .filter((assessment) => Number(assessment?.courseId) === courseKey)
      .map((assessment) => Number(assessment.id)),
  );

  publicState.courses = publicState.courses.filter((item) => Number(item?.id) !== courseKey);
  publicState.slots = (Array.isArray(publicState.slots) ? publicState.slots : [])
    .filter((slot) => Number(slot?.courseId) !== courseKey);
  publicState.lessons = (Array.isArray(publicState.lessons) ? publicState.lessons : [])
    .filter((lesson) => Number(lesson?.courseId) !== courseKey && !slotIds.has(Number(lesson?.slotId)));

  const courseRows = [
    'gradeStructures',
    'gradeAssessments',
    'gradeStudents',
    'gradeImports',
    'gradeSeatPlans',
    'gradeAccommodations',
  ];
  for (const key of courseRows) {
    gradeState[key] = (Array.isArray(gradeState[key]) ? gradeState[key] : [])
      .filter((row) => Number(row?.courseId) !== courseKey);
  }
  gradeState.gradeOverrides = (Array.isArray(gradeState.gradeOverrides) ? gradeState.gradeOverrides : [])
    .filter((entry) => Number(entry?.courseId) !== courseKey && !studentIds.has(Number(entry?.studentId)));
  gradeState.gradeEntries = (Array.isArray(gradeState.gradeEntries) ? gradeState.gradeEntries : [])
    .filter((entry) => !studentIds.has(Number(entry?.studentId)) && !assessmentIds.has(Number(entry?.assessmentId)));
  return {
    changed: true,
    courseId: courseKey,
    studentIds: [...studentIds],
    assessmentIds: [...assessmentIds],
  };
}
