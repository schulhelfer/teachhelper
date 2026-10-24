import {
  GRADE_COURSE_SCHEMA,
  GRADE_VAULT_CONFIG_SCHEMA,
  GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
  GRADE_VAULT_AUTO_LOCK_MINUTES_DEFAULT,
} from '../../shared/school-data/defaults.js';
import {
  WORKSPACE_ERROR_VAULT_DIRTY,
  WORKSPACE_ERROR_VAULT_LOCKED,
  WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT,
} from '../../shared/school-data/messages.js';
import {
  createWorkspaceVaultKdf,
  decryptWorkspaceVaultText,
  deriveWorkspaceVaultKey,
  encryptWorkspaceVaultText,
  normalizeWorkspaceVaultKdf,
  validateWorkspaceVaultKdf,
  WORKSPACE_VAULT_KDF_ITERATIONS,
  serializeWorkspaceVaultSession,
  deserializeWorkspaceVaultSession,
} from './crypto.js';

const VAULT_VALIDATION_TOKEN = 'teachhelper-grade-vault-v1';
const AUTO_LOCK_RETRY_MS = 10 * 60 * 1000;

function normalizeVaultConfig(raw, clone) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const configured = Boolean(source.configured && source.kdf && source.validation);
  return {
    schema: GRADE_VAULT_CONFIG_SCHEMA,
    configured,
    kdf: configured ? normalizeWorkspaceVaultKdf(source.kdf) : null,
    validation: configured ? clone(source.validation, null) : null,
  };
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
  }
  return null;
}

function assertCourseSegmentEncryption(parsed, courseId, encryptionRequired) {
  if (!encryptionRequired || parsed.encrypted) return parsed;
  const error = new Error(`Notensegment für Kurs ${courseId} liegt unverschlüsselt in einer geschützten Datenbank vor und wurde abgelehnt.`);
  error.code = WORKSPACE_ERROR_VAULT_PLAINTEXT_SEGMENT;
  throw error;
}

export class GradeVault {
  constructor({
    store,
    eventTarget,
    getDocument,
    setTimeout,
    clearTimeout,
    nowMs,
    randomId,
    clone,
    markChanged,
    hasDirtyCourses,
    hasPersistedCourses,
    hasConnectedFile,
    isManualPersistenceMode,
    saveToConnectedFile,
    enqueueOperation,
    loadAllPersistedGradeCoursesForCryptoRewrite,
    refreshNameLearningDueSummary,
    markPersistedCoursesDirty,
    getCryptoRewriteSnapshot,
    getPersistedCourseText,
    replaceCryptoRewriteStates,
    clearPlaintextCourses,
    discardCourseChanges,
    runtimeCourseFromPersisted,
    captureCourseSession,
    restoreCourseSession,
    getPersistedCourseTexts,
    getFeatureClient,
  }) {
    this.store = store;
    this.eventTarget = eventTarget;
    this.getDocument = getDocument;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
    this.nowMs = nowMs;
    this.randomId = randomId;
    this.clone = clone;
    this.markChanged = markChanged;
    this.hasDirtyCourses = hasDirtyCourses;
    this.hasPersistedCourses = hasPersistedCourses;
    this.hasConnectedFile = hasConnectedFile;
    this.isManualPersistenceMode = isManualPersistenceMode;
    this.saveToConnectedFile = saveToConnectedFile;
    this.enqueueOperation = enqueueOperation;
    this.loadAllPersistedGradeCoursesForCryptoRewrite = loadAllPersistedGradeCoursesForCryptoRewrite;
    this.refreshNameLearningDueSummary = refreshNameLearningDueSummary;
    this.markPersistedCoursesDirty = markPersistedCoursesDirty;
    this.getCryptoRewriteSnapshot = getCryptoRewriteSnapshot;
    this.getPersistedCourseText = getPersistedCourseText;
    this.replaceCryptoRewriteStates = replaceCryptoRewriteStates;
    this.clearPlaintextCourses = clearPlaintextCourses;
    this.discardCourseChanges = discardCourseChanges;
    this.runtimeCourseFromPersisted = runtimeCourseFromPersisted;
    this.captureCourseSession = captureCourseSession;
    this.restoreCourseSession = restoreCourseSession;
    this.getPersistedCourseTexts = getPersistedCourseTexts;
    this.getFeatureClient = getFeatureClient;
    this.sessionGeneration = 0;
    this.sessionTransition = false;
    this.disposed = false;
    this.suspendedSession = null;
    this.persistedStates = new Map();
    this.vault = {
      encryptionEnabled: GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT,
      configured: false,
      unlocked: false,
      config: this.normalizeVaultConfig(null),
      persistedConfig: this.normalizeVaultConfig(null),
      persistedCryptoKey: null,
      cryptoKey: null,
      kdf: null,
      lastActivityAt: 0,
      autoLockTimer: 0,
      backgroundAutoLockTimer: 0,
      backgroundHiddenAt: 0,
      autoLockWarning: null,
      autoLockNotice: null,
    };
  }

  bindAutoLock() {
    if (!this.eventTarget?.addEventListener) return;
    const record = () => this.recordGradeVaultActivity();
    for (const type of ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart']) {
      this.eventTarget.addEventListener(type, record, { passive: true });
    }
    const documentTarget = this.getDocument();
    documentTarget?.addEventListener?.('visibilitychange', () => {
      void this.handleGradeVaultVisibilityChange();
    });
  }

  captureSession() {
    return this.sessionGeneration;
  }

  assertSession(session, { requireAccess = true, allowTransition = false } = {}) {
    if (this.disposed || session !== this.sessionGeneration
      || (!allowTransition && this.sessionTransition)
      || (requireAccess && !this.canAccessGradeVault())) {
      const error = new Error('Die Notensitzung wurde gesperrt oder gewechselt.');
      error.code = WORKSPACE_ERROR_VAULT_LOCKED;
      throw error;
    }
  }

  hasSuspendedChanges() {
    return Boolean(this.suspendedSession?.dirty);
  }

  disposeSession() {
    this.sessionGeneration += 1;
    this.disposed = true;
    this.suspendedSession = null;
    this.persistedStates.clear();
    this.clearPlaintextCourses({ clearSegments: true });
    this.vault.unlocked = false;
    this.vault.cryptoKey = null;
    this.vault.persistedCryptoKey = null;
    this.clearGradeVaultAutoLockTimer();
    this.clearGradeVaultBackgroundAutoLockTimer();
    this.getFeatureClient()?.clearVaultSession?.();
    this.getFeatureClient()?.finishVaultSessionLock?.();
  }

  getGradeVaultAutoLockMs() {
    const minutes = Number(this.store.getGradeVaultAutoLockMinutes?.() ?? GRADE_VAULT_AUTO_LOCK_MINUTES_DEFAULT);
    return Math.max(1, minutes) * 60 * 1000;
  }

  recordGradeVaultActivity() {
    if (!this.vault.unlocked) return;
    this.vault.lastActivityAt = this.nowMs();
    this.scheduleGradeVaultAutoLock(this.getGradeVaultAutoLockMs());
  }

  clearGradeVaultAutoLockTimer() {
    this.clearTimeout(this.vault.autoLockTimer);
    this.vault.autoLockTimer = 0;
  }

  clearGradeVaultBackgroundAutoLockTimer() {
    this.clearTimeout(this.vault.backgroundAutoLockTimer);
    this.vault.backgroundAutoLockTimer = 0;
    this.vault.backgroundHiddenAt = 0;
  }

  scheduleGradeVaultAutoLock(delayMs = this.getGradeVaultAutoLockMs()) {
    this.clearGradeVaultAutoLockTimer();
    if (!this.isGradeVaultUnlocked()) return;
    const timeoutMs = Math.max(0, Number(delayMs) || 0);
    this.vault.autoLockTimer = this.setTimeout(() => {
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
        if (this.hasDirtyCourses() && this.store.getGradeVaultAutoSaveBeforeLock?.()
          && !this.isManualPersistenceMode() && this.hasConnectedFile()) {
          try {
            await this.saveDirtyGradeVaultChangesForAutoLock();
          } catch {
          }
        }
        const locked = await this.lockGradeVaultSession({ autoLock: true });
        if (locked || !this.isGradeVaultUnlocked()) return locked;
        throw new Error('Der Notenbereich konnte nicht automatisch gesperrt werden.');
      };
      return await this.enqueueOperation(autoLock);
    } catch (error) {
      if (!this.isGradeVaultUnlocked()) return false;
      const previousWarning = this.vault.autoLockWarning;
      const blockedAt = Number(previousWarning?.blockedAt) || this.nowMs();
      const retryAt = this.nowMs() + AUTO_LOCK_RETRY_MS;
      this.vault.autoLockWarning = {
        active: true,
        blockedAt,
        retryAt,
        message: error instanceof Error && error.message
          ? error.message
          : 'Ungespeicherte Notenänderungen verhindern das automatische Sperren.',
      };
      this.markChanged('grades');
      this.scheduleGradeVaultAutoLock(AUTO_LOCK_RETRY_MS);
      return false;
    }
  }

  async saveDirtyGradeVaultChangesForAutoLock() {
    if (!this.hasDirtyCourses()) return false;
    if (!this.store.getGradeVaultAutoSaveBeforeLock?.()) {
      throw new Error('Ungespeicherte Noten verhindern das automatische Sperren. Automatisches Speichern vor der Sperre ist ausgeschaltet. Bitte speichere die Noten manuell.');
    }
    if (this.isManualPersistenceMode()) {
      throw new Error('Automatisches Speichern ist im manuellen Download-Modus nicht möglich. Bitte speichere die Noten manuell.');
    }
    if (!this.hasConnectedFile()) {
      throw new Error('Automatisches Speichern ist nicht möglich, weil keine Datenbankdatei verbunden ist. Bitte verbinde oder speichere die Noten manuell.');
    }
    const saved = await this.saveToConnectedFile('grade-vault-auto-lock');
    if (!saved || this.hasDirtyCourses()) {
      throw new Error('Die Notendaten konnten vor dem automatischen Sperren nicht vollständig gespeichert werden.');
    }
    return true;
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
    return !this.disposed && !this.sessionTransition
      && (!this.isGradeVaultEncryptionEnabled() || this.isGradeVaultUnlocked());
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
    const session = this.captureSession();
    this.assertSession(session, { requireAccess: false });
    if (String(password || '').length < 12) throw new Error('Das Passwort muss mindestens 12 Zeichen lang sein.');
    if (!coursesLoaded && this.hasPersistedCourses()) {
      await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    }
    this.assertSession(session, { requireAccess: false });
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
    this.assertSession(session, { requireAccess: false });
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
    this.markPersistedCoursesDirty();
    await this.refreshNameLearningDueSummary();
    this.assertSession(session);
    this.recordGradeVaultActivity();
    this.markChanged('grades');
    return true;
  }

  async unlockGradeVault(password) {
    const generation = this.captureSession();
    this.assertSession(generation, { requireAccess: false });
    if (!this.hasGradeVaultUnlockConfig()) {
      throw new Error('Der geschützte Notenbereich ist nicht vollständig eingerichtet.');
    }
    const config = this.vault.config;
    const suspended = this.suspendedSession;
    const { cryptoKey, kdf } = await deriveWorkspaceVaultKey(password, config.kdf);
    this.assertSession(generation, { requireAccess: false });
    const validation = await decryptWorkspaceVaultText(config.validation, cryptoKey, kdf, { type: 'validation' });
    this.assertSession(generation, { requireAccess: false });
    if (validation !== VAULT_VALIDATION_TOKEN) throw new Error('Passwort falsch oder Notendaten beschädigt.');
    let restored = null;
    if (suspended) {
      const plaintext = await decryptWorkspaceVaultText(suspended.envelope, cryptoKey, kdf, {
        type: 'session', sessionId: suspended.id,
      });
      this.assertSession(generation, { requireAccess: false });
      restored = deserializeWorkspaceVaultSession(plaintext);
      if (restored.version !== 1 || restored.id !== suspended.id) {
        throw new Error('Die verschlüsselte Zwischensicherung ist ungültig.');
      }
    }
    const session = ++this.sessionGeneration;
    try {
      if (restored) {
        this.restoreCourseSession(restored.courses);
        this.persistedStates = new Map(restored.persistedStates);
      }
      this.vault.unlocked = true;
      this.vault.cryptoKey = cryptoKey;
      this.vault.kdf = kdf;
      this.vault.autoLockNotice = null;
      if (restored) this.getFeatureClient()?.restoreVaultSession?.(restored.feature);
      try {
        await this.upgradeGradeVaultKdf(password);
      } catch (error) {
        if (error?.code === WORKSPACE_ERROR_VAULT_LOCKED) throw error;
      }
      void this.refreshNameLearningDueSummary().catch((error) => {
        if (error?.code !== WORKSPACE_ERROR_VAULT_LOCKED) {
          console.warn('[TeachHelper] Die Namenslern-Übersicht konnte nicht aktualisiert werden.', error);
        }
      });
      this.assertSession(session);
      this.suspendedSession = null;
      this.recordGradeVaultActivity();
      this.markChanged('grades');
      return true;
    } catch (error) {
      if (session === this.sessionGeneration) {
        this.sessionGeneration += 1;
        this.clearPlaintextCourses({ clearUnencryptedSegments: true });
        this.persistedStates.clear();
        this.getFeatureClient()?.clearVaultSession?.();
        this.vault.unlocked = false;
        this.vault.cryptoKey = null;
        this.vault.persistedCryptoKey = null;
      }
      throw error;
    }
  }

  async upgradeGradeVaultKdf(password) {
    const session = this.captureSession();
    const currentKdf = normalizeWorkspaceVaultKdf(this.vault.config?.kdf);
    if (currentKdf.iterations >= WORKSPACE_VAULT_KDF_ITERATIONS) return false;

    const { courseIds, states: rewrittenStates } = this.getCryptoRewriteSnapshot();
    for (const courseId of courseIds) {
      if (rewrittenStates.has(courseId)) continue;
      const text = this.getPersistedCourseText(courseId);
      const state = text
        ? await this.decodeCourse(courseId, text)
        : this.store.normalizeGradeVaultState(null);
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

    this.assertSession(session);
    this.vault.persistedCryptoKey ||= this.vault.cryptoKey;
    this.vault.config = {
      schema: GRADE_VAULT_CONFIG_SCHEMA,
      configured: true,
      kdf: nextKdf,
      validation,
    };
    this.vault.cryptoKey = nextCryptoKey;
    this.vault.kdf = nextKdf;
    this.replaceCryptoRewriteStates(rewrittenStates, courseIds);
    return true;
  }

  async changeGradeVaultPassword(currentPassword, nextPassword) {
    await this.unlockGradeVault(currentPassword);
    const session = this.captureSession();
    await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    this.assertSession(session);
    return this.setupGradeVault(nextPassword, { coursesLoaded: true });
  }

  async setGradeVaultEncryptionEnabledFromSettings(enabled) {
    const session = this.captureSession();
    const next = Boolean(enabled);
    if (next === this.isGradeVaultEncryptionEnabled()) return true;
    if (next) return false;
    if (!this.isGradeVaultUnlocked()) throw new Error('Der geschützte Notenbereich muss zuerst entsperrt sein.');
    await this.loadAllPersistedGradeCoursesForCryptoRewrite();
    this.assertSession(session);
    const persistedCryptoKey = this.vault.cryptoKey;
    this.vault.encryptionEnabled = false;
    this.vault.configured = false;
    this.vault.unlocked = false;
    this.vault.config = this.normalizeVaultConfig(null);
    this.vault.persistedCryptoKey = persistedCryptoKey;
    this.vault.cryptoKey = null;
    this.vault.kdf = null;
    this.clearGradeVaultAutoLockTimer();
    this.clearGradeVaultBackgroundAutoLockTimer();
    this.clearGradeVaultAutoLockWarning();
    this.vault.autoLockNotice = null;
    this.store.setGradeVaultEncryptionEnabled(false);
    await this.refreshNameLearningDueSummary();
    this.markChanged('grades');
    return true;
  }

  async lockGradeVaultSession({ autoLock = false } = {}) {
    if (!this.isGradeVaultEncryptionEnabled()) return false;
    if (!autoLock && this.hasDirtyCourses()) {
      const error = new Error('Ungespeicherte Notenänderungen müssen vor dem Sperren gespeichert werden.');
      error.code = WORKSPACE_ERROR_VAULT_DIRTY;
      throw error;
    }
    if (this.sessionTransition) return false;
    const session = ++this.sessionGeneration;
    if (!this.isGradeVaultUnlocked()) return true;
    this.sessionTransition = true;
    const featureClient = this.getFeatureClient();
    try {
      const feature = featureClient?.captureVaultSession?.() || null;
      featureClient?.prepareVaultSessionLock?.();
      const configChanged = JSON.stringify(this.normalizeVaultConfig(this.vault.config))
        !== JSON.stringify(this.normalizeVaultConfig(this.vault.persistedConfig));
      let suspended = null;
      if (this.hasDirtyCourses() || feature || configChanged) {
        const persistedStates = new Map(this.persistedStates);
        if (configChanged) {
          for (const [courseId, text] of this.getPersistedCourseTexts()) {
            const state = await this.decodeCourseSegmentForPlausibility(courseId, text, {
              persisted: true, allowTransition: true,
            });
            this.assertSession(session, { requireAccess: false, allowTransition: true });
            persistedStates.set(courseId, { text, state });
          }
        }
        const id = this.randomId();
        const courses = this.captureCourseSession();
        const plaintext = await serializeWorkspaceVaultSession({
          version: 1, id, courses, feature, persistedStates: [...persistedStates],
        });
        this.assertSession(session, { requireAccess: false, allowTransition: true });
        const envelope = await encryptWorkspaceVaultText(plaintext, this.vault.cryptoKey, this.vault.kdf, {
          type: 'session', sessionId: id,
        });
        this.assertSession(session, { requireAccess: false, allowTransition: true });
        suspended = { id, envelope, dirty: this.hasDirtyCourses() || Boolean(feature?.dirty) || configChanged };
      }
      this.suspendedSession = suspended;
      this.clearPlaintextCourses({ clearUnencryptedSegments: true });
      this.persistedStates.clear();
      this.vault.unlocked = false;
      this.vault.cryptoKey = null;
      this.vault.persistedCryptoKey = null;
      featureClient?.clearVaultSession?.();
      this.vault.kdf = this.vault.config?.kdf || null;
      this.clearGradeVaultAutoLockTimer();
      this.clearGradeVaultBackgroundAutoLockTimer();
      this.clearGradeVaultAutoLockWarning();
      this.vault.autoLockNotice = autoLock
        ? { id: this.randomId(), lockedAt: this.nowMs() }
        : null;
    } finally {
      if (session === this.sessionGeneration) {
        this.sessionTransition = false;
        featureClient?.finishVaultSessionLock?.();
        this.markChanged('grades');
      }
    }
    return true;
  }

  async discardGradeVaultChanges() {
    const persistedConfig = this.normalizeVaultConfig(this.vault.persistedConfig);
    const configChanged = JSON.stringify(this.normalizeVaultConfig(this.vault.config)) !== JSON.stringify(this.normalizeVaultConfig(persistedConfig));
    if (!this.hasDirtyCourses() && !configChanged) return false;
    const requiresUnlock = configChanged && persistedConfig.configured && !this.vault.persistedCryptoKey;

    this.assertSession(this.captureSession());
    this.sessionGeneration += 1;
    this.suspendedSession = null;
    this.persistedStates.clear();
    this.discardCourseChanges();
    this.clearGradeVaultAutoLockWarning();

    if (configChanged) {
      this.vault.config = persistedConfig;
      this.vault.configured = Boolean(persistedConfig.configured);
      this.vault.encryptionEnabled = Boolean(persistedConfig.configured);
      this.vault.cryptoKey = persistedConfig.configured ? this.vault.persistedCryptoKey : null;
      this.vault.kdf = persistedConfig.kdf;
      this.store.setGradeVaultEncryptionEnabled(Boolean(persistedConfig.configured));
    }
    if (requiresUnlock) {
      this.vault.unlocked = false;
      this.getFeatureClient()?.clearVaultSession?.();
    }
    this.markChanged('grades');
    return true;
  }

  scheduleGradeVaultBackgroundAutoLock(delayMs = this.getGradeVaultAutoLockMs()) {
    this.clearGradeVaultBackgroundAutoLockTimer();
    if (!this.isGradeVaultUnlocked() || !this.store.getGradeVaultAutoLockOnBackground?.()) return;
    this.vault.backgroundHiddenAt = this.nowMs();
    this.vault.backgroundAutoLockTimer = this.setTimeout(() => {
      this.vault.backgroundAutoLockTimer = 0;
      this.vault.backgroundHiddenAt = 0;
      void this.handleGradeVaultAutoLockTimeout().catch(() => undefined);
    }, Math.max(0, Number(delayMs) || 0));
  }

  async handleGradeVaultVisibilityChange() {
    const documentTarget = this.getDocument();
    if (!documentTarget || !this.isGradeVaultUnlocked() || !this.store.getGradeVaultAutoLockOnBackground?.()) return;
    if (documentTarget.visibilityState === 'hidden') {
      this.clearGradeVaultAutoLockTimer();
      this.scheduleGradeVaultBackgroundAutoLock();
      return;
    }
    const hiddenAt = Number(this.vault.backgroundHiddenAt) || 0;
    this.clearGradeVaultBackgroundAutoLockTimer();
    if (!hiddenAt) return;
    if (this.nowMs() - hiddenAt >= this.getGradeVaultAutoLockMs()) {
      await this.handleGradeVaultAutoLockTimeout();
      return;
    }
    this.recordGradeVaultActivity();
  }

  async decodeCourse(courseId, text) {
    const session = this.captureSession();
    const parsed = parseCourseSegment(text);
    if (!parsed) throw new Error(`Notensegment für Kurs ${courseId} ist ungültig.`);
    assertCourseSegmentEncryption(parsed, courseId, this.isGradeVaultConfigured());
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
    this.assertSession(session);
    return this.runtimeCourseFromPersisted(courseId, persisted);
  }

  async decodeCourseSegmentForPlausibility(courseId, text, { persisted = false, allowTransition = false } = {}) {
    const session = this.captureSession();
    this.assertSession(session, { requireAccess: false, allowTransition });
    const saved = persisted ? this.persistedStates.get(Number(courseId)) : null;
    if (saved?.text === text) return this.clone(saved.state);
    const parsed = parseCourseSegment(text);
    if (!parsed) throw new Error(`Notensegment für Kurs ${courseId} ist ungültig.`);
    assertCourseSegmentEncryption(
      parsed,
      courseId,
      persisted ? Boolean(this.vault.persistedConfig?.configured) : this.isGradeVaultConfigured(),
    );
    let rawState = parsed.state;
    if (parsed.encrypted) {
      const cryptoKey = persisted
        ? this.vault.persistedCryptoKey || this.vault.cryptoKey
        : this.vault.cryptoKey;
      if (!cryptoKey) {
        const error = new Error('Das Notensegment kann für die Sicherheitsprüfung nicht entschlüsselt werden.');
        error.code = WORKSPACE_ERROR_VAULT_LOCKED;
        throw error;
      }
      const plaintext = await decryptWorkspaceVaultText(
        parsed.envelope,
        cryptoKey,
        parsed.envelope?.kdf || this.vault.kdf,
        { type: 'course', courseId },
      );
      rawState = JSON.parse(plaintext);
    }
    this.assertSession(session, { requireAccess: false, allowTransition });
    return this.runtimeCourseFromPersisted(courseId, rawState);
  }


  normalizeVaultConfig(raw = null) {
    return normalizeVaultConfig(raw, this.clone);
  }

  validateConfig(raw) {
    const config = this.normalizeVaultConfig(raw);
    if (config.configured) validateWorkspaceVaultKdf(raw.kdf);
    return config;
  }

  getContainerConfig() {
    return this.isGradeVaultEncryptionEnabled() ? this.vault.config : this.normalizeVaultConfig(null);
  }

  loadConfig(config, encryptionEnabled) {
    this.sessionGeneration += 1;
    this.sessionTransition = false;
    this.suspendedSession = null;
    this.persistedStates.clear();
    this.getFeatureClient()?.clearVaultSession?.();
    this.getFeatureClient()?.finishVaultSessionLock?.();
    this.clearGradeVaultAutoLockTimer();
    this.clearGradeVaultBackgroundAutoLockTimer();
    this.vault.encryptionEnabled = Boolean(config.configured || encryptionEnabled);
    this.vault.configured = Boolean(config.configured);
    this.vault.unlocked = false;
    this.vault.config = config;
    this.vault.persistedConfig = this.clone(config, this.normalizeVaultConfig(null));
    this.vault.persistedCryptoKey = null;
    this.vault.cryptoKey = null;
    this.vault.kdf = config.kdf;
    this.store.state.settings.gradeVaultEncryptionEnabled = this.vault.encryptionEnabled;
  }

  commitPersistedConfig(config = this.vault.config) {
    const cryptoKey = this.vault.persistedCryptoKey || this.vault.cryptoKey;
    this.persistedStates.clear();
    this.vault.persistedConfig = this.clone(config, this.normalizeVaultConfig(null));
    this.vault.persistedCryptoKey = this.isGradeVaultUnlocked()
      && JSON.stringify(this.vault.config) !== JSON.stringify(config) ? cryptoKey : null;
  }

  async encodeCourse(courseId, persisted) {
    return this.isGradeVaultUnlocked()
      ? JSON.stringify(await encryptWorkspaceVaultText(
        JSON.stringify(persisted),
        this.vault.cryptoKey,
        this.vault.kdf,
        { type: 'course', courseId },
      ))
      : JSON.stringify(persisted);
  }
}
