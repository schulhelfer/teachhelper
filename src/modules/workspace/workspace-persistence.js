import {
  buildThdb1ContainerBytes,
  getThdb1FileHashAsync,
  parseThdb1ContainerBytes,
  parseThdb1ContainerBytesAsync,
  parseThdb1Header,
} from '../../shared/school-data/thdb.js';
import { FILE_LIMITS, formatFileSize } from '../../shared/file-guards.js';
import { writeAndVerifyFileBytes } from '../../shared/school-data/sync-safety.js';
import {
  APP_DB_SCHEMA,
  APP_DB_SCHEMA_LEGACY,
  APP_DB_STARTUP_SHELL_SCHEMA,
} from '../../shared/school-data/defaults.js';
import { WORKSPACE_ERROR_PERSISTENCE_CONFLICT } from '../../shared/school-data/messages.js';

const HANDLE_DB_NAME = 'teachhelper-sync-handles-v1';
const HANDLE_STORE_NAME = 'handles';
const HANDLE_FILE_KEY = 'sync-file';
const HANDLE_BACKUP_KEY = 'backup-dir';
const THDB_CONFIRM_BYTES = 100 * 1024 * 1024;

function emptyGradeState(store) {
  return store.normalizeGradeVaultState(null);
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
      gradeLevel: Number.isInteger(Number(course.gradeLevel)) ? Number(course.gradeLevel) : null,
      color: String(course.color || ''),
      noLesson: Boolean(course.noLesson),
      noGrades: Boolean(course.noGrades),
      hiddenInSidebar: Boolean(course.hiddenInSidebar),
      hiddenInNameLearning: Boolean(course.hiddenInNameLearning),
      sortOrder: Number(course.sortOrder || 0),
    })),
    gradeVaultConfigured: Boolean(configured),
    gradeEntryCount: Number.isFinite(gradeEntryCount) ? Math.max(0, Number(gradeEntryCount) || 0) : null,
  };
}

export function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(fileName || 'TeachHelper-Datenbank.json');
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export class WorkspacePersistence {
  constructor({
    store,
    ephemeral,
    confirmLargeFile,
    deviceId,
    getIndexedDB,
    downloadBytes,
    markChanged,
    publish,
    markReady,
    buildGradeCourseSegments,
    getVaultConfig,
    emptyVaultConfig,
    validateVaultConfig,
    loadVaultConfig,
    commitPersistedSegments,
    commitPersistedConfig,
    resetCoursesForDatabase,
    completeGradeSave,
    clearGradeVaultAutoLockWarning,
    isGradeVaultEncryptionEnabled,
    refreshNameLearningDueSummary,
    getDefaultSchoolYearStartYear,
    assertContainerKeepsPersistedCourses,
    getBackupConnection,
    clearBackupConnection,
    restoreBackupConnection,
    enqueueOperation,
  }) {
    this.store = store;
    this.ephemeral = ephemeral;
    this.confirmLargeFile = confirmLargeFile;
    this.deviceId = deviceId;
    this.getIndexedDB = getIndexedDB;
    this.downloadBytes = downloadBytes;
    this.markChanged = markChanged;
    this.publish = publish;
    this.markReady = markReady;
    this.buildGradeCourseSegments = buildGradeCourseSegments;
    this.getVaultConfig = getVaultConfig;
    this.emptyVaultConfig = emptyVaultConfig;
    this.validateVaultConfig = validateVaultConfig;
    this.loadVaultConfig = loadVaultConfig;
    this.commitPersistedSegments = commitPersistedSegments;
    this.commitPersistedConfig = commitPersistedConfig;
    this.resetCoursesForDatabase = resetCoursesForDatabase;
    this.completeGradeSave = completeGradeSave;
    this.clearGradeVaultAutoLockWarning = clearGradeVaultAutoLockWarning;
    this.isGradeVaultEncryptionEnabled = isGradeVaultEncryptionEnabled;
    this.refreshNameLearningDueSummary = refreshNameLearningDueSummary;
    this.getDefaultSchoolYearStartYear = getDefaultSchoolYearStartYear;
    this.assertContainerKeepsPersistedCourses = assertContainerKeepsPersistedCourses;
    this.getBackupConnection = getBackupConnection;
    this.clearBackupConnection = clearBackupConnection;
    this.restoreBackupConnection = restoreBackupConnection;
    this.enqueueOperation = enqueueOperation;
    this.fileHandle = null;
    this.storedFileHandle = null;
    this.syncReconnectInFlight = null;
    this.fileName = '';
    this.knownRevision = 0;
    this.knownFileHash = '';
    this.databaseLoaded = false;
    this.loadGeneration = 0;
    this.loadInProgress = false;
    this.persistenceFailure = null;
    this.manualLoaded = false;
    this.manualDirty = false;
    this.publicDirty = false;
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

  buildNewDatabaseSuggestedName(fileName = this.fileName || this.fileHandle?.name || '') {
    const fallback = this.buildSyncFileSuggestedName();
    const source = String(fileName || fallback).trim() || fallback;
    const extensionMatch = source.match(/(\.[^./\\]+)$/);
    const extension = extensionMatch?.[1] || '.json';
    const stem = (extensionMatch ? source.slice(0, -extension.length) : source)
      .replace(/\s+\(neu\)$/i, '')
      .trim() || 'TeachHelper-Datenbank';
    return `${stem} (neu)${extension}`;
  }

  isPersistenceReady() {
    return !this.loadInProgress && (!this.fileHandle || this.databaseLoaded);
  }

  clearPersistenceFailure() {
    if (!this.persistenceFailure) return false;
    this.persistenceFailure = null;
    return true;
  }

  recordPersistenceFailure(error) {
    this.persistenceFailure = {
      code: String(error?.code || ''),
      message: error instanceof Error && error.message
        ? error.message
        : 'Die Datenbankdatei konnte nicht gespeichert werden.',
      at: Date.now(),
    };
    this.markChanged('shell');
    return false;
  }

  async buildContainer(reason = 'save') {
    const { segments, entryCount } = await this.buildGradeCourseSegments();
    const publicState = this.store.exportPublicStateSnapshot();
    const config = this.getVaultConfig();
    const containerOptions = {
      schema: APP_DB_SCHEMA,
      startupShellText: JSON.stringify(buildStartupShell(publicState, config.configured, entryCount)),
      planningPublicText: JSON.stringify(publicState),
      gradeVaultConfigText: JSON.stringify(config),
      gradeCourseSegments: segments,
      revision: this.knownRevision + 1,
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      reason,
    };
    return buildThdb1ContainerBytes(containerOptions);
  }

  commitPersistedVaultContainer(bytes) {
    const parsed = parseThdb1ContainerBytes(bytes, { includeGradeCourseSegments: true });
    this.commitPersistedSegments(parsed?.gradeCourseSegments);
    this.commitPersistedConfig();
  }

  async loadBytes(bytes, source = 'manual') {
    if (this.loadInProgress) throw new Error('Es wird bereits eine Datenbank geladen. Bitte warte, bis der Import abgeschlossen ist.');
    this.loadInProgress = true;
    try {
      this.loadGeneration += 1;
      const view = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
      const parsed = await parseThdb1ContainerBytesAsync(view, {
        schemas: [APP_DB_SCHEMA, APP_DB_SCHEMA_LEGACY],
        includePlanningPublic: true,
        includeGradeCourseSegments: true,
      });
      if (!parsed) throw new Error('Datenbankdatei ist ungültig oder beschädigt.');
      let publicState;
      let config;
      try {
        publicState = JSON.parse(parsed.planningPublicText);
        const rawVaultConfig = JSON.parse(parsed.gradeVaultConfigText || '{}');
        config = this.validateVaultConfig(rawVaultConfig);
      } catch {
        throw new Error('Datenbanksegmente oder Verschlüsselungseinstellungen sind ungültig.');
      }
      const fileHash = await getThdb1FileHashAsync(view);
      if (!fileHash) throw new Error('Datenbankdatei konnte nicht vollständig geprüft werden.');
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
      this.resetCoursesForDatabase(parsed.gradeCourseSegments);
      this.loadVaultConfig(config, publicState?.settings?.gradeVaultEncryptionEnabled);
      this.knownRevision = Math.max(0, Number(parsed.header.revision) || 0);
      this.knownFileHash = fileHash;
      this.publicDirty = false;
      this.manualDirty = false;
      this.clearGradeVaultAutoLockWarning();
      this.manualLoaded = true;
      this.databaseLoaded = true;
      this.markReady();
      this.clearPersistenceFailure();
      if (!this.isGradeVaultEncryptionEnabled()) await this.refreshNameLearningDueSummary();
      this.markChanged('planning');
      this.publish('grades');
      return { ok: true, source };
    } finally {
      this.loadInProgress = false;
    }
  }

  readPersistedCourseIds(bytes) {
    const prefix = parseThdb1Header(bytes, { schemas: [APP_DB_SCHEMA, APP_DB_SCHEMA_LEGACY] });
    return (prefix?.header?.gradeCourseSegments || []).map((descriptor) => Number(descriptor.courseId) || 0).filter(Boolean);
  }

  async readHandleBytes(handle) {
    const file = await handle.getFile();
    return this.readDatabaseFileBytes(file, 'Datenbankdatei');
  }

  async readDatabaseFileBytes(file, label = 'Datenbankdatei') {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error(`${label} konnte nicht gelesen werden.`);
    }
    const size = Number(file.size);
    if (Number.isFinite(size) && size > FILE_LIMITS.THDB_BYTES) {
      throw new Error(`${label} ist zu groß: maximal ${formatFileSize(FILE_LIMITS.THDB_BYTES)}.`);
    }
    if (Number.isFinite(size) && size > THDB_CONFIRM_BYTES) {
      let shouldContinue = false;
      try {
        shouldContinue = Boolean(await this.confirmLargeFile({
          label,
          size,
          formattedSize: formatFileSize(size),
        }));
      } catch {
        shouldContinue = false;
      }
      if (!shouldContinue) {
        throw new Error(`${label} wurde nicht geladen.`);
      }
    }
    return new Uint8Array(await file.arrayBuffer());
  }

  buildEmptyDatabaseContainer(reason = 'create-empty', { schoolYearStart = null } = {}) {
    const startYear = Number(schoolYearStart);
    const publicState = Number.isInteger(startYear) && startYear >= 1900 && startYear <= 9998
      ? this.store.buildNewDatabasePublicState(startYear)
      : this.store.normalizePublicState(null);
    const config = this.emptyVaultConfig();
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

  async getNewWorkspaceFileHandleInDirectory(directoryHandle, fileName) {
    if (!directoryHandle || typeof directoryHandle.getFileHandle !== 'function') {
      throw new Error('Der Zielordner konnte nicht geöffnet werden.');
    }
    try {
      await directoryHandle.getFileHandle(fileName);
    } catch (error) {
      if (String(error?.name || '') === 'NotFoundError') {
        return directoryHandle.getFileHandle(fileName, { create: true });
      }
      throw error;
    }
    throw new Error(`Die Datei „${fileName}“ existiert bereits. Bitte benenne oder verschiebe sie, bevor eine neue leere Datenbank angelegt wird.`);
  }

  async assertEmptyWorkspaceDatabaseTarget(handle, fileName) {
    const file = await handle?.getFile?.();
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Die neue Datenbankdatei konnte nicht gelesen werden.');
    }
    const size = Number(file.size);
    const containsData = Number.isFinite(size)
      ? size > 0
      : (await file.arrayBuffer()).byteLength > 0;
    if (containsData) {
      throw new Error(`Die Datei „${fileName || handle?.name || ''}“ enthält bereits Daten. Die neue leere Datenbank wurde nicht angelegt.`);
    }
    return true;
  }

  async createEmptyWorkspaceFileInDirectory(directoryHandle, options = {}) {
    if (!directoryHandle) return false;
    if (!await this.ensureHandleReadWritePermission(directoryHandle)) {
      throw new Error('Für den Zielordner wurde keine Schreibberechtigung erteilt.');
    }
    return this.enqueueOperation(() => this.createEmptyWorkspaceFileInDirectoryNow(directoryHandle, options));
  }

  async createEmptyWorkspaceFileInDirectoryNow(directoryHandle, options = {}) {
    const fileName = this.buildNewDatabaseSuggestedName();
    const handle = await this.getNewWorkspaceFileHandleInDirectory(directoryHandle, fileName);
    return this.connectEmptyWorkspaceFileNow(handle, options, { fileName });
  }

  async connectEmptyWorkspaceFileNow(handle, options = {}, { fileName = '' } = {}) {
    if (await this.isCurrentWorkspaceFileHandle(handle)) {
      throw new Error('Bitte wähle für die neue leere Datenbank eine andere Datei.');
    }
    await this.assertEmptyWorkspaceDatabaseTarget(handle, fileName);
    const built = this.buildEmptyDatabaseContainer('create-empty', {
      ...options,
      schoolYearStart: options.schoolYearStart ?? this.getDefaultSchoolYearStartYear(),
    });
    const builtHash = await getThdb1FileHashAsync(built.bytes);
    const writeResult = await writeAndVerifyFileBytes(
      handle,
      built.bytes,
      async (persisted) => (await getThdb1FileHashAsync(persisted)) === builtHash,
      { validateOriginal: async (original) => original.length === 0 },
    );
    if (!writeResult.ok) {
      if (writeResult.stage === 'precondition') {
        throw new Error(`Die Datei „${fileName || handle?.name || ''}“ wurde vor dem Schreiben geändert. Die neue leere Datenbank wurde nicht angelegt.`);
      }
      throw writeResult.error || new Error('Leere Datenbankdatei konnte nicht verifiziert werden.');
    }
    if (!await this.storeHandle(HANDLE_FILE_KEY, handle)) {
      throw new Error('Die Auswahl der Datenbankdatei konnte nicht dauerhaft gespeichert werden.');
    }

    this.databaseLoaded = false;
    this.fileHandle = handle;
    this.storedFileHandle = handle;
    this.fileName = String(handle.name || this.buildSyncFileSuggestedName());
    this.clearBackupConnection();
    await this.loadBytes(built.bytes, 'new-empty');
    await this.removeStoredHandle(HANDLE_BACKUP_KEY);
    this.markChanged('shell');
    return true;
  }

  async acceptWorkspaceSyncFileHandle(handle, mode = 'existing', options = {}) {
    if (!handle) return false;
    if (String(mode || '') === 'new-empty') {
      throw new Error('Für eine neue leere Datenbank wähle bitte einen Zielordner.');
    }
    if (!await this.ensureHandleReadWritePermission(handle)) {
      throw new Error('Für die Datenbankdatei wurde keine Schreibberechtigung erteilt.');
    }
    return this.enqueueOperation(() => this.acceptWorkspaceSyncFileHandleNow(handle, mode, options));
  }

  async acceptWorkspaceSyncFileHandleNow(handle, mode = 'existing', _options = {}) {
    const preserveBackupDirectory = String(mode || '') === 'reconnect';
    const previousBackupConnection = this.getBackupConnection();
    const previousFileHandle = this.fileHandle;
    const previousStoredFileHandle = this.storedFileHandle;
    const previousFileName = this.fileName;
    const previousDatabaseLoaded = this.databaseLoaded;
    if (!preserveBackupDirectory) {
      this.clearBackupConnection();
    }
    this.databaseLoaded = false;
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
        this.restoreBackupConnection(previousBackupConnection);
      }
      this.fileHandle = previousFileHandle;
      this.storedFileHandle = previousStoredFileHandle;
      this.fileName = previousFileName;
      this.databaseLoaded = previousDatabaseLoaded;
      throw error;
    }
    if (!preserveBackupDirectory) {
      await this.removeStoredHandle(HANDLE_BACKUP_KEY);
      this.markChanged('shell');
    }
    return true;
  }

  async saveToConnectedFile(reason = 'save') {
    if (this.loadInProgress) return false;
    if (!this.fileHandle) return false;
    if (!this.databaseLoaded) return false;
    const fileHandle = this.fileHandle;
    const generation = this.loadGeneration;
    const expectedFileHash = this.knownFileHash;
    const isCurrentSaveTarget = () => (
      this.fileHandle === fileHandle
      && this.databaseLoaded
      && this.loadGeneration === generation
    );
    const remote = await this.readHandleBytes(fileHandle);
    if (!isCurrentSaveTarget()) return false;
    if (expectedFileHash) {
      const remoteHash = await getThdb1FileHashAsync(remote);
      if (!isCurrentSaveTarget()) return false;
      if (remoteHash && remoteHash !== expectedFileHash) {
        const error = new Error('Die Datenbankdatei wurde außerhalb dieses Workspace geändert.');
        error.code = WORKSPACE_ERROR_PERSISTENCE_CONFLICT;
        throw error;
      }
    }
    const remoteCourseIds = this.readPersistedCourseIds(remote);
    const built = await this.buildContainer(reason);
    if (!isCurrentSaveTarget()) return false;
    this.assertContainerKeepsPersistedCourses(built, remoteCourseIds);
    const builtHash = await getThdb1FileHashAsync(built.bytes);
    if (!isCurrentSaveTarget()) return false;
    const writeResult = await writeAndVerifyFileBytes(
      fileHandle,
      built.bytes,
      async (persisted) => (await getThdb1FileHashAsync(persisted)) === builtHash,
      {
        validateOriginal: expectedFileHash
          ? async (original) => (await getThdb1FileHashAsync(original)) === expectedFileHash
          : null,
      },
    );
    if (!writeResult.ok) {
      if (writeResult.stage === 'precondition') {
        const error = new Error('Die Datenbankdatei wurde außerhalb dieses Workspace geändert.');
        error.code = WORKSPACE_ERROR_PERSISTENCE_CONFLICT;
        throw error;
      }
      throw writeResult.error || new Error('Datenbankdatei konnte nicht verifiziert werden.');
    }
    if (!isCurrentSaveTarget()) return false;
    this.knownRevision = built.header.revision;
    this.knownFileHash = builtHash;
    this.commitPersistedVaultContainer(built.bytes);
    this.publicDirty = false;
    this.completeGradeSave({ clearDeleted: true });
    this.manualDirty = false;
    this.clearGradeVaultAutoLockWarning();
    this.clearPersistenceFailure();
    this.markChanged('shell');
    return true;
  }

  async saveManualDatabase() {
    if (!this.isPersistenceReady()) {
      throw new Error('Die verbundene Datenbankdatei wurde noch nicht vollständig geladen.');
    }
    if (
      !this.manualLoaded
      && Array.isArray(this.store.state?.schoolYears)
      && this.store.state.schoolYears.length === 0
      && typeof this.store.buildNewDatabasePublicState === 'function'
    ) {
      const publicState = this.store.buildNewDatabasePublicState(this.getDefaultSchoolYearStartYear());
      this.store.importDatabaseState(
        publicState,
        this.store.exportGradeVaultStateSnapshot(),
        { skipSaveNotification: true, allowEmpty: false },
      );
    }
    const built = await this.buildContainer('manual-save');
    this.downloadBytes(built.bytes, this.fileName || this.buildSyncFileSuggestedName());
    this.commitPersistedVaultContainer(built.bytes);
    this.manualLoaded = true;
    this.manualDirty = false;
    this.publicDirty = false;
    this.completeGradeSave({ clearDeleted: false });
    this.clearGradeVaultAutoLockWarning();
    this.markChanged('shell');
    return true;
  }

  async createEmptyManualDatabase(options = {}) {
    const built = this.buildEmptyDatabaseContainer('manual-create-empty', {
      ...options,
      schoolYearStart: options.schoolYearStart ?? this.getDefaultSchoolYearStartYear(),
    });
    const fileName = this.buildNewDatabaseSuggestedName();
    this.downloadBytes(built.bytes, fileName);
    this.fileName = fileName;
    await this.loadBytes(built.bytes, 'manual-create-empty');
    return true;
  }

  async loadManualDatabaseFromFile(file) {
    if (!file) return false;
    this.fileName = String(file.name || this.buildSyncFileSuggestedName());
    await this.loadBytes(await this.readDatabaseFileBytes(file), 'manual');
    return true;
  }

  tryReconnectStoredSyncFile(options = {}) {
    if (this.ephemeral) return Promise.resolve(false);
    if (this.syncReconnectInFlight) return this.syncReconnectInFlight;
    const attempt = this.runStoredSyncFileReconnect(options);
    this.syncReconnectInFlight = attempt;
    const release = () => {
      if (this.syncReconnectInFlight === attempt) this.syncReconnectInFlight = null;
    };
    attempt.then(release, release);
    return attempt;
  }

  async runStoredSyncFileReconnect({ allowPrompt = false } = {}) {
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

  async openHandleDb() {
    if (this.ephemeral) return null;
    const indexedDB = this.getIndexedDB();
    if (!indexedDB) return null;
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
}
