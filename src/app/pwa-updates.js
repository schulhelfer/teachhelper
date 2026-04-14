export function registerServiceWorkerUpdates({
  updateDialog,
  updateDialogLater,
  updateDialogReload,
  serviceWorkerUrl = './sw.js',
} = {}) {
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
    if (!hadControllerOnLoad) return;
    if (!activeRegistration?.waiting) return;
    openUpdateDialog();
  };

  const watchInstallingWorker = (registration, worker) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        maybePromptForUpdate(registration);
      }
    });
  };

  const checkForUpdates = async () => {
    if (!activeRegistration) {
      return { status: 'unavailable' };
    }
    try {
      await activeRegistration.update();
    } catch {
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
        closeUpdateDialog();
        const waitingWorker = activeRegistration?.waiting;
        if (waitingWorker) {
          waitingWorker.postMessage({ type: 'SKIP_WAITING' });
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
        maybePromptForUpdate(registration);
        if (registration.installing) {
          watchInstallingWorker(registration, registration.installing);
        }
        registration.addEventListener('updatefound', () => {
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
