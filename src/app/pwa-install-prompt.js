export const PWA_INSTALL_DISMISSED_SESSION_KEY = 'teachhelper:pwa-install-prompt-dismissed';

function getUserAgent(navigatorRef) {
  return String(navigatorRef?.userAgent || '');
}

function getBrandNames(navigatorRef) {
  const brands = navigatorRef?.userAgentData?.brands;
  return Array.isArray(brands)
    ? brands.map((brand) => String(brand?.brand || '').toLowerCase())
    : [];
}

export function isStandalonePwa({ windowRef = window, navigatorRef = windowRef?.navigator, documentRef = windowRef?.document } = {}) {
  return Boolean(
    windowRef?.matchMedia?.('(display-mode: standalone)')?.matches
    || windowRef?.matchMedia?.('(display-mode: window-controls-overlay)')?.matches
    || navigatorRef?.standalone === true
    || String(documentRef?.referrer || '').startsWith('android-app://')
  );
}

export function isDesktopDevice({ navigatorRef = navigator } = {}) {
  if (navigatorRef?.userAgentData && typeof navigatorRef.userAgentData.mobile === 'boolean') {
    return !navigatorRef.userAgentData.mobile;
  }

  const userAgent = getUserAgent(navigatorRef);
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) {
    return false;
  }
  return !(navigatorRef?.maxTouchPoints > 1 && /Macintosh/i.test(userAgent));
}

export function getInstallBrowser({ navigatorRef = navigator } = {}) {
  const brandNames = getBrandNames(navigatorRef);
  const userAgent = getUserAgent(navigatorRef);

  if (brandNames.some((brand) => brand.includes('microsoft edge')) || /Edg\//.test(userAgent)) {
    return 'edge';
  }
  if (brandNames.some((brand) => brand.includes('google chrome')) || /(?:Chrome|CriOS)\//.test(userAgent)) {
    return 'chrome';
  }
  return null;
}

function readSessionFlag(storage, key) {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(storage, key) {
  try {
    storage?.setItem(key, '1');
  } catch {
    // Storage can be unavailable in privacy-restricted browser sessions.
  }
}

export function createPwaInstallPrompt({
  windowRef = window,
  navigatorRef = windowRef?.navigator,
  documentRef = windowRef?.document,
  sessionStorageRef = windowRef?.sessionStorage,
  dialog,
  copy,
  installButton,
  status,
  laterButton,
} = {}) {
  let deferredInstallPrompt = null;
  let dismissed = readSessionFlag(sessionStorageRef, PWA_INSTALL_DISMISSED_SESSION_KEY);

  const browser = getInstallBrowser({ navigatorRef });
  const isEligible = () => isDesktopDevice({ navigatorRef })
    && !isStandalonePwa({ windowRef, navigatorRef, documentRef })
    && !dismissed;

  const closeDialog = () => {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    }
    dialog.removeAttribute?.('open');
  };

  const dismiss = () => {
    dismissed = true;
    writeSessionFlag(sessionStorageRef, PWA_INSTALL_DISMISSED_SESSION_KEY);
    closeDialog();
  };

  const render = () => {
    if (copy) {
      copy.textContent = browser
        ? `Installiere den TeachHelper als App.`
        : 'Öffne TeachHelper bitte im Browser Google Chrome oder im Browser Microsoft Edge.';
    }
    if (installButton) {
      installButton.hidden = !browser;
      installButton.disabled = false;
      installButton.setAttribute('aria-disabled', 'false');
    }
    if (status) {
      status.textContent = browser && !deferredInstallPrompt
        ? 'Falls der Button unten nicht funktioniert, nutze das Symbol rechts in der Adresszeile.'
        : '';
    }
  };

  const showIfNeeded = () => {
    if (!isEligible() || !dialog) return false;
    render();
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute?.('open', 'open');
    }
    return true;
  };

  const handleInstall = async () => {
    if (!deferredInstallPrompt) {
      if (status) {
        status.textContent = 'Die direkte Installationsaufforderung steht gerade nicht bereit. Klicke bitte oben rechts in der Adresszeile auf das Installationssymbol.';
      }
      return;
    }
    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    render();
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'dismissed' && status) {
        status.textContent = 'Die Installation wurde noch nicht abgeschlossen. Du kannst es über das Symbol in der Adresszeile erneut versuchen.';
      }
    } catch {
      if (status) {
        status.textContent = 'Die Installation konnte nicht gestartet werden. Nutze bitte das Symbol in der Adresszeile.';
      }
    }
  };

  windowRef?.addEventListener?.('beforeinstallprompt', (event) => {
    event.preventDefault?.();
    deferredInstallPrompt = event;
    render();
  });
  windowRef?.addEventListener?.('appinstalled', () => {
    deferredInstallPrompt = null;
    dismissed = true;
    writeSessionFlag(sessionStorageRef, PWA_INSTALL_DISMISSED_SESSION_KEY);
    closeDialog();
  });
  laterButton?.addEventListener?.('click', dismiss);
  installButton?.addEventListener?.('click', () => {
    void handleInstall();
  });
  dialog?.addEventListener?.('cancel', () => {
    dismissed = true;
    writeSessionFlag(sessionStorageRef, PWA_INSTALL_DISMISSED_SESSION_KEY);
  });

  return {
    showIfNeeded,
    dismiss,
    handleInstall,
  };
}
