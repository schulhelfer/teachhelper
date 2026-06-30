export function registerServiceWorkerUpdates({
  updateDialog,
  updateDialogLater,
  updateDialogReload,
  beforeReloadForUpdate,
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
  let updateDialogShown = false;
  let reloadRequestedForUpdate = false;
  let activeRegistration = null;
  let initPromise = null;
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

  const notifyUpdateAvailability = (registration = activeRegistration) => {
    if (typeof onUpdateAvailabilityChange !== 'function') return;
    try {
      onUpdateAvailabilityChange(Boolean(registration?.waiting));
    } catch {
      // Ignore consumer callback failures.
    }
  };

  const openUpdateDialog = () => {
    if (!updateDialog || updateDialogShown) return;
    updateDialogShown = true;
    if (typeof updateDialog.showModal === 'function') {
      if (!updateDialog.open) updateDialog.showModal();
    } else {
      updateDialog.setAttribute('open', 'open');
    }
  };

  const closeUpdateDialog = () => {
    if (!updateDialog) return;
    updateDialogShown = false;
    if (typeof updateDialog.close === 'function' && updateDialog.open) {
      updateDialog.close();
    }
    updateDialog.removeAttribute('open');
  };

  const maybePromptForUpdate = (registration) => {
    activeRegistration = registration || activeRegistration;
    notifyUpdateAvailability(activeRegistration);
    if (!hadControllerOnLoad) return;
    if (!activeRegistration?.waiting) return;
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

  const checkForUpdates = async () => {
    if (!activeRegistration) {
      notifyUpdateAvailability(null);
      return { status: 'unavailable' };
    }
    try {
      await activeRegistration.update();
    } catch {
      notifyUpdateAvailability(activeRegistration);
      return { status: 'error' };
    }
    maybePromptForUpdate(activeRegistration);
    return activeRegistration?.waiting
      ? { status: 'update-available' }
      : { status: 'up-to-date' };
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
        window.location.reload();
      });

      updateDialogLater?.addEventListener('click', () => {
        closeUpdateDialog();
      });
      updateDialogReload?.addEventListener('click', () => {
        reloadRequestedForUpdate = true;
        if (typeof beforeReloadForUpdate === 'function') {
          try {
            beforeReloadForUpdate();
          } catch {
            // Ignore storage/hint preparation errors and continue the update flow.
          }
        }
        notifyUpdateAvailability(null);
        closeUpdateDialog();
        const waitingWorker = activeRegistration?.waiting;
        if (waitingWorker) {
          waitingWorker.postMessage({ type: 'SKIP_WAITING', token: updateActivationToken });
          return;
        }
        window.location.reload();
      });

      try {
        const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
          updateViaCache: 'none',
          type: 'module',
        });
        activeRegistration = registration;
        shareUpdateActivationToken(registration);
        notifyUpdateAvailability(registration);
        maybePromptForUpdate(registration);
        if (registration.installing) {
          watchInstallingWorker(registration, registration.installing);
        }
        registration.addEventListener('updatefound', () => {
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
    checkForUpdates: async () => {
      await ensureInitialized();
      return checkForUpdates();
    },
  };
}
