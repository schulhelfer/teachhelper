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
const { createRosterOcrDialog } = await import(await moduleUrl(new URL('../src/modules/grades/roster-ocr-dialog.js', import.meta.url)));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const pct = (value) => Math.round(parseFloat(value) * 1000) / 1000;
const entryCount = (state) => Math.max(0, state.refs.rows.children.length - 1);

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = new Map(); this.style = {}; this.dataset = {}; this.value = ''; this.hidden = false; this.attributes = {}; this.draws = []; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  fire(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener({ target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { this.clicked = (this.clicked || 0) + 1; this.fire('click'); }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() { this.focused = true; }
  querySelector(tag) { for (const child of this.children) { if (child.tag === tag) return child; const nested = child.querySelector(tag); if (nested) return nested; } return null; }
  querySelectorAll(selector) { const key = selector.match(/data-ocr="([^"]+)"/)?.[1]; return this.children.flatMap((child) => [...(child.dataset.ocr === key ? [child] : []), ...child.querySelectorAll(selector)]); }
  closest(selector) { const key = selector.match(/data-ocr="([^"]+)"/)?.[1]; return key && this.dataset.ocr === key ? this : null; }
  getContext() { return Object.fromEntries(['save', 'restore', 'fillRect', 'scale', 'translate', 'rotate', 'drawImage'].map((name) => [name, (...args) => this.draws.push([name, ...args])])); }
  toBlob(callback) { callback(new Blob(['image'])); }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 }; }
  setPointerCapture(id) { this.pointerId = id; }
  hasPointerCapture(id) { return this.pointerId === id; }
  releasePointerCapture() { this.pointerId = null; }
}

function setup(recognize, options = {}) {
  const refs = Object.fromEntries(['canvas', 'stage', 'status', 'confirm', 'recognize', 'rotate', 'order', 'stop', 'progress', 'rows', 'review', 'file', 'frame', 'drop', 'crop', 'close', 'paste', 'pdf-pages', 'pdf-page', 'pdf-count'].map((key) => [key, new Element()]));
  for (const [key, element] of Object.entries(refs)) element.dataset.ocr = key;
  refs.review.append(refs.rows);
  for (const value of ['first-last', 'last-first']) {
    const input = new Element('input');
    input.dataset.ocr = 'order-input';
    input.value = value;
    input.checked = value === 'last-first';
    refs.order.append(input);
  }
  const form = new Element('form');
  const dialog = new Element('dialog');
  dialog.append(refs.order);
  const created = [];
  dialog.ownerDocument = { createElement(tag) { const element = new Element(tag); created.push(element); return element; } };
  dialog.querySelector = (selector) => selector === 'form' ? form : refs[selector.match(/data-ocr="([^"]+)"/)[1]];
  const imported = [];
  const api = createRosterOcrDialog({ dialog, recognize, openDialog: () => { dialog.open = true; }, closeDialog: () => { dialog.open = false; dialog.fire('close'); }, onImported: (result) => imported.push(result), ...options });
  return { api, dialog, refs, form, imported, created };
}

async function selectImage(refs) {
  refs.file.files = [new File(['picture'], 'liste.png', { type: 'image/png' })];
  refs.file.fire('change');
  await tick();
}

function installImage(t, decode = () => Promise.resolve()) {
  t.mock.method(URL, 'createObjectURL', () => 'blob:local-picture');
  const revoked = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.property(globalThis, 'Image', class { naturalWidth = 2000; naturalHeight = 1000; decode = decode; });
  return revoked;
}

if (!('Image' in globalThis)) globalThis.Image = undefined;

test('the dialog crops the original coordinates and commits the corrected rows that were not deleted', async (t) => {
  const revoked = installImage(t);
  const results = [];
  const state = setup(async () => 'Muller Anna\nBauer Max\nWolf Tom');
  state.api.open((names) => { results.push(names); return { added: names.length, skipped: 0 }; });
  await selectImage(state.refs);
  assert.equal(revoked.mock.callCount(), 1);
  assert.equal(state.refs.recognize.disabled, false);
  state.refs.stage.fire('pointerdown', { isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 100, target: state.refs.canvas });
  state.refs.stage.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 400 });
  state.refs.stage.fire('pointerup', { pointerId: 1 });
  state.refs.recognize.fire('click');
  await tick(); await tick();
  assert.equal(results.length, 0, 'OCR completion must not mutate the roster');
  const output = state.created.find((element) => element.tag === 'canvas');
  assert.ok(output.draws.some(([name, x, y]) => name === 'translate' && x === -200 && y === -200));
  assert.equal(output.width, 0, 'temporary OCR canvas is released');
  const [head, first, second] = state.refs.rows.children;
  assert.deepEqual(head.children.map((cell) => cell.textContent), ['Nachname', 'Vorname', '']);
  assert.equal(state.refs.rows.children.length, 4, 'one header plus three recognized rows');
  first.children[0].value = 'Müller';
  first.children[0].fire('input');
  assert.ok(second.children[2].className.includes('danger-action'), 'the row delete button is styled as a danger action');
  second.children[2].fire('click');
  state.refs.rows.children[2].children[2].fire('click');
  assert.equal(state.refs.confirm.attributes['aria-label'], '1 Namen übernehmen');
  assert.equal(state.refs.confirm.attributes['aria-label'], state.refs.confirm.dataset.tooltip);
  assert.equal(state.refs.confirm.textContent, undefined, 'the header submit keeps its icon as content');
  state.form.fire('submit');
  assert.deepEqual(results, [[{ lastName: 'Müller', firstName: 'Anna' }]]);
  assert.equal(state.dialog.open, false);
  assert.equal(state.refs.canvas.width, 0);
  assert.equal(state.refs.rows.children.length, 0);
  assert.equal(state.refs.file.value, '');
});

test('closing, reopening and selecting another image invalidate outstanding OCR results', async (t) => {
  installImage(t);
  const jobs = [];
  const state = setup((_bytes, { signal }) => new Promise((resolve) => jobs.push({ resolve, signal })));
  let imports = 0;
  state.api.open(() => { imports += 1; });
  await selectImage(state.refs);
  state.refs.recognize.fire('click'); await tick();
  state.api.close();
  assert.equal(jobs[0].signal.aborted, true);
  state.api.open(() => { imports += 1; });
  jobs[0].resolve('Old Name'); await tick();
  assert.equal(state.refs.rows.children.length, 0);
  await selectImage(state.refs);
  state.refs.recognize.fire('click'); await tick();
  await selectImage(state.refs);
  assert.equal(jobs[1].signal.aborted, true);
  jobs[1].resolve('Other Name'); await tick();
  assert.equal(state.refs.rows.children.length, 0);
  state.form.fire('submit');
  assert.equal(imports, 0);
  state.api.close();
});

test('an image finishing decode after close cannot reopen the crop or retain its URL', async (t) => {
  let resolve;
  const revoked = installImage(t, () => new Promise((done) => { resolve = done; }));
  const state = setup(() => assert.fail('OCR should not start'));
  state.api.open(() => assert.fail('No import'));
  await selectImage(state.refs);
  state.api.close();
  resolve(); await tick();
  assert.equal(state.refs.frame.hidden, true);
  assert.equal(state.refs.stage.dataset.state, 'empty');
  assert.equal(state.refs.canvas.width, 0);
  assert.equal(revoked.mock.callCount(), 1);
});

test('keyboard crop changes, rotation, recognition failure and retry leave the dialog usable', async (t) => {
  installImage(t);
  let calls = 0;
  const state = setup(async () => { if (++calls === 1) throw Error('Testfehler'); return 'Müller Anna'; });
  state.api.open(() => {});
  await selectImage(state.refs);
  state.refs.stage.fire('pointerdown', { isPrimary: true, button: 0, pointerId: 1, clientX: 200, clientY: 100, target: state.refs.canvas });
  state.refs.stage.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 400 });
  state.refs.stage.fire('pointerup', { pointerId: 1 });
  state.refs.stage.fire('keydown', { target: state.refs.crop, key: 'ArrowRight', shiftKey: true });
  assert.equal(pct(state.refs.crop.style.left), 20.5);
  state.refs.stage.fire('keydown', { target: state.refs.crop, key: 'ArrowDown', altKey: true });
  assert.equal(pct(state.refs.crop.style.height), 60.1);
  state.refs.rotate.fire('click');
  assert.equal(state.refs.canvas.width, 600);
  assert.equal(state.refs.canvas.height, 1200);
  state.refs.recognize.fire('click'); await tick(); await tick();
  assert.equal(state.refs.status.textContent, 'Testfehler');
  assert.equal(state.refs.recognize.disabled, false);
  state.refs.recognize.fire('click'); await tick(); await tick();
  assert.equal(entryCount(state), 1);
  state.api.close();
});

test('the name order segment control drives parsing, resets on open and locks while busy', async (t) => {
  installImage(t);
  const results = [];
  const state = setup(async () => 'Anna Müller');
  const [firstLast, lastFirst] = state.refs.order.children;
  state.api.open((names) => { results.push(names); return { added: names.length, skipped: 0 }; });
  assert.equal(lastFirst.checked, true);
  assert.equal(firstLast.checked, false);
  await selectImage(state.refs);
  state.refs.recognize.fire('click'); await tick(); await tick();
  assert.deepEqual(entryCount(state), 1);
  state.form.fire('submit');
  assert.deepEqual(results, [[{ lastName: 'Anna', firstName: 'Müller' }]]);

  state.api.open((names) => { results.push(names); return { added: names.length, skipped: 0 }; });
  assert.equal(lastFirst.checked, true, 'reopening restores the default order');
  firstLast.checked = true;
  lastFirst.checked = false;
  state.refs.order.fire('change', { target: firstLast });
  assert.equal(state.refs.status.textContent, '');
  assert.equal(state.refs.rows.children.length, 0);
  await selectImage(state.refs);
  state.refs.recognize.fire('click');
  assert.equal(firstLast.disabled, true, 'the order stays fixed while OCR runs');
  await tick(); await tick();
  assert.equal(firstLast.disabled, false);
  state.form.fire('submit');
  assert.deepEqual(results[1], [{ lastName: 'Müller', firstName: 'Anna' }]);
});

test('the crop is resized from its border and moved from its interior without handle elements', async (t) => {
  installImage(t);
  const state = setup(async () => '');
  state.api.open(() => {});
  await selectImage(state.refs);
  state.refs.stage.fire('pointerdown', { isPrimary: true, button: 0, pointerId: 1, clientX: 200, clientY: 100, target: state.refs.canvas });
  state.refs.stage.fire('pointermove', { pointerId: 1, clientX: 600, clientY: 400 });
  state.refs.stage.fire('pointerup', { pointerId: 1 });
  state.refs.crop.rect = { left: 200, top: 100, right: 600, bottom: 400, width: 400, height: 300 };

  state.refs.stage.fire('pointermove', { clientX: 210, clientY: 110, target: state.refs.crop });
  assert.equal(state.refs.crop.dataset.resize, 'nw');
  state.refs.stage.fire('pointerdown', { isPrimary: true, button: 0, pointerId: 2, clientX: 210, clientY: 110, target: state.refs.crop });
  state.refs.stage.fire('pointermove', { pointerId: 2, clientX: 310, clientY: 210, target: state.refs.crop });
  state.refs.stage.fire('pointerup', { pointerId: 2 });
  assert.deepEqual(
    [pct(state.refs.crop.style.left), pct(state.refs.crop.style.top), pct(state.refs.crop.style.width), pct(state.refs.crop.style.height)],
    [30, 40, 30, 40]
  );
  assert.equal(state.refs.crop.dataset.resize, undefined);

  state.refs.stage.fire('pointermove', { clientX: 400, clientY: 250, target: state.refs.crop });
  assert.equal(state.refs.crop.dataset.resize, undefined);
  state.refs.stage.fire('pointerdown', { isPrimary: true, button: 0, pointerId: 3, clientX: 400, clientY: 250, target: state.refs.crop });
  state.refs.stage.fire('pointermove', { pointerId: 3, clientX: 450, clientY: 250, target: state.refs.crop });
  state.refs.stage.fire('pointerup', { pointerId: 3 });
  assert.deepEqual([pct(state.refs.crop.style.left), pct(state.refs.crop.style.width)], [35, 30]);
  state.api.close();
});

test('the stage is the dropzone: it opens the file picker while empty and accepts dropped files', async (t) => {
  installImage(t);
  const state = setup(async () => '');
  state.api.open(() => {});
  assert.deepEqual(
    [state.refs.stage.dataset.state, state.refs.frame.hidden, state.refs.drop.hidden],
    ['empty', true, false]
  );
  state.refs.stage.fire('click');
  state.refs.stage.fire('keydown', { key: 'Enter' });
  assert.equal(state.refs.file.clicked, 2, 'click and Enter on the empty stage open the file picker');

  const transfer = { types: ['Files'], files: [new File(['picture'], 'liste.png', { type: 'image/png' })] };
  state.refs.stage.fire('dragenter', { dataTransfer: transfer });
  assert.equal(state.refs.stage.dataset.dragOver, '1');
  state.refs.stage.fire('dragleave', { dataTransfer: transfer });
  assert.equal(state.refs.stage.dataset.dragOver, undefined);
  state.refs.stage.fire('drop', { dataTransfer: transfer });
  await tick(); await tick();
  assert.deepEqual(
    [state.refs.stage.dataset.state, state.refs.frame.hidden, state.refs.drop.hidden, state.refs.stage.dataset.dragOver],
    ['loaded', false, true, undefined]
  );
  assert.equal(state.refs.rotate.disabled, false);
  state.refs.stage.fire('click');
  assert.equal(state.refs.file.clicked, 2, 'a loaded stage no longer opens the picker');
  state.api.close();
  assert.equal(state.refs.stage.dataset.state, 'empty');
});

if (!('clipboard' in navigator)) Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

test('clipboard image button reads immediately and loads the image without importing names', async (t) => {
  installImage(t);
  let reads = 0;
  t.mock.property(navigator, 'clipboard', { read: async () => {
    reads += 1;
    return [{ types: ['text/plain', 'image/png'], getType: async () => new Blob(['picture'], { type: 'image/png' }) }];
  } });
  const state = setup(() => assert.fail('OCR must remain explicit'));
  state.api.open(() => assert.fail('Import must remain explicit'));
  state.refs.paste.fire('click');
  assert.equal(reads, 1);
  await tick();
  assert.equal(state.refs.stage.dataset.state, 'loaded');
  assert.equal(state.refs.recognize.disabled, false);
  assert.equal(state.refs['pdf-pages'].hidden, true);
  state.api.close();
});

test('clipboard errors preserve the current image and delayed reads are ignored after close', async (t) => {
  installImage(t);
  const clipboard = { read: async () => { throw new DOMException('Denied', 'NotAllowedError'); } };
  t.mock.property(navigator, 'clipboard', clipboard);
  const state = setup(() => assert.fail('No OCR'));
  state.api.open(() => {});
  await selectImage(state.refs);
  state.refs.paste.fire('click');
  await tick();
  assert.match(state.refs.status.textContent, /nicht erlaubt/);
  assert.equal(state.refs.stage.dataset.state, 'loaded');
  let resolve;
  clipboard.read = () => new Promise((done) => { resolve = done; });
  state.refs.paste.fire('click');
  state.api.close();
  resolve([{ types: ['image/png'], getType: () => assert.fail('Closed dialog must ignore clipboard') }]);
  await tick();
  assert.equal(state.refs.stage.dataset.state, 'empty');
});

test('PDF page selection feeds the chosen page through the same crop and OCR flow', async () => {
  const rendered = [];
  let destroyed = 0;
  const state = setup(async () => 'Meier Mia', { createPdf: () => ({
    load: async () => 2,
    render: async (page) => {
      rendered.push(page);
      const image = new Element('canvas'); image.width = 1200; image.height = 1800;
      return image;
    },
    destroy: () => { destroyed += 1; },
  }) });
  const imported = [];
  state.api.open((names) => { imported.push(names); });
  state.refs.file.files = [new File(['%PDF-1.7'], 'liste.pdf', { type: 'application/pdf' })];
  state.refs.file.fire('change');
  await tick();
  assert.deepEqual(rendered, [1]);
  assert.equal(state.refs['pdf-count'].textContent, 'von 2');
  assert.equal(state.refs['pdf-pages'].hidden, false);
  state.refs['pdf-page'].value = '2';
  state.refs['pdf-page'].fire('change');
  await tick();
  assert.deepEqual(rendered, [1, 2]);
  state.refs.recognize.fire('click');
  await tick(); await tick();
  assert.equal(imported.length, 0);
  assert.equal(entryCount(state), 1);
  state.form.fire('submit');
  assert.deepEqual(imported, [[{ lastName: 'Meier', firstName: 'Mia' }]]);
  assert.equal(destroyed, 1);
  assert.equal(state.refs['pdf-pages'].hidden, true);
});
