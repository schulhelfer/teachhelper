import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleRegistry } from '../src/app/module-registry.js';
import { createIframeModuleAdapters } from '../src/app/iframe-module-adapters.js';

function createHarness() {
  const calls = [];
  const frames = new Map();
  const getters = Object.fromEntries([
    ['planning', 'Planning'], ['grades', 'Grades'], ['merger', 'Merger'],
    ['duplicate-check', 'DuplicateCheck'], ['qr', 'Qr'], ['seatplan', 'Seatplan'], ['name-learning', 'NameLearning'],
  ].map(([id, name]) => [`get${name}Frame`, () => frames.get(id)]));
  let bridge = null;
  const registry = createModuleRegistry(createIframeModuleAdapters({
    frames: getters,
    getBridgeController: () => bridge,
    els: {},
  }));
  bridge = {
    ensureTabInitialized: (id) => calls.push(['init', id]),
    applyModuleShellLayout: (id, context) => calls.push(['layout', id, context]),
    disposeModule: (id) => calls.push(['dispose', id]),
  };
  return { registry, calls, frames };
}

test('adapters resolve late bridge and tutorial frames without mounting for broadcasts', () => {
  const { registry, calls, frames } = createHarness();
  assert.equal(registry.list().length, 7);
  assert.equal(registry.get('groups'), null);
  const planning = registry.get('planning');
  assert.equal(planning.getFrame(), null);
  registry.broadcast({ type: 'test' });
  assert.deepEqual(calls, []);
  const live = {};
  const tutorial = {};
  frames.set('planning', live);
  assert.equal(planning.getFrame(), live);
  frames.set('planning', tutorial);
  assert.equal(planning.getFrame(), tutorial);
  frames.set('planning', live);
  assert.equal(planning.getFrame(), live);
  planning.ensureInitialized();
  planning.applyShellLayout({ activeTab: 'planning' });
  assert.deepEqual(calls, [['init', 'planning'], ['layout', 'planning', { activeTab: 'planning' }]]);
});

test('sidebar broadcasts use adapter scopes and disposal stops late work', (t) => {
  const previous = globalThis.window;
  globalThis.window = { location: { href: 'https://teachhelper.test/' } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const { registry, calls, frames } = createHarness();
  const messages = [];
  for (const adapter of registry.list()) {
    frames.set(adapter.id, {
      src: 'https://teachhelper.test/module',
      dataset: {},
      contentWindow: { postMessage: (payload) => messages.push([adapter.id, payload.type]) },
    });
  }
  registry.broadcast({ type: 'layout' }, (adapter) => adapter.sidebarScope === 'planning');
  assert.deepEqual(messages, [['grades', 'layout'], ['planning', 'layout']]);
  registry.dispose();
  registry.dispose();
  registry.broadcast({ type: 'late' });
  for (const adapter of registry.list()) {
    assert.equal(adapter.getFrame(), null);
    assert.equal(adapter.postMessage({ type: 'late' }), false);
    adapter.ensureInitialized();
    adapter.applyShellLayout({});
    adapter.dispose();
  }
  assert.equal(messages.length, 2);
  assert.deepEqual(calls, registry.list().map(({ id }) => ['dispose', id]));
});

test('cleanup continues through all modules when a controller throws', () => {
  const calls = [];
  const registry = createModuleRegistry([
    { id: 'one', dispose() { calls.push('one'); throw new Error('cleanup'); } },
    { id: 'two', dispose() { calls.push('two'); } },
  ]);
  assert.throws(() => registry.dispose(), AggregateError);
  registry.dispose();
  assert.deepEqual(calls, ['one', 'two']);
});
