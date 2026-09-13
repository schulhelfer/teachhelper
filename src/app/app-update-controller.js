import { registerServiceWorkerUpdates } from './pwa-updates.js';

export function createAppUpdateController({
  view: window,
  els,
  appVersion,
  registerCleanup,
  bindRuntime,
  setRuntimeTimeout,
  clearRuntimeTimeout,
  runGuardBackup,
  describeBackupStatus,
  showMessage,
}) {
  const UPDATE_APPLIED_HINT_SESSION_KEY = 'teachhelper:update-applied-hint';
  const getSafeSessionStorage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  let versionUpdateHintTimer = 0;
  let versionUpdateAvailable = false;
  let versionUpdateAppliedVisible = false;
  registerCleanup(() => {
    clearRuntimeTimeout(versionUpdateHintTimer);
    versionUpdateHintTimer = 0;
  });

  const renderVersionUpdateHint = () => {
    if (!els.headerVersion) {
      return;
    }
    const hintText = versionUpdateAppliedVisible
      ? 'Aktualisiert'
      : (versionUpdateAvailable ? 'Update verfügbar' : '');
    els.headerVersion.classList.toggle('has-update-hint', Boolean(hintText));
    if (hintText) {
      els.headerVersion.dataset.updateHint = hintText;
    } else {
      delete els.headerVersion.dataset.updateHint;
    }
  };

  const clearVersionUpdateHintTimer = () => {
    if (versionUpdateHintTimer) {
      clearRuntimeTimeout(versionUpdateHintTimer);
      versionUpdateHintTimer = 0;
    }
  };

  const dismissVersionUpdateHint = () => {
    versionUpdateAppliedVisible = false;
    clearVersionUpdateHintTimer();
    renderVersionUpdateHint();
  };

  const showVersionUpdateHint = () => {
    if (!els.headerVersion) {
      return;
    }
    versionUpdateAppliedVisible = true;
    clearVersionUpdateHintTimer();
    renderVersionUpdateHint();
    versionUpdateHintTimer = setRuntimeTimeout(() => {
      dismissVersionUpdateHint();
    }, 8000);
  };

  const setVersionUpdateAvailability = (isAvailable) => {
    versionUpdateAvailable = Boolean(isAvailable);
    renderVersionUpdateHint();
  };

  const markVersionUpdateHintPending = () => {
    try {
      getSafeSessionStorage()?.setItem(UPDATE_APPLIED_HINT_SESSION_KEY, '1');
    } catch {

    }
  };

  const consumePendingVersionUpdateHint = () => {
    try {
      const storage = getSafeSessionStorage();
      if (storage?.getItem(UPDATE_APPLIED_HINT_SESSION_KEY) !== '1') {
        return;
      }
      storage.removeItem(UPDATE_APPLIED_HINT_SESSION_KEY);
      showVersionUpdateHint();
    } catch {

    }
  };

  const setDisplayedAppVersion = (version) => {
    if (els.headerVersion) {
      const safeVersion = String(version || '').trim();
      els.headerVersion.textContent = safeVersion ? `(v${safeVersion})` : '';
      els.headerVersion.hidden = !safeVersion;
      if (safeVersion) {
        els.headerVersion.setAttribute('title', 'Auf Updates prüfen');
        els.headerVersion.setAttribute('aria-label', `Version v${safeVersion}. Auf Updates prüfen`);
      } else {
        els.headerVersion.removeAttribute('title');
        els.headerVersion.removeAttribute('aria-label');
      }
    }
  };
  setDisplayedAppVersion(String(appVersion || 'dev'));
  consumePendingVersionUpdateHint();
  async function beforeReloadForUpdate() {
    const result = await runGuardBackup('update');
    if (result.ok) markVersionUpdateHintPending();
    return result;
  }

  function start({ helpPreviewRequest }) {
    const serviceWorkerUpdates = helpPreviewRequest ? null : registerServiceWorkerUpdates({
      updateDialog: els.updateDialog,
      updateDialogLater: els.updateDialogLater,
      updateDialogReload: els.updateDialogReload,
      updateDialogForce: els.updateDialogForce,
      updateDialogStatus: els.updateDialogStatus,
      beforeReloadForUpdate,
      describeBackupStatus,
      onUpdateAvailabilityChange: setVersionUpdateAvailability,
      serviceWorkerUrl: './sw.js',
    });
    if (els.headerVersion && serviceWorkerUpdates?.checkForUpdates) {
      const runManualUpdateCheck = async () => {
        if (els.headerVersion.dataset.updateCheckPending === '1') {
          return;
        }
        els.headerVersion.dataset.updateCheckPending = '1';
        els.headerVersion.classList.add('is-checking-update');
        try {
          const result = await serviceWorkerUpdates.checkForUpdates({ force: true });
          switch (result?.status) {
            case 'update-available':
              break;
            case 'update-installing':
              showMessage('Update wird geladen. Der Neu-laden-Hinweis erscheint automatisch.', 'info', { presentation: 'toast' });
              break;
            case 'up-to-date':
              showMessage('TeachHelper ist aktuell.', 'info', { presentation: 'toast' });
              break;
            case 'disabled':
              showMessage('Update-Check ist auf localhost deaktiviert.', 'warn', { presentation: 'toast' });
              break;
            case 'unsupported':
              showMessage('Update-Check wird von diesem Browser nicht unterstützt.', 'warn', { presentation: 'toast' });
              break;
            default:
              showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn', { presentation: 'toast' });
              break;
          }
        } catch {
          showMessage('Update-Check konnte gerade nicht ausgeführt werden.', 'warn', { presentation: 'toast' });
        } finally {
          delete els.headerVersion.dataset.updateCheckPending;
          els.headerVersion.classList.remove('is-checking-update');
        }
      };
      bindRuntime(els.headerVersion, 'click', () => {
        void runManualUpdateCheck();
      });
      bindRuntime(els.headerVersion, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space') {
          return;
        }
        event.preventDefault();
        void runManualUpdateCheck();
      });
    }
  }

  return { start };
}
