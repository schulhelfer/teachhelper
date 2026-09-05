import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function moduleUrl(url) {
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.url', JSON.stringify(url.href));
  for (const match of [...source.matchAll(/from "([.][^"]+)"/g)]) {
    source = source.replace(match[0], `from "${await moduleUrl(new URL(match[1], url))}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const { createOcrPdfSession } = await import(await moduleUrl(new URL('../src/modules/grades/roster-ocr-pdf.js', import.meta.url)));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const file = () => new File(['%PDF-1.7\n'], 'liste.pdf', { type: 'application/pdf' });

function setup({ pendingLoad = false, pendingRender = false } = {}) {
  const calls = { destroyed: 0, cleaned: 0, pages: [], renders: [], canvases: [] };
  const document = {
    numPages: 3,
    async getPage(number) {
      calls.pages.push(number);
      return {
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 850 * scale }),
        cleanup() { calls.cleaned += 1; },
        render(options) {
          let resolve;
          let reject;
          const task = {
            options, cancelled: false,
            promise: pendingRender ? new Promise((res, rej) => { resolve = res; reject = rej; }) : Promise.resolve(),
            cancel() { this.cancelled = true; reject?.(new DOMException('Abgebrochen', 'AbortError')); },
            finish() { resolve?.(); },
          };
          calls.renders.push(task);
          return task;
        },
      };
    },
  };
  let resolveLoad;
  const task = {
    promise: pendingLoad ? new Promise((resolve) => { resolveLoad = resolve; }) : Promise.resolve(document),
    async destroy() { calls.destroyed += 1; },
  };
  const session = createOcrPdfSession({
    createCanvas() { const canvas = { width: 0, height: 0, getContext: () => ({}) }; calls.canvases.push(canvas); return canvas; },
    loadPdfJs: async () => ({ getDocument(options) { calls.options = options; return task; } }),
  });
  return { session, calls, finishLoad: () => resolveLoad?.(document) };
}

test('PDF renders only the selected page within the image budget and releases document and canvas', async () => {
  const { session, calls } = setup();
  assert.equal(await session.load(file()), 3);
  const first = await session.render(2);
  assert.deepEqual(calls.pages, [2]);
  assert.equal(calls.options.useWasm, false);
  assert.equal(calls.options.isEvalSupported, false);
  assert.ok(calls.options.data instanceof Uint8Array);
  assert.ok(first.width * first.height <= 4_000_000);
  assert.ok(Math.max(first.width, first.height) <= 4096);
  await assert.rejects(session.render(4), /gültige PDF-Seite/);
  const next = await session.render(3);
  assert.equal(first.width, 0);
  assert.ok(next.width > 0);
  session.destroy();
  session.destroy();
  assert.equal(next.width, 0);
  assert.equal(calls.destroyed, 1);
  assert.equal(calls.cleaned, 2);
});

test('invalid PDF signatures are rejected before loading a renderer', async () => {
  const { session, calls } = setup();
  await assert.rejects(session.load(new File(['image'], 'bad.pdf', { type: 'application/pdf' })), /keine gültige PDF/);
  assert.equal(calls.options, undefined);
});

test('aborting PDF load releases its worker and ignores a later document', async () => {
  const { session, calls, finishLoad } = setup({ pendingLoad: true });
  const controller = new AbortController();
  const pending = session.load(file(), { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  finishLoad();
  await tick();
  assert.equal(calls.destroyed, 1);
  await assert.rejects(session.render(1), { name: 'AbortError' });
});

test('aborting a PDF render clears its page and permits a retry', async () => {
  const { session, calls } = setup({ pendingRender: true });
  await session.load(file());
  const controller = new AbortController();
  const pending = session.render(1, { signal: controller.signal });
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls.renders[0].cancelled, true);
  assert.equal(calls.canvases[0].width, 0);
  const retry = session.render(2);
  await tick();
  calls.renders[1].finish();
  assert.ok((await retry).width > 0);
  session.destroy();
});

test('a cancelled render cannot clear a newer page request', async () => {
  const { session, calls } = setup({ pendingRender: true });
  await session.load(file());
  const first = session.render(1);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await tick();
  const second = session.render(2);
  await tick();
  calls.renders[1].finish();
  await rejected;
  assert.ok((await second).width > 0);
  session.destroy();
});
