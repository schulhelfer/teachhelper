import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

test('the random picker preserves its cards, controls, conditions, and callbacks', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const { mountRandomPicker } = await import('/src/modules/random-picker/app.js');
    const makeElement = (tag, id = '') => {
      const element = document.createElement(tag);
      if (id) element.id = id;
      return element;
    };
    const machine = makeElement('div');
    machine.className = 'random-picker-machine';
    const wheel = makeElement('div', 'random-picker-wheel');
    wheel.style.setProperty('--random-picker-arrow-clearance', '20px');
    machine.appendChild(wheel);
    for (let index = 0; index < 7; index += 1) {
      const card = makeElement('div');
      card.dataset.randomSlot = String(index);
      wheel.appendChild(card);
    }
    const start = makeElement('button', 'random-picker-start');
    start.dataset.randomPickerStart = '1';
    start.textContent = 'Start';
    const collapsed = makeElement('button');
    collapsed.dataset.randomPickerStart = '1';
    collapsed.dataset.collapsedIcon = '1';
    collapsed.textContent = '✨';
    const importButton = makeElement('button', 'random-picker-import');
    const exportButton = makeElement('button', 'random-picker-export');
    const title = makeElement('h2', 'preferences-dialog-title');
    const table = makeElement('table');
    const tableHead = makeElement('thead', 'preferences-thead');
    const tableBody = makeElement('tbody', 'preferences-tbody');
    table.append(tableHead, tableBody);
    const autoWrap = makeElement('div', 'preferences-random-picker-auto-disable');
    const auto = makeElement('input', 'random-picker-auto-disable-selected');
    auto.type = 'checkbox';
    autoWrap.appendChild(auto);
    const summary = makeElement('div', 'preferences-performance-summary');
    const reset = makeElement('button', 'preferences-reset');
    document.body.replaceChildren(
      machine,
      start,
      collapsed,
      importButton,
      exportButton,
      title,
      table,
      autoWrap,
      summary,
      reset
    );
    let students = [
      { id: '01', first: 'Alex', last: 'A', randomWeight: 1 },
      { id: '02', first: 'Bea', last: 'B', randomWeight: 0 },
      { id: '03', first: 'Chris', last: 'C', randomWeight: 3 },
    ];
    let autoDisable = false;
    let imports = 0;
    let exports = 0;
    let conditionSaves = 0;
    const messages = [];
    const delays = [];
    let runningSnapshot = null;
    let controller;
    controller = mountRandomPicker({
      doc: document,
      getStudents: () => students,
      formatStudentLabel: (student) => `${student.first} ${student.last}`,
      getAutoDisableSelected: () => autoDisable,
      setAutoDisableSelected: (value) => { autoDisable = value; },
      setStudentWeight: (student, weight) => { student.randomWeight = weight; },
      onConditionsSaved: () => { conditionSaves += 1; },
      showMessage: (...args) => messages.push(args),
      onImport: () => { imports += 1; },
      onExport: () => { exports += 1; },
      random: () => 0,
      wait: async (delay) => {
        delays.push(delay);
        if (!runningSnapshot) {
          runningSnapshot = {
            active: controller.isSpinning(),
            startDisabled: start.disabled,
            startText: start.textContent,
            collapsedDisabled: collapsed.disabled,
            collapsedText: collapsed.textContent,
          };
        }
      },
    });
    controller.render();
    const initialCards = [...wheel.children].map((card) => ({
      text: card.textContent,
      distance: card.dataset.distance,
      hidden: card.getAttribute('aria-hidden'),
    }));
    importButton.click();
    exportButton.click();
    controller.renderConditions();
    const conditionLabels = [...tableBody.querySelectorAll('.weight-choice span')].map((node) => node.textContent);
    const certain = tableBody.querySelector('input[data-student-id="02"][value="4"]');
    certain.checked = true;
    controller.handleConditionsChange({ target: certain });
    const choicesAfterCertain = students.map((student) => tableBody.querySelector(
      `input[data-student-id="${student.id}"]:checked`
    )?.value);
    auto.checked = true;
    controller.saveConditions();
    const savedWeights = students.map((student) => student.randomWeight);
    const savedAutoDisable = autoDisable;
    controller.renderConditions();
    controller.resetConditions();
    const resetWeights = students.map((student) => tableBody.querySelector(
      `input[data-student-id="${student.id}"]:checked`
    )?.value);
    const resetAuto = auto.checked;
    students = [
      { id: '08', first: 'Gina', last: 'G', randomWeight: 0 },
      { id: '09', first: 'Hugo', last: 'H', randomWeight: 0 },
    ];
    controller.render();
    const zeroWeightStartDisabled = start.disabled;
    await controller.start();
    const zeroWeightMessage = messages.at(-1);
    students = [{ id: '10', first: 'Ida', last: 'I', randomWeight: 1 }];
    autoDisable = false;
    delays.length = 0;
    await controller.start();
    const finalResult = {
      text: wheel.children[3].textContent,
      final: wheel.children[3].classList.contains('is-final'),
      duration: delays.reduce((sum, delay) => sum + delay, 0),
    };
    students = [
      { id: '11', first: 'Dora', last: 'D', randomWeight: 1 },
      { id: '12', first: 'Emil', last: 'E', randomWeight: 2 },
      { id: '13', first: 'Fina', last: 'F', randomWeight: 0 },
    ];
    autoDisable = true;
    delays.length = 0;
    runningSnapshot = null;
    await controller.start();
    const spinResult = {
      weights: students.map((student) => student.randomWeight),
      winner: wheel.children[3].textContent,
      final: wheel.children[3].classList.contains('is-final'),
      startDisabled: start.disabled,
      startText: start.textContent,
      collapsedDisabled: collapsed.disabled,
      collapsedText: collapsed.textContent,
      active: controller.isSpinning(),
      duration: delays.reduce((sum, delay) => sum + delay, 0),
    };
    delays.length = 0;
    await controller.start();
    const secondSpinResult = {
      weights: students.map((student) => student.randomWeight),
      winner: wheel.children[3].textContent,
      final: wheel.children[3].classList.contains('is-final'),
    };
    students = [];
    controller.render();
    const emptyResult = {
      title: wheel.children[3].querySelector('.empty-state-title')?.textContent,
      copy: wheel.children[3].querySelector('.empty-state-copy')?.textContent,
      centerHidden: wheel.children[3].getAttribute('aria-hidden'),
      outerHidden: wheel.children[0].getAttribute('aria-hidden'),
      startDisabled: start.disabled,
    };
    await controller.start();
    const emptyMessage = messages.at(-1);
    controller.dispose();
    importButton.click();
    exportButton.click();
    return {
      initialCards,
      imports,
      exports,
      conditionSaves,
      conditionLabels,
      choicesAfterCertain,
      savedWeights,
      savedAutoDisable,
      resetWeights,
      resetAuto,
      zeroWeightStartDisabled,
      zeroWeightMessage,
      finalResult,
      runningSnapshot,
      spinResult,
      secondSpinResult,
      emptyResult,
      emptyMessage,
    };
  });
  assert.deepEqual(result.initialCards.map(({ text }) => text), [
    'Alex A', 'Bea B', 'Chris C', 'Alex A', 'Bea B', 'Chris C', 'Alex A',
  ]);
  assert.deepEqual(result.initialCards.map(({ distance }) => distance), ['3', '2', '1', '0', '1', '2', '3']);
  assert.ok(result.initialCards.every(({ hidden }) => hidden === null));
  assert.equal(result.imports, 1);
  assert.equal(result.exports, 1);
  assert.equal(result.conditionSaves, 1);
  assert.deepEqual(result.conditionLabels, [
    'unmöglich', 'normal', 'doppelt', 'dreifach', 'sicher',
    'unmöglich', 'normal', 'doppelt', 'dreifach', 'sicher',
    'unmöglich', 'normal', 'doppelt', 'dreifach', 'sicher',
  ]);
  assert.deepEqual(result.choicesAfterCertain, ['0', '4', '0']);
  assert.deepEqual(result.savedWeights, [0, 4, 0]);
  assert.equal(result.savedAutoDisable, true);
  assert.deepEqual(result.resetWeights, ['1', '1', '1']);
  assert.equal(result.resetAuto, false);
  assert.equal(result.zeroWeightStartDisabled, false);
  assert.deepEqual(result.zeroWeightMessage, [
    'Für den Picker ist aktuell kein Name auf „normal“, „doppelt“, „dreifach“ oder „sicher“ gesetzt.',
    'warn',
    { presentation: 'toast' },
  ]);
  assert.equal(result.finalResult.text, 'Ida I');
  assert.equal(result.finalResult.final, true);
  assert.ok(Math.abs(result.finalResult.duration - 4000) < 0.001);
  assert.deepEqual(result.runningSnapshot, {
    active: true,
    startDisabled: true,
    startText: 'Läuft...',
    collapsedDisabled: true,
    collapsedText: '✨',
  });
  assert.deepEqual(result.spinResult.weights, [0, 2, 0]);
  assert.equal(result.spinResult.winner, 'Dora D');
  assert.equal(result.spinResult.final, true);
  assert.equal(result.spinResult.startDisabled, false);
  assert.equal(result.spinResult.startText, 'Nochmal');
  assert.equal(result.spinResult.collapsedDisabled, false);
  assert.equal(result.spinResult.collapsedText, '✨');
  assert.equal(result.spinResult.active, false);
  assert.ok(Math.abs(result.spinResult.duration - 4000) < 0.001);
  assert.deepEqual(result.secondSpinResult, {
    weights: [0, 0, 0],
    winner: 'Emil E',
    final: true,
  });
  assert.deepEqual(result.emptyResult, {
    title: 'Noch keine Namen',
    copy: 'Importiere zuerst eine Namensliste.',
    centerHidden: 'false',
    outerHidden: 'true',
    startDisabled: true,
  });
  assert.deepEqual(result.emptyMessage, [
    'Importiere zuerst die Namensliste!',
    'warn',
    { presentation: 'toast' },
  ]);
});
