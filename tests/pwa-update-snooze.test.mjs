import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/pwa-updates.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const {
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
  windowStub.location = { hostname, reload: () => {} };
  windowStub.localStorage = localStorageStub;
  windowStub.setInterval = () => 0;

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

function createDialogSetup() {
  const updateDialog = new DialogStub();
  const updateDialogLater = new EventTargetStub();
  const updateDialogReload = new EventTargetStub();
  return { updateDialog, updateDialogLater, updateDialogReload };
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

test('the manual version check in the shell forces the dialog', () => {
  assert.match(mainSource, /serviceWorkerUpdates\.checkForUpdates\(\{ force: true \}\)/);
});
