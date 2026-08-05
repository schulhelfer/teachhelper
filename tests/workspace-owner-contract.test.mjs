import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const messagesSource = await readFile(
  new URL('../src/shared/school-data/messages.js', import.meta.url),
  'utf8',
);
const messagesUrl = `data:text/javascript;base64,${Buffer.from(messagesSource).toString('base64')}`;
const runtimeUrl = `data:text/javascript;base64,${Buffer.from(`
export function createWorkspaceRuntime(store) {
  const clients = new Map();
  return {
    store, clients, ready: true,
    bindController(controller) { this.controller = controller; return this; },
    registerFeatureClient(scope, client) { clients.set(scope, client); return () => clients.delete(scope); },
    createWorkspaceSnapshot(scope) { return { scope, ready: this.ready }; },
    async handleWorkspaceAction() { return { changed: false }; },
    async handleWorkspaceCommand() { return { changed: false }; },
  };
}
`).toString('base64')}`;
const workspaceSource = (await readFile(
  new URL('../src/modules/workspace/index.js', import.meta.url),
  'utf8',
)).replace(
  "from '../../shared/school-data/messages.js';",
  `from '${messagesUrl}';`,
).replace("import { WorkspaceStore } from './store.js';", 'class WorkspaceStore {}')
  .replace("from './runtime.js';", `from '${runtimeUrl}';`);
const { createWorkspaceController } = await import(
  `data:text/javascript;base64,${Buffer.from(workspaceSource).toString('base64')}`
);

test('the shell exposes a stable owner before any feature frame attaches', () => {
  const controller = createWorkspaceController({ eventTarget: new EventTarget() });
  const store = controller.getStore();
  const feature = { generateWorkspaceArchive() {} };

  assert.equal(controller.attachRuntime(feature, store), true);
  const owner = controller.getOwner();
  assert.ok(owner);
  assert.notEqual(owner, feature);
  assert.equal("getRuntimeOwner" in controller, false);
  assert.equal(controller.getStore(), store);
  assert.equal(owner.store, store);
  assert.deepEqual(controller.getSnapshot('shell'), { scope: 'shell', ready: true });
  assert.equal(controller.attachRuntime({}, store), false);
});

test('the workspace store and runtime exist before a feature client attaches', () => {
  const controller = createWorkspaceController({ eventTarget: new EventTarget() });
  assert.ok(controller.getOwner());
  assert.ok(controller.getStore());
  assert.equal(controller.getLifecycle().serviceAttached, true);
  assert.equal(controller.isReady(), true);
});
