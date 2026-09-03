import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/pwa-updates.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const shellCss = await readFile(new URL('../src/app/shell.css', import.meta.url), 'utf8');
const {
  AUTOMATIC_UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_ACTIVATION_TIMEOUT_MS,
  UPDATE_SNOOZE_MS,
  UPDATE_SNOOZE_STORAGE_KEY,
  registerServiceWorkerUpdates,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class EventTargetStub {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = (this.listeners.get(type) || []).filter((entry) => entry !== listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) {
      listener(event);
    }
  }
}

class DialogStub extends EventTargetStub {
  constructor() {
    super();
    this.open = false;
    this.showModalCount = 0;
    this.attributes = new Map();
  }

  showModal() {
    this.open = true;
    this.showModalCount += 1;
  }

  close() {
    this.open = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

class WorkerStub extends EventTargetStub {
  constructor(state = 'installed') {
    super();
    this.state = state;
    this.messages = [];
  }

  postMessage(message) {
    this.messages.push(message);
  }
}

class RegistrationStub extends EventTargetStub {
  constructor({ waiting = null } = {}) {
    super();
    this.active = new WorkerStub('activated');
    this.installing = null;
    this.waiting = waiting;
    this.updateCount = 0;
  }

  async update() {
    this.updateCount += 1;
  }
}

function createLocalStorageStub() {
  const store = new Map();
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

async function withEnvironment(run, { hostname = 'teachhelper.example' } = {}) {
  const localStorageStub = createLocalStorageStub();
  const registration = new RegistrationStub({ waiting: new WorkerStub('installed') });
  const serviceWorkerContainer = new EventTargetStub();
  serviceWorkerContainer.controller = new WorkerStub('activated');
  serviceWorkerContainer.register = async () => registration;

  const windowStub = new EventTargetStub();
  windowStub.reloadCount = 0;
  windowStub.location = { hostname, reload: () => { windowStub.reloadCount += 1; } };
  windowStub.localStorage = localStorageStub;
  windowStub.setInterval = () => 0;
  windowStub.scheduledTimeouts = [];
  windowStub.setTimeout = (handler, delay) => {
    windowStub.scheduledTimeouts.push({ handler, delay, cleared: false });
    return windowStub.scheduledTimeouts.length;
  };
  windowStub.clearTimeout = (id) => {
    const timer = windowStub.scheduledTimeouts[id - 1];
    if (timer) timer.cleared = true;
  };

  const documentStub = new EventTargetStub();
  documentStub.readyState = 'complete';
  documentStub.visibilityState = 'visible';

  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: serviceWorkerContainer },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: windowStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: documentStub,
    configurable: true,
    writable: true,
  });

  try {
    return await run({ registration, localStorage: localStorageStub, windowStub });
  } finally {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete globalThis[name];
      }
    }
  }
}

class ElementStub extends EventTargetStub {
  constructor() {
    super();
    this.textContent = '';
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }
}

function createDialogSetup() {
  const updateDialog = new DialogStub();
  const updateDialogLater = new EventTargetStub();
  const updateDialogReload = new ElementStub();
  const updateDialogForce = new ElementStub();
  const updateDialogStatus = new ElementStub();
  return {
    updateDialog,
    updateDialogLater,
    updateDialogReload,
    updateDialogForce,
    updateDialogStatus,
  };
}

test('"Später" silences the update dialog instead of only closing it', async () => {
  await withEnvironment(async ({ localStorage }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });

    const first = await updates.checkForUpdates();
    assert.equal(first.status, 'update-available');
    assert.equal(dialogs.updateDialog.showModalCount, 1, 'dialog opens once an update waits');

    dialogs.updateDialogLater.dispatch('click');
    assert.equal(dialogs.updateDialog.open, false);
    const snoozedUntil = Number(localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY));
    assert.ok(snoozedUntil > Date.now(), 'later must store a snooze deadline');
    assert.ok(snoozedUntil <= Date.now() + UPDATE_SNOOZE_MS);

    await updates.checkForUpdates();
    await updates.checkForUpdates();
    assert.equal(
      dialogs.updateDialog.showModalCount,
      1,
      'periodic checks must not reopen the dialog while snoozed',
    );
  });
});

test('an expired snooze and a manual check both bring the dialog back', async () => {
  await withEnvironment(async ({ localStorage }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();
    dialogs.updateDialogLater.dispatch('click');

    await updates.checkForUpdates({ force: true });
    assert.equal(dialogs.updateDialog.showModalCount, 2, 'a manual check ignores the snooze');
    assert.equal(
      localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY),
      null,
      'a manual check clears the snooze',
    );

    dialogs.updateDialogLater.dispatch('click');
    localStorage.setItem(UPDATE_SNOOZE_STORAGE_KEY, String(Date.now() - 1));
    await updates.checkForUpdates();
    assert.equal(dialogs.updateDialog.showModalCount, 3, 'an expired snooze prompts again');
  });
});

test('a newer version cancels a snooze taken for the previous one', async () => {
  await withEnvironment(async ({ registration, localStorage }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();
    dialogs.updateDialogLater.dispatch('click');
    assert.ok(localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY));

    registration.installing = new WorkerStub('installing');
    registration.dispatch('updatefound');
    assert.equal(
      localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY),
      null,
      'a newly installing worker must clear the old snooze',
    );

    registration.installing.state = 'installed';
    registration.installing.dispatch('statechange');
    assert.equal(dialogs.updateDialog.showModalCount, 2);
  });
});

test('automatic checks are throttled while manual checks always hit the network', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });

    await updates.checkForUpdates();
    assert.equal(registration.updateCount, 1);

    for (let index = 0; index < 25; index += 1) {
      await updates.checkForUpdates();
    }
    assert.equal(
      registration.updateCount,
      1,
      'rapid automatic checks must not produce one update request each',
    );

    const result = await updates.checkForUpdates({ force: true });
    assert.equal(registration.updateCount, 2, 'a manual check bypasses the throttle');
    assert.equal(result.status, 'update-available');
    assert.ok(AUTOMATIC_UPDATE_CHECK_MIN_INTERVAL_MS >= 60 * 1000);
  });
});

test('a throttled check still reports the waiting update', async () => {
  await withEnvironment(async () => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();
    const throttled = await updates.checkForUpdates();
    assert.equal(throttled.status, 'update-available');
  });
});

test('the manual version check in the shell forces the dialog', () => {
  assert.match(mainSource, /serviceWorkerUpdates\.checkForUpdates\(\{ force: true \}\)/);
});

test('a failing beforeReloadForUpdate blocks the update and explains why inside the dialog', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      beforeReloadForUpdate: async () => ({ ok: false, reason: 'Der Backup-Ordner ist nicht mehr erreichbar.' }),
    });
    await updates.checkForUpdates();
    assert.equal(dialogs.updateDialog.open, true);

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      false,
      'a blocked update must not skip waiting',
    );
    assert.equal(dialogs.updateDialog.open, true, 'the dialog stays open when the backup fails');
    assert.match(
      dialogs.updateDialogStatus.textContent,
      /Der Backup-Ordner ist nicht mehr erreichbar\./,
      'the concrete reason must be readable inside the modal dialog',
    );
    assert.equal(dialogs.updateDialogStatus.hidden, false);
    assert.equal(dialogs.updateDialogStatus.classList.contains('is-error'), true);
    assert.equal(dialogs.updateDialogForce.hidden, false, 'the escape hatch must appear');
    assert.equal(dialogs.updateDialogReload.textContent, 'Nochmal versuchen');
  });
});

test('a throwing beforeReloadForUpdate blocks the update instead of waving it through', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      beforeReloadForUpdate: async () => {
        throw new Error('Notenbereich ist gesperrt.');
      },
    });
    await updates.checkForUpdates();

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      false,
      'a thrown hook must never activate the waiting worker without a backup',
    );
    assert.match(dialogs.updateDialogStatus.textContent, /Notenbereich ist gesperrt\./);
  });
});

test('"Ohne Backup aktualisieren" updates without consulting the backup hook again', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    let hookCalls = 0;
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      beforeReloadForUpdate: async () => {
        hookCalls += 1;
        return { ok: false, reason: 'Kein Platz auf dem Laufwerk.' };
      },
    });
    await updates.checkForUpdates();

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.equal(hookCalls, 1);

    dialogs.updateDialogForce.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(hookCalls, 1, 'the forced path must not run the backup again');
    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      true,
      'the forced path must activate the waiting worker',
    );
    assert.equal(dialogs.updateDialog.open, false);
  });
});

test('"Nochmal versuchen" retries the backup and updates once it succeeds', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    let hookCalls = 0;
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      beforeReloadForUpdate: async () => {
        hookCalls += 1;
        return hookCalls === 1
          ? { ok: false, reason: 'Zugriff verweigert' }
          : { ok: true, skipped: false, reason: '' };
      },
    });
    await updates.checkForUpdates();

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      false,
    );

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(hookCalls, 2);
    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      true,
      'a successful retry must activate the waiting worker',
    );
  });
});

test('a missing backup folder is announced when the dialog opens, not while it closes', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      describeBackupStatus: () => 'Kein Backup-Ordner verbunden – das Update läuft ohne Sicherung.',
      beforeReloadForUpdate: async () => ({ ok: true, skipped: true, reason: '' }),
    });
    await updates.checkForUpdates();

    assert.equal(dialogs.updateDialog.open, true);
    assert.match(dialogs.updateDialogStatus.textContent, /ohne Sicherung/);
    assert.equal(dialogs.updateDialogStatus.hidden, false);
    assert.equal(
      dialogs.updateDialogForce.hidden,
      true,
      'a hint is not a failure, so the escape hatch stays hidden',
    );

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      true,
      'a skipped backup must not block the update',
    );
  });
});

test('the update dialog markup carries the status line and the escape hatch', () => {
  assert.match(htmlSource, /id="update-dialog-status"[^>]*role="status"/);
  assert.match(htmlSource, /id="update-dialog-force"[^>]*hidden/);
  assert.match(htmlSource, /id="update-dialog"[^>]*aria-describedby="update-dialog-status"/);
  assert.match(shellCss, /\.dialog-status\.is-error \{/);
});

test('ESC counts as "Später" instead of silencing the dialog for good', async () => {
  await withEnvironment(async ({ localStorage }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();
    assert.equal(dialogs.updateDialog.showModalCount, 1);

    dialogs.updateDialog.dispatch('cancel');
    dialogs.updateDialog.open = false;

    assert.ok(
      Number(localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY)) > Date.now(),
      'ESC must snooze the update like "Später" does',
    );

    localStorage.setItem(UPDATE_SNOOZE_STORAGE_KEY, String(Date.now() - 1));
    await updates.checkForUpdates();
    assert.equal(
      dialogs.updateDialog.showModalCount,
      2,
      'the dialog must reopen once the snooze has expired',
    );
  });
});

test('the waiting worker gets the token again right before it skips waiting', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();

    registration.waiting.messages.length = 0;

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.deepEqual(
      registration.waiting.messages.map((message) => message.type),
      ['SET_UPDATE_TOKEN', 'SKIP_WAITING'],
      'the token must travel with the click, not only with the registration',
    );
    const [tokenMessage, skipMessage] = registration.waiting.messages;
    assert.ok(skipMessage.token);
    assert.equal(tokenMessage.token, skipMessage.token);
  });
});

test('an activation that never takes over still gets the user out of the dialog', async () => {
  await withEnvironment(async ({ windowStub }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    const fallback = windowStub.scheduledTimeouts.at(-1);
    assert.ok(fallback, 'the reload must not hang on controllerchange alone');
    assert.equal(fallback.delay, UPDATE_ACTIVATION_TIMEOUT_MS);

    assert.equal(windowStub.reloadCount, 0, 'the fallback must not reload right away');
    fallback.handler();
    assert.equal(windowStub.reloadCount, 1);
  });
});

test('the service worker is registered as a classic script so old browsers keep working', () => {
  const registerCall = source.match(/navigator\.serviceWorker\.register\([\s\S]*?\n\s*\}\);/);
  assert.ok(registerCall, 'the module must register a service worker');
  assert.match(registerCall[0], /updateViaCache: 'none'/);
  assert.doesNotMatch(registerCall[0], /type:/);
});

test('a successful beforeReloadForUpdate runs before the waiting worker is activated', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    const calls = [];
    const updates = registerServiceWorkerUpdates({
      ...dialogs,
      serviceWorkerUrl: './sw.js',
      beforeReloadForUpdate: async () => {
        calls.push('backup');
        return true;
      },
    });
    await updates.checkForUpdates();

    dialogs.updateDialogReload.dispatch('click');
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    assert.deepEqual(calls, ['backup'], 'the backup hook must run before the update is applied');
    assert.equal(
      registration.waiting.messages.some((message) => message.type === 'SKIP_WAITING'),
      true,
      'the waiting worker is told to skip waiting',
    );
    assert.equal(dialogs.updateDialog.open, false);
  });
});

test('a manual check reports a still installing update instead of claiming the app is current', async () => {
  await withEnvironment(async ({ registration }) => {
    const dialogs = createDialogSetup();
    registration.waiting = null;
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    registration.update = async () => {
      registration.updateCount += 1;
      registration.installing = new WorkerStub('installing');
      registration.dispatch('updatefound');
    };

    const result = await updates.checkForUpdates({ force: true });
    assert.equal(
      result.status,
      'update-installing',
      'update() resolves while the new worker installs, so waiting is still empty',
    );
    assert.equal(dialogs.updateDialog.showModalCount, 0);

    registration.waiting = registration.installing;
    registration.installing.state = 'installed';
    registration.waiting.dispatch('statechange');
    assert.equal(
      dialogs.updateDialog.showModalCount,
      1,
      'the dialog opens as soon as the update finished installing',
    );
  });
});

test('a manual check clears the snooze even while the update is still installing', async () => {
  await withEnvironment(async ({ registration, localStorage }) => {
    const dialogs = createDialogSetup();
    const updates = registerServiceWorkerUpdates({ ...dialogs, serviceWorkerUrl: './sw.js' });
    await updates.checkForUpdates();
    dialogs.updateDialogLater.dispatch('click');
    assert.ok(localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY));

    registration.waiting = null;
    registration.installing = new WorkerStub('installing');
    const result = await updates.checkForUpdates({ force: true });
    assert.equal(result.status, 'update-installing');
    assert.equal(
      localStorage.getItem(UPDATE_SNOOZE_STORAGE_KEY),
      null,
      'the snooze must not outlive a manual check just because waiting is still empty',
    );

    registration.waiting = new WorkerStub('installed');
    registration.installing = null;
    await updates.checkForUpdates();
    assert.equal(dialogs.updateDialog.showModalCount, 2);
  });
});

test('the shell tells the user about a still installing update', () => {
  assert.match(mainSource, /case 'update-installing':/);
  assert.doesNotMatch(
    mainSource,
    /case 'update-installing':\s*\n\s*break;/,
    'a still installing update must not fall through silently',
  );
});

test('the version number is a control before any script runs', () => {
  const versionElement = htmlSource.match(/<span id="app-header-version"[\s\S]*?>/)?.[0];
  assert.ok(versionElement, 'index.html must ship the header version element');
  assert.match(versionElement, /role="button"/);
  assert.match(versionElement, /tabindex="0"/);
  assert.doesNotMatch(
    mainSource,
    /headerVersion\.(?:set|remove)Attribute\('(?:role|tabindex)'/,
    'the window controls overlay carves the drag region out before the boot script runs, '
    + 'so role and tabindex must not depend on it',
  );
});

test('the version number stays clickable inside the window drag region', () => {
  const wco = shellCss.slice(shellCss.indexOf('@media (display-mode: window-controls-overlay)'));
  assert.ok(wco, 'shell.css must style the window controls overlay');
  assert.match(
    wco,
    /\.app-header-version \{[^}]*app-region: no-drag;/,
    'without its own no-drag rule the header drag region swallows every mouse event on it',
  );
});
