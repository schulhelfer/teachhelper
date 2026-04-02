export function registerServiceWorkerUpdates({
  updateDialog,
  updateDialogLater,
  updateDialogReload,
  serviceWorkerUrl = './sw.js',
} = {}) {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    return;
  }

  window.addEventListener('load', async () => {
    const hadControllerOnLoad = Boolean(navigator.serviceWorker.controller);
    let updateDialogShown = false;
    let reloadRequestedForUpdate = false;
    let activeRegistration = null;

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
      if (!activeRegistration) return;
      try {
        await activeRegistration.update();
      } catch {
        // optional update check
      }
      maybePromptForUpdate(activeRegistration);
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloadRequestedForUpdate) return;
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
      // Service Worker optional
    }

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
  });
}
