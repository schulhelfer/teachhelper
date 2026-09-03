export const UPDATE_SNOOZE_STORAGE_KEY = 'teachhelper:update-snooze-until';
export const UPDATE_SNOOZE_MS = 6 * 60 * 60 * 1000;
export const AUTOMATIC_UPDATE_CHECK_MIN_INTERVAL_MS = 60 * 1000;
export const UPDATE_ACTIVATION_TIMEOUT_MS = 8 * 1000;

export function registerServiceWorkerUpdates({
  updateDialog,
  updateDialogLater,
  updateDialogReload,
  updateDialogForce,
  updateDialogStatus,
  beforeReloadForUpdate,
  describeBackupStatus,
  onUpdateAvailabilityChange,
  serviceWorkerUrl = './sw.js',
} = {}) {
  const createUpdateActivationToken = () => {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }

    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const unsupportedResult = { status: 'unsupported' };
  const disabledResult = { status: 'disabled' };
  if (!('serviceWorker' in navigator)) {
    return {
      checkForUpdates: async () => unsupportedResult,
    };
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    return {
      checkForUpdates: async () => disabledResult,
    };
  }

  let hadControllerOnLoad = false;
  let reloadRequestedForUpdate = false;
  let updateReloadFallbackTimer = null;
  let activeRegistration = null;
  let initPromise = null;
  let lastUpdateCheckAt = 0;
  const updateActivationToken = createUpdateActivationToken();

  const postUpdateActivationToken = (worker) => {
    if (!worker || worker.state === 'redundant') return;
    worker.postMessage({ type: 'SET_UPDATE_TOKEN', token: updateActivationToken });
  };

  const shareUpdateActivationToken = (registration) => {
    postUpdateActivationToken(registration?.active);
    postUpdateActivationToken(registration?.waiting);
    postUpdateActivationToken(registration?.installing);
  };

  const readSnoozedUntil = () => {
    try {
      const raw = window.localStorage?.getItem(UPDATE_SNOOZE_STORAGE_KEY);
      const until = Number.parseInt(raw ?? '', 10);
      return Number.isFinite(until) ? until : 0;
    } catch {
      return 0;
    }
  };

  const writeSnoozedUntil = (until) => {
    try {
      if (until > 0) {
        window.localStorage?.setItem(UPDATE_SNOOZE_STORAGE_KEY, String(until));
      } else {
        window.localStorage?.removeItem(UPDATE_SNOOZE_STORAGE_KEY);
      }
    } catch {

    }
  };

  const isUpdateSnoozed = () => readSnoozedUntil() > Date.now();
  const snoozeUpdate = () => writeSnoozedUntil(Date.now() + UPDATE_SNOOZE_MS);
  const clearUpdateSnooze = () => writeSnoozedUntil(0);

  const notifyUpdateAvailability = (registration = activeRegistration) => {
    if (typeof onUpdateAvailabilityChange !== 'function') return;
    try {
      onUpdateAvailabilityChange(Boolean(registration?.waiting));
    } catch {
      
    }
  };

  const setUpdateDialogStatus = (text = '', variant = '') => {
    if (updateDialogStatus) {
      updateDialogStatus.textContent = text;
      updateDialogStatus.hidden = !text;
      updateDialogStatus.classList?.[variant === 'error' ? 'add' : 'remove']?.('is-error');
    }
    if (updateDialogForce) updateDialogForce.hidden = variant !== 'error';
    if (updateDialogReload) {
      updateDialogReload.textContent = variant === 'error' ? 'Nochmal versuchen' : 'Neu laden';
    }
  };

  const openUpdateDialog = () => {
    if (!updateDialog || updateDialog.open) return;
    setUpdateDialogStatus(
      typeof describeBackupStatus === 'function' ? String(describeBackupStatus() || '') : '',
    );
    if (typeof updateDialog.showModal === 'function') {
      updateDialog.showModal();
    } else {
      updateDialog.setAttribute('open', 'open');
    }
  };

  const closeUpdateDialog = () => {
    if (!updateDialog) return;
    if (typeof updateDialog.close === 'function' && updateDialog.open) {
      updateDialog.close();
    }
    updateDialog.removeAttribute('open');
  };

  const clearUpdateReloadFallback = () => {
    if (updateReloadFallbackTimer === null) return;
    window.clearTimeout?.(updateReloadFallbackTimer);
    updateReloadFallbackTimer = null;
  };

  const scheduleUpdateReloadFallback = () => {
    if (updateReloadFallbackTimer !== null) return;
    updateReloadFallbackTimer = window.setTimeout(() => {
      updateReloadFallbackTimer = null;
      if (!reloadRequestedForUpdate) return;
      window.location.reload();
    }, UPDATE_ACTIVATION_TIMEOUT_MS);
  };

  const activateWaitingWorker = () => {
    reloadRequestedForUpdate = true;
    clearUpdateSnooze();
    notifyUpdateAvailability(null);
    closeUpdateDialog();
    const waitingWorker = activeRegistration?.waiting;
    if (waitingWorker) {
      postUpdateActivationToken(waitingWorker);
      waitingWorker.postMessage({ type: 'SKIP_WAITING', token: updateActivationToken });
      scheduleUpdateReloadFallback();
      return;
    }
    window.location.reload();
  };

  const attemptUpdate = async ({ skipBackup = false } = {}) => {
    if (!skipBackup && typeof beforeReloadForUpdate === 'function') {
      let result;
      try {
        result = await beforeReloadForUpdate();
      } catch (error) {
        result = {
          ok: false,
          reason: error instanceof Error && error.message ? error.message : '',
        };
      }
      const failed = result === false || (result && typeof result === 'object' && result.ok === false);
      if (failed) {
        const reason = typeof result === 'object' && result?.reason ? ` ${result.reason}` : '';
        setUpdateDialogStatus(
          `Vor dem Update konnte kein Backup erstellt werden.${reason}`,
          'error',
        );
        return;
      }
    }
    activateWaitingWorker();
  };

  const maybePromptForUpdate = (registration, { force = false } = {}) => {
    activeRegistration = registration || activeRegistration;
    notifyUpdateAvailability(activeRegistration);
    if (!hadControllerOnLoad) return;
    if (force) {
      clearUpdateSnooze();
    }
    if (!activeRegistration?.waiting) return;
    if (!force && isUpdateSnoozed()) return;
    openUpdateDialog();
  };

  const watchInstallingWorker = (registration, worker) => {
    if (!worker) return;
    postUpdateActivationToken(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        postUpdateActivationToken(worker);
        maybePromptForUpdate(registration);
      }
    });
  };

  const checkForUpdates = async ({ force = false } = {}) => {
    if (!activeRegistration) {
      notifyUpdateAvailability(null);
      return { status: 'unavailable' };
    }
    const now = Date.now();
    const throttled = !force
      && now - lastUpdateCheckAt < AUTOMATIC_UPDATE_CHECK_MIN_INTERVAL_MS;
    if (!throttled) {
      lastUpdateCheckAt = now;
      try {
        await activeRegistration.update();
      } catch {
        notifyUpdateAvailability(activeRegistration);
        return { status: 'error' };
      }
    }
    maybePromptForUpdate(activeRegistration, { force });
    if (activeRegistration?.waiting) {
      return { status: 'update-available' };
    }
    if (activeRegistration?.installing) {
      return { status: 'update-installing' };
    }
    return { status: 'up-to-date' };
  };

  const ensureInitialized = async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (document.readyState !== 'complete') {
        await new Promise((resolve) => {
          window.addEventListener('load', resolve, { once: true });
        });
      }

      hadControllerOnLoad = Boolean(navigator.serviceWorker.controller);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadRequestedForUpdate) return;
        clearUpdateReloadFallback();
        window.location.reload();
      });

      updateDialogLater?.addEventListener('click', () => {
        snoozeUpdate();
        closeUpdateDialog();
      });
      updateDialog?.addEventListener('cancel', () => {
        snoozeUpdate();
      });
      updateDialogReload?.addEventListener('click', () => {
        void attemptUpdate();
      });
      updateDialogForce?.addEventListener('click', () => {
        void attemptUpdate({ skipBackup: true });
      });

      try {
        const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
          updateViaCache: 'none',
        });
        activeRegistration = registration;
        shareUpdateActivationToken(registration);
        notifyUpdateAvailability(registration);
        maybePromptForUpdate(registration);
        if (registration.installing) {
          watchInstallingWorker(registration, registration.installing);
        }
        registration.addEventListener('updatefound', () => {
          clearUpdateSnooze();
          shareUpdateActivationToken(registration);
          watchInstallingWorker(registration, registration.installing);
        });
        window.setInterval(() => {
          void checkForUpdates();
        }, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void checkForUpdates();
          }
        });
        window.addEventListener('focus', () => {
          void checkForUpdates();
        });
      } catch {
        activeRegistration = null;
        notifyUpdateAvailability(null);
      }
    })();
    return initPromise;
  };

  void ensureInitialized();

  return {
    checkForUpdates: async (options = {}) => {
      await ensureInitialized();
      return checkForUpdates(options);
    },
  };
}
