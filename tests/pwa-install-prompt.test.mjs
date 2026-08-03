import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [source, htmlSource, mainSource, shellStyles, serviceWorkerSource] = await Promise.all([
  readFile(new URL('../src/app/pwa-install-prompt.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
]);
const {
  PWA_INSTALL_DISMISSED_SESSION_KEY,
  createPwaInstallPrompt,
  getInstallBrowser,
  isDesktopDevice,
  isStandalonePwa,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('integrates an accessible, blurred installation dialog into the offline app shell', () => {
  assert.match(htmlSource, /<dialog id="pwa-install-dialog"[\s\S]*aria-labelledby="pwa-install-dialog-title"[\s\S]*aria-describedby="pwa-install-dialog-copy pwa-install-dialog-status"/);
  assert.match(htmlSource, /id="pwa-install-dialog-later"[\s\S]*id="pwa-install-dialog-install"/);
  assert.match(mainSource, /import \{ createPwaInstallPrompt \} from '\.\/app\/pwa-install-prompt\.js';/);
  assert.match(mainSource, /pwaInstallPrompt\.showIfNeeded\(\);/);
  assert.match(shellStyles, /\.pwa-install-dialog::backdrop[\s\S]*blur\(8px\)/);
  assert.match(serviceWorkerSource, /'\.\/src\/app\/pwa-install-prompt\.js'/);
});

class EventTargetStub {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

class ElementStub extends EventTargetStub {
  constructor() {
    super();
    this.attributes = new Map();
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.textContent = '';
    this.title = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function createWindow({ standalone = false } = {}) {
  const windowRef = new EventTargetStub();
  windowRef.matchMedia = () => ({ matches: standalone });
  return windowRef;
}

test('detects standalone mode, desktop devices, and Chrome or Edge in the required order', () => {
  assert.equal(isStandalonePwa({
    windowRef: { matchMedia: () => ({ matches: true }) },
    navigatorRef: {},
    documentRef: {},
  }), true);
  assert.equal(isStandalonePwa({
    windowRef: { matchMedia: () => ({ matches: false }) },
    navigatorRef: { standalone: true },
    documentRef: {},
  }), true);
  assert.equal(isStandalonePwa({
    windowRef: { matchMedia: (query) => ({ matches: query === '(display-mode: window-controls-overlay)' }) },
    navigatorRef: {},
    documentRef: {},
  }), true);
  assert.equal(isStandalonePwa({
    windowRef: { matchMedia: () => ({ matches: false }) },
    navigatorRef: {},
    documentRef: { referrer: 'android-app://org.chromium.chrome' },
  }), true);
  assert.equal(isDesktopDevice({ navigatorRef: { userAgentData: { mobile: false } } }), true);
  assert.equal(isDesktopDevice({ navigatorRef: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)' } }), false);
  assert.equal(getInstallBrowser({ navigatorRef: { userAgent: 'Mozilla/5.0 Chrome/126.0 Edg/126.0' } }), 'edge');
  assert.equal(getInstallBrowser({ navigatorRef: { userAgentData: { brands: [{ brand: 'Google Chrome' }] } } }), 'chrome');
  assert.equal(getInstallBrowser({ navigatorRef: { userAgent: 'Mozilla/5.0 Firefox/128.0' } }), null);
});

test('shows the dialog only for non-installed desktop browsers and remembers Später for the session', async () => {
  const windowRef = createWindow();
  const storage = createStorage();
  const dialog = new ElementStub();
  const copy = new ElementStub();
  const installButton = new ElementStub();
  const status = new ElementStub();
  const laterButton = new ElementStub();
  const controller = createPwaInstallPrompt({
    windowRef,
    navigatorRef: { userAgentData: { mobile: false, brands: [{ brand: 'Google Chrome' }] } },
    documentRef: {},
    sessionStorageRef: storage,
    dialog,
    copy,
    installButton,
    status,
    laterButton,
  });

  assert.equal(controller.showIfNeeded(), true);
  assert.equal(dialog.open, true);
  assert.match(copy.textContent, /Installiere den TeachHelper als App/);
  assert.equal(installButton.disabled, false);
  await controller.handleInstall();
  assert.match(status.textContent, /Installationssymbol/);

  laterButton.dispatch('click');
  assert.equal(dialog.open, false);
  assert.equal(storage.getItem(PWA_INSTALL_DISMISSED_SESSION_KEY), '1');
  assert.equal(controller.showIfNeeded(), false);

  const installedController = createPwaInstallPrompt({
    windowRef: createWindow({ standalone: true }),
    navigatorRef: { userAgentData: { mobile: false, brands: [{ brand: 'Microsoft Edge' }] } },
    documentRef: {},
    dialog: new ElementStub(),
  });
  assert.equal(installedController.showIfNeeded(), false);
});

test('uses the deferred native installation prompt and closes after installation', async () => {
  const windowRef = createWindow();
  const dialog = new ElementStub();
  const installButton = new ElementStub();
  const status = new ElementStub();
  const controller = createPwaInstallPrompt({
    windowRef,
    navigatorRef: { userAgentData: { mobile: false, brands: [{ brand: 'Microsoft Edge' }] } },
    documentRef: {},
    sessionStorageRef: createStorage(),
    dialog,
    copy: new ElementStub(),
    installButton,
    status,
    laterButton: new ElementStub(),
  });
  controller.showIfNeeded();

  let prevented = false;
  let prompted = false;
  windowRef.dispatch('beforeinstallprompt', {
    preventDefault: () => { prevented = true; },
    prompt: async () => { prompted = true; },
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(prevented, true);
  assert.equal(installButton.disabled, false);

  await controller.handleInstall();
  assert.equal(prompted, true);
  windowRef.dispatch('appinstalled');
  assert.equal(dialog.open, false);
});
