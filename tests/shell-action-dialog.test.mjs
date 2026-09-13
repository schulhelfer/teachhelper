import assert from 'node:assert/strict';
import test from 'node:test';

import { createShellActionDialog } from '../src/app/shell-action-dialog.js';

class TestClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

class TestElement extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.open = false;
    this.textContent = '';
    this.value = '';
    this.returnValue = '';
    this.classList = new TestClassList();
    this.focused = false;
    this.selected = false;
  }

  showModal() {
    this.open = true;
  }

  close(returnValue = '') {
    this.open = false;
    this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  }

  removeAttribute(name) {
    if (name === 'open') this.open = false;
  }

  focus() {
    this.focused = true;
  }

  select() {
    this.selected = true;
  }
}

function createHarness() {
  const ids = [
    'shell-action-dialog',
    'shell-action-dialog-title',
    'shell-action-dialog-message',
    'shell-action-dialog-input-row',
    'shell-action-dialog-input-label',
    'shell-action-dialog-input',
    'shell-action-dialog-cancel',
    'shell-action-dialog-secondary',
    'shell-action-dialog-confirm',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new TestElement()]));
  const doc = { getElementById: (id) => elements[id] || null };
  return { elements, controller: createShellActionDialog(doc) };
}

test('choose resolves all three actions and focuses the primary action', async () => {
  const { elements, controller } = createHarness();
  const choice = controller.choose({
    title: 'Picker speichern',
    message: 'Ziel wählen',
    secondaryText: 'Separate Picker-Datei',
    secondaryValue: 'file',
    confirmText: 'Im Notenmodul',
    confirmValue: 'grades',
    cancelValue: '',
  });
  await Promise.resolve();
  assert.equal(elements['shell-action-dialog-secondary'].hidden, false);
  assert.equal(elements['shell-action-dialog-secondary'].textContent, 'Separate Picker-Datei');
  assert.equal(elements['shell-action-dialog-confirm'].textContent, 'Im Notenmodul');
  assert.equal(elements['shell-action-dialog-confirm'].focused, true);
  elements['shell-action-dialog-secondary'].dispatchEvent(new Event('click'));
  assert.equal(await choice, 'file');

  const cancelled = controller.choose({
    secondaryText: 'Verwerfen',
    secondaryValue: 'discard',
    confirmText: 'Speichern',
    confirmValue: 'save',
    cancelValue: '',
  });
  elements['shell-action-dialog'].dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.equal(await cancelled, '');

  const cancelledByButton = controller.choose({
    secondaryText: 'Verwerfen',
    secondaryValue: 'discard',
    confirmText: 'Speichern',
    confirmValue: 'save',
    cancelValue: '',
  });
  elements['shell-action-dialog-cancel'].dispatchEvent(new Event('click'));
  assert.equal(await cancelledByButton, '');
});

test('confirm and prompt keep their existing result types and hide the secondary action', async () => {
  const { elements, controller } = createHarness();
  const confirmed = controller.confirm({ confirmText: 'OK' });
  elements['shell-action-dialog-confirm'].dispatchEvent(new Event('click'));
  assert.equal(await confirmed, true);
  assert.equal(elements['shell-action-dialog-secondary'].hidden, true);

  const prompted = controller.prompt({ defaultValue: 'Physik (Picker)' });
  await Promise.resolve();
  assert.equal(elements['shell-action-dialog-input'].value, 'Physik (Picker)');
  assert.equal(elements['shell-action-dialog-input'].selected, true);
  elements['shell-action-dialog-confirm'].dispatchEvent(new Event('click'));
  assert.equal(await prompted, 'Physik (Picker)');
});
