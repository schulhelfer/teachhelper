import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [planFormatSource, fileGuardsSource] = await Promise.all([
  readFile(new URL('../src/app/plan-format.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/shared/file-guards.js', import.meta.url), 'utf8'),
]);
const fileGuardsUrl = `data:text/javascript;base64,${Buffer.from(fileGuardsSource).toString('base64')}`;
const planFormatUrl = `data:text/javascript;base64,${Buffer.from(
  planFormatSource.replace("'../shared/file-guards.js'", JSON.stringify(fileGuardsUrl)),
).toString('base64')}`;
const {
  PLAN_FORMAT_VERSION,
  createPlanSnapshot,
  deserializePlan,
  serializePlan,
} = await import(planFormatUrl);
const { FILE_LIMITS } = await import(fileGuardsUrl);

const generatedAt = '2026-09-11T10:15:30.000Z';
const groups = {
  grid: { rows: 1, cols: 2 },
  activeSeats: ['1-1', '1-2'],
  lockedSeats: ['1-1'],
  seats: { '1-1': ['01'], '1-2': ['02'] },
  seatTopics: { '1-1': 'Recherche', '1-2': 'Präsentation' },
  performanceFlairCount: 4,
  minGroupSize: 1,
  maxGroupSize: 2,
};
const roster = {
  students: [
    { id: '01', first: 'Anna', last: 'Adler', performanceFlair: 'A', buddies: [], foes: [], randomWeight: 1 },
    { id: '02', first: 'Ben', last: 'Berg', performanceFlair: 'B', buddies: [], foes: [], randomWeight: 2 },
  ],
  headers: ['', 'Nachname', 'Vorname'],
  delimiter: ';',
  csvName: 'Klasse 7a',
};
const workPhase = {
  workOrder: 'Erstellt ein Plakat.',
  workOrderDurationMinutes: 15,
  workOrderStartISO: null,
};

function createSnapshot() {
  return createPlanSnapshot({
    generatedAt,
    roster,
    groups,
    randomPicker: { autoDisableSelected: true },
    workPhase,
  });
}

function expectedSerializedPlan() {
  return {
    version: 1,
    generatedAt,
    grid: groups.grid,
    activeSeats: groups.activeSeats,
    lockedSeats: groups.lockedSeats,
    seats: groups.seats,
    seatTopics: groups.seatTopics,
    workOrder: workPhase.workOrder,
    workOrderDurationMinutes: workPhase.workOrderDurationMinutes,
    workOrderStartISO: workPhase.workOrderStartISO,
    students: roster.students,
    performanceFlairCount: groups.performanceFlairCount,
    randomPickerAutoDisableSelected: true,
    headers: roster.headers,
    delim: roster.delimiter,
    csvName: roster.csvName,
    minGroupSize: groups.minGroupSize,
    maxGroupSize: groups.maxGroupSize,
  };
}

test('createPlanSnapshot builds the complete versioned internal plan structure', () => {
  assert.equal(PLAN_FORMAT_VERSION, 1);
  assert.deepEqual(createSnapshot(), {
    version: PLAN_FORMAT_VERSION,
    generatedAt,
    roster,
    groups,
    randomPicker: { autoDisableSelected: true },
    workPhase,
  });
  assert.equal(createPlanSnapshot({ generatedAt, roster, groups: null }), null);
});

test('serializePlan preserves the established flat JSON structure and formatting', () => {
  assert.equal(
    serializePlan(createSnapshot()),
    JSON.stringify(expectedSerializedPlan(), null, 2),
  );
});

test('serializePlan and deserializePlan round-trip every current plan field', () => {
  assert.deepEqual(deserializePlan(serializePlan(createSnapshot())), createSnapshot());
});

test('deserializePlan accepts the warning preamble and legacy work-phase fields', () => {
  const legacy = expectedSerializedPlan();
  delete legacy.version;
  delete legacy.workOrderDurationMinutes;
  delete legacy.workOrderStartISO;
  legacy.workOrderDuration = 9;
  legacy.workOrderStart = '2026-09-11T09:00:00.000Z';

  const plan = deserializePlan(`/* Diese Datei wird in TeachHelper importiert. */\n${JSON.stringify(legacy)}`);

  assert.equal(plan.version, PLAN_FORMAT_VERSION);
  assert.deepEqual(plan.workPhase, {
    workOrder: legacy.workOrder,
    workOrderDurationMinutes: 9,
    workOrderStartISO: '2026-09-11T09:00:00.000Z',
  });
});

test('deserializePlan keeps unknown versions loadable for existing compatibility', () => {
  const data = expectedSerializedPlan();
  data.version = 99;
  assert.equal(deserializePlan(JSON.stringify(data)).version, 99);
});

test('deserializePlan applies the existing defaults for missing optional fields', () => {
  const plan = deserializePlan(JSON.stringify({
    activeSeats: ['1-1'],
    seats: { '1-1': [] },
  }));

  assert.deepEqual(plan.roster, {
    students: [],
    headers: [],
    delimiter: ',',
    csvName: '',
  });
  assert.deepEqual(plan.randomPicker, { autoDisableSelected: undefined });
  assert.deepEqual(plan.workPhase, {
    workOrder: '',
    workOrderDurationMinutes: null,
    workOrderStartISO: null,
  });
});

test('deserializePlan preserves the established invalid JSON and plan errors', () => {
  assert.throws(() => deserializePlan('{'), new Error('Datei ist kein gültiges JSON.'));
  assert.throws(() => deserializePlan('null'), new Error('Ungültiges Plan-Format.'));
  assert.throws(() => deserializePlan('42'), new Error('Ungültiges Plan-Format.'));
  assert.throws(() => serializePlan(null), new Error('Ungültiges Plan-Format.'));
});

test('deserializePlan enforces the existing JSON nesting limit', () => {
  const deeplyNested = `${'['.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}0${']'.repeat(FILE_LIMITS.JSON_MAX_NESTING + 1)}`;
  assert.throws(
    () => deserializePlan(deeplyNested),
    {
      name: 'FileValidationError',
      message: `JSON-Datei ist zu tief verschachtelt: maximal ${FILE_LIMITS.JSON_MAX_NESTING} Ebenen.`,
    },
  );
});
