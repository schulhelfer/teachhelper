import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function importWorkspaceModules() {
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
    createWorkspaceSnapshot(scope) { return { scope, status: { ready: this.ready }, ready: this.ready }; },
    async handleWorkspaceAction() { return { changed: false }; },
    async handleWorkspaceCommand() { return { changed: false }; },
  };
}
`).toString('base64')}`;
  const workspaceSource = await readFile(
    new URL('../src/modules/workspace/index.js', import.meta.url),
    'utf8',
  );
  const rewrittenWorkspaceSource = workspaceSource.replace(
    '../../shared/school-data/messages.js',
    messagesUrl,
  ).replace("import { WorkspaceStore } from './store.js';", 'class WorkspaceStore {}')
    .replace("from './runtime.js';", `from '${runtimeUrl}';`);
  const workspaceUrl = `data:text/javascript;base64,${Buffer.from(rewrittenWorkspaceSource).toString('base64')}`;
  return {
    messages: await import(messagesUrl),
    workspace: await import(workspaceUrl),
  };
}

const { messages, workspace } = await importWorkspaceModules();

function command(command, baseRevision, payload = {}) {
  return {
    requestId: `test:${command}:${baseRevision ?? 'none'}`,
    client: messages.WORKSPACE_CLIENT_PLANNING,
    command,
    payload,
    baseRevision,
  };
}

function createOwner({ ready = false, handle = async () => ({ changed: false }) } = {}) {
  const state = { ready };
  const owner = {
    state,
    createWorkspaceSnapshot(scope) {
      return {
        scope,
        status: { ready: state.ready },
        publicState: {
          courses: [{ id: 1, name: 'A' }],
          password: 'must-not-leak',
          nested: { vaultKey: 'must-not-leak-either', visible: true },
        },
      };
    },
    handleWorkspaceCommand: handle,
  };
  return owner;
}

function installOwnerBehavior(controller, behavior) {
  const owner = controller.getOwner();
  owner.createWorkspaceSnapshot = behavior.createWorkspaceSnapshot.bind(behavior);
  owner.handleWorkspaceCommand = behavior.handleWorkspaceCommand.bind(behavior);
  controller.setOwnerHydrated(owner, Boolean(behavior.state.ready));
  return owner;
}

test('workspace rejects reads and writes until the owner is fully hydrated', async () => {
  let commandCalls = 0;
  const owner = createOwner({
    handle: async () => {
      commandCalls += 1;
      return { changed: true, scope: messages.WORKSPACE_CLIENT_PLANNING };
    },
  });
  const controller = workspace.createWorkspaceController({ eventTarget: new EventTarget() });
  const runtimeOwner = installOwnerBehavior(controller, owner);
  const registeredRevision = controller.getRevision();
  assert.deepEqual(controller.getLifecycle(), {
    owner: true,
    serviceAttached: true,
    hydrated: false,
    ready: false,
    revision: registeredRevision,
  });

  const snapshotBeforeHydration = await controller.execute(command(
    messages.WORKSPACE_COMMAND_GET_SNAPSHOT,
    registeredRevision,
  ));
  assert.equal(snapshotBeforeHydration.ok, false);
  assert.equal(snapshotBeforeHydration.code, messages.WORKSPACE_ERROR_NOT_READY);
  assert.equal(snapshotBeforeHydration.hydrated, false);
  assert.equal(snapshotBeforeHydration.ready, false);

  const mutationBeforeHydration = await controller.execute(command('mutate', registeredRevision));
  assert.equal(mutationBeforeHydration.ok, false);
  assert.equal(mutationBeforeHydration.code, messages.WORKSPACE_ERROR_NOT_READY);
  assert.equal(commandCalls, 0, 'an unhydrated owner must never receive a mutating command');

  owner.state.ready = true;
  assert.equal(controller.refreshOwnerStatus(runtimeOwner), true);
  const hydratedRevision = controller.getRevision();
  assert.equal(controller.isReady(), true);
  assert.ok(hydratedRevision > registeredRevision);

  const mutation = await controller.execute(command('mutate', hydratedRevision));
  assert.equal(mutation.ok, true);
  assert.equal(mutation.hydrated, true);
  assert.equal(mutation.ready, true);
  assert.equal(commandCalls, 1);
  assert.equal(controller.getRevision(), hydratedRevision + 1);
});

test('workspace snapshots and command results cannot leak persisted secrets', async () => {
  const owner = createOwner({
    ready: true,
    handle: async () => ({
      changed: false,
      password: 'command-secret',
      data: { cryptoKey: 'key-secret', safe: 'visible' },
    }),
  });
  const controller = workspace.createWorkspaceController({ eventTarget: new EventTarget() });
  installOwnerBehavior(controller, owner);

  const snapshotResult = await controller.execute(command(
    messages.WORKSPACE_COMMAND_GET_SNAPSHOT,
    controller.getRevision(),
  ));
  assert.equal(snapshotResult.ok, true);
  assert.equal(snapshotResult.data.publicState.password, undefined);
  assert.equal(snapshotResult.data.publicState.nested.vaultKey, undefined);
  assert.equal(snapshotResult.data.publicState.nested.visible, true);

  const commandResult = await controller.execute(command('read-safe-result', controller.getRevision()));
  assert.equal(commandResult.ok, true);
  assert.equal(commandResult.data.password, undefined);
  assert.equal(commandResult.data.data.cryptoKey, undefined);
  assert.equal(commandResult.data.data.safe, 'visible');

  const original = owner.createWorkspaceSnapshot('planning');
  assert.equal(original.publicState.password, 'must-not-leak', 'redaction must not mutate owner state');
});

test('workspace rejects a stale revision before invoking the owner', async () => {
  const calls = [];
  const owner = createOwner({
    ready: true,
    handle: async (request) => {
      calls.push(request.requestId);
      return { changed: true, scope: messages.WORKSPACE_CLIENT_PLANNING };
    },
  });
  const controller = workspace.createWorkspaceController({ eventTarget: new EventTarget() });
  installOwnerBehavior(controller, owner);
  const baseRevision = controller.getRevision();

  const first = await controller.execute({
    ...command('first-change', baseRevision),
    requestId: 'first',
  });
  assert.equal(first.ok, true);
  assert.equal(controller.getRevision(), baseRevision + 1);

  const stale = await controller.execute({
    ...command('stale-change', baseRevision),
    requestId: 'stale',
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, messages.WORKSPACE_ERROR_STALE_STATE);
  assert.equal(stale.revision, baseRevision + 1);
  assert.equal(stale.data.publicState.courses[0].name, 'A');
  assert.deepEqual(calls, ['first']);
});

test('concurrent commands are serialized and a queued stale write is rejected atomically', async () => {
  const events = [];
  let active = 0;
  let maxActive = 0;
  const owner = createOwner({
    ready: true,
    handle: async (request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push(`start:${request.requestId}`);
      await new Promise((resolve) => setTimeout(resolve, 8));
      events.push(`end:${request.requestId}`);
      active -= 1;
      return { changed: true, scope: messages.WORKSPACE_CLIENT_PLANNING };
    },
  });
  const controller = workspace.createWorkspaceController({ eventTarget: new EventTarget() });
  installOwnerBehavior(controller, owner);
  const baseRevision = controller.getRevision();

  const firstPromise = controller.execute({
    ...command('change', baseRevision),
    requestId: 'one',
  });
  const stalePromise = controller.execute({
    ...command('change', baseRevision),
    requestId: 'two',
  });
  const [first, stale] = await Promise.all([firstPromise, stalePromise]);

  assert.equal(first.ok, true);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, messages.WORKSPACE_ERROR_STALE_STATE);
  assert.equal(maxActive, 1);
  assert.deepEqual(events, ['start:one', 'end:one']);

  const currentRevision = controller.getRevision();
  const unversioned = [1, 2, 3].map((number) => controller.execute({
    ...command('queued-change', null),
    requestId: `queue-${number}`,
  }));
  const results = await Promise.all(unversioned);
  assert.ok(results.every((result) => result.ok));
  assert.equal(controller.getRevision(), currentRevision + 3);
  assert.equal(maxActive, 1);
  assert.deepEqual(events.slice(2), [
    'start:queue-1', 'end:queue-1',
    'start:queue-2', 'end:queue-2',
    'start:queue-3', 'end:queue-3',
  ]);
});

test('replace-public-state also obeys hydration and revision checks', async () => {
  const applied = [];
  const owner = createOwner({ ready: true });
  owner.applyWorkspacePublicState = async (publicState) => {
    applied.push(publicState);
    return { imported: true };
  };
  const controller = workspace.createWorkspaceController({ eventTarget: new EventTarget() });
  const runtimeOwner = installOwnerBehavior(controller, owner);
  runtimeOwner.applyWorkspacePublicState = owner.applyWorkspacePublicState.bind(owner);
  const baseRevision = controller.getRevision();

  const result = await controller.execute(command(
    messages.WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE,
    baseRevision,
    { publicState: { courses: [{ id: 2 }] } },
  ));
  assert.equal(result.ok, true);
  assert.equal(controller.getRevision(), baseRevision + 1);
  assert.deepEqual(applied, [{ courses: [{ id: 2 }] }]);

  const stale = await controller.execute(command(
    messages.WORKSPACE_COMMAND_REPLACE_PUBLIC_STATE,
    baseRevision,
    { publicState: { courses: [] } },
  ));
  assert.equal(stale.ok, false);
  assert.equal(stale.code, messages.WORKSPACE_ERROR_STALE_STATE);
  assert.equal(applied.length, 1);
});
