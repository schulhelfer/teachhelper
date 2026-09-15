const SHARED_DATA_METHODS = Object.freeze([
  'createCourse',
  'ensureLessonsForYear',
  'exportPublicStateSnapshot',
  'getActiveSchoolYear',
  'getBackupEnabled',
  'getBackupIntervalDays',
  'getHoursPerDay',
  'getLastAutoBackupAt',
  'getLessonById',
  'getLessonTimes',
  'getSetting',
  'listCourses',
  'listFreeRanges',
  'listGradeStudents',
  'listLessonsForWeek',
  'listSchoolYears',
  'setActiveSchoolYear',
  'setSetting',
  'updateCourse',
  'updateCourseOrder',
]);

const PLANNING_DATA_METHODS = Object.freeze([
  'applyHolidayDefaultsForYear',
  'createSlot',
  'deleteCourse',
  'deleteFreeRange',
  'deleteSlot',
  'deleteSpecialDay',
  'findSlotConflicts',
  'getLessonBlock',
  'getSlot',
  'listSlotsForYear',
  'listSpecialDays',
  'requiredHolidaysComplete',
  'resetSpecialDays',
  'setBackupEnabled',
  'setBackupIntervalDays',
  'setHoursPerDay',
  'setLessonTimes',
  'setQualificationPhaseEndDate',
  'shiftCourseTopicsBackward',
  'shiftCourseTopicsForward',
  'splitSlotFromDate',
  'updateLessonBlock',
  'updateSlot',
  'upsertFreeRange',
  'upsertSpecialDay',
]);

const GRADES_DATA_METHODS = Object.freeze([
  'buildGradeTestScaleSnapshot',
  'calculateComputedGradeForStudentInCategoryPeriod',
  'calculateComputedGradeForStudentInCoursePeriod',
  'calculateComputedGradeForStudentInSubcategoryPeriod',
  'calculateGradeForStudentInCategoryPeriod',
  'calculateGradeForStudentInCoursePeriod',
  'calculateGradeForStudentInSubcategoryPeriod',
  'calculateHomeworkSummaryForStudentInSubcategoryPeriod',
  'createGradeAssessment',
  'createGradeAssessmentSnapshot',
  'deleteGradeAssessment',
  'exportGradeVaultStateSnapshot',
  'getDefaultGradeStructure',
  'getExpectationHorizonCommentTemplate',
  'getExpectationHorizonLocation',
  'getGradeAssessment',
  'getGradeDisplaySystem',
  'getGradeEntry',
  'getGradeImportMeta',
  'getGradeOccurrenceCategories',
  'getGradeOverride',
  'getGradePickerConfig',
  'getGradeSeatPlan',
  'getGradeStructure',
  'getGradeStructureForPeriod',
  'getGradeStudentPerformanceFlair',
  'getGradeTestScaleSettings',
  'getGradeTestScaleTemplate',
  'getGradeVaultAutoLockMinutes',
  'getGradeVaultAutoLockOnBackground',
  'getGradeVaultAutoSaveBeforeLock',
  'getGradesPrivacyGraphThreshold',
  'getGroupedGradeAssessments',
  'listGradeAccommodations',
  'listGradeAssessments',
  'listVisibleGradeTestScaleTemplates',
  'reorderGradeAssessments',
  'replaceGradeStudentsForCourse',
  'saveGradeAccommodationsForCourse',
  'saveGradePickerConfig',
  'saveGradeSeatPlan',
  'saveGradeStructure',
  'setCourseNameLearningHidden',
  'setCourseNoGrades',
  'setGradeEntry',
  'setGradeOverride',
  'setGradeTestEntry',
  'updateGradeAssessment',
]);

const PLANNING_OPERATIONS = Object.freeze([
  'canAccessGradeVault',
  'getDefaultSchoolYearStartYear',
  'getGradeCourseRosterSummary',
  'setGradeCourseStudentCounts',
]);

const GRADES_OPERATIONS = Object.freeze([
  'acceptWorkspaceBackupDirectoryHandle',
  'acceptWorkspaceSyncFileHandle',
  'canAccessGradeVault',
  'createEmptyManualDatabase',
  'createEmptyWorkspaceFileInDirectory',
  'createLatestWebBackup',
  'discardGradeVaultChanges',
  'enqueueConnectedFileSave',
  'ensureBackupDirectoryReady',
  'ensureGradeCourseLoaded',
  'ensurePlanningPublicLoaded',
  'getDefaultSchoolYearStartYear',
  'getGradeCourseRevision',
  'getGradeCourseRosterSummary',
  'getGradeCourseStateSnapshot',
  'getOccurrenceCategoryUsage',
  'hasGradeVaultUnlockConfig',
  'hasShellDatabaseConnection',
  'importBackupFromFile',
  'isExternalFileSyncPresentationSupported',
  'isGradeCourseLoaded',
  'isGradeVaultConfigured',
  'isGradeVaultEncryptionEnabled',
  'isGradeVaultUnlocked',
  'isManualPersistenceMode',
  'isManualPersistencePresentationMode',
  'loadGradeCourseNavigationTargetAtomically',
  'loadManualDatabaseFromFile',
  'lockGradeVaultSession',
  'maybeRunAutomaticWebBackup',
  'persistExplicitDatabaseSave',
  'recordGradeVaultActivity',
  'runGradeCourseMutation',
  'saveGradeVaultChanges',
  'saveManualDatabase',
  'setGradeCourseStudentCounts',
  'setGradeVaultEncryptionEnabledFromSettings',
  'shouldPromptForManualDatabaseOnStartup',
  'tryReconnectStoredSyncFile',
  'withTemporaryGradeCourse',
]);

function copy(value) {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function copyResult(value) {
  return value && typeof value.then === 'function' ? value.then(copy) : copy(value);
}

export function createWorkspacePublicApi({ getStore, getRuntime, scope }) {
  const data = Object.create(null);
  const operations = Object.create(null);
  const shared = scope === 'shell' || scope === 'planning' || scope === 'grades';
  const planning = scope === 'shell' || scope === 'planning';
  const grades = scope === 'shell' || scope === 'grades';
  const dataMethods = new Set([
    ...(shared ? SHARED_DATA_METHODS : []),
    ...(planning ? PLANNING_DATA_METHODS : []),
    ...(grades ? GRADES_DATA_METHODS : []),
  ]);
  for (const method of dataMethods) {
    data[method] = (...args) => copyResult(getStore()[method](...args.map(copy)));
  }
  const operationMethods = new Set([
    ...(shared ? PLANNING_OPERATIONS : []),
    ...(grades ? GRADES_OPERATIONS : []),
  ]);
  for (const method of operationMethods) {
    operations[method] = (...args) => copyResult(getRuntime()[method](...args));
  }
  if (shared) {
    data.listLessons = () => copy(getStore().state.lessons);
    data.getCourse = (courseId) => copy(getStore().state.courses.find((course) => Number(course.id) === Number(courseId)) || null);
    operations.getPersistenceView = () => {
      const runtime = getRuntime();
      const sync = runtime.syncState;
      const backup = runtime.backupState;
      return {
        sync: {
          supported: sync.supported,
          initialized: sync.initialized,
          connected: Boolean(sync.fileHandle),
          pending: Boolean(sync.storedFileHandle),
          pendingFileName: String(sync.storedFileHandle?.name || ''),
          fileName: String(sync.fileName || ''),
        },
        backup: {
          connected: Boolean(backup.directoryHandle),
          pending: Boolean(backup.storedDirectoryHandle),
          directoryName: String(backup.directoryHandle?.name || ''),
          pendingDirectoryName: String(backup.storedDirectoryHandle?.name || ''),
        },
        manual: copy(runtime.manualPersistenceState),
        meta: copy(runtime.syncMeta),
      };
    };
  }
  if (grades) {
    data.listGradeEntries = () => copy(getStore().gradeVaultState.gradeEntries);
    data.clearGradeAssessmentEntries = (assessmentId) => {
      const store = getStore();
      store.gradeVaultState.gradeEntries = store.gradeVaultState.gradeEntries
        .filter((entry) => Number(entry.assessmentId) !== Number(assessmentId));
      store._saveGradeVault();
    };
    data.saveNameLearningProgress = (courseId, studentId, progress) => {
      const store = getStore();
      if (!store.listGradeStudents(courseId).some((student) => Number(student.id) === Number(studentId))) {
        const error = new Error('Diese Person ist nicht mehr im Kurs.');
        error.code = 'NAME_LEARNING_STUDENT_MISSING';
        throw error;
      }
      const rows = store.gradeVaultState.gradeNameLearning;
      const current = rows.find((row) => Number(row.courseId) === Number(courseId) && Number(row.studentId) === Number(studentId));
      const stage = Math.min(10, Math.max(0, Math.floor(Number(progress?.stage) || 0)));
      const dueAt = Number(progress?.dueAt);
      if (!Number.isFinite(dueAt) || dueAt < 0) throw new Error('Lernstatus ist ungültig.');
      if (current) Object.assign(current, { stage, dueAt });
      else rows.push({ courseId: Number(courseId), studentId: Number(studentId), stage, dueAt });
      store._saveGradeVault();
    };
    operations.getGradeCourseActivity = () => ({
      mutationCourseId: Number(getRuntime().gradeCourseMutationActiveCourseId) || null,
      operationActive: Boolean(getRuntime().gradeCourseOperationActive),
    });
    operations.canCommitImmediateGradeCourseMutation = (courseId, { assessmentId = null, studentId = null } = {}) => {
      const runtime = getRuntime();
      const store = getStore();
      const courseKey = Number(courseId) || 0;
      const assessmentKey = Number(assessmentId) || 0;
      const studentKey = Number(studentId) || 0;
      if (!courseKey || runtime.gradeCourseOperationActive || runtime.gradeCourseMutationActiveCourseId || !runtime.isGradeCourseLoaded(courseKey)) return false;
      try {
        runtime.normalizeAndAssertGradeCourseSnapshot(courseKey, runtime.getCurrentGradeVaultSnapshot());
      } catch {
        return false;
      }
      if (assessmentKey && Number(store.getGradeAssessment(assessmentKey)?.courseId) !== courseKey) return false;
      return !studentKey || store.listGradeStudents(courseKey).some((student) => Number(student.id) === studentKey);
    };
  }
  return Object.freeze({ data: Object.freeze(data), operations: Object.freeze(operations) });
}
