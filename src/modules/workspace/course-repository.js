import { GRADE_COURSE_SCHEMA } from '../../shared/school-data/defaults.js';
import {
  WORKSPACE_ERROR_VAULT_LOCKED,
  WORKSPACE_ERROR_PERSISTENCE_CONTENT_LOSS,
  WORKSPACE_ERROR_PERSISTENCE_INCOMPLETE,
} from '../../shared/school-data/messages.js';
import {
  buildNameLearningDueBuckets,
  countPublicNameLearningDueCards,
  normalizeNameLearningDueSummary,
} from '../../shared/name-learning-due-summary.js';

function emptyGradeState(store) {
  return store.normalizeGradeVaultState(null);
}

function gradeStateContainsCourseData(state, courseId) {
  const id = Number(courseId) || 0;
  if (!id || !state || typeof state !== 'object') return false;
  return [
    'gradeStructures',
    'gradeAssessments',
    'gradeStudents',
    'gradeImports',
    'gradeSeatPlans',
    'gradePickerConfigs',
    'gradeAccommodations',
    'gradeNameLearning',
  ].some((key) => (
    Array.isArray(state[key])
    && state[key].some((entry) => Number(entry?.courseId) === id)
  ));
}

function courseStateHasSeatPlan(state) {
  return (Array.isArray(state?.gradeSeatPlans) ? state.gradeSeatPlans : []).some((row) => (
    row
    && row.plan
    && typeof row.plan === 'object'
    && (!Array.isArray(row.plan.activeSeats) || row.plan.activeSeats.length > 0)
  ));
}

function gradeStateHasPersistedStructure(state, courseId) {
  const id = Number(courseId) || 0;
  const structure = Array.isArray(state?.gradeStructures)
    ? state.gradeStructures.find((entry) => Number(entry?.courseId) === id)
    : null;
  if (!structure) return false;
  const periodCategories = structure.periodCategories && typeof structure.periodCategories === 'object'
    ? structure.periodCategories
    : { h1: structure.categories };
  return ['h1', 'h2'].some((period) => (
    Array.isArray(periodCategories[period])
    && periodCategories[period].some((category) => Number(category?.id || 0) > 0)
  ));
}

function buildCourseContentSignature(state, courseId) {
  const id = Number(courseId) || 0;
  const rowsForCourse = (key) => (Array.isArray(state?.[key]) ? state[key] : [])
    .filter((entry) => Number(entry?.courseId) === id);
  const students = rowsForCourse('gradeStudents');
  const assessments = rowsForCourse('gradeAssessments');
  const studentIds = new Set(students.map((student) => Number(student?.id) || 0).filter(Boolean));
  const assessmentIds = new Set(assessments.map((assessment) => Number(assessment?.id) || 0).filter(Boolean));
  const entries = (Array.isArray(state?.gradeEntries) ? state.gradeEntries : []).filter((entry) => (
    studentIds.has(Number(entry?.studentId)) || assessmentIds.has(Number(entry?.assessmentId))
  ));
  const counts = {
    structure: gradeStateHasPersistedStructure(state, id) ? 1 : 0,
    assessments: assessments.length,
    entries: entries.length,
    overrides: rowsForCourse('gradeOverrides').length,
    imports: rowsForCourse('gradeImports').length,
    seatPlans: rowsForCourse('gradeSeatPlans').length,
    pickerConfigs: rowsForCourse('gradePickerConfigs').length,
    accommodations: rowsForCourse('gradeAccommodations').length,
    nameLearning: rowsForCourse('gradeNameLearning').length,
  };
  const hasOtherContent = Object.values(counts).some((count) => count > 0);
  return {
    studentIds,
    counts,
    hasOtherContent,
    hasMeaningfulContent: studentIds.size > 0 || hasOtherContent,
  };
}

function persistedCourseFromState(store, courseId, rawState, clone) {
  const id = Number(courseId) || 0;
  const state = store.normalizeGradeVaultState(rawState);
  const studentIds = new Set(state.gradeStudents.filter((row) => Number(row.courseId) === id).map((row) => Number(row.id)));
  const assessmentIds = new Set(state.gradeAssessments.filter((row) => Number(row.courseId) === id).map((row) => Number(row.id)));
  return {
    schema: GRADE_COURSE_SCHEMA,
    courseId: id,
    counters: clone(state.counters, {}),
    gradeStructures: state.gradeStructures.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeAssessments: state.gradeAssessments.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeStudents: state.gradeStudents.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      delete copy.sortKey;
      return copy;
    }),
    gradeEntries: state.gradeEntries.filter((row) => (
      studentIds.has(Number(row.studentId)) && assessmentIds.has(Number(row.assessmentId))
    )).map((row) => clone(row, {})),
    gradeOverrides: state.gradeOverrides.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeImports: state.gradeImports.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeSeatPlans: state.gradeSeatPlans.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      if (copy.plan && typeof copy.plan === 'object') delete copy.plan.students;
      return copy;
    }),
    gradePickerConfigs: (Array.isArray(state.gradePickerConfigs) ? state.gradePickerConfigs : []).filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeAccommodations: state.gradeAccommodations.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
    gradeNameLearning: (Array.isArray(state.gradeNameLearning) ? state.gradeNameLearning : []).filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
  };
}

function runtimeCourseFromPersisted(store, courseId, persisted, clone) {
  const id = Number(courseId) || 0;
  if (!persisted || persisted.schema !== GRADE_COURSE_SCHEMA || Number(persisted.courseId) !== id) {
    throw new Error('Gespeicherter Notenkurs gehört nicht zum erwarteten Kurs.');
  }
  const withCourse = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({ ...clone(row, {}), courseId: id }));
  return store.normalizeGradeVaultState({
    counters: clone(persisted.counters, {}),
    gradeStructures: withCourse(persisted.gradeStructures),
    gradeAssessments: withCourse(persisted.gradeAssessments),
    gradeStudents: withCourse(persisted.gradeStudents),
    gradeEntries: clone(Array.isArray(persisted.gradeEntries) ? persisted.gradeEntries : [], []),
    gradeOverrides: withCourse(persisted.gradeOverrides),
    gradeImports: withCourse(persisted.gradeImports),
    gradeSeatPlans: withCourse(persisted.gradeSeatPlans),
    gradePickerConfigs: withCourse(persisted.gradePickerConfigs),
    gradeAccommodations: withCourse(persisted.gradeAccommodations),
    gradeNameLearning: withCourse(persisted.gradeNameLearning),
  });
}

export class CourseRepository {
  constructor({
    store,
    clone,
    canAccessGradeVault,
    isGradeVaultConfigured,
    isGradeVaultUnlocked,
    decodeCourse,
    decodeCourseSegmentForPlausibility,
    encodeCourse,
    isPersistenceReady,
    isManualPersistenceMode,
    hasConnectedFile,
    queueSyncSave,
    onPublicChanged,
    markManualDirty,
    enqueueOperation,
    markChanged,
    publish,
  }) {
    this.store = store;
    this.clone = clone;
    this.canAccessGradeVault = canAccessGradeVault;
    this.isGradeVaultConfigured = isGradeVaultConfigured;
    this.isGradeVaultUnlocked = isGradeVaultUnlocked;
    this.decodeCourse = decodeCourse;
    this.decodeCourseSegmentForPlausibility = decodeCourseSegmentForPlausibility;
    this.encodeCourse = encodeCourse;
    this.isPersistenceReady = isPersistenceReady;
    this.isManualPersistenceMode = isManualPersistenceMode;
    this.hasConnectedFile = hasConnectedFile;
    this.queueSyncSave = queueSyncSave;
    this.onPublicChanged = onPublicChanged;
    this.markManualDirty = markManualDirty;
    this.enqueueOperation = enqueueOperation;
    this.markChanged = markChanged;
    this.publish = publish;
    this.persistedCourseIds = new Set();
    this.deletedCourseIds = new Set();
    this.confirmedStudentRemovalsByCourse = new Map();
    this.segmentTexts = new Map();
    this.courseCache = new Map();
    this.performanceIndexCache = new Map();
    this.seatplanPresenceCache = new Map();
    this.dirtyCourseIds = new Set();
    this.courseRevisions = new Map();
    this.loadedCourseId = null;
    this.courseLoadTail = Promise.resolve();
    this.gradeCourseMutationActiveCourseId = null;
  }

  rememberPersistedCourseIds(segments) {
    this.persistedCourseIds = new Set(
      (Array.isArray(segments) ? segments : []).map((segment) => Number(segment?.courseId) || 0).filter(Boolean),
    );
    return this.persistedCourseIds;
  }

  getGradeCourseRevision(courseId) {
    return Math.max(0, Number(this.courseRevisions.get(Number(courseId) || 0)) || 0);
  }

  isGradeCourseLoaded(courseId) {
    return Number(this.loadedCourseId || 0) === (Number(courseId) || 0);
  }

  getCurrentGradeVaultSnapshot() {
    return this.store.exportGradeVaultStateSnapshot();
  }

  normalizeAndAssertGradeCourseSnapshot(courseId, state = null) {
    const id = Number(courseId) || 0;
    const normalized = this.store.normalizeGradeVaultState(state);
    const wrongCourse = [
      ...(normalized.gradeStudents || []),
      ...(normalized.gradeAssessments || []),
      ...(normalized.gradeStructures || []),
    ].some((row) => Number(row.courseId) !== id);
    if (wrongCourse) throw new Error('Notenkurs enthält Daten eines anderen Kurses.');
    return normalized;
  }

  async ensureGradeCourseLoaded(courseId, { publish = true } = {}) {
    const id = Number(courseId) || 0;
    if (!id || !this.canAccessGradeVault()) return false;
    const load = async () => {
      if (this.loadedCourseId === id) return true;
      if (this.loadedCourseId) this.courseCache.set(this.loadedCourseId, this.store.exportGradeVaultStateSnapshot());
      let state = this.courseCache.get(id) || null;
      if (!state) {
        const text = this.segmentTexts.get(id) || '';
        const initialState = this.store.exportGradeVaultStateSnapshot();
        state = text
          ? await this.decodeCourse(id, text)
          : (!this.loadedCourseId && gradeStateContainsCourseData(initialState, id)
            ? initialState
            : emptyGradeState(this.store));
        this.courseCache.set(id, state);
        this.rememberPerformanceIndex(id, state);
      }
      this.store.replaceGradeVaultState(state);
      this.loadedCourseId = id;
      if (!gradeStateHasPersistedStructure(state, id)) {
        const defaultStructure = this.store.getDefaultGradeStructure?.();
        const defaultPeriodCategories = defaultStructure?.periodCategories;
        const hasDefaults = ['h1', 'h2'].some((period) => (
          Array.isArray(defaultPeriodCategories?.[period])
          && defaultPeriodCategories[period].length > 0
        ));
        if (hasDefaults) {
          this.store._suspendSaveHooks();
          try {
            this.store.saveGradeStructure(id, defaultPeriodCategories);
          } finally {
            this.store._resumeSaveHooks({ flush: false });
          }
          state = this.store.normalizeGradeVaultState(this.store.exportGradeVaultStateSnapshot());
          this.courseCache.set(id, state);
          this.rememberPerformanceIndex(id, state);
          this.dirtyCourseIds.add(id);
          this.courseRevisions.set(id, this.getGradeCourseRevision(id) + 1);
          this.markManualDirty();
        }
      }
      if (publish) this.publish('grades');
      return true;
    };
    const pending = this.courseLoadTail.then(load, load);
    this.courseLoadTail = pending.catch(() => undefined);
    return pending;
  }

  async getGradeCourseRosterSummary(courseId) {
    const id = Number(courseId) || 0;
    if (!id || !this.canAccessGradeVault()) return null;
    await this.courseLoadTail;
    let state = this.loadedCourseId === id
      ? this.store.exportGradeVaultStateSnapshot()
      : this.courseCache.get(id) || null;
    if (!state) {
      const text = this.segmentTexts.get(id) || '';
      if (text) {
        state = await this.decodeCourse(id, text);
        this.courseCache.set(id, state);
        this.rememberPerformanceIndex(id, state);
      } else {
        const initialState = this.store.exportGradeVaultStateSnapshot();
        state = !this.loadedCourseId && gradeStateContainsCourseData(initialState, id)
          ? initialState
          : emptyGradeState(this.store);
      }
    }
    const studentCount = (Array.isArray(state?.gradeStudents) ? state.gradeStudents : [])
      .filter((student) => (
        Number(student?.courseId || id) === id
        && !student?.isPlaceholder
        && Number(student?.id || 0) > 0
      )).length;
    return { courseId: id, studentCount };
  }

  async getGradeCourseStateSnapshot(courseId) {
    const id = Number(courseId) || 0;
    if (!id || !this.canAccessGradeVault()) return null;
    await this.courseLoadTail;
    let state = this.loadedCourseId === id
      ? this.store.exportGradeVaultStateSnapshot()
      : this.courseCache.get(id) || null;
    if (!state) {
      const text = this.segmentTexts.get(id) || '';
      const initialState = this.store.exportGradeVaultStateSnapshot();
      state = text
        ? await this.decodeCourse(id, text)
        : (!this.loadedCourseId && gradeStateContainsCourseData(initialState, id)
          ? initialState
          : emptyGradeState(this.store));
      this.courseCache.set(id, state);
      this.rememberPerformanceIndex(id, state);
    }
    return this.clone(state, emptyGradeState(this.store));
  }

  setGradeCourseStudentCounts(counts = null) {
    if (!this.isPersistenceReady()) return false;
    const source = counts && typeof counts === 'object' ? counts : {};
    if (!Array.isArray(this.store.state?.courses) || this.store.state.courses.length === 0) return false;
    const validCourseIds = this.store.state.courses
      .map((course) => String(Number(course.id) || 0))
      .filter((courseId) => courseId !== '0');
    const next = Object.fromEntries(
      validCourseIds.map((courseId) => [courseId, Math.max(0, Number(source[courseId]) || 0)])
    );
    const current = this.store.state.settings.gradeCourseStudentCounts || {};
    if (
      this.store.state.settings.gradeCourseStudentCountsComplete === true
      && JSON.stringify(current) === JSON.stringify(next)
    ) {
      return false;
    }
    this.store.state.settings.gradeCourseStudentCounts = next;
    this.store.state.settings.gradeCourseStudentCountsComplete = true;
    this.onPublicChanged();
    return true;
  }

  getNameLearningDueCount(now = Date.now()) {
    const activeYearId = Number(this.store.getActiveSchoolYear?.()?.id) || 0;
    const courses = Array.isArray(this.store.state?.courses)
      ? this.store.state.courses
      : (this.store.exportPublicStateSnapshot?.().courses || []);
    return countPublicNameLearningDueCards(
      this.store.state.settings.nameLearningDueSummary,
      courses,
      activeYearId,
      now,
    );
  }

  saveNameLearningDueSummary(summary, { notify = true } = {}) {
    const courses = Array.isArray(this.store.state?.courses)
      ? this.store.state.courses
      : (this.store.exportPublicStateSnapshot?.().courses || []);
    const validCourseIds = new Set(courses.map((course) => Number(course.id)).filter((id) => id > 0));
    const next = normalizeNameLearningDueSummary(summary, validCourseIds);
    const current = normalizeNameLearningDueSummary(this.store.state.settings.nameLearningDueSummary, validCourseIds);
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    this.store.state.settings.nameLearningDueSummary = next;
    if (notify) this.onPublicChanged();
    return true;
  }

  updateNameLearningDueSummaryForCourse(courseId, gradeState) {
    const id = Number(courseId) || 0;
    const courses = Array.isArray(this.store.state?.courses)
      ? this.store.state.courses
      : (this.store.exportPublicStateSnapshot?.().courses || []);
    const course = courses.find((item) => Number(item.id) === id);
    if (!id || !course) return false;
    const summary = normalizeNameLearningDueSummary(this.store.state.settings.nameLearningDueSummary);
    if (course.noLesson || course.noGrades) delete summary.courses[String(id)];
    else summary.courses[String(id)] = buildNameLearningDueBuckets(gradeState, id);
    return this.saveNameLearningDueSummary(summary, { notify: false });
  }

  removeNameLearningDueSummaryForCourse(courseId) {
    const id = Number(courseId) || 0;
    if (!id) return false;
    const summary = normalizeNameLearningDueSummary(this.store.state.settings.nameLearningDueSummary);
    if (!Object.hasOwn(summary.courses, String(id))) return false;
    delete summary.courses[String(id)];
    return this.saveNameLearningDueSummary(summary);
  }

  async refreshNameLearningDueSummary() {
    if (!this.canAccessGradeVault()) return false;
    const courses = {};
    const publicCourses = Array.isArray(this.store.state?.courses)
      ? this.store.state.courses
      : (this.store.exportPublicStateSnapshot?.().courses || []);
    const courseIds = publicCourses
      .filter((course) => !course.noLesson && !course.noGrades)
      .map((course) => Number(course.id))
      .filter((courseId) => courseId > 0);
    let complete = true;
    for (const courseId of courseIds) {
      let state;
      try {
        state = await this.getGradeCourseStateSnapshot(courseId);
      } catch (error) {
        if (error?.code === WORKSPACE_ERROR_VAULT_LOCKED || !this.canAccessGradeVault()) return false;
        console.warn(`[TeachHelper] Kurs ${courseId} konnte für die Namenslern-Übersicht nicht gelesen werden.`, error);
        complete = false;
        continue;
      }
      courses[String(courseId)] = buildNameLearningDueBuckets(state, courseId);
    }
    return this.saveNameLearningDueSummary({ complete, courses });
  }

  async getOccurrenceCategoryUsage(categoryId) {
    const id = Number(categoryId) || 0;
    if (!id || !this.canAccessGradeVault()) return 0;
    const courseIds = new Set([
      ...this.segmentTexts.keys(),
      ...this.courseCache.keys(),
      ...(this.loadedCourseId ? [this.loadedCourseId] : []),
    ]);
    let count = 0;
    for (const courseId of courseIds) {
      let state = Number(courseId) === Number(this.loadedCourseId)
        ? this.store.exportGradeVaultStateSnapshot()
        : this.courseCache.get(courseId) || null;
      if (!state) {
        const text = this.segmentTexts.get(courseId) || '';
        state = text ? await this.decodeCourse(courseId, text) : emptyGradeState(this.store);
        this.courseCache.set(courseId, state);
      }
      count += (Array.isArray(state.gradeAssessments) ? state.gradeAssessments : []).filter((assessment) => (
        String(assessment?.mode || '') === 'homework'
        && Number(assessment?.occurrenceCategoryId || 1) === id
      )).length;
    }
    return count;
  }

  async deleteOccurrenceCategoryData(categoryId) {
    const categoryIdNumber = Number(categoryId) || 0;
    if (!categoryIdNumber) return 0;
    if (!this.canAccessGradeVault()) {
      const error = new Error('Das Notenmodul muss zum Löschen von Vorkommnissen entsperrt sein.');
      error.code = WORKSPACE_ERROR_VAULT_LOCKED;
      throw error;
    }
    const previous = this.loadedCourseId;
    const courseIds = new Set([
      ...this.segmentTexts.keys(),
      ...this.courseCache.keys(),
      ...(previous ? [previous] : []),
    ]);
    let deleted = 0;
    for (const courseId of courseIds) {
      deleted += await this.runGradeCourseMutation(courseId, () => {
        const assessmentIds = this.store.listGradeAssessments(courseId)
          .filter((assessment) => (
            String(assessment?.mode || '') === 'homework'
            && Number(assessment?.occurrenceCategoryId || 1) === categoryIdNumber
          ))
          .map((assessment) => Number(assessment.id));
        if (!assessmentIds.length) return 0;
        const removedIds = new Set(assessmentIds);
        this.store.gradeVaultState.gradeAssessments = this.store.gradeVaultState.gradeAssessments
          .filter((assessment) => !removedIds.has(Number(assessment.id)));
        this.store.gradeVaultState.gradeEntries = this.store.gradeVaultState.gradeEntries
          .filter((entry) => !removedIds.has(Number(entry.assessmentId)));
        return assessmentIds.length;
      });
    }
    if (previous && previous !== this.loadedCourseId) await this.ensureGradeCourseLoaded(previous);
    return deleted;
  }

  async loadGradeCourseNavigationTargetAtomically(courseId, fallbackCourseId = null) {
    const previous = Number(this.loadedCourseId || fallbackCourseId) || null;
    try {
      return await this.ensureGradeCourseLoaded(courseId);
    } catch (error) {
      if (previous && previous !== Number(courseId)) await this.ensureGradeCourseLoaded(previous);
      throw error;
    }
  }

  async withTemporaryGradeCourse(courseId, operation) {
    const previous = this.loadedCourseId;
    await this.ensureGradeCourseLoaded(courseId, { publish: false });
    try {
      return await operation();
    } finally {
      if (previous && previous !== Number(courseId)) {
        await this.ensureGradeCourseLoaded(previous, { publish: false });
      }
      this.publish('grades');
    }
  }

  rememberConfirmedStudentRemovals(courseId, previousStudentIds, nextStudentIds, confirmedStudentIds = []) {
    const id = Number(courseId) || 0;
    if (!id) return false;
    const next = new Set((Array.isArray(nextStudentIds) ? nextStudentIds : []).map(Number).filter(Boolean));
    const removed = (Array.isArray(previousStudentIds) ? previousStudentIds : [])
      .map(Number)
      .filter((studentId) => studentId > 0 && !next.has(studentId));
    if (!removed.length) return false;
    const confirmed = new Set(
      (Array.isArray(confirmedStudentIds) ? confirmedStudentIds : []).map(Number).filter(Boolean),
    );
    if (removed.some((studentId) => !confirmed.has(studentId))) return false;
    const known = this.confirmedStudentRemovalsByCourse.get(id) || new Set();
    for (const studentId of removed) known.add(studentId);
    this.confirmedStudentRemovalsByCourse.set(id, known);
    return true;
  }

  async runGradeCourseMutation(courseId, operation, {
    preserveRoster = false,
    skipAutoSave = false,
    confirmedRemovedStudentIds = [],
  } = {}) {
    const id = Number(courseId) || 0;
    const run = async () => {
      await this.ensureGradeCourseLoaded(id, { publish: false });
      const before = this.store.exportGradeVaultStateSnapshot();
      const roster = before.gradeStudents.map((student) => Number(student.id)).sort((a, b) => a - b);
      this.gradeCourseMutationActiveCourseId = id;
      this.store._suspendSaveHooks();
      try {
        const result = await operation({ courseId: id });
        const after = this.store.normalizeGradeVaultState(this.store.exportGradeVaultStateSnapshot());
        const nextRoster = after.gradeStudents.map((student) => Number(student.id)).sort((a, b) => a - b);
        if (preserveRoster) {
          if (JSON.stringify(roster) !== JSON.stringify(nextRoster)) throw new Error('Die Kursliste wurde während der Mutation verändert.');
        }
        this.store.replaceGradeVaultState(after);
        this.courseCache.set(id, after);
        this.rememberPerformanceIndex(id, after);
        this.updateNameLearningDueSummaryForCourse(id, after);
        this.rememberConfirmedStudentRemovals(id, roster, nextRoster, confirmedRemovedStudentIds);
        this.dirtyCourseIds.add(id);
        this.courseRevisions.set(id, this.getGradeCourseRevision(id) + 1);
        this.markManualDirty();
        if (!skipAutoSave && !this.isManualPersistenceMode() && this.hasConnectedFile()) {
          this.queueSyncSave('grades-auto-save');
        }
        return result;
      } catch (error) {
        this.store.replaceGradeVaultState(before);
        throw error;
      } finally {
        this.store._resumeSaveHooks({ flush: false });
        this.gradeCourseMutationActiveCourseId = null;
        this.markChanged('grades');
      }
    };
    return this.enqueueOperation(run);
  }

  async loadAllPersistedGradeCoursesForCryptoRewrite() {
    for (const courseId of this.segmentTexts.keys()) {
      if (!this.courseCache.has(courseId)) {
        const state = await this.decodeCourse(courseId, this.segmentTexts.get(courseId));
        this.courseCache.set(courseId, state);
        this.rememberPerformanceIndex(courseId, state);
      }
      this.dirtyCourseIds.add(courseId);
    }
    if (this.loadedCourseId && this.courseCache.has(this.loadedCourseId)) {
      this.store.replaceGradeVaultState(this.courseCache.get(this.loadedCourseId));
    }
    return true;
  }

  buildPerformanceIndex(courseIds = []) {
    const requested = new Set((Array.isArray(courseIds) ? courseIds : []).map(Number));
    const result = [];
    for (const [courseId, items] of this.performanceIndexCache.entries()) {
      if (requested.size && !requested.has(courseId)) continue;
      result.push(...items.map((item) => ({ ...item })));
    }
    return result;
  }

  rememberPerformanceIndex(courseId, state) {
    const id = Number(courseId) || 0;
    if (!id) return;
    const items = (state?.gradeAssessments || []).map((assessment) => ({
      courseId: id,
      assessmentId: Number(assessment.id) || 0,
      date: String(assessment.date || assessment.lessonDate || ''),
      title: String(assessment.title || ''),
    }));
    this.performanceIndexCache.set(id, items);
    this.seatplanPresenceCache.set(id, courseStateHasSeatPlan(state));
  }

  buildSeatplanCourseIds(courseIds = []) {
    const requested = new Set((Array.isArray(courseIds) ? courseIds : []).map(Number));
    const result = [];
    for (const [courseId, hasPlan] of this.seatplanPresenceCache.entries()) {
      if (requested.size && !requested.has(courseId)) continue;
      if (hasPlan) result.push(courseId);
    }
    return result;
  }

  async resolvePerformanceIndex(courseIds) {
    const ids = [...new Set((Array.isArray(courseIds) ? courseIds : []).map(Number).filter((id) => id > 0))];
    if (!this.canAccessGradeVault()) {
      const error = new Error('Das Notenmodul ist gesperrt.');
      error.code = WORKSPACE_ERROR_VAULT_LOCKED;
      throw error;
    }
    const previous = this.loadedCourseId;
    for (const id of ids) {
      if (!this.courseCache.has(id)) {
        const text = this.segmentTexts.get(id);
        const state = text ? await this.decodeCourse(id, text) : emptyGradeState(this.store);
        this.courseCache.set(id, state);
        this.rememberPerformanceIndex(id, state);
      }
    }
    if (previous) {
      this.store.replaceGradeVaultState(this.courseCache.get(previous) || emptyGradeState(this.store));
      this.loadedCourseId = previous;
    }
    return this.buildPerformanceIndex(ids);
  }

  async getCourseContentSignature(courseId, text, options = {}) {
    return buildCourseContentSignature(
      await this.decodeCourseSegmentForPlausibility(courseId, text, options),
      courseId,
    );
  }

  async assertCourseContentIsPlausible(segments = []) {
    const candidateTexts = new Map(
      (Array.isArray(segments) ? segments : []).map((segment) => [
        Number(segment?.courseId) || 0,
        String(segment?.text || ''),
      ]),
    );
    const unexpectedRosterLosses = [];
    const emptiedCourseIds = [];
    for (const [courseId, persistedText] of this.segmentTexts.entries()) {
      if (this.deletedCourseIds.has(courseId)) continue;
      const candidateText = candidateTexts.get(courseId);
      if (!candidateText || candidateText === persistedText) continue;
      let previous;
      let next;
      try {
        previous = await this.getCourseContentSignature(courseId, persistedText, { persisted: true });
        next = await this.getCourseContentSignature(courseId, candidateText);
      } catch (cause) {
        const error = new Error(`Speichern abgebrochen: Der Inhalt von Kurs ${courseId} konnte nicht sicher geprüft werden. Die Datenbankdatei wurde nicht verändert.`);
        error.code = WORKSPACE_ERROR_PERSISTENCE_CONTENT_LOSS;
        error.cause = cause;
        throw error;
      }
      const approvedStudentRemovals = this.confirmedStudentRemovalsByCourse.get(courseId) || new Set();
      const unconfirmedStudentIds = [...previous.studentIds].filter((studentId) => (
        !next.studentIds.has(studentId) && !approvedStudentRemovals.has(studentId)
      ));
      if (unconfirmedStudentIds.length > 0) {
        unexpectedRosterLosses.push({ courseId, studentIds: unconfirmedStudentIds });
      }
      const onlyConfirmedRosterRemoval = (
        previous.studentIds.size > 0
        && !previous.hasOtherContent
        && next.studentIds.size === 0
        && !next.hasOtherContent
        && unconfirmedStudentIds.length === 0
      );
      if (
        previous.hasMeaningfulContent
        && !next.hasMeaningfulContent
        && !onlyConfirmedRosterRemoval
      ) {
        emptiedCourseIds.push(courseId);
      }
    }
    if (unexpectedRosterLosses.length > 0) {
      const details = unexpectedRosterLosses
        .map(({ courseId, studentIds }) => `${courseId} (${studentIds.join(', ')})`)
        .join('; ');
      const error = new Error(`Speichern abgebrochen: Teilnehmende würden ohne ausdrückliche Löschbestätigung entfernt (Kurs-IDs und Teilnehmenden-IDs: ${details}). Die Datenbankdatei wurde nicht verändert.`);
      error.code = WORKSPACE_ERROR_PERSISTENCE_CONTENT_LOSS;
      throw error;
    }
    if (emptiedCourseIds.length > 0) {
      const error = new Error(`Speichern abgebrochen: Die Notendaten der Kurssegmente ${emptiedCourseIds.join(', ')} wären nach dem Speichern inhaltlich leer. Die Datenbankdatei wurde nicht verändert.`);
      error.code = WORKSPACE_ERROR_PERSISTENCE_CONTENT_LOSS;
      throw error;
    }
    return true;
  }

  assertContainerKeepsPersistedCourses(built, knownCourseIds) {
    const writtenCourseIds = new Set(
      (built?.header?.gradeCourseSegments || []).map((descriptor) => Number(descriptor.courseId) || 0),
    );
    const droppedCourseIds = [...new Set(knownCourseIds)]
      .filter((courseId) => !writtenCourseIds.has(courseId) && !this.deletedCourseIds.has(courseId));
    if (droppedCourseIds.length === 0) return true;
    const error = new Error(`Speichern abgebrochen: Die Notendaten von ${droppedCourseIds.length} Kurs(en) fehlen im Schreibvorgang (Kurs-IDs ${droppedCourseIds.join(', ')}). Die Datenbankdatei wurde nicht verändert.`);
    error.code = WORKSPACE_ERROR_PERSISTENCE_INCOMPLETE;
    throw error;
  }

  async buildGradeCourseSegments() {
    if (this.loadedCourseId) this.courseCache.set(this.loadedCourseId, this.store.exportGradeVaultStateSnapshot());
    const courseIds = new Set([
      ...this.segmentTexts.keys(),
      ...this.courseCache.keys(),
      ...this.dirtyCourseIds,
    ]);
    const publicCourses = Array.isArray(this.store.state?.courses)
      ? this.store.state.courses
      : (this.store.exportPublicStateSnapshot?.().courses || []);
    const existingCourses = new Set(publicCourses.map((course) => Number(course.id)));
    const segments = [];
    let entryCount = 0;
    for (const courseId of [...courseIds].sort((a, b) => a - b)) {
      if (
        !existingCourses.has(courseId)
        && !this.persistedCourseIds.has(courseId)
        && !this.dirtyCourseIds.has(courseId)
      ) continue;
      const rewrite = this.dirtyCourseIds.has(courseId) || !this.segmentTexts.has(courseId);
      if (!rewrite && this.segmentTexts.has(courseId)) {
        segments.push({ courseId, text: this.segmentTexts.get(courseId) });
        continue;
      }
      if (this.isGradeVaultConfigured() && !this.isGradeVaultUnlocked()) {
        const error = new Error('Ungespeicherte Notenänderungen können erst nach dem Entsperren des Notenbereichs gespeichert werden.');
        error.code = WORKSPACE_ERROR_VAULT_LOCKED;
        throw error;
      }
      const state = this.courseCache.get(courseId) || emptyGradeState(this.store);
      entryCount += state.gradeEntries?.length || 0;
      const persisted = this.persistedCourseFromState(courseId, state);
      const text = await this.encodeCourse(courseId, persisted);
      segments.push({ courseId, text });
    }
    const writtenCourseIds = new Set(segments.map((segment) => Number(segment.courseId)));
    const droppedCourseIds = [...this.persistedCourseIds].filter((courseId) => !writtenCourseIds.has(courseId));
    if (droppedCourseIds.length > 0) {
      const error = new Error(`Speichern abgebrochen: Die Notendaten von ${droppedCourseIds.length} Kurs(en) fehlen im Schreibvorgang (Kurs-IDs ${droppedCourseIds.join(', ')}). Die Datenbankdatei wurde nicht verändert.`);
      error.code = WORKSPACE_ERROR_PERSISTENCE_INCOMPLETE;
      throw error;
    }
    await this.assertCourseContentIsPlausible(segments);
    return { segments, entryCount };
  }

  persistedCourseFromState(courseId, state) {
    return persistedCourseFromState(this.store, courseId, state, this.clone);
  }

  runtimeCourseFromPersisted(courseId, persisted) {
    return runtimeCourseFromPersisted(this.store, courseId, persisted, this.clone);
  }

  markPersistedCoursesDirty() {
    for (const courseId of this.segmentTexts.keys()) this.dirtyCourseIds.add(courseId);
  }

  getCryptoRewriteSnapshot() {
    return {
      courseIds: new Set([
        ...this.segmentTexts.keys(),
        ...this.courseCache.keys(),
        ...(this.loadedCourseId ? [this.loadedCourseId] : []),
      ]),
      states: new Map(this.courseCache),
    };
  }

  replaceCryptoRewriteStates(states, courseIds) {
    this.courseCache = states;
    if (this.loadedCourseId && states.has(this.loadedCourseId)) {
      this.store.replaceGradeVaultState(states.get(this.loadedCourseId));
    }
    for (const courseId of courseIds) this.dirtyCourseIds.add(courseId);
  }

  clearPlaintextCourses() {
    if (this.loadedCourseId) {
      this.rememberPerformanceIndex(this.loadedCourseId, this.store.exportGradeVaultStateSnapshot());
    }
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
    this.courseCache.clear();
    this.loadedCourseId = null;
  }

  discardCourseChanges() {
    this.courseCache.clear();
    this.performanceIndexCache.clear();
    this.seatplanPresenceCache.clear();
    this.courseRevisions.clear();
    this.dirtyCourseIds.clear();
    this.confirmedStudentRemovalsByCourse.clear();
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
    this.loadedCourseId = null;
  }

  commitPersistedSegments(segments = []) {
    this.segmentTexts = new Map((segments || []).map((segment) => [
      Number(segment.courseId),
      String(segment.text || ''),
    ]));
    this.rememberPersistedCourseIds(segments);
    this.confirmedStudentRemovalsByCourse.clear();
  }

  resetForDatabase(segments) {
    this.commitPersistedSegments(segments);
    this.deletedCourseIds.clear();
    this.courseCache.clear();
    this.performanceIndexCache.clear();
    this.seatplanPresenceCache.clear();
    this.dirtyCourseIds.clear();
    this.loadedCourseId = null;
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
  }

  completeSave({ clearDeleted = false } = {}) {
    this.dirtyCourseIds.clear();
    if (clearDeleted) this.deletedCourseIds.clear();
  }

  captureGradeChange() {
    const courseId = Number(this.loadedCourseId) || 0;
    if (!courseId) return;
    this.courseCache.set(courseId, this.store.exportGradeVaultStateSnapshot());
    this.rememberPerformanceIndex(courseId, this.courseCache.get(courseId));
    this.dirtyCourseIds.add(courseId);
    this.courseRevisions.set(courseId, this.getGradeCourseRevision(courseId) + 1);
  }

  deleteCourseData(courseId) {
    this.segmentTexts.delete(courseId);
    this.persistedCourseIds.delete(courseId);
    this.deletedCourseIds.add(courseId);
    this.confirmedStudentRemovalsByCourse.delete(courseId);
    this.courseCache.delete(courseId);
    this.performanceIndexCache.delete(courseId);
    this.seatplanPresenceCache.delete(courseId);
    this.dirtyCourseIds.delete(courseId);
    if (this.loadedCourseId === courseId) this.loadedCourseId = null;
  }
}
