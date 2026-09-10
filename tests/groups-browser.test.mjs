import assert from 'node:assert/strict';
import test from 'node:test';
import { openDomBrowser } from './helpers/dom-browser.mjs';

async function bootGroups(evaluate, suffix, { touch = false } = {}) {
  return evaluate(async ({ token, touchEnabled }) => {
    if (touchEnabled) {
      Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 });
    }
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    await import(`/src/main.js?groups-browser=${token}`);
    document.getElementById('tab-groups').click();
    await new Promise(done => window.setTimeout(done, 450));
    return document.getElementById('app').classList.contains('app-tab-groups');
  }, { token: suffix, touchEnabled: touch });
}

test('Groups preserves CSV sharing, sizing, group metadata, and drag interactions', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  assert.equal(await bootGroups(evaluate, `interaction-${Date.now()}`), true);
  const result = await evaluate(async () => {
    const wait = (delay = 0) => new Promise(done => window.setTimeout(done, delay));
    const csv = [
      ';Nachname;Vorname',
      ';Adler;Anna',
      ';Berg;Ben',
      ';Claus;Cara',
      ';Dorf;Dino',
    ].join('\n');
    const input = document.getElementById('csv');
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], 'Klasse 7a.csv', { type: 'text/csv' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);

    const max = document.getElementById('max-group-size');
    max.value = '2';
    max.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);

    const initialGroupCount = document.querySelectorAll('#groups-grid .seat').length;
    document.querySelector('#groups-grid .seat-placeholder').dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    }));
    await wait(50);
    const addedGroupCount = document.querySelectorAll('#groups-grid .seat').length;
    [...document.querySelectorAll('#groups-grid .seat')].at(-1).querySelector('.seat-delete-button').click();
    await wait(280);
    const deletedGroupCount = document.querySelectorAll('#groups-grid .seat').length;

    const firstSeat = document.querySelector('#groups-grid .seat');
    const secondSeat = document.querySelectorAll('#groups-grid .seat')[1];
    const drag = async (source, target) => {
      const dragData = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragData,
      }));
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dragData,
      }));
      await wait(40);
    };
    await drag(document.querySelector('#unseated [data-sid="01"]'), firstSeat);
    await drag(document.querySelector('#unseated [data-sid="02"]'), firstSeat);
    await drag(document.querySelector('#unseated [data-sid="03"]'), firstSeat);
    const capacityRejected = [...firstSeat.querySelectorAll('.seat-chip')].map(node => node.dataset.sid);
    await drag(document.querySelector('#unseated [data-sid="03"]'), secondSeat);
    await drag(firstSeat.querySelector('[data-sid="01"]'), secondSeat.querySelector('[data-sid="03"]'));

    const topic = firstSeat.querySelector('.seat-topic');
    topic.value = 'Recherche';
    topic.dispatchEvent(new Event('input', { bubbles: true }));
    firstSeat.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await wait(30);

    const beforePicker = {
      status: document.getElementById('csv-status').textContent,
      groups: document.querySelectorAll('#groups-grid .seat').length,
      unseated: document.querySelectorAll('#unseated .student').length,
      seatMembers: [...document.querySelectorAll('#groups-grid .seat')].map(seat => (
        [...seat.querySelectorAll('.seat-chip')].map(node => node.dataset.sid)
      )),
      topic: topic.value,
      locked: firstSeat.classList.contains('locked'),
      layoutScale: document.getElementById('groups-grid').style.getPropertyValue('--group-fit-scale'),
      initialGroupCount,
      addedGroupCount,
      deletedGroupCount,
      capacityRejected,
    };

    document.getElementById('tab-random-picker').click();
    await wait(450);
    document.getElementById('group-seat-preferences').click();
    await Promise.resolve();
    const pickerRows = document.querySelectorAll('#preferences-tbody tr').length;
    document.getElementById('preferences-cancel').click();
    return {
      beforePicker,
      pickerRows,
      pickerNames: [...document.querySelectorAll('[data-random-slot]')].map(node => node.textContent),
    };
  });

  assert.deepEqual(result.beforePicker, {
    status: 'Klasse 7a',
    groups: 2,
    unseated: 1,
    seatMembers: [['03', '02'], ['01']],
    topic: 'Recherche',
    locked: true,
    layoutScale: result.beforePicker.layoutScale,
    initialGroupCount: 2,
    addedGroupCount: 3,
    deletedGroupCount: 2,
    capacityRejected: ['01', '02'],
  });
  assert.ok(Number.parseFloat(result.beforePicker.layoutScale) > 0);
  assert.equal(result.pickerRows, 4);
  assert.ok(result.pickerNames.includes('Anna Adler'));
});

test('main parses quoted CSV names with BOM, CRLF, delimiters, and escaped quotes', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  assert.equal(await bootGroups(evaluate, `csv-parser-${Date.now()}`), true);
  const result = await evaluate(async () => {
    const csv = [
      '\uFEFFsep=;',
      'Nachname;Vorname',
      '"Meyer;Schmidt";Anna',
      '"O""Neil";Bob',
    ].join('\r\n');
    const input = document.getElementById('csv');
    const transfer = new DataTransfer();
    transfer.items.add(new File([csv], 'Parser-Fall.csv', { type: 'text/csv' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(done => window.setTimeout(done, 80));
    document.getElementById('group-seat-preferences').click();
    await Promise.resolve();
    return {
      status: document.getElementById('csv-status').textContent,
      names: [...document.querySelectorAll('#preferences-tbody .name-cell')].map(node => node.textContent),
      rows: document.querySelectorAll('#preferences-tbody tr').length,
    };
  });

  assert.deepEqual(result, {
    status: 'Parser-Fall',
    names: ['Anna Meyer;Schmidt', 'Bob O"Neil'],
    rows: 2,
  });
});

test('Groups preserves preferences and the complete shared plan payload', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  const result = await evaluate(async () => {
    const saved = [];
    window.showSaveFilePicker = async () => ({
      async createWritable() {
        return {
          async write(blob) { saved.push(await blob.text()); },
          async close() {},
        };
      },
    });
    const html = await fetch('/index.html').then(response => response.text());
    const fixture = new DOMParser().parseFromString(html, 'text/html');
    document.body.replaceChildren(...fixture.body.childNodes);
    await import(`/src/main.js?groups-browser=roundtrip-${Date.now()}`);
    document.getElementById('tab-groups').click();
    await new Promise(done => window.setTimeout(done, 450));

    const plan = {
      version: 1,
      grid: { rows: 1, cols: 2 },
      activeSeats: ['1-1', '1-2'],
      lockedSeats: ['1-1'],
      seats: { '1-1': ['01', '02'], '1-2': ['03', '04'] },
      seatTopics: { '1-1': 'Quellen', '1-2': 'Präsentation' },
      students: [
        { id: '01', first: 'Anna', last: 'Adler', performanceFlair: 'A', buddies: ['02'], foes: [], randomWeight: 1 },
        { id: '02', first: 'Ben', last: 'Berg', performanceFlair: 'A', buddies: ['01'], foes: [], randomWeight: 2 },
        { id: '03', first: 'Cara', last: 'Claus', performanceFlair: 'B', buddies: [], foes: ['04'], randomWeight: 3 },
        { id: '04', first: 'Dino', last: 'Dorf', performanceFlair: 'B', buddies: [], foes: ['03'], randomWeight: 1 },
      ],
      performanceFlairCount: 4,
      randomPickerAutoDisableSelected: true,
      headers: ['', 'Nachname', 'Vorname'],
      delim: ';',
      csvName: 'Klasse 7a',
      minGroupSize: 2,
      maxGroupSize: 2,
      workOrder: 'Erstellt ein Plakat.',
      workOrderDurationMinutes: 15,
      workOrderStartISO: null,
    };
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(plan)], 'plan.json', { type: 'application/json' }));
    const input = document.getElementById('import-plan-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(done => window.setTimeout(done, 120));

    document.getElementById('group-seat-preferences').click();
    await Promise.resolve();
    const preferences = {
      rows: document.querySelectorAll('#preferences-tbody tr').length,
      buddy: document.querySelector('select[data-student-id="01"][data-pref-type="buddy"]')?.value,
      flair: document.querySelector('select[data-student-id="03"][data-preference="performance-flair"]')?.value,
    };
    document.getElementById('preferences-cancel').click();

    document.getElementById('group-export-plan').click();
    await Promise.resolve();
    document.getElementById('shell-action-dialog-confirm').click();
    await new Promise(done => window.setTimeout(done, 80));
    const exported = JSON.parse(saved[0]);

    document.getElementById('tab-work-phase').click();
    await new Promise(done => window.setTimeout(done, 450));
    return {
      inputPlan: plan,
      preferences,
      topics: [...document.querySelectorAll('#groups-grid .seat-topic')].map(node => node.value),
      locked: document.querySelector('#groups-grid .seat')?.classList.contains('locked'),
      exported,
      workOrder: document.getElementById('work-order-text').value,
      duration: document.getElementById('work-order-duration').value,
    };
  });

  assert.deepEqual(result.preferences, { rows: 4, buddy: '02', flair: 'B' });
  assert.deepEqual(result.topics, ['Quellen', 'Präsentation']);
  assert.equal(result.locked, true);
  assert.ok(Number.isFinite(Date.parse(result.exported.generatedAt)));
  assert.deepEqual(
    { ...result.exported, generatedAt: '<generated>' },
    { ...result.inputPlan, generatedAt: '<generated>' },
  );
  assert.equal(result.workOrder, 'Erstellt ein Plakat.');
  assert.equal(result.duration, '15');
});

test('Groups preserves touch movement, suggestion rules, locked assignments, and responsive layout', { timeout: 60000 }, async (t) => {
  const evaluate = await openDomBrowser(t);
  assert.equal(await bootGroups(evaluate, `touch-suggest-${Date.now()}`, { touch: true }), true);
  const result = await evaluate(async () => {
    const wait = (delay = 0) => new Promise(done => window.setTimeout(done, delay));
    const importPlan = async (plan) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(plan)], 'plan.json', { type: 'application/json' }));
      const input = document.getElementById('import-plan-file');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(120);
    };

    await importPlan({
      version: 1,
      grid: { rows: 1, cols: 2 },
      activeSeats: ['1-1', '1-2'],
      lockedSeats: [],
      seats: { '1-1': ['01'], '1-2': [] },
      seatTopics: {},
      students: [
        { id: '01', first: 'Anna', last: 'Adler', buddies: [], foes: [], performanceFlair: '', randomWeight: 1 },
        { id: '02', first: 'Ben', last: 'Berg', buddies: [], foes: [], performanceFlair: '', randomWeight: 1 },
      ],
      minGroupSize: 1,
      maxGroupSize: 2,
    });

    const touchSource = document.querySelector('#unseated [data-sid="02"]');
    const touchTarget = document.querySelectorAll('#groups-grid .seat')[1];
    const touch = { identifier: 7, clientX: 20, clientY: 20 };
    const touchList = [touch];
    touchList.item = index => touchList[index] || null;
    const originalElementFromPoint = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => touchTarget;
    const start = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'touches', { value: touchList });
    touchSource.dispatchEvent(start);
    await wait(120);
    const end = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(end, 'changedTouches', { value: touchList });
    touchSource.dispatchEvent(end);
    document.elementFromPoint = originalElementFromPoint;
    await wait(80);
    const touchSeatMembers = [...touchTarget.querySelectorAll('.seat-chip')].map(node => node.dataset.sid);

    await importPlan({
      version: 1,
      grid: { rows: 1, cols: 3 },
      activeSeats: ['1-1', '1-2', '1-3'],
      lockedSeats: ['1-1'],
      seats: { '1-1': ['01', '02'], '1-2': [], '1-3': [] },
      seatTopics: { '1-1': 'Fixiert' },
      students: [
        { id: '01', first: 'Anna', last: 'Adler', performanceFlair: 'A', buddies: ['02'], foes: [], randomWeight: 1 },
        { id: '02', first: 'Ben', last: 'Berg', performanceFlair: 'A', buddies: ['01'], foes: [], randomWeight: 1 },
        { id: '03', first: 'Cara', last: 'Claus', performanceFlair: 'B', buddies: ['04'], foes: ['05'], randomWeight: 1 },
        { id: '04', first: 'Dino', last: 'Dorf', performanceFlair: 'B', buddies: ['03'], foes: ['06'], randomWeight: 1 },
        { id: '05', first: 'Eva', last: 'Eich', performanceFlair: 'C', buddies: ['06'], foes: ['03'], randomWeight: 1 },
        { id: '06', first: 'Finn', last: 'Feld', performanceFlair: 'C', buddies: ['05'], foes: ['04'], randomWeight: 1 },
      ],
      performanceFlairCount: 3,
      minGroupSize: 2,
      maxGroupSize: 2,
    });

    const suggest = document.getElementById('group-suggest');
    suggest.click();
    const deadline = Date.now() + 15000;
    while (suggest.hasAttribute('aria-busy') && Date.now() < deadline) {
      await wait(100);
    }
    const suggested = [...document.querySelectorAll('#groups-grid .seat')].map(seat => ({
      locked: seat.classList.contains('locked'),
      members: [...seat.querySelectorAll('.seat-chip')].map(node => node.dataset.sid),
    }));
    const expandedScale = document.getElementById('groups-grid').style.getPropertyValue('--group-fit-scale');
    document.getElementById('toggle-chrome').click();
    await wait(700);
    window.dispatchEvent(new Event('resize'));
    await wait(120);
    const collapsedScale = document.getElementById('groups-grid').style.getPropertyValue('--group-fit-scale');

    return {
      touchSeatMembers,
      suggested,
      suggestionFinished: !suggest.hasAttribute('aria-busy'),
      expandedScale,
      collapsedScale,
      collapsed: document.getElementById('app').classList.contains('chrome-collapsed'),
    };
  });

  assert.deepEqual(result.touchSeatMembers, ['02']);
  assert.equal(result.suggestionFinished, true);
  assert.deepEqual(result.suggested[0], { locked: true, members: ['01', '02'] });
  const freeGroups = result.suggested.slice(1).map(group => group.members.slice().sort()).sort();
  assert.deepEqual(freeGroups, [['03', '04'], ['05', '06']]);
  assert.equal(result.collapsed, true);
  assert.ok(Number.parseFloat(result.expandedScale) > 0);
  assert.ok(Number.parseFloat(result.collapsedScale) > 0);
});
