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
const [{ createWorkspaceController }, { WORKSPACE_STATE_EVENT }] = await Promise.all([
  import(`data:text/javascript;base64,${Buffer.from(workspaceSource).toString('base64')}`),
  import(messagesUrl),
]);

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

test('workspace state events are synchronous and feature changes are mirrored to the shell', () => {
  const target = new EventTarget();
  const controller = createWorkspaceController({ eventTarget: target });
  const sequence = [];
  target.addEventListener(WORKSPACE_STATE_EVENT, (event) => {
    sequence.push(`event:${event.detail.scope}`);
  });
  controller.registerClient('planning-observer', {
    scope: 'planning',
    onState: (detail) => sequence.push(`planning:${detail.scope}`),
  });
  controller.registerClient('grades-observer', {
    scope: 'grades',
    onState: (detail) => sequence.push(`grades:${detail.scope}`),
  });
  controller.registerClient('shell-observer', {
    scope: 'shell',
    onState: (detail) => sequence.push(`shell:${detail.scope}`),
  });
  sequence.length = 0;

  controller.markChanged('grades');

  assert.deepEqual(sequence, [
    'event:grades',
    'grades:grades',
    'event:planning',
    'planning:planning',
    'event:shell',
    'planning:shell',
    'grades:shell',
    'shell:shell',
  ]);

  sequence.length = 0;
  controller.markChanged('planning');

  assert.deepEqual(sequence, [
    'event:planning',
    'planning:planning',
    'event:grades',
    'grades:grades',
    'event:shell',
    'planning:shell',
    'grades:shell',
    'shell:shell',
  ]);
});
