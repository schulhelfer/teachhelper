import { WorkspaceBackup } from './workspace-backup.js';
import { WorkspacePersistence, downloadBytes } from './workspace-persistence.js';
import { GradeVault } from './grade-vault.js';
import { CourseRepository } from './course-repository.js';
import {
  WORKSPACE_COMMAND_APPLY_SETTINGS,
  WORKSPACE_COMMAND_CREATE_COURSE,
  WORKSPACE_COMMAND_DELETE_COURSE,
  WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY,
  WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
  WORKSPACE_COMMAND_REORDER_COURSES,
  WORKSPACE_COMMAND_UPDATE_COURSE,
} from '../../shared/school-data/messages.js';
import { getDefaultSchoolYearStartYear } from './store.js';
import { buildWorkspaceArchivePdfBytes, downloadWorkspaceArchivePdf } from './archive-pdf.js';

export { formatLocalBackupTimestamp } from './workspace-backup.js';

const PLANNING_SETTING_KEYS = new Set([
  'hoursPerDay',
  'lessonTimes',
  'showHiddenSidebarCourses',
  'showHalfYearBoundaryMarkers',
  'backupEnabled',
  'backupIntervalDays',
]);
const GRADES_SETTING_KEYS = new Set([
  'gradesPrivacyGraphThreshold',
  'showHiddenSidebarCourses',
  'showGradeStudentPortraits',
  'showNameLearningModule',
  'gradeTestScaleSettings',
  'gradeOccurrenceCategories',
  'defaultGradeStructure',
  'expectationHorizonLocation',
  'expectationHorizonCommentTemplate',
  'backupEnabled',
  'backupIntervalDays',
  'gradeVaultAutoLockMinutes',
  'gradeVaultAutoLockOnBackground',
  'gradeVaultAutoSaveBeforeLock',
]);

function clone(value, fallback = null) {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
}

function randomId() {
  return globalThis.crypto?.randomUUID?.()
    || `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class WorkspaceRuntime {
  constructor(store, {
    eventTarget = globalThis.window || new EventTarget(),
    ephemeral = false,
    confirmLargeFile = null,
    now = () => new Date(),
  } = {}) {
    this.store = store;
    this.eventTarget = eventTarget;
    this.ephemeral = Boolean(ephemeral);
    this.confirmLargeFile = typeof confirmLargeFile === 'function' ? confirmLargeFile : null;
    this.now = typeof now === 'function' ? now : () => new Date();
    this.controller = null;
    this.clients = new Map();
    this.ready = true;
    this.startupPermissionRecovery = null;
    this.operationTail = Promise.resolve();

    this.courseRepository = new CourseRepository({
      store,
      clone,
      canAccessGradeVault: () => this.canAccessGradeVault(),
      isGradeVaultConfigured: () => this.isGradeVaultConfigured(),
      isGradeVaultUnlocked: () => this.isGradeVaultUnlocked(),
      decodeCourse: (...args) => this.decodeCourse(...args),
      decodeCourseSegmentForPlausibility: (...args) => this.decodeCourseSegmentForPlausibility(...args),
      encodeCourse: (...args) => this.gradeVault.encodeCourse(...args),
      isPersistenceReady: () => this.isPersistenceReady(),
      isManualPersistenceMode: () => this.isManualPersistenceMode(),
      hasConnectedFile: () => Boolean(this.fileHandle),
      queueSyncSave: (...args) => this.queueSyncSave(...args),
      onPublicChanged: () => this.onPublicChanged(),
      markManualDirty: () => { this.manualDirty = true; },
      enqueueOperation: (operation) => this.enqueueFileOperation(operation),
      markChanged: (scope) => this.controller?.markChanged?.(scope),
      publish: (scope) => this.controller?.publish?.(scope),
    });
    this.gradeVault = new GradeVault({
      store,
      eventTarget: this.eventTarget,
      getDocument: () => this.eventTarget?.document || globalThis.document,
      setTimeout: (...args) => setTimeout(...args),
      clearTimeout: (...args) => clearTimeout(...args),
      nowMs: () => Date.now(),
      randomId,
      clone,
      markChanged: (scope) => this.controller?.markChanged?.(scope),
      hasDirtyCourses: () => this.dirtyCourseIds.size > 0,
      hasPersistedCourses: () => this.segmentTexts.size > 0,
      hasConnectedFile: () => Boolean(this.fileHandle),
      isManualPersistenceMode: () => this.isManualPersistenceMode(),
      saveToConnectedFile: (...args) => this.saveToConnectedFile(...args),
      enqueueOperation: (operation) => this.enqueueFileOperation(operation),
      loadAllPersistedGradeCoursesForCryptoRewrite: () => this.loadAllPersistedGradeCoursesForCryptoRewrite(),
      refreshNameLearningDueSummary: () => this.refreshNameLearningDueSummary(),
      markPersistedCoursesDirty: () => this.courseRepository.markPersistedCoursesDirty(),
      getCryptoRewriteSnapshot: () => this.courseRepository.getCryptoRewriteSnapshot(),
      getPersistedCourseText: (courseId) => this.segmentTexts.get(courseId) || '',
      replaceCryptoRewriteStates: (...args) => this.courseRepository.replaceCryptoRewriteStates(...args),
      clearPlaintextCourses: () => this.courseRepository.clearPlaintextCourses(),
      discardCourseChanges: () => {
        this.courseRepository.discardCourseChanges();
        this.manualDirty = Boolean(this.publicDirty);
      },
      runtimeCourseFromPersisted: (...args) => this.courseRepository.runtimeCourseFromPersisted(...args),
    });
    this.persistence = new WorkspacePersistence({
      store,
      ephemeral: this.ephemeral,
      confirmLargeFile: (...args) => this.confirmLargeFile?.(...args),
      deviceId: randomId(),
      getIndexedDB: () => globalThis.indexedDB,
      downloadBytes,
      markChanged: (scope) => this.controller?.markChanged?.(scope),
      publish: (scope) => this.controller?.publish?.(scope),
      markReady: () => { this.ready = true; },
      buildGradeCourseSegments: () => this.courseRepository.buildGradeCourseSegments(),
      getVaultConfig: () => this.gradeVault.getContainerConfig(),
      emptyVaultConfig: () => this.gradeVault.normalizeVaultConfig(null),
      validateVaultConfig: (raw) => this.gradeVault.validateConfig(raw),
      loadVaultConfig: (...args) => this.gradeVault.loadConfig(...args),
      commitPersistedSegments: (segments) => this.courseRepository.commitPersistedSegments(segments),
      commitPersistedConfig: () => this.gradeVault.commitPersistedConfig(),
      resetCoursesForDatabase: (segments) => this.courseRepository.resetForDatabase(segments),
      completeGradeSave: (options) => this.courseRepository.completeSave(options),
      clearGradeVaultAutoLockWarning: () => this.clearGradeVaultAutoLockWarning(),
      isGradeVaultEncryptionEnabled: () => this.isGradeVaultEncryptionEnabled(),
      refreshNameLearningDueSummary: () => this.refreshNameLearningDueSummary(),
      getDefaultSchoolYearStartYear: (...args) => this.getDefaultSchoolYearStartYear(...args),
      assertContainerKeepsPersistedCourses: (...args) => this.assertContainerKeepsPersistedCourses(...args),
      getBackupConnection: () => ({
        directoryHandle: this.backupDirectoryHandle,
        storedDirectoryHandle: this.storedBackupDirectoryHandle,
      }),
      clearBackupConnection: () => {
        this.backupDirectoryHandle = null;
        this.storedBackupDirectoryHandle = null;
      },
      restoreBackupConnection: ({ directoryHandle, storedDirectoryHandle }) => {
        this.backupDirectoryHandle = directoryHandle;
        this.storedBackupDirectoryHandle = storedDirectoryHandle;
      },
      enqueueOperation: (operation) => this.enqueueFileOperation(operation),
    });
    this.backup = new WorkspaceBackup({
      store,
      ephemeral: this.ephemeral,
      now: () => this.now(),
      markChanged: (scope) => this.controller?.markChanged?.(scope),
      ensureHandleReadWritePermission: (...args) => this.ensureHandleReadWritePermission(...args),
      storeHandle: (...args) => this.storeHandle(...args),
      loadStoredHandle: (...args) => this.loadStoredHandle(...args),
      isPersistenceReady: () => this.isPersistenceReady(),
      buildContainer: (...args) => this.buildContainer(...args),
      loadBytes: (...args) => this.loadBytes(...args),
      readDatabaseFileBytes: (...args) => this.readDatabaseFileBytes(...args),
      downloadBytes,
      loadManualDatabaseFromFile: (...args) => this.loadManualDatabaseFromFile(...args),
      getFileName: () => this.fileName,
      setFileName: (value) => { this.fileName = value; },
      buildSyncFileSuggestedName: () => this.buildSyncFileSuggestedName(),
    });
    this.store.setAfterSaveHooks({
      publicChange: () => this.onPublicChanged(),
      gradeVaultChange: () => this.onGradeChanged(),
    });
    this.bindAutoLock();
  }

  get fileHandle() {
    return this.persistence.fileHandle;
  }

  set fileHandle(value) {
    this.persistence.fileHandle = value;
  }

  get storedFileHandle() {
    return this.persistence.storedFileHandle;
  }

  set storedFileHandle(value) {
    this.persistence.storedFileHandle = value;
  }

  get syncReconnectInFlight() {
    return this.persistence.syncReconnectInFlight;
  }

  set syncReconnectInFlight(value) {
    this.persistence.syncReconnectInFlight = value;
  }

  get fileName() {
    return this.persistence.fileName;
  }

  set fileName(value) {
    this.persistence.fileName = value;
  }

  get knownRevision() {
    return this.persistence.knownRevision;
  }

  set knownRevision(value) {
    this.persistence.knownRevision = value;
  }

  get knownFileHash() {
    return this.persistence.knownFileHash;
  }

  set knownFileHash(value) {
    this.persistence.knownFileHash = value;
  }

  get databaseLoaded() {
    return this.persistence.databaseLoaded;
  }

  set databaseLoaded(value) {
    this.persistence.databaseLoaded = value;
  }

  get loadGeneration() {
    return this.persistence.loadGeneration;
  }

  set loadGeneration(value) {
    this.persistence.loadGeneration = value;
  }

  get loadInProgress() {
    return this.persistence.loadInProgress;
  }

  set loadInProgress(value) {
    this.persistence.loadInProgress = value;
  }

  get persistenceFailure() {
    return this.persistence.persistenceFailure;
  }

  set persistenceFailure(value) {
    this.persistence.persistenceFailure = value;
  }

  get deviceId() {
    return this.persistence.deviceId;
  }

  set deviceId(value) {
    this.persistence.deviceId = value;
  }

  get manualLoaded() {
    return this.persistence.manualLoaded;
  }

  set manualLoaded(value) {
    this.persistence.manualLoaded = value;
  }

  get manualDirty() {
    return this.persistence.manualDirty;
  }

  set manualDirty(value) {
    this.persistence.manualDirty = value;
  }

  get publicDirty() {
    return this.persistence.publicDirty;
  }

  set publicDirty(value) {
    this.persistence.publicDirty = value;
  }

  get backupDirectoryHandle() {
    return this.backup.backupDirectoryHandle;
  }

  set backupDirectoryHandle(value) {
    this.backup.backupDirectoryHandle = value;
  }

  get storedBackupDirectoryHandle() {
    return this.backup.storedBackupDirectoryHandle;
  }

  set storedBackupDirectoryHandle(value) {
    this.backup.storedBackupDirectoryHandle = value;
  }

  get vault() {
    return this.gradeVault.vault;
  }

  set vault(value) {
    this.gradeVault.vault = value;
  }

  get persistedCourseIds() {
    return this.courseRepository.persistedCourseIds;
  }

  set persistedCourseIds(value) {
    this.courseRepository.persistedCourseIds = value;
  }

  get deletedCourseIds() {
    return this.courseRepository.deletedCourseIds;
  }

  set deletedCourseIds(value) {
    this.courseRepository.deletedCourseIds = value;
  }

  get confirmedStudentRemovalsByCourse() {
    return this.courseRepository.confirmedStudentRemovalsByCourse;
  }

  set confirmedStudentRemovalsByCourse(value) {
    this.courseRepository.confirmedStudentRemovalsByCourse = value;
  }

  get segmentTexts() {
    return this.courseRepository.segmentTexts;
  }

  set segmentTexts(value) {
    this.courseRepository.segmentTexts = value;
  }

  get courseCache() {
    return this.courseRepository.courseCache;
  }

  set courseCache(value) {
    this.courseRepository.courseCache = value;
  }

  get performanceIndexCache() {
    return this.courseRepository.performanceIndexCache;
  }

  set performanceIndexCache(value) {
    this.courseRepository.performanceIndexCache = value;
  }

  get seatplanPresenceCache() {
    return this.courseRepository.seatplanPresenceCache;
  }

  set seatplanPresenceCache(value) {
    this.courseRepository.seatplanPresenceCache = value;
  }

  get dirtyCourseIds() {
    return this.courseRepository.dirtyCourseIds;
  }

  set dirtyCourseIds(value) {
    this.courseRepository.dirtyCourseIds = value;
  }

  get courseRevisions() {
    return this.courseRepository.courseRevisions;
  }

  set courseRevisions(value) {
    this.courseRepository.courseRevisions = value;
  }

  get loadedCourseId() {
    return this.courseRepository.loadedCourseId;
  }

  set loadedCourseId(value) {
    this.courseRepository.loadedCourseId = value;
  }

  get courseLoadTail() {
    return this.courseRepository.courseLoadTail;
  }

  set courseLoadTail(value) {
    this.courseRepository.courseLoadTail = value;
  }

  get gradeCourseMutationActiveCourseId() {
    return this.courseRepository.gradeCourseMutationActiveCourseId;
  }

  set gradeCourseMutationActiveCourseId(value) {
    this.courseRepository.gradeCourseMutationActiveCourseId = value;
  }

  async initialize() {
    if (this.ephemeral) {
      this.ready = true;
      this.controller?.publish?.('shell');
      return false;
    }
    const results = await Promise.allSettled([
      this.tryReconnectStoredSyncFile(),
      this.ensureBackupDirectoryReady(),
    ]);
    if (!this.isGradeVaultEncryptionEnabled()) await this.refreshNameLearningDueSummary();
    this.ready = true;
    this.bindStartupPermissionRecovery();
    this.controller?.publish?.('shell');
    return results.some((result) => result.status === 'fulfilled' && result.value);
  }

  bindController(controller) {
    this.controller = controller;
    return this;
  }

  get syncState() {
    return {
      supported: this.isExternalFileSyncPresentationSupported(),
      initialized: true,
      fileHandle: this.fileHandle,
      storedFileHandle: this.storedFileHandle,
      fileName: this.fileName,
      statusText: '',
      statusError: false,
    };
  }

  get backupState() {
    return {
      directoryHandle: this.backupDirectoryHandle,
      storedDirectoryHandle: this.storedBackupDirectoryHandle,
    };
  }

  get syncMeta() {
    return {
      deviceId: this.deviceId,
      knownRemoteRevision: this.knownRevision,
      knownRemoteHash: this.knownFileHash,
      fileName: this.fileName,
      lastSyncedAt: '',
    };
  }

  get manualPersistenceState() {
    return {
      dirty: this.manualDirty,
      fileName: this.fileName,
      lastAction: this.manualLoaded ? 'loaded' : '',
    };
  }

  buildSyncFileSuggestedName(...args) {
    return this.persistence.buildSyncFileSuggestedName(...args);
  }

  buildNewDatabaseSuggestedName(...args) {
    return this.persistence.buildNewDatabaseSuggestedName(...args);
  }

  registerFeatureClient(scope, client) {
    const key = String(scope || '').trim().toLowerCase();
    if (!key || !client) return () => {};
    this.clients.set(key, client);
    return () => {
      if (this.clients.get(key) === client) this.clients.delete(key);
    };
  }

  bindAutoLock(...args) {
    return this.gradeVault.bindAutoLock(...args);
  }

  getGradeVaultAutoLockMs(...args) {
    return this.gradeVault.getGradeVaultAutoLockMs(...args);
  }

  recordGradeVaultActivity(...args) {
    return this.gradeVault.recordGradeVaultActivity(...args);
  }

  clearGradeVaultAutoLockTimer(...args) {
    return this.gradeVault.clearGradeVaultAutoLockTimer(...args);
  }

  clearGradeVaultBackgroundAutoLockTimer(...args) {
    return this.gradeVault.clearGradeVaultBackgroundAutoLockTimer(...args);
  }

  scheduleGradeVaultAutoLock(...args) {
    return this.gradeVault.scheduleGradeVaultAutoLock(...args);
  }

  clearGradeVaultAutoLockWarning(...args) {
    return this.gradeVault.clearGradeVaultAutoLockWarning(...args);
  }

  handleGradeVaultAutoLockTimeout(...args) {
    return this.gradeVault.handleGradeVaultAutoLockTimeout(...args);
  }

  saveDirtyGradeVaultChangesForAutoLock(...args) {
    return this.gradeVault.saveDirtyGradeVaultChangesForAutoLock(...args);
  }

  onPublicChanged() {
    this.publicDirty = true;
    this.manualDirty = true;
    this.controller?.markChanged?.('planning');
    if (!this.isManualPersistenceMode() && this.fileHandle) {
      this.queueSyncSave('planning-auto-save');
    }
  }

  onGradeChanged() {
    this.courseRepository.captureGradeChange();
    this.manualDirty = true;
    this.controller?.markChanged?.('grades');
    if (!this.isManualPersistenceMode() && this.fileHandle) {
      this.queueSyncSave('grades-auto-save');
    }
  }

  createWorkspaceSnapshot(scope = 'shell') {
    const normalized = String(scope || 'shell').toLowerCase();
    const status = {
      ready: this.ready,
      hydrated: this.ready,
      persistence: {
        connected: this.hasShellDatabaseConnection(),
        ownerReady: true,
        initialized: true,
        presentationSupported: this.isExternalFileSyncPresentationSupported(),
        isManualMode: this.isManualPersistenceMode(),
        dirty: this.manualDirty,
        fileName: this.fileName,
        pendingFileName: String(this.storedFileHandle?.name || ''),
        backupConnected: Boolean(this.backupDirectoryHandle),
        backupDirectoryName: String(this.backupDirectoryHandle?.name || ''),
        pendingBackupDirectoryName: String(this.storedBackupDirectoryHandle?.name || ''),
        statusText: String(this.persistenceFailure?.message || ''),
        statusError: Boolean(this.persistenceFailure),
        statusAt: Number(this.persistenceFailure?.at) || 0,
      },
      unsaved: {
        dirty: Boolean(this.publicDirty || this.dirtyCourseIds.size),
        planningDirty: this.publicDirty,
        gradesDirty: this.dirtyCourseIds.size > 0,
        dirtyGradeCourseIds: [...this.dirtyCourseIds],
      },
      vault: {
        mode: this.getGradeVaultStatusMode(),
        dbConnected: this.hasShellDatabaseConnection(),
        configured: this.isGradeVaultConfigured(),
        unlocked: this.isGradeVaultUnlocked(),
        encryptionEnabled: this.isGradeVaultEncryptionEnabled(),
        showGradeStudentPortraits: Boolean(this.store.getSetting?.('showGradeStudentPortraits', false)),
        showNameLearningModule: Boolean(this.store.getSetting?.('showNameLearningModule', false)),
        nameLearningDueCount: this.getNameLearningDueCount(),
        setupRequired: this.isGradeVaultEncryptionEnabled() && !this.isGradeVaultConfigured(),
        autoLockWarning: this.vault.autoLockWarning
          ? {
            active: true,
            blockedAt: Number(this.vault.autoLockWarning.blockedAt) || 0,
            retryAt: Number(this.vault.autoLockWarning.retryAt) || 0,
            message: String(this.vault.autoLockWarning.message || ''),
          }
          : { active: false, blockedAt: 0, retryAt: 0, message: '' },
        autoLockNotice: this.vault.autoLockNotice
          ? {
            active: true,
            id: String(this.vault.autoLockNotice.id || ''),
            lockedAt: Number(this.vault.autoLockNotice.lockedAt) || 0,
          }
          : { active: false, id: '', lockedAt: 0 },
      },
    };
    if (normalized === 'planning') {
      return {
        publicState: this.store.exportPublicStateSnapshot(),
        assessmentIndex: this.buildPerformanceIndex([...this.performanceIndexCache.keys()]),
        assessmentIndexResolvedCourseIds: [...this.performanceIndexCache.keys()],
        seatplanCourseIds: this.buildSeatplanCourseIds([...this.performanceIndexCache.keys()]),
      };
    }
    if (normalized === 'grades') {
      return {
        status,
        publicState: this.store.exportPublicStateSnapshot(),
        activeCourseId: this.loadedCourseId,
        gradeState: this.canAccessGradeVault() && this.loadedCourseId
          ? this.store.exportGradeVaultStateSnapshot()
          : null,
      };
    }
    return status;
  }

  hasShellDatabaseConnection() {
    return this.isManualPersistenceMode() ? this.manualLoaded : Boolean(this.fileHandle);
  }

  isExternalFileSyncPresentationSupported() {
    return typeof globalThis.showOpenFilePicker === 'function' && typeof globalThis.showDirectoryPicker === 'function';
  }

  isManualPersistenceMode() {
    return !this.isExternalFileSyncPresentationSupported();
  }

  isPersistenceReady(...args) {
    return this.persistence.isPersistenceReady(...args);
  }

  clearPersistenceFailure(...args) {
    return this.persistence.clearPersistenceFailure(...args);
  }

  recordPersistenceFailure(...args) {
    return this.persistence.recordPersistenceFailure(...args);
  }

  rememberPersistedCourseIds(...args) {
    return this.courseRepository.rememberPersistedCourseIds(...args);
  }

  isManualPersistencePresentationMode() {
    return this.isManualPersistenceMode();
  }

  shouldPromptForManualDatabaseOnStartup() {
    return this.isManualPersistenceMode() && !this.manualLoaded;
  }

  isGradeVaultEncryptionEnabled(...args) {
    return this.gradeVault.isGradeVaultEncryptionEnabled(...args);
  }

  isGradeVaultConfigured(...args) {
    return this.gradeVault.isGradeVaultConfigured(...args);
  }

  isGradeVaultUnlocked(...args) {
    return this.gradeVault.isGradeVaultUnlocked(...args);
  }

  canAccessGradeVault(...args) {
    return this.gradeVault.canAccessGradeVault(...args);
  }

  hasGradeVaultUnlockConfig(...args) {
    return this.gradeVault.hasGradeVaultUnlockConfig(...args);
  }

  getGradeVaultStatusMode(...args) {
    return this.gradeVault.getGradeVaultStatusMode(...args);
  }

  setupGradeVault(...args) {
    return this.gradeVault.setupGradeVault(...args);
  }

  unlockGradeVault(...args) {
    return this.gradeVault.unlockGradeVault(...args);
  }

  upgradeGradeVaultKdf(...args) {
    return this.gradeVault.upgradeGradeVaultKdf(...args);
  }

  changeGradeVaultPassword(...args) {
    return this.gradeVault.changeGradeVaultPassword(...args);
  }

  setGradeVaultEncryptionEnabledFromSettings(...args) {
    return this.gradeVault.setGradeVaultEncryptionEnabledFromSettings(...args);
  }

  lockGradeVaultSession(...args) {
    return this.gradeVault.lockGradeVaultSession(...args);
  }

  discardGradeVaultChanges(...args) {
    return this.gradeVault.discardGradeVaultChanges(...args);
  }

  getGradeCourseRevision(...args) {
    return this.courseRepository.getGradeCourseRevision(...args);
  }

  isGradeCourseLoaded(...args) {
    return this.courseRepository.isGradeCourseLoaded(...args);
  }

  getCurrentGradeVaultSnapshot(...args) {
    return this.courseRepository.getCurrentGradeVaultSnapshot(...args);
  }

  normalizeAndAssertGradeCourseSnapshot(...args) {
    return this.courseRepository.normalizeAndAssertGradeCourseSnapshot(...args);
  }

  async ensurePlanningPublicLoaded() {
    return true;
  }

  async saveGradeVaultChanges() {
    return this.isManualPersistenceMode()
      ? this.saveManualDatabase()
      : this.enqueueConnectedFileSave('grade-vault-explicit-save');
  }

  scheduleGradeVaultBackgroundAutoLock(...args) {
    return this.gradeVault.scheduleGradeVaultBackgroundAutoLock(...args);
  }

  handleGradeVaultVisibilityChange(...args) {
    return this.gradeVault.handleGradeVaultVisibilityChange(...args);
  }

  async persistExplicitDatabaseSave() {
    if (!this.isManualPersistenceMode()) return true;
    return this.saveManualDatabase();
  }

  decodeCourse(...args) {
    return this.gradeVault.decodeCourse(...args);
  }

  ensureGradeCourseLoaded(...args) {
    return this.courseRepository.ensureGradeCourseLoaded(...args);
  }

  getGradeCourseRosterSummary(...args) {
    return this.courseRepository.getGradeCourseRosterSummary(...args);
  }

  getGradeCourseStateSnapshot(...args) {
    return this.courseRepository.getGradeCourseStateSnapshot(...args);
  }

  setGradeCourseStudentCounts(...args) {
    return this.courseRepository.setGradeCourseStudentCounts(...args);
  }

  getNameLearningDueCount(...args) {
    return this.courseRepository.getNameLearningDueCount(...args);
  }

  saveNameLearningDueSummary(...args) {
    return this.courseRepository.saveNameLearningDueSummary(...args);
  }

  updateNameLearningDueSummaryForCourse(...args) {
    return this.courseRepository.updateNameLearningDueSummaryForCourse(...args);
  }

  removeNameLearningDueSummaryForCourse(...args) {
    return this.courseRepository.removeNameLearningDueSummaryForCourse(...args);
  }

  refreshNameLearningDueSummary(...args) {
    return this.courseRepository.refreshNameLearningDueSummary(...args);
  }

  getOccurrenceCategoryUsage(...args) {
    return this.courseRepository.getOccurrenceCategoryUsage(...args);
  }

  deleteOccurrenceCategoryData(...args) {
    return this.courseRepository.deleteOccurrenceCategoryData(...args);
  }

  loadGradeCourseNavigationTargetAtomically(...args) {
    return this.courseRepository.loadGradeCourseNavigationTargetAtomically(...args);
  }

  withTemporaryGradeCourse(...args) {
    return this.courseRepository.withTemporaryGradeCourse(...args);
  }

  rememberConfirmedStudentRemovals(...args) {
    return this.courseRepository.rememberConfirmedStudentRemovals(...args);
  }

  runGradeCourseMutation(...args) {
    return this.courseRepository.runGradeCourseMutation(...args);
  }

  loadAllPersistedGradeCoursesForCryptoRewrite(...args) {
    return this.courseRepository.loadAllPersistedGradeCoursesForCryptoRewrite(...args);
  }

  buildPerformanceIndex(...args) {
    return this.courseRepository.buildPerformanceIndex(...args);
  }

  rememberPerformanceIndex(...args) {
    return this.courseRepository.rememberPerformanceIndex(...args);
  }

  buildSeatplanCourseIds(...args) {
    return this.courseRepository.buildSeatplanCourseIds(...args);
  }

  resolvePerformanceIndex(...args) {
    return this.courseRepository.resolvePerformanceIndex(...args);
  }

  decodeCourseSegmentForPlausibility(...args) {
    return this.gradeVault.decodeCourseSegmentForPlausibility(...args);
  }

  getCourseContentSignature(...args) {
    return this.courseRepository.getCourseContentSignature(...args);
  }

  assertCourseContentIsPlausible(...args) {
    return this.courseRepository.assertCourseContentIsPlausible(...args);
  }

  buildContainer(...args) {
    return this.persistence.buildContainer(...args);
  }

  commitPersistedVaultContainer(...args) {
    return this.persistence.commitPersistedVaultContainer(...args);
  }

  loadBytes(...args) {
    return this.persistence.loadBytes(...args);
  }

  readPersistedCourseIds(...args) {
    return this.persistence.readPersistedCourseIds(...args);
  }

  assertContainerKeepsPersistedCourses(...args) {
    return this.courseRepository.assertContainerKeepsPersistedCourses(...args);
  }

  readHandleBytes(...args) {
    return this.persistence.readHandleBytes(...args);
  }

  readDatabaseFileBytes(...args) {
    return this.persistence.readDatabaseFileBytes(...args);
  }

  getDefaultSchoolYearStartYear(date = new Date()) {
    return getDefaultSchoolYearStartYear(date);
  }

  buildEmptyDatabaseContainer(...args) {
    return this.persistence.buildEmptyDatabaseContainer(...args);
  }

  isCurrentWorkspaceFileHandle(...args) {
    return this.persistence.isCurrentWorkspaceFileHandle(...args);
  }

  enqueueFileOperation(operation) {
    const queued = this.operationTail.then(operation, operation);
    this.operationTail = queued.catch(() => undefined);
    return queued;
  }

  getNewWorkspaceFileHandleInDirectory(...args) {
    return this.persistence.getNewWorkspaceFileHandleInDirectory(...args);
  }

  assertEmptyWorkspaceDatabaseTarget(...args) {
    return this.persistence.assertEmptyWorkspaceDatabaseTarget(...args);
  }

  createEmptyWorkspaceFileInDirectory(...args) {
    return this.persistence.createEmptyWorkspaceFileInDirectory(...args);
  }

  createEmptyWorkspaceFileInDirectoryNow(...args) {
    return this.persistence.createEmptyWorkspaceFileInDirectoryNow(...args);
  }

  connectEmptyWorkspaceFileNow(...args) {
    return this.persistence.connectEmptyWorkspaceFileNow(...args);
  }

  acceptWorkspaceSyncFileHandle(...args) {
    return this.persistence.acceptWorkspaceSyncFileHandle(...args);
  }

  acceptWorkspaceSyncFileHandleNow(...args) {
    return this.persistence.acceptWorkspaceSyncFileHandleNow(...args);
  }

  acceptWorkspaceBackupDirectoryHandle(...args) {
    return this.backup.acceptWorkspaceBackupDirectoryHandle(...args);
  }

  saveToConnectedFile(...args) {
    return this.persistence.saveToConnectedFile(...args);
  }

  enqueueConnectedFileSave(reason = 'save') {
    if (this.isManualPersistenceMode() || !this.fileHandle) return Promise.resolve(false);
    const save = () => this.saveToConnectedFile(reason);
    const operation = this.operationTail.then(save, save);
    this.operationTail = operation.catch(() => undefined);
    return operation;
  }

  queueSyncSave(reason = 'auto-save') {
    if (this.isManualPersistenceMode() || !this.fileHandle) return false;
    const operation = this.enqueueConnectedFileSave(reason);
    void operation.catch((error) => this.recordPersistenceFailure(error));
    return true;
  }

  saveManualDatabase(...args) {
    return this.persistence.saveManualDatabase(...args);
  }

  createEmptyManualDatabase(...args) {
    return this.persistence.createEmptyManualDatabase(...args);
  }

  loadManualDatabaseFromFile(...args) {
    return this.persistence.loadManualDatabaseFromFile(...args);
  }

  createLatestWebBackup(...args) {
    return this.backup.createLatestWebBackup(...args);
  }

  maybeRunAutomaticWebBackup(...args) {
    return this.backup.maybeRunAutomaticWebBackup(...args);
  }

  restoreLatestWebBackup(...args) {
    return this.backup.restoreLatestWebBackup(...args);
  }

  exportBackup(...args) {
    return this.backup.exportBackup(...args);
  }

  importBackupFromFile(...args) {
    return this.backup.importBackupFromFile(...args);
  }

  bindStartupPermissionRecovery() {
    if (this.ephemeral || this.startupPermissionRecovery) return false;
    if (!this.eventTarget?.addEventListener) return false;
    const queue = [];
    if (this.storedFileHandle && !this.fileHandle) queue.push('sync-file');
    if (this.storedBackupDirectoryHandle && !this.backupDirectoryHandle) queue.push('backup-directory');
    if (!queue.length) return false;

    const types = ['pointerdown', 'keydown', 'touchstart'];
    const state = { queue, busy: false, detach: () => {} };
    const onGesture = () => {
      if (state.busy || !state.queue.length) return;
      const step = state.queue.shift();
      state.busy = true;
      const settle = (reconnected) => {
        state.busy = false;
        if (reconnected) this.controller?.markChanged?.('shell');
        if (!reconnected || !state.queue.length) state.detach();
      };
      const attempt = step === 'sync-file'
        ? this.tryReconnectStoredSyncFile({ allowPrompt: true })
        : this.ensureBackupDirectoryReady({ allowPrompt: true });
      void attempt.then((changed) => settle(Boolean(changed)), () => settle(false));
    };
    for (const type of types) {
      this.eventTarget.addEventListener(type, onGesture, { passive: true });
    }
    state.detach = () => {
      state.queue.length = 0;
      for (const type of types) {
        this.eventTarget.removeEventListener?.(type, onGesture);
      }
      if (this.startupPermissionRecovery === state) this.startupPermissionRecovery = null;
    };
    this.startupPermissionRecovery = state;
    return true;
  }

  tryReconnectStoredSyncFile(...args) {
    return this.persistence.tryReconnectStoredSyncFile(...args);
  }

  runStoredSyncFileReconnect(...args) {
    return this.persistence.runStoredSyncFileReconnect(...args);
  }

  ensureHandleReadWritePermission(...args) {
    return this.persistence.ensureHandleReadWritePermission(...args);
  }

  ensureBackupDirectoryReady(...args) {
    return this.backup.ensureBackupDirectoryReady(...args);
  }

  openHandleDb(...args) {
    return this.persistence.openHandleDb(...args);
  }

  storeHandle(...args) {
    return this.persistence.storeHandle(...args);
  }

  loadStoredHandle(...args) {
    return this.persistence.loadStoredHandle(...args);
  }

  removeStoredHandle(...args) {
    return this.persistence.removeStoredHandle(...args);
  }

  async applyWorkspacePublicState(publicState) {
    const incoming = this.store.normalizePublicState(publicState);
    const existingIds = new Set(this.store.state.courses.map((course) => Number(course.id)));
    const incomingIds = new Set(incoming.courses.map((course) => Number(course.id)));
    for (const id of existingIds) {
      if (!incomingIds.has(id)) throw new Error('Kurse dürfen nur über eine ausdrücklich bestätigte Löschung entfernt werden.');
    }
    this.store.importDatabaseState(incoming, this.store.exportGradeVaultStateSnapshot());
    return { changed: true, scope: 'planning' };
  }

  async handleWorkspaceCommand(request = {}) {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    const command = String(request.command || '');
    const schoolYearId = Number(payload.schoolYearId) || 0;
    const courseId = Number(payload.courseId) || 0;
    if (command === WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX) {
      const assessmentIndex = await this.resolvePerformanceIndex(payload.courseIds);
      return {
        changed: false,
        scope: 'planning',
        assessmentIndex,
        assessmentIndexResolvedCourseIds: payload.courseIds || [],
        seatplanCourseIds: this.buildSeatplanCourseIds(payload.courseIds),
      };
    }
    if (command === WORKSPACE_COMMAND_CREATE_COURSE) {
      const id = this.store.createCourse(schoolYearId, payload.name, payload.color, payload.noLesson, payload.hiddenInSidebar, payload.subject, payload.gradeLevel);
      if (!id) throw new Error('Kursname bereits vorhanden oder Kursdaten ungültig.');
      return { changed: true, scope: 'planning', courseId: id };
    }
    if (command === WORKSPACE_COMMAND_UPDATE_COURSE) {
      const current = this.store.state.courses.find((course) => Number(course.id) === courseId && Number(course.schoolYearId) === schoolYearId);
      if (!current) throw new Error('Kurs nicht gefunden.');
      const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : payload;
      const value = (name, fallback) => Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : fallback;
      if (!this.store.updateCourse(schoolYearId, courseId, value('name', current.name), value('color', current.color), value('noLesson', current.noLesson), value('hiddenInSidebar', current.hiddenInSidebar), value('subject', current.subject), value('gradeLevel', current.gradeLevel))) {
        throw new Error('Kurs konnte nicht aktualisiert werden.');
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'hiddenInNameLearning')) {
        this.store.setCourseNameLearningHidden(schoolYearId, courseId, Boolean(fields.hiddenInNameLearning));
      }
      if (Object.prototype.hasOwnProperty.call(fields, 'noGrades')) {
        this.store.setCourseNoGrades(schoolYearId, courseId, Boolean(fields.noGrades));
      }
      return { changed: true, scope: 'planning', courseId };
    }
    if (command === WORKSPACE_COMMAND_REORDER_COURSES) {
      this.store.updateCourseOrder(schoolYearId, Array.isArray(payload.orderedIds) ? payload.orderedIds : []);
      return { changed: true, scope: request.client === 'grades' ? 'grades' : 'planning' };
    }
    if (command === WORKSPACE_COMMAND_DELETE_COURSE) {
      if (payload.destructive !== true) throw new Error('Kurslöschung wurde nicht ausdrücklich bestätigt.');
      this.store.deleteCourse(courseId);
      this.removeNameLearningDueSummaryForCourse(courseId);
      this.courseRepository.deleteCourseData(courseId);
      return { changed: true, scope: 'planning' };
    }
    if (command === WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY) {
      if (request.client !== 'grades' || payload.destructive !== true) {
        throw new Error('Das Löschen von Vorkommnissen muss ausdrücklich bestätigt werden.');
      }
      const deleted = await this.deleteOccurrenceCategoryData(payload.categoryId);
      return { changed: deleted > 0, scope: 'grades', deleted };
    }
    if (command === WORKSPACE_COMMAND_APPLY_SETTINGS) {
      const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
      const allowed = request.client === 'grades' ? GRADES_SETTING_KEYS : PLANNING_SETTING_KEYS;
      const unknownKeys = Object.keys(settings).filter((key) => !allowed.has(key));
      if (unknownKeys.length) throw new Error(`Unzulässige Einstellungsfelder: ${unknownKeys.join(', ')}`);
      for (const [key, value] of Object.entries(settings)) {
        if (key === 'hoursPerDay') this.store.setHoursPerDay(value);
        else if (key === 'lessonTimes') this.store.setLessonTimes(value, settings.hoursPerDay ?? this.store.getHoursPerDay());
        else if (key === 'backupEnabled') this.store.setBackupEnabled(value);
        else if (key === 'backupIntervalDays') this.store.setBackupIntervalDays(value);
        else if (key === 'gradeOccurrenceCategories') this.store.setGradeOccurrenceCategories(value);
        else if (key === 'gradeVaultAutoLockMinutes') this.store.setGradeVaultAutoLockMinutes(value);
        else if (key === 'gradeVaultAutoLockOnBackground') this.store.setGradeVaultAutoLockOnBackground(value);
        else if (key === 'gradeVaultAutoSaveBeforeLock') this.store.setGradeVaultAutoSaveBeforeLock(value);
        else this.store.setSetting?.(key, clone(value));
      }
      if (
        request.client === 'grades'
        && (
          Object.hasOwn(settings, 'gradeVaultAutoLockMinutes')
          || Object.hasOwn(settings, 'gradeVaultAutoLockOnBackground')
          || Object.hasOwn(settings, 'gradeVaultAutoSaveBeforeLock')
        )
        && this.isGradeVaultUnlocked()
      ) this.scheduleGradeVaultAutoLock();
      return { changed: true, scope: request.client === 'grades' ? 'grades' : 'planning' };
    }
    const error = new Error(`Unbekannter Workspace-Befehl: ${command || 'leer'}`);
    error.code = 'UNSUPPORTED';
    throw error;
  }

  async handleWorkspaceAction(action = '', detail = null) {
    const name = String(action || '').toLowerCase();
    if (name === 'manual-save') return { changed: await this.saveManualDatabase(detail), scope: 'shell' };
    if (name === 'explicit-save') return { changed: await this.persistExplicitDatabaseSave(detail), scope: 'shell' };
    if (name === 'manual-create-empty') return { changed: await this.createEmptyManualDatabase(detail), scope: 'shell' };
    if (name === 'manual-load') return { changed: await this.loadManualDatabaseFromFile(detail?.file), scope: 'shell' };
    if (name === 'sync-connect') return { changed: await this.acceptWorkspaceSyncFileHandle(detail?.handle, detail?.mode), scope: 'shell' };
    if (name === 'sync-create-empty') return { changed: await this.createEmptyWorkspaceFileInDirectory(detail?.directoryHandle, detail), scope: 'shell' };
    if (name === 'sync-reconnect') return { changed: await this.tryReconnectStoredSyncFile({ allowPrompt: detail?.allowPrompt === true }), scope: 'shell' };
    if (name === 'backup-directory-connect') return { changed: await this.acceptWorkspaceBackupDirectoryHandle(detail?.handle), scope: 'shell' };
    if (name === 'backup-directory-reconnect') return { changed: await this.ensureBackupDirectoryReady({ allowPrompt: detail?.allowPrompt === true }), scope: 'shell' };
    if (name === 'sync-save') return { changed: await this.enqueueConnectedFileSave(detail?.reason), scope: 'shell' };
    if (name === 'backup-create') return { changed: await this.createLatestWebBackup(detail?.mode, detail?.silent), scope: 'shell' };
    if (name === 'backup-auto') return { changed: await this.maybeRunAutomaticWebBackup(), scope: 'shell' };
    if (name === 'backup-restore') return { changed: await this.restoreLatestWebBackup(), scope: 'shell' };
    if (name === 'backup-export') return { changed: false, value: await this.exportBackup(), scope: 'shell' };
    if (name === 'backup-import') return { changed: await this.importBackupFromFile(detail?.file), scope: 'shell' };
    if (name === 'vault-setup') return { changed: await this.setupGradeVault(detail?.password), scope: 'grades' };
    if (name === 'vault-unlock') return { changed: await this.unlockGradeVault(detail?.password), scope: 'grades' };
    if (name === 'vault-change-password') return { changed: await this.changeGradeVaultPassword(detail?.currentPassword, detail?.password), scope: 'grades' };
    if (name === 'vault-encryption-mode') return { changed: await this.setGradeVaultEncryptionEnabledFromSettings(detail?.enabled), scope: 'grades' };
    if (name === 'vault-lock') return { changed: await this.lockGradeVaultSession(), scope: 'grades' };
    if (name === 'archive-generate') {
      const gradesClient = this.clients.get('grades');
      const planningClient = this.clients.get('planning');
      const options = detail?.options || {};
      const publicState = this.store.exportPublicStateSnapshot();
      const yearId = Number(publicState?.settings?.activeSchoolYearId || 0);
      const year = publicState.schoolYears?.find((item) => Number(item.id) === yearId) || publicState.schoolYears?.[0];
      if (!year) throw new Error('Kein aktives Schuljahr gefunden.');
      const sections = [];
      if (options.exportPlanning) {
        if (!planningClient?.collectArchivePlanningSections) throw new Error('Planungsarchiv ist noch nicht bereit.');
        sections.push(...await planningClient.collectArchivePlanningSections(year, options));
      }
      if (options.exportGrades) {
        if (!gradesClient?.collectArchiveGradeSections) throw new Error('Notenarchiv ist noch nicht bereit.');
        sections.push(...await gradesClient.collectArchiveGradeSections(year, options));
      }
      if (!sections.length) throw new Error('Für die gewählte Auswahl wurden keine Daten gefunden.');
      const bytes = await buildWorkspaceArchivePdfBytes(year, sections);
      downloadWorkspaceArchivePdf(bytes, year);
      return { changed: false, value: { sectionCount: sections.length }, scope: 'shell' };
    }
    const error = new Error(`Unbekannte Workspace-Aktion: ${name || 'leer'}`);
    error.code = 'UNSUPPORTED';
    throw error;
  }
}

export function createWorkspaceRuntime(store, options = {}) {
  return new WorkspaceRuntime(store, options);
}
