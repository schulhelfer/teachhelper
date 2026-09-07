import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);
const appHtml = await readFile(
  new URL('../src/modules/planning/app.html', import.meta.url),
  'utf8',
);

function extractClassMethod(name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(appSource);
  assert.ok(match, `method ${name} must exist`);
  const start = match.index + 1;
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`method ${name} is incomplete`);
}

const formatDate = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};
const dayOfWeekIso = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 ? 7 : weekday;
};

const methods = Function(
  'formatDate',
  'dayOfWeekIso',
  `"use strict"; return {
    ${extractClassMethod('setSlotDialogStartStatic')},
    ${extractClassMethod('syncSlotDialogEditTools')}
  };`,
)(formatDate, dayOfWeekIso);

function createHarness({ slotId = '7', scope = 'from', fromDate = '2027-02-16' } = {}) {
  return {
    refs: {
      slotDialogId: { value: slotId },
      slotDialogParity: { value: '0' },
      slotDialogEditTools: { hidden: true },
      slotDialogDelete: { hidden: true },
      slotDialogEditScope: { value: scope },
      slotDialogEditFromDate: { value: fromDate },
      slotDialogStart: { value: slotId ? fromDate : '', disabled: false, hidden: false, required: true },
      slotDialogStartText: { textContent: '', hidden: true },
      slotDialogEnd: { value: '2027-06-30', disabled: false },
      slotDialogDay: { value: '2', disabled: false },
      slotDialogEditInfo: { textContent: '', hidden: true },
      slotDialogStartLabel: { textContent: 'Startdatum' },
    },
    slotDialogEndDateBackup: null,
    setSlotDialogStartStatic: methods.setSlotDialogStartStatic,
  };
}

test('das Markup enthält den statischen Startdatum-Text', () => {
  assert.match(appHtml, /id="slot-dialog-start-text"/);
  assert.match(appHtml, /class="slot-dialog-static"/);
  assert.match(appHtml, /id="slot-dialog-start-label"/);
});

test('im from-Scope wird das Startdatum als Text statt als Eingabefeld gezeigt', () => {
  const harness = createHarness({ scope: 'from', fromDate: '2027-02-16' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStart.hidden, true);
  assert.equal(harness.refs.slotDialogStartText.hidden, false);
  assert.equal(harness.refs.slotDialogStartText.textContent, '16.02.2027');
  assert.equal(harness.refs.slotDialogStart.value, '2027-02-16');
});

test('im all-Scope bleibt das Startdatum ein Eingabefeld', () => {
  const harness = createHarness({ scope: 'all' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStart.hidden, false);
  assert.equal(harness.refs.slotDialogStartText.hidden, true);
  assert.equal(harness.refs.slotDialogStartText.textContent, '');
});

test('beim Anlegen einer neuen Stunde bleibt das Startdatum bedienbar', () => {
  const harness = createHarness({ slotId: '', scope: 'all', fromDate: '' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStart.hidden, false);
  assert.equal(harness.refs.slotDialogStart.disabled, false);
  assert.equal(harness.refs.slotDialogStartText.hidden, true);
});

test('das versteckte Startdatum blockiert die Formularvalidierung nicht', () => {
  const harness = createHarness({ scope: 'from', fromDate: '2027-02-16' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStart.hidden, true);
  assert.equal(harness.refs.slotDialogStart.required, false);
});

test('zurück im all-Scope ist das Startdatum wieder pflicht', () => {
  const harness = createHarness({ scope: 'from', fromDate: '2027-02-16' });
  methods.syncSlotDialogEditTools.call(harness);

  harness.refs.slotDialogEditScope.value = 'all';
  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStart.hidden, false);
  assert.equal(harness.refs.slotDialogStart.required, true);
});

test('die Hinweiszeile entfällt zugunsten der Beschriftung', () => {
  const harness = createHarness({ scope: 'from', fromDate: '2027-02-16' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogEditInfo.hidden, true);
  assert.equal(harness.refs.slotDialogEditInfo.textContent, '');
  assert.equal(harness.refs.slotDialogStartLabel.textContent, 'Ab Termin');
});

test('ohne Teiländerung bleibt die Beschriftung "Startdatum"', () => {
  const harness = createHarness({ scope: 'all' });

  methods.syncSlotDialogEditTools.call(harness);

  assert.equal(harness.refs.slotDialogStartLabel.textContent, 'Startdatum');
});
