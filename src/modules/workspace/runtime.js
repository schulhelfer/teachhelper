import {
  buildThdb1ContainerBytes,
  getThdb1FileHash,
  parseThdb1ContainerBytes,
} from '../../shared/school-data/thdb.js';
import { writeAndVerifyFileBytes } from '../../shared/school-data/sync-safety.js';
import {
  APP_DB_SCHEMA,
  APP_DB_SCHEMA_LEGACY,
  APP_DB_STARTUP_SHELL_SCHEMA,
  GRADE_COURSE_SCHEMA,
  GRADE_VAULT_CONFIG_SCHEMA,
  GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
} from '../../shared/school-data/defaults.js';
import {
  WORKSPACE_COMMAND_APPLY_SETTINGS,
  WORKSPACE_COMMAND_CREATE_COURSE,
  WORKSPACE_COMMAND_DELETE_COURSE,
  WORKSPACE_COMMAND_DELETE_OCCURRENCE_CATEGORY,
  WORKSPACE_COMMAND_GET_PERFORMANCE_INDEX,
  WORKSPACE_COMMAND_REORDER_COURSES,
  WORKSPACE_COMMAND_UPDATE_COURSE,
  WORKSPACE_ERROR_PERSISTENCE_CONFLICT,
  WORKSPACE_ERROR_VAULT_DIRTY,
  WORKSPACE_ERROR_VAULT_LOCKED,
} from '../../shared/school-data/messages.js';
import { getDefaultSchoolYearStartYear } from './store.js';
import {
  createWorkspaceVaultKdf,
  decryptWorkspaceVaultText,
  deriveWorkspaceVaultKey,
  encryptWorkspaceVaultText,
  normalizeWorkspaceVaultKdf,
  WORKSPACE_VAULT_KDF_ITERATIONS,
} from './crypto.js';
import { buildWorkspaceArchivePdfBytes, downloadWorkspaceArchivePdf } from './archive-pdf.js';

const VAULT_VALIDATION_TOKEN = 'teachhelper-grade-vault-v1';
const HANDLE_DB_NAME = 'teachhelper-sync-handles-v1';
const HANDLE_STORE_NAME = 'handles';
const HANDLE_FILE_KEY = 'sync-file';
const HANDLE_BACKUP_KEY = 'backup-dir';
const AUTO_LOCK_MS = 45 * 60 * 1000;
const AUTO_LOCK_RETRY_MS = 10 * 60 * 1000;
const PLANNING_SETTING_KEYS = new Set([
  'hoursPerDay',
  'lessonTimes',
  'showHiddenSidebarCourses',
  'backupEnabled',
  'backupIntervalDays',
]);
const GRADES_SETTING_KEYS = new Set([
  'gradesPrivacyGraphThreshold',
  'showHiddenSidebarCourses',
  'showGradeStudentPortraits',
  'gradeTestScaleSettings',
  'gradeOccurrenceCategories',
  'defaultGradeStructure',
  'expectationHorizonLocation',
  'expectationHorizonCommentTemplate',
  'backupEnabled',
  'backupIntervalDays',
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
    'gradeAccommodations',
  ].some((key) => (
    Array.isArray(state[key])
    && state[key].some((entry) => Number(entry?.courseId) === id)
  ));
}

function normalizeVaultConfig(raw = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const configured = Boolean(source.configured && source.kdf && source.validation);
  return {
    schema: GRADE_VAULT_CONFIG_SCHEMA,
    configured,
    kdf: configured ? normalizeWorkspaceVaultKdf(source.kdf) : null,
    validation: configured ? clone(source.validation, null) : null,
  };
}

function vaultConfigsEqual(left, right) {
  return JSON.stringify(normalizeVaultConfig(left)) === JSON.stringify(normalizeVaultConfig(right));
}

function parseCourseSegment(text = '') {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (parsed?.schema === GRADE_COURSE_SCHEMA) {
      return { encrypted: false, state: parsed };
    }
    if (parsed?.schema === 'teachhelper-grade-vault-v1' && parsed?.ciphertext) {
      return { encrypted: true, envelope: parsed };
    }
  } catch {
    // Invalid data is rejected by the caller with a stable error message.
  }
  return null;
}

function buildStartupShell(publicState, configured, gradeEntryCount = null) {
  const activeSchoolYearId = Number(publicState?.settings?.activeSchoolYearId || 0) || null;
  return {
    schema: APP_DB_STARTUP_SHELL_SCHEMA,
    activeSchoolYearId,
    schoolYears: (Array.isArray(publicState?.schoolYears) ? publicState.schoolYears : []).map((year) => ({
      id: Number(year.id) || 0,
      name: String(year.name || ''),
      startDate: String(year.startDate || ''),
      endDate: String(year.endDate || ''),
    })),
    courses: (Array.isArray(publicState?.courses) ? publicState.courses : []).map((course) => ({
      id: Number(course.id) || 0,
      schoolYearId: Number(course.schoolYearId) || 0,
      name: String(course.name || ''),
      subject: String(course.subject || ''),
      color: String(course.color || ''),
      noLesson: Boolean(course.noLesson),
      noGrades: Boolean(course.noGrades),
      hiddenInSidebar: Boolean(course.hiddenInSidebar),
      sortOrder: Number(course.sortOrder || 0),
    })),
    gradeVaultConfigured: Boolean(configured),
    gradeEntryCount: Number.isFinite(gradeEntryCount) ? Math.max(0, Number(gradeEntryCount) || 0) : null,
  };
}

function persistedCourseFromState(store, courseId, rawState = null) {
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
    gradeAccommodations: state.gradeAccommodations.filter((row) => Number(row.courseId) === id).map((row) => {
      const copy = clone(row, {});
      delete copy.courseId;
      return copy;
    }),
  };
}

function runtimeCourseFromPersisted(store, courseId, persisted) {
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
    gradeAccommodations: withCourse(persisted.gradeAccommodations),
  });
}

function downloadBytes(bytes, fileName) {
  // Ein JSON-MIME-Type kann bei einem nachgelagerten Navigations-Fallback im
  // Browser sichtbar geöffnet werden. Die Dateiendung bleibt .json, der Blob
  // selbst wird jedoch bewusst als Download behandelt.
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(fileName || 'TeachHelper-Datenbank.json');
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Der Browser darf die Blob-URL noch lesen, bevor sie freigegeben wird.
  // Ein sofortiger Widerruf kann den Download je nach Browser verhindern.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export class WorkspaceRuntime {
  constructor(store, {
    eventTarget = globalThis.window || new EventTarget(),
    ephemeral = false,
  } = {}) {
    this.store = store;
    this.eventTarget = eventTarget;
    this.ephemeral = Boolean(ephemeral);
    this.controller = null;
    this.clients = new Map();
    this.ready = true;
    this.fileHandle = null;
    this.storedFileHandle = null;
    this.backupDirectoryHandle = null;
    this.storedBackupDirectoryHandle = null;
    this.fileName = '';
    this.knownRevision = 0;
    this.knownFileHash = '';
    this.deviceId = randomId();
    this.manualLoaded = false;
    this.manualDirty = false;
    this.publicDirty = false;
    this.segmentTexts = new Map();
    this.courseCache = new Map();
    // Planning may retain this deliberately redacted index while the vault is
    // locked. No roster, result or grade value is ever stored here.
    this.performanceIndexCache = new Map();
    this.dirtyCourseIds = new Set();
    this.courseRevisions = new Map();
    this.loadedCourseId = null;
    this.courseLoadTail = Promise.resolve();
    this.gradeCourseMutationActiveCourseId = null;
    this.operationTail = Promise.resolve();
    this.vault = {
      encryptionEnabled: GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
      configured: false,
      unlocked: false,
      config: normalizeVaultConfig(null),
      // Last successfully persisted configuration. It lets a user discard a
      // pending KDF/password/encryption change without breaking the ciphertext
      // that is still stored on disk.
      persistedConfig: normalizeVaultConfig(null),
      persistedCryptoKey: null,
      cryptoKey: null,
      kdf: null,
      lastActivityAt: 0,
      autoLockTimer: 0,
      autoLockWarning: null,
    };
    this.store.setAfterSaveHooks({
      publicChange: () => this.onPublicChanged(),
      gradeVaultChange: () => this.onGradeChanged(),
    });
    this.bindAutoLock();
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
    this.ready = true;
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

  buildSyncFileSuggestedName() {
    const year = this.store.getActiveSchoolYear?.();
    const now = new Date();
    const fallbackStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const parsedStart = Number(String(year?.startDate || '').slice(0, 4));
    const parsedEnd = Number(String(year?.endDate || '').slice(0, 4));
    const start = Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : fallbackStart;
    const end = Number.isFinite(parsedEnd) && parsedEnd > 0 ? parsedEnd : start + 1;
    const short = (value) => String(Math.trunc(value) % 100).padStart(2, '0');
    return `TeachHelper-Datenbank-${short(start)}-${short(end)}.json`;
  }

  registerFeatureClient(scope, client) {
    const key = String(scope || '').trim().toLowerCase();
    if (!key || !client) return () => {};
    this.clients.set(key, client);
    return () => {
      if (this.clients.get(key) === client) this.clients.delete(key);
    };
  }

  bindAutoLock() {
    if (!this.eventTarget?.addEventListener) return;
    const record = () => this.recordGradeVaultActivity();
    for (const type of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart']) {
      this.eventTarget.addEventListener(type, record, { passive: true });
    }
  }

  recordGradeVaultActivity() {
    if (!this.vault.unlocked) return;
    this.vault.lastActivityAt = Date.now();
    this.scheduleGradeVaultAutoLock(AUTO_LOCK_MS);
  }

  clearGradeVaultAutoLockTimer() {
    clearTimeout(this.vault.autoLockTimer);
    this.vault.autoLockTimer = 0;
  }

  scheduleGradeVaultAutoLock(delayMs = AUTO_LOCK_MS) {
    this.clearGradeVaultAutoLockTimer();
    if (!this.isGradeVaultUnlocked()) return;
    const timeoutMs = Math.max(0, Number(delayMs) || 0);
    this.vault.autoLockTimer = setTimeout(() => {
      void this.handleGradeVaultAutoLockTimeout().catch(() => undefined);
    }, timeoutMs);
  }

  clearGradeVaultAutoLockWarning() {
    if (!this.vault.autoLockWarning) return false;
    this.vault.autoLockWarning = null;
    return true;
  }

  async handleGradeVaultAutoLockTimeout() {
    try {
      const autoLock = async () => {
        if (!this.isGradeVaultUnlocked()) {
          this.clearGradeVaultAutoLockTimer();
          return false;
        }
        if (this.dirtyCourseIds.size > 0) {
          await this.saveDirtyGradeVaultChangesForAutoLock();
        }
        const locked = await this.lockGradeVaultSession();
        if (locked || !this.isGradeVaultUnlocked()) return locked;
        throw new Error('Die Noten-Datenbank konnte nicht automatisch gesperrt werden.');
      };
      const promise = this.operationTail.then(autoLock, autoLock);
      this.operationTail = promise.catch(() => undefined);
      return await promise;
    } catch (error) {
      if (!this.isGradeVaultUnlocked()) return false;
      const previousWarning = this.vault.autoLockWarning;
      const blockedAt = Number(previousWarning?.blockedAt) || Date.now();
      const retryAt = Date.now() + AUTO_LOCK_RETRY_MS;
      this.vault.autoLockWarning = {
        active: true,
        blockedAt,
        retryAt,
        message: error instanceof Error && error.message
          ? error.message
          : 'Ungespeicherte Notenänderungen verhindern das automatische Sperren.',
      };
      this.controller?.markChanged?.('grades');
      this.scheduleGradeVaultAutoLock(AUTO_LOCK_RETRY_MS);
      return false;
    }
  }

  async saveDirtyGradeVaultChangesForAutoLock() {
    if (this.dirtyCourseIds.size === 0) return false;
    if (this.isManualPersistenceMode()) {
      throw new Error('Automatisches Speichern ist im manuellen Download-Modus nicht möglich. Bitte speichere die Noten manuell.');
    }
    if (!this.fileHandle) {
      throw new Error('Automatisches Speichern ist nicht möglich, weil keine Datenbankdatei verbunden ist. Bitte verbinde oder speichere die Noten manuell.');
    }
    const saved = await this.saveToConnectedFile('grade-vault-auto-lock');
    if (!saved || this.dirtyCourseIds.size > 0) {
      throw new Error('Die Noten-Datenbank konnte vor dem automatischen Sperren nicht vollständig gespeichert werden.');
    }
    return true;
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
    const courseId = Number(this.loadedCourseId) || 0;
    if (courseId) {
      this.courseCache.set(courseId, this.store.exportGradeVaultStateSnapshot());
      this.rememberPerformanceIndex(courseId, this.courseCache.get(courseId));
      this.dirtyCourseIds.add(courseId);
      this.courseRevisions.set(courseId, this.getGradeCourseRevision(courseId) + 1);
    }
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
        statusText: '',
        statusError: false,
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
        setupRequired: this.isGradeVaultEncryptionEnabled() && !this.isGradeVaultConfigured(),
        autoLockWarning: this.vault.autoLockWarning
          ? {
            active: true,
            blockedAt: Number(this.vault.autoLockWarning.blockedAt) || 0,
            retryAt: Number(this.vault.autoLockWarning.retryAt) || 0,
            message: String(this.vault.autoLockWarning.message || ''),
          }
          : { active: false, blockedAt: 0, retryAt: 0, message: '' },
      },
    };
    if (normalized === 'planning') {
      return {
        publicState: this.store.exportPublicStateSnapshot(),
        assessmentIndex: this.buildPerformanceIndex([...this.performanceIndexCache.keys()]),
        assessmentIndexResolvedCourseIds: [...this.performanceIndexCache.keys()],
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
    return typeof globalThis.showOpenFilePicker === 'function' && typeof globalThis.showSaveFilePicker === 'function';
  }

  isManualPersistenceMode() {
    return !this.isExternalFileSyncPresentationSupported();
  }

  isManualPersistencePresentationMode() {
    return this.isManualPersistenceMode();
  }

  shouldPromptForManualDatabaseOnStartup() {
    return this.isManualPersistenceMode() && !this.manualLoaded;
  }

  isGradeVaultEncryptionEnabled() {
    return Boolean(this.vault.encryptionEnabled || this.store.getGradeVaultEncryptionEnabled());
  }

  isGradeVaultConfigured() {
    return Boolean(this.isGradeVaultEncryptionEnabled() && this.vault.configured);
  }

  isGradeVaultUnlocked() {
    return Boolean(this.isGradeVaultConfigured() && this.vault.unlocked && this.vault.cryptoKey);
  }

  canAccessGradeVault() {
    return !this.isGradeVaultEncryptionEnabled() || this.isGradeVaultUnlocked();
  }

  hasGradeVaultUnlockConfig() {
    return Boolean(this.vault.configured && this.vault.config?.kdf && this.vault.config?.validation);
  }

  getGradeVaultStatusMode() {
    if (!this.isGradeVaultEncryptionEnabled()) return 'off';
    if (!this.isGradeVaultConfigured()) return 'setup';
    return this.isGradeVaultUnlocked() ? 'ready' : 'unlock';
  }

  async setupGradeVault(password, { coursesLoaded = false } = {}) {
    if (String(password || '').length < 12) throw new Error('Das Passwort muss mindestens 12 Zeichen lang sein.');
    if (!coursesLoaded && this.segmentTexts.size) {
      await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    }
    const previousCryptoKey = this.vault.cryptoKey;
    if (
      this.vault.persistedConfig?.configured
      && this.vault.config?.configured
      && previousCryptoKey
      && !this.vault.persistedCryptoKey
    ) {
      this.vault.persistedCryptoKey = previousCryptoKey;
    }
    const kdf = createWorkspaceVaultKdf();
    const { cryptoKey } = await deriveWorkspaceVaultKey(password, kdf);
    const validation = await encryptWorkspaceVaultText(VAULT_VALIDATION_TOKEN, cryptoKey, kdf, { type: 'validation' });
    this.vault = {
      ...this.vault,
      encryptionEnabled: true,
      configured: true,
      unlocked: true,
      config: { schema: GRADE_VAULT_CONFIG_SCHEMA, configured: true, kdf, validation },
      cryptoKey,
      kdf,
    };
    this.store.setGradeVaultEncryptionEnabled(true);
    for (const courseId of this.segmentTexts.keys()) this.dirtyCourseIds.add(courseId);
    this.recordGradeVaultActivity();
    this.controller?.markChanged?.('grades');
    return true;
  }

  async unlockGradeVault(password) {
    if (!this.hasGradeVaultUnlockConfig()) throw new Error('Der geschützte Notenbereich ist nicht vollständig eingerichtet.');
    const { cryptoKey, kdf } = await deriveWorkspaceVaultKey(password, this.vault.config.kdf);
    const validation = await decryptWorkspaceVaultText(this.vault.config.validation, cryptoKey, kdf, { type: 'validation' });
    if (validation !== VAULT_VALIDATION_TOKEN) throw new Error('Passwort falsch oder Notendaten beschädigt.');
    this.vault.unlocked = true;
    this.vault.cryptoKey = cryptoKey;
    this.vault.kdf = kdf;
    // The KDF parameters live in the persisted vault configuration. Existing
    // files can therefore be read with their original parameters and, after a
    // successful unlock, upgraded before their next regular save.
    try {
      await this.upgradeGradeVaultKdf(password);
    } catch {
      // A damaged or otherwise unreadable course must not turn a successful
      // password verification into a failed unlock. The legacy parameters are
      // kept unchanged and the course still reports its own read error later.
    }
    this.recordGradeVaultActivity();
    this.controller?.markChanged?.('grades');
    return true;
  }

  async upgradeGradeVaultKdf(password) {
    const currentKdf = normalizeWorkspaceVaultKdf(this.vault.config?.kdf);
    if (currentKdf.iterations >= WORKSPACE_VAULT_KDF_ITERATIONS) return false;

    // Complete all decryptions with the verified legacy key first. Nothing is
    // changed until this preparation and creation of the stronger key succeed.
    const courseIds = new Set([
      ...this.segmentTexts.keys(),
      ...this.courseCache.keys(),
      ...(this.loadedCourseId ? [this.loadedCourseId] : []),
    ]);
    const rewrittenStates = new Map(this.courseCache);
    for (const courseId of courseIds) {
      if (rewrittenStates.has(courseId)) continue;
      const text = this.segmentTexts.get(courseId) || '';
      const state = text
        ? await this.decodeCourse(courseId, text)
        : emptyGradeState(this.store);
      rewrittenStates.set(courseId, state);
    }

    const nextKdf = createWorkspaceVaultKdf();
    const { cryptoKey: nextCryptoKey } = await deriveWorkspaceVaultKey(password, nextKdf);
    const validation = await encryptWorkspaceVaultText(
      VAULT_VALIDATION_TOKEN,
      nextCryptoKey,
      nextKdf,
      { type: 'validation' },
    );

    this.vault.persistedCryptoKey = this.vault.cryptoKey;
    this.vault.config = {
      schema: GRADE_VAULT_CONFIG_SCHEMA,
      configured: true,
      kdf: nextKdf,
      validation,
    };
    this.vault.cryptoKey = nextCryptoKey;
    this.vault.kdf = nextKdf;
    this.courseCache = rewrittenStates;
    if (this.loadedCourseId && rewrittenStates.has(this.loadedCourseId)) {
      this.store.replaceGradeVaultState(rewrittenStates.get(this.loadedCourseId));
    }
    for (const courseId of courseIds) this.dirtyCourseIds.add(courseId);
    return true;
  }

  async changeGradeVaultPassword(currentPassword, nextPassword) {
    await this.unlockGradeVault(currentPassword);
    await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    return this.setupGradeVault(nextPassword, { coursesLoaded: true });
  }

  async setGradeVaultEncryptionEnabledFromSettings(enabled) {
    const next = Boolean(enabled);
    if (next === this.isGradeVaultEncryptionEnabled()) return true;
    if (next) return false;
    if (!this.isGradeVaultUnlocked()) throw new Error('Der geschützte Notenbereich muss zuerst entsperrt sein.');
    await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    this.vault.encryptionEnabled = false;
    this.vault.configured = false;
    this.vault.unlocked = false;
    this.vault.config = normalizeVaultConfig(null);
    this.vault.persistedCryptoKey = null;
    this.vault.cryptoKey = null;
    this.vault.kdf = null;
    this.clearGradeVaultAutoLockTimer();
    this.clearGradeVaultAutoLockWarning();
    this.store.setGradeVaultEncryptionEnabled(false);
    this.controller?.markChanged?.('grades');
    return true;
  }

  async lockGradeVaultSession() {
    if (!this.isGradeVaultEncryptionEnabled()) return false;
    if (this.dirtyCourseIds.size > 0) {
      const error = new Error('Ungespeicherte Notenänderungen müssen vor dem Sperren gespeichert werden.');
      error.code = WORKSPACE_ERROR_VAULT_DIRTY;
      throw error;
    }
    if (this.loadedCourseId) {
      this.rememberPerformanceIndex(this.loadedCourseId, this.store.exportGradeVaultStateSnapshot());
    }
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
    this.courseCache.clear();
    this.loadedCourseId = null;
    this.vault.unlocked = false;
    this.vault.cryptoKey = null;
    this.vault.persistedCryptoKey = null;
    this.vault.kdf = this.vault.config?.kdf || null;
    this.clearGradeVaultAutoLockTimer();
    this.clearGradeVaultAutoLockWarning();
    this.controller?.markChanged?.('grades');
    return true;
  }

  async discardGradeVaultChanges() {
    if (!this.dirtyCourseIds.size) return false;
    const persistedConfig = normalizeVaultConfig(this.vault.persistedConfig);
    const configChanged = !vaultConfigsEqual(this.vault.config, persistedConfig);
    if (configChanged && persistedConfig.configured && !this.vault.persistedCryptoKey) {
      throw new Error('Die ausstehende Verschlüsselungsänderung kann in dieser Sitzung nicht sicher verworfen werden. Bitte speichere die Datenbank oder lade sie erneut.');
    }

    this.courseCache.clear();
    this.performanceIndexCache.clear();
    this.courseRevisions.clear();
    this.dirtyCourseIds.clear();
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
    this.loadedCourseId = null;
    this.manualDirty = Boolean(this.publicDirty);
    this.clearGradeVaultAutoLockWarning();

    if (configChanged) {
      this.vault.config = persistedConfig;
      this.vault.configured = Boolean(persistedConfig.configured);
      this.vault.encryptionEnabled = Boolean(persistedConfig.configured);
      this.vault.cryptoKey = persistedConfig.configured ? this.vault.persistedCryptoKey : null;
      this.vault.kdf = persistedConfig.kdf;
      this.store.setGradeVaultEncryptionEnabled(Boolean(persistedConfig.configured));
    }
    this.controller?.markChanged?.('grades');
    return true;
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

  async ensurePlanningPublicLoaded() {
    return true;
  }

  async saveGradeVaultChanges() {
    return this.isManualPersistenceMode()
      ? this.saveManualDatabase()
      : this.saveToConnectedFile('grade-vault-explicit-save');
  }

  async persistExplicitDatabaseSave() {
    if (!this.isManualPersistenceMode()) return true;
    return this.saveManualDatabase();
  }

  async decodeCourse(courseId, text) {
    const parsed = parseCourseSegment(text);
    if (!parsed) throw new Error(`Notensegment für Kurs ${courseId} ist ungültig.`);
    let persisted = parsed.state;
    if (parsed.encrypted) {
      if (!this.isGradeVaultUnlocked()) {
        const error = new Error('Das Notenmodul ist gesperrt.');
        error.code = WORKSPACE_ERROR_VAULT_LOCKED;
        throw error;
      }
      const plaintext = await decryptWorkspaceVaultText(
        parsed.envelope,
        this.vault.cryptoKey,
        this.vault.kdf || parsed.envelope.kdf,
        { type: 'course', courseId },
      );
      persisted = JSON.parse(plaintext);
    }
    return runtimeCourseFromPersisted(this.store, courseId, persisted);
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
      if (publish) this.controller?.publish?.('grades');
      return true;
    };
    const pending = this.courseLoadTail.then(load, load);
    this.courseLoadTail = pending.catch(() => undefined);
    return pending;
  }

  async getGradeCourseRosterSummary(courseId) {
    const id = Number(courseId) || 0;
    if (!id || !this.canAccessGradeVault()) return null;
    let state = this.loadedCourseId === id
      ? this.store.exportGradeVaultStateSnapshot()
      : this.courseCache.get(id) || null;
    if (!state) {
      const text = this.segmentTexts.get(id) || '';
      state = text ? await this.decodeCourse(id, text) : emptyGradeState(this.store);
      this.courseCache.set(id, state);
      this.rememberPerformanceIndex(id, state);
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
    // A roster request may arrive while Grades is still completing a navigation
    // to another course. Wait for that atomic load before inspecting the active
    // state; otherwise `loadedCourseId` and the store can briefly describe
    // different courses and the previous roster is returned for this request.
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
    return clone(state, emptyGradeState(this.store));
  }

  setGradeCourseStudentCounts(counts = null) {
    const source = counts && typeof counts === 'object' ? counts : {};
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
    // Do not publish the intermediary course state. A grades-view render can
    // otherwise queue its selected course for loading and replace the state
    // before the operation reads the requested course's roster or structure.
    await this.ensureGradeCourseLoaded(courseId, { publish: false });
    try {
      return await operation();
    } finally {
      if (previous && previous !== Number(courseId)) {
        await this.ensureGradeCourseLoaded(previous, { publish: false });
      }
      this.controller?.publish?.('grades');
    }
  }

  async runGradeCourseMutation(courseId, operation, { preserveRoster = false } = {}) {
    const id = Number(courseId) || 0;
    const run = async () => {
      await this.ensureGradeCourseLoaded(id);
      const before = this.store.exportGradeVaultStateSnapshot();
      const roster = before.gradeStudents.map((student) => Number(student.id)).sort((a, b) => a - b);
      this.gradeCourseMutationActiveCourseId = id;
      this.store._suspendSaveHooks();
      try {
        const result = await operation({ courseId: id });
        const after = this.store.normalizeGradeVaultState(this.store.exportGradeVaultStateSnapshot());
        if (preserveRoster) {
          const nextRoster = after.gradeStudents.map((student) => Number(student.id)).sort((a, b) => a - b);
          if (JSON.stringify(roster) !== JSON.stringify(nextRoster)) throw new Error('Die Kursliste wurde während der Mutation verändert.');
        }
        this.store.replaceGradeVaultState(after);
        this.courseCache.set(id, after);
        this.rememberPerformanceIndex(id, after);
        this.dirtyCourseIds.add(id);
        this.courseRevisions.set(id, this.getGradeCourseRevision(id) + 1);
        this.manualDirty = true;
        if (!this.isManualPersistenceMode() && this.fileHandle) {
          this.queueSyncSave('grades-auto-save');
        }
        return result;
      } catch (error) {
        this.store.replaceGradeVaultState(before);
        throw error;
      } finally {
        this.store._resumeSaveHooks({ flush: false });
        this.gradeCourseMutationActiveCourseId = null;
        this.controller?.markChanged?.('grades');
      }
    };
    const promise = this.operationTail.then(run, run);
    this.operationTail = promise.catch(() => undefined);
    return promise;
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

  async buildContainer(reason = 'save') {
    if (this.loadedCourseId) this.courseCache.set(this.loadedCourseId, this.store.exportGradeVaultStateSnapshot());
    const courseIds = new Set([
      ...this.segmentTexts.keys(),
      ...this.courseCache.keys(),
      ...this.dirtyCourseIds,
    ]);
    const existingCourses = new Set(this.store.state.courses.map((course) => Number(course.id)));
    if (this.isGradeVaultEncryptionEnabled() && !this.isGradeVaultUnlocked()) {
      const hasRewrite = [...courseIds].some((id) => this.dirtyCourseIds.has(id) || !this.segmentTexts.has(id));
      if (hasRewrite) throw new Error('Der geschützte Notenbereich muss vor dem Speichern entsperrt sein.');
    }
    const segments = [];
    let entryCount = 0;
    for (const courseId of [...courseIds].sort((a, b) => a - b)) {
      if (!existingCourses.has(courseId)) continue;
      const rewrite = this.dirtyCourseIds.has(courseId) || !this.segmentTexts.has(courseId);
      if (!rewrite && this.segmentTexts.has(courseId)) {
        segments.push({ courseId, text: this.segmentTexts.get(courseId) });
        continue;
      }
      const state = this.courseCache.get(courseId) || emptyGradeState(this.store);
      entryCount += state.gradeEntries?.length || 0;
      const persisted = persistedCourseFromState(this.store, courseId, state);
      const text = this.isGradeVaultEncryptionEnabled()
        ? JSON.stringify(await encryptWorkspaceVaultText(
          JSON.stringify(persisted),
          this.vault.cryptoKey,
          this.vault.kdf,
          { type: 'course', courseId },
        ))
        : JSON.stringify(persisted);
      segments.push({ courseId, text });
    }
    const publicState = this.store.exportPublicStateSnapshot();
    const config = this.isGradeVaultEncryptionEnabled() ? this.vault.config : normalizeVaultConfig(null);
    return buildThdb1ContainerBytes({
      schema: APP_DB_SCHEMA,
      startupShellText: JSON.stringify(buildStartupShell(publicState, config.configured, entryCount)),
      planningPublicText: JSON.stringify(publicState),
      gradeVaultConfigText: JSON.stringify(config),
      gradeCourseSegments: segments,
      revision: this.knownRevision + 1,
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      reason,
    });
  }

  commitPersistedVaultContainer(bytes) {
    const parsed = parseThdb1ContainerBytes(bytes, { includeGradeCourseSegments: true });
    this.segmentTexts = new Map(parsed?.gradeCourseSegments?.map((segment) => [
      Number(segment.courseId),
      String(segment.text || ''),
    ]) || []);
    this.vault.persistedConfig = clone(this.vault.config, normalizeVaultConfig(null));
    this.vault.persistedCryptoKey = null;
  }

  async loadBytes(bytes, source = 'manual') {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const parsed = parseThdb1ContainerBytes(view, {
      schemas: [APP_DB_SCHEMA, APP_DB_SCHEMA_LEGACY],
      includePlanningPublic: true,
      includeGradeCourseSegments: true,
    });
    if (!parsed) throw new Error('Datenbankdatei ist ungültig oder beschädigt.');
    let publicState;
    let config;
    try {
      publicState = JSON.parse(parsed.planningPublicText);
      config = normalizeVaultConfig(JSON.parse(parsed.gradeVaultConfigText || '{}'));
    } catch {
      throw new Error('Datenbanksegmente enthalten ungültiges JSON.');
    }
    const isEmptyDatabase = [
      publicState?.schoolYears,
      publicState?.courses,
      publicState?.slots,
      publicState?.freeRanges,
      publicState?.specialDays,
      publicState?.lessons,
      parsed.gradeCourseSegments,
    ].every((items) => Array.isArray(items) && items.length === 0);
    this.store.importDatabaseState(publicState, emptyGradeState(this.store), {
      skipSaveNotification: true,
      allowEmpty: isEmptyDatabase,
    });
    this.segmentTexts = new Map(parsed.gradeCourseSegments.map((segment) => [Number(segment.courseId), String(segment.text || '')]));
    this.courseCache.clear();
    this.performanceIndexCache.clear();
    this.dirtyCourseIds.clear();
    this.loadedCourseId = null;
    this.store.replaceGradeVaultState(emptyGradeState(this.store));
    const encrypted = [...this.segmentTexts.values()].some((text) => parseCourseSegment(text)?.encrypted);
    this.vault.encryptionEnabled = Boolean(config.configured || encrypted || publicState?.settings?.gradeVaultEncryptionEnabled);
    this.vault.configured = Boolean(config.configured);
    this.vault.unlocked = false;
    this.vault.config = config;
    this.vault.persistedConfig = clone(config, normalizeVaultConfig(null));
    this.vault.persistedCryptoKey = null;
    this.vault.cryptoKey = null;
    this.vault.kdf = config.kdf;
    this.store.state.settings.gradeVaultEncryptionEnabled = this.vault.encryptionEnabled;
    this.knownRevision = Math.max(0, Number(parsed.header.revision) || 0);
    this.knownFileHash = getThdb1FileHash(view);
    this.publicDirty = false;
    this.manualDirty = false;
    this.clearGradeVaultAutoLockWarning();
    this.manualLoaded = true;
    this.ready = true;
    this.controller?.markChanged?.('planning');
    this.controller?.publish?.('grades');
    return { ok: true, source };
  }

  async readHandleBytes(handle) {
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  getDefaultSchoolYearStartYear(date = new Date()) {
    return getDefaultSchoolYearStartYear(date);
  }

  buildEmptyDatabaseContainer(reason = 'create-empty', { schoolYearStart = null } = {}) {
    const startYear = Number(schoolYearStart);
    const publicState = Number.isInteger(startYear) && startYear >= 1900 && startYear <= 9998
      ? this.store.buildNewDatabasePublicState(startYear)
      : this.store.normalizePublicState(null);
    const config = normalizeVaultConfig(null);
    return buildThdb1ContainerBytes({
      schema: APP_DB_SCHEMA,
      startupShellText: JSON.stringify(buildStartupShell(publicState, false, 0)),
      planningPublicText: JSON.stringify(publicState),
      gradeVaultConfigText: JSON.stringify(config),
      gradeCourseSegments: [],
      revision: 1,
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      reason,
    });
  }

  async isCurrentWorkspaceFileHandle(handle) {
    if (!handle || !this.fileHandle) return false;
    if (handle === this.fileHandle) return true;
    if (typeof handle.isSameEntry !== 'function') return false;
    try {
      return Boolean(await handle.isSameEntry(this.fileHandle));
    } catch {
      return false;
    }
  }

  async connectEmptyWorkspaceFile(handle, options = {}) {
    if (await this.isCurrentWorkspaceFileHandle(handle)) {
      throw new Error('Bitte wähle für die neue leere Datenbank eine andere Datei.');
    }
    if (!await this.ensureHandleReadWritePermission(handle)) {
      throw new Error('Für die Datenbankdatei wurde keine Schreibberechtigung erteilt.');
    }
    // A pending automatic save still belongs to the previous workspace. Let it
    // finish before the active file handle can point at the new empty file.
    await this.operationTail;
    const built = this.buildEmptyDatabaseContainer('create-empty', options);
    const writeResult = await writeAndVerifyFileBytes(
      handle,
      built.bytes,
      (persisted) => getThdb1FileHash(persisted) === getThdb1FileHash(built.bytes),
    );
    if (!writeResult.ok) throw writeResult.error || new Error('Leere Datenbankdatei konnte nicht verifiziert werden.');
    if (!await this.storeHandle(HANDLE_FILE_KEY, handle)) {
      throw new Error('Die Auswahl der Datenbankdatei konnte nicht dauerhaft gespeichert werden.');
    }

    this.fileHandle = handle;
    this.storedFileHandle = handle;
    this.fileName = String(handle.name || this.buildSyncFileSuggestedName());
    this.backupDirectoryHandle = null;
    this.storedBackupDirectoryHandle = null;
    await this.loadBytes(built.bytes, 'new-empty');
    await this.removeStoredHandle(HANDLE_BACKUP_KEY);
    this.controller?.markChanged?.('shell');
    return true;
  }

  async acceptWorkspaceSyncFileHandle(handle, mode = 'existing', options = {}) {
    if (!handle) return false;
    if (String(mode || '') === 'new-empty') {
      return this.connectEmptyWorkspaceFile(handle, options);
    }
    if (!await this.ensureHandleReadWritePermission(handle)) {
      throw new Error('Für die Datenbankdatei wurde keine Schreibberechtigung erteilt.');
    }
    const preserveBackupDirectory = String(mode || '') === 'reconnect';
    const previousBackupDirectoryHandle = this.backupDirectoryHandle;
    const previousStoredBackupDirectoryHandle = this.storedBackupDirectoryHandle;
    if (!preserveBackupDirectory) {
      this.backupDirectoryHandle = null;
      this.storedBackupDirectoryHandle = null;
    }
    this.fileHandle = handle;
    this.storedFileHandle = handle;
    this.fileName = String(handle.name || this.buildSyncFileSuggestedName());
    try {
      if (!await this.storeHandle(HANDLE_FILE_KEY, handle)) {
        throw new Error('Die Auswahl der Datenbankdatei konnte nicht dauerhaft gespeichert werden.');
      }
      await this.loadBytes(await this.readHandleBytes(handle), 'file');
    } catch (error) {
      if (!preserveBackupDirectory) {
        this.backupDirectoryHandle = previousBackupDirectoryHandle;
        this.storedBackupDirectoryHandle = previousStoredBackupDirectoryHandle;
      }
      throw error;
    }
    if (!preserveBackupDirectory) {
      await this.removeStoredHandle(HANDLE_BACKUP_KEY);
      this.controller?.markChanged?.('shell');
    }
    return true;
  }

  async acceptWorkspaceBackupDirectoryHandle(handle) {
    if (!handle) return false;
    if (!await this.ensureHandleReadWritePermission(handle)) {
      throw new Error('Für den Backup-Ordner wurde keine Schreibberechtigung erteilt.');
    }
    this.backupDirectoryHandle = handle;
    this.storedBackupDirectoryHandle = handle;
    if (!await this.storeHandle(HANDLE_BACKUP_KEY, handle)) {
      this.backupDirectoryHandle = null;
      this.storedBackupDirectoryHandle = null;
      throw new Error('Die Auswahl des Backup-Ordners konnte nicht dauerhaft gespeichert werden.');
    }
    this.controller?.markChanged?.('shell');
    return true;
  }

  async saveToConnectedFile(reason = 'save') {
    if (!this.fileHandle) return false;
    if (this.knownFileHash) {
      const remote = await this.readHandleBytes(this.fileHandle);
      const remoteHash = getThdb1FileHash(remote);
      if (remoteHash && remoteHash !== this.knownFileHash) {
        const error = new Error('Die Datenbankdatei wurde außerhalb dieses Workspace geändert.');
        error.code = WORKSPACE_ERROR_PERSISTENCE_CONFLICT;
        throw error;
      }
    }
    const built = await this.buildContainer(reason);
    const writeResult = await writeAndVerifyFileBytes(
      this.fileHandle,
      built.bytes,
      (persisted) => getThdb1FileHash(persisted) === getThdb1FileHash(built.bytes),
    );
    if (!writeResult.ok) throw writeResult.error || new Error('Datenbankdatei konnte nicht verifiziert werden.');
    this.knownRevision = built.header.revision;
    this.knownFileHash = getThdb1FileHash(built.bytes);
    this.commitPersistedVaultContainer(built.bytes);
    this.publicDirty = false;
    this.dirtyCourseIds.clear();
    this.manualDirty = false;
    this.clearGradeVaultAutoLockWarning();
    this.controller?.markChanged?.('shell');
    return true;
  }

  queueSyncSave(reason = 'auto-save') {
    if (this.isManualPersistenceMode() || !this.fileHandle) return false;
    const save = () => this.saveToConnectedFile(reason);
    const operation = this.operationTail.then(save, save);
    this.operationTail = operation.catch(() => undefined);
    void operation.catch(() => undefined);
    return true;
  }

  async saveManualDatabase() {
    const built = await this.buildContainer('manual-save');
    downloadBytes(built.bytes, this.fileName || this.buildSyncFileSuggestedName());
    this.commitPersistedVaultContainer(built.bytes);
    this.manualLoaded = true;
    this.manualDirty = false;
    this.publicDirty = false;
    this.dirtyCourseIds.clear();
    this.clearGradeVaultAutoLockWarning();
    this.controller?.markChanged?.('shell');
    return true;
  }

  async createEmptyManualDatabase(options = {}) {
    const built = this.buildEmptyDatabaseContainer('manual-create-empty', options);
    const fileName = this.buildSyncFileSuggestedName();
    downloadBytes(built.bytes, fileName);
    this.fileName = fileName;
    await this.loadBytes(built.bytes, 'manual-create-empty');
    return true;
  }

  async loadManualDatabaseFromFile(file) {
    if (!file) return false;
    this.fileName = String(file.name || this.buildSyncFileSuggestedName());
    await this.loadBytes(new Uint8Array(await file.arrayBuffer()), 'manual');
    return true;
  }

  async createLatestWebBackup(mode = 'manual', silent = false) {
    if (!this.backupDirectoryHandle) return false;
    const built = await this.buildContainer(`backup-${mode}`);
    const stamp = new Date().toISOString().slice(0, 10);
    const handle = await this.backupDirectoryHandle.getFileHandle(`TeachHelper-Backup-${stamp}.json`, { create: true });
    const writeResult = await writeAndVerifyFileBytes(
      handle,
      built.bytes,
      (persisted) => getThdb1FileHash(persisted) === getThdb1FileHash(built.bytes),
    );
    if (!writeResult.ok) throw writeResult.error || new Error('Backup konnte nicht verifiziert werden.');
    return true;
  }

  async maybeRunAutomaticWebBackup() {
    if (!this.store.getBackupEnabled?.() || !this.backupDirectoryHandle) return false;
    const intervalDays = Math.max(1, Number(this.store.getBackupIntervalDays?.()) || 7);
    const lastRun = Date.parse(String(this.store.getSetting?.('lastAutoBackupAt', '') || ''));
    if (Number.isFinite(lastRun) && Date.now() - lastRun < intervalDays * 86400000) return false;
    const created = await this.createLatestWebBackup('automatic', true);
    if (created) this.store.setSetting?.('lastAutoBackupAt', new Date().toISOString());
    return created;
  }

  async restoreLatestWebBackup() {
    if (!await this.ensureBackupDirectoryReady()) return false;
    const candidates = [];
    for await (const entry of this.backupDirectoryHandle.values()) {
      if (
        entry?.kind !== 'file'
        || !/^(?:Planung-Backup-|TeachHelper-Backup-).*\.json$/i.test(String(entry.name || ''))
      ) continue;
      candidates.push(entry);
    }
    candidates.sort((left, right) => String(right.name || '').localeCompare(String(left.name || '')));
    const latest = candidates[0];
    if (!latest) return false;
    const file = await latest.getFile();
    await this.loadBytes(new Uint8Array(await file.arrayBuffer()), 'backup');
    this.fileName = String(latest.name || this.fileName || this.buildSyncFileSuggestedName());
    return true;
  }

  async exportBackup() {
    const built = await this.buildContainer('backup-export');
    downloadBytes(built.bytes, `TeachHelper-Backup-${new Date().toISOString().slice(0, 10)}.json`);
    return true;
  }

  async importBackupFromFile(file) {
    return this.loadManualDatabaseFromFile(file);
  }

  async tryReconnectStoredSyncFile({ allowPrompt = false } = {}) {
    if (this.ephemeral) return false;
    const handle = this.storedFileHandle || await this.loadStoredHandle(HANDLE_FILE_KEY);
    if (!handle) return false;
    this.storedFileHandle = handle;
    if (!this.fileHandle) this.fileName = String(handle.name || this.fileName || '');
    try {
      let permission = await handle.queryPermission?.({ mode: 'readwrite' });
      if (permission !== 'granted' && allowPrompt && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (permission !== 'granted') return false;
      return this.acceptWorkspaceSyncFileHandle(handle, 'reconnect');
    } catch {
      return false;
    }
  }

  async ensureHandleReadWritePermission(handle, { allowPrompt = true } = {}) {
    if (!handle || typeof handle.queryPermission !== 'function') return Boolean(handle);
    try {
      let permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted' && allowPrompt && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      return permission === 'granted';
    } catch {
      return false;
    }
  }

  async ensureBackupDirectoryReady({ allowPrompt = false } = {}) {
    if (this.ephemeral) return false;
    if (this.backupDirectoryHandle) return true;
    const handle = this.storedBackupDirectoryHandle || await this.loadStoredHandle(HANDLE_BACKUP_KEY);
    if (!handle) return false;
    this.storedBackupDirectoryHandle = handle;
    try {
      let permission = await handle.queryPermission?.({ mode: 'readwrite' });
      if (permission !== 'granted' && allowPrompt && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (permission !== 'granted') return false;
      this.backupDirectoryHandle = handle;
      this.controller?.markChanged?.('shell');
      return true;
    } catch {
      return false;
    }
  }

  async openHandleDb() {
    if (this.ephemeral) return null;
    if (!globalThis.indexedDB) return null;
    return new Promise((resolve) => {
      const request = indexedDB.open(HANDLE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HANDLE_STORE_NAME)) request.result.createObjectStore(HANDLE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async storeHandle(key, handle) {
    const db = await this.openHandleDb();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      tx.objectStore(HANDLE_STORE_NAME).put(handle, key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    });
  }

  async loadStoredHandle(key) {
    const db = await this.openHandleDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
      const request = tx.objectStore(HANDLE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  }

  async removeStoredHandle(key) {
    const db = await this.openHandleDb();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
      tx.objectStore(HANDLE_STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    });
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
      return { changed: false, scope: 'planning', assessmentIndex, assessmentIndexResolvedCourseIds: payload.courseIds || [] };
    }
    if (command === WORKSPACE_COMMAND_CREATE_COURSE) {
      const id = this.store.createCourse(schoolYearId, payload.name, payload.color, payload.noLesson, payload.hiddenInSidebar, payload.subject);
      if (!id) throw new Error('Kursname bereits vorhanden oder Kursdaten ungültig.');
      return { changed: true, scope: 'planning', courseId: id };
    }
    if (command === WORKSPACE_COMMAND_UPDATE_COURSE) {
      const current = this.store.state.courses.find((course) => Number(course.id) === courseId && Number(course.schoolYearId) === schoolYearId);
      if (!current) throw new Error('Kurs nicht gefunden.');
      const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : payload;
      const value = (name, fallback) => Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : fallback;
      if (!this.store.updateCourse(schoolYearId, courseId, value('name', current.name), value('color', current.color), value('noLesson', current.noLesson), value('hiddenInSidebar', current.hiddenInSidebar), value('subject', current.subject))) {
        throw new Error('Kurs konnte nicht aktualisiert werden.');
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
      this.segmentTexts.delete(courseId);
      this.courseCache.delete(courseId);
      this.performanceIndexCache.delete(courseId);
      this.dirtyCourseIds.delete(courseId);
      if (this.loadedCourseId === courseId) this.loadedCourseId = null;
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
        else this.store.setSetting?.(key, clone(value));
      }
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
    if (name === 'sync-reconnect') return { changed: await this.tryReconnectStoredSyncFile({ allowPrompt: detail?.allowPrompt === true }), scope: 'shell' };
    if (name === 'backup-directory-connect') return { changed: await this.acceptWorkspaceBackupDirectoryHandle(detail?.handle), scope: 'shell' };
    if (name === 'backup-directory-reconnect') return { changed: await this.ensureBackupDirectoryReady({ allowPrompt: detail?.allowPrompt === true }), scope: 'shell' };
    if (name === 'sync-save') return { changed: await this.saveToConnectedFile(detail?.reason), scope: 'shell' };
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
