import { getThdb1FileHashAsync } from '../../shared/school-data/thdb.js';
import { writeAndVerifyFileBytes } from '../../shared/school-data/sync-safety.js';

const HANDLE_BACKUP_KEY = 'backup-dir';

export function formatLocalBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('-');
}

function buildBackupFileName(date = new Date()) {
  return `TeachHelper-Backup-${formatLocalBackupTimestamp(date)}.json`;
}

export class WorkspaceBackup {
  constructor({
    store,
    ephemeral,
    now,
    markChanged,
    ensureHandleReadWritePermission,
    storeHandle,
    loadStoredHandle,
    isPersistenceReady,
    buildContainer,
    loadBytes,
    readDatabaseFileBytes,
    downloadBytes,
    loadManualDatabaseFromFile,
    getFileName,
    setFileName,
    buildSyncFileSuggestedName,
  }) {
    this.store = store;
    this.ephemeral = ephemeral;
    this.now = now;
    this.markChanged = markChanged;
    this.ensureHandleReadWritePermission = ensureHandleReadWritePermission;
    this.storeHandle = storeHandle;
    this.loadStoredHandle = loadStoredHandle;
    this.isPersistenceReady = isPersistenceReady;
    this.buildContainer = buildContainer;
    this.loadBytes = loadBytes;
    this.readDatabaseFileBytes = readDatabaseFileBytes;
    this.downloadBytes = downloadBytes;
    this.loadManualDatabaseFromFile = loadManualDatabaseFromFile;
    this.getFileName = getFileName;
    this.setFileName = setFileName;
    this.buildSyncFileSuggestedName = buildSyncFileSuggestedName;
    this.backupDirectoryHandle = null;
    this.storedBackupDirectoryHandle = null;
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
    this.markChanged('shell');
    return true;
  }

  async createLatestWebBackup(mode = 'manual', silent = false) {
    if (!this.backupDirectoryHandle) return false;
    if (!this.isPersistenceReady()) {
      if (silent) return false;
      throw new Error('Die verbundene Datenbankdatei wurde noch nicht vollständig geladen.');
    }
    if (!await this.ensureHandleReadWritePermission(this.backupDirectoryHandle, { allowPrompt: !silent })) {
      if (silent) return false;
      throw new Error('Der Backup-Ordner ist nicht mehr zum Schreiben freigegeben. Bitte verbinde ihn in den Einstellungen neu.');
    }
    const built = await this.buildContainer(`backup-${mode}`);
    let handle;
    try {
      handle = await this.backupDirectoryHandle.getFileHandle(buildBackupFileName(this.now()), { create: true });
    } catch (cause) {
      if (silent) {
        console.warn('[TeachHelper] Hintergrund-Backup fehlgeschlagen.', cause);
        return false;
      }
      const detail = String(cause?.name || '') === 'NotAllowedError'
        ? 'Zugriff verweigert'
        : String(cause?.message || cause?.name || 'unbekannter Fehler');
      const error = new Error(`Der Backup-Ordner ist nicht mehr erreichbar. Bitte verbinde ihn in den Einstellungen neu. (${detail})`);
      error.cause = cause;
      throw error;
    }
    const builtHash = await getThdb1FileHashAsync(built.bytes);
    const writeResult = await writeAndVerifyFileBytes(
      handle,
      built.bytes,
      async (persisted) => (await getThdb1FileHashAsync(persisted)) === builtHash,
    );
    if (!writeResult.ok) {
      const error = writeResult.error
        || new Error(`Backup konnte nicht verifiziert werden (Schritt: ${writeResult.stage || 'unbekannt'}).`);
      if (silent) {
        console.warn('[TeachHelper] Hintergrund-Backup fehlgeschlagen.', error);
        return false;
      }
      throw error;
    }
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
    await this.loadBytes(await this.readDatabaseFileBytes(file, 'Sicherung'), 'backup');
    this.setFileName(String(latest.name || this.getFileName() || this.buildSyncFileSuggestedName()));
    return true;
  }

  async exportBackup() {
    if (!this.isPersistenceReady()) {
      throw new Error('Die verbundene Datenbankdatei wurde noch nicht vollständig geladen.');
    }
    const built = await this.buildContainer('backup-export');
    this.downloadBytes(built.bytes, buildBackupFileName(this.now()));
    return true;
  }

  async importBackupFromFile(file) {
    return this.loadManualDatabaseFromFile(file);
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
      this.markChanged('shell');
      return true;
    } catch {
      return false;
    }
  }
}
