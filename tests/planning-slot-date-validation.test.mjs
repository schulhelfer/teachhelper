import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
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

const submitSlotDialog = Function(
  'isSchoolWeekdayIso',
  `"use strict"; return ({${extractClassMethod('submitSlotDialog')}}).submitSlotDialog;`,
)((iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday >= 1 && weekday <= 5;
});

function createHarness(startDate, endDate) {
  const calls = { messages: [], persist: [], saves: 0 };
  return {
    activeSchoolYear: { startDate: '2026-08-01', endDate: '2027-07-31' },
    slotDialogStartMinIso: null,
    refs: {
      slotDialogStart: { value: startDate },
      slotDialogEnd: { value: endDate },
      slotDialogId: { value: '' },
      slotDialogCourse: { value: '7' },
      slotDialogDay: { value: '1' },
      slotDialogHour: { value: '2' },
      slotDialogEndHour: { value: '3' },
      slotDialogParity: { value: '0' },
      slotDialogEditScope: { value: 'all' },
      slotDialogEditFromDate: { value: '' },
    },
    calls,
    async showInfoMessage(message) { calls.messages.push(message); },
    syncSlotDialogHourRange() {},
    async persistSlotChange(value) { calls.persist.push(value); return true; },
    async persistExplicitDatabaseSave() { calls.saves += 1; },
    closeSlotDialog() {},
    resetSlotForm() {},
    renderAll() {},
  };
}

test('manuelle Datumsänderungen im Unterrichtsstundendialog werden nicht mehr umgeschrieben', () => {
  const bindingsStart = appSource.indexOf('this.refs.slotDialogStart.addEventListener("change"');
  const bindingsEnd = appSource.indexOf('this.refs.slotDialogForm.addEventListener("submit"', bindingsStart);
  assert.ok(bindingsStart >= 0 && bindingsEnd > bindingsStart);
  assert.doesNotMatch(appSource.slice(bindingsStart, bindingsEnd), /\.value\s*=/);
  assert.doesNotMatch(appSource.slice(bindingsStart, bindingsEnd), /normalizeIsoToSchoolWeekday/);
});

test('ein Wochenend-Startdatum bleibt erhalten und wird beim Speichern abgewiesen', async () => {
  const harness = createHarness('2026-08-08', '2026-08-14');

  await submitSlotDialog.call(harness);

  assert.equal(harness.refs.slotDialogStart.value, '2026-08-08');
  assert.deepEqual(harness.calls.persist, []);
  assert.deepEqual(harness.calls.messages, [
    'Das Startdatum muss auf einen Schultag (Montag bis Freitag) fallen.',
  ]);
});

test('ein Wochenend-Enddatum bleibt erhalten und wird beim Speichern abgewiesen', async () => {
  const harness = createHarness('2026-08-03', '2026-08-09');

  await submitSlotDialog.call(harness);

  assert.equal(harness.refs.slotDialogEnd.value, '2026-08-09');
  assert.deepEqual(harness.calls.persist, []);
  assert.deepEqual(harness.calls.messages, [
    'Das Enddatum muss auf einen Schultag (Montag bis Freitag) fallen.',
  ]);
});

test('ein gültiger Zeitraum wird unverändert gespeichert', async () => {
  const harness = createHarness('2026-08-03', '2026-08-14');

  await submitSlotDialog.call(harness);

  assert.deepEqual(harness.calls.messages, []);
  assert.equal(harness.calls.saves, 1);
  assert.deepEqual(harness.calls.persist, [
    {
      slotId: null,
      courseId: '7',
      dayOfWeek: '1',
      startHour: 2,
      duration: 2,
      startDate: '2026-08-03',
      endDateInput: '2026-08-14',
      recurrenceValue: '0',
      editScope: 'all',
      editFromDate: null,
    },
  ]);
});

test('die bestehende Reihenfolgeprüfung bleibt vor dem Speichern wirksam', async () => {
  const harness = createHarness('2026-08-14', '2026-08-03');

  await submitSlotDialog.call(harness);

  assert.deepEqual(harness.calls.persist, []);
  assert.deepEqual(harness.calls.messages, [
    'Enddatum muss am oder nach dem Startdatum liegen.',
  ]);
});
