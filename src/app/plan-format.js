import { assertJsonNestingAtMost } from '../shared/file-guards.js';

export const PLAN_FORMAT_VERSION = 1;

function assertPlanRoot(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Ungültiges Plan-Format.');
  }
  return value;
}

function normalizeSerializedPlanText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trimStart();
}

function normalizeGroupsPlan(data) {
  return {
    grid: data.grid && typeof data.grid === 'object' ? data.grid : undefined,
    activeSeats: Array.isArray(data.activeSeats) ? data.activeSeats : [],
    lockedSeats: Array.isArray(data.lockedSeats) ? data.lockedSeats : [],
    seats: data.seats && typeof data.seats === 'object' ? data.seats : {},
    seatTopics: data.seatTopics && typeof data.seatTopics === 'object' ? data.seatTopics : {},
    performanceFlairCount: data.performanceFlairCount,
    minGroupSize: data.minGroupSize,
    maxGroupSize: data.maxGroupSize,
  };
}

function normalizeWorkPhasePlan(data) {
  return {
    workOrder: typeof data.workOrder === 'string' ? data.workOrder : '',
    workOrderDurationMinutes: data.workOrderDurationMinutes ?? data.workOrderDuration ?? null,
    workOrderStartISO: typeof data.workOrderStartISO === 'string'
      ? data.workOrderStartISO
      : (typeof data.workOrderStart === 'string' ? data.workOrderStart : null),
  };
}

function normalizePlanDocument(data) {
  const source = assertPlanRoot(data);
  return {
    version: source.version ?? PLAN_FORMAT_VERSION,
    generatedAt: typeof source.generatedAt === 'string' ? source.generatedAt : null,
    roster: {
      students: Array.isArray(source.students) ? source.students : [],
      headers: Array.isArray(source.headers) ? source.headers : [],
      delimiter: typeof source.delim === 'string' ? source.delim : ',',
      csvName: typeof source.csvName === 'string' ? source.csvName : '',
    },
    groups: normalizeGroupsPlan(source),
    randomPicker: {
      autoDisableSelected: source.randomPickerAutoDisableSelected,
    },
    workPhase: normalizeWorkPhasePlan(source),
  };
}

export function createPlanSnapshot({ generatedAt, roster, groups, randomPicker, workPhase } = {}) {
  if (!groups || typeof groups !== 'object') return null;
  const rosterState = roster && typeof roster === 'object' ? roster : {};
  const pickerState = randomPicker && typeof randomPicker === 'object' ? randomPicker : {};
  const workPhaseState = workPhase && typeof workPhase === 'object' ? workPhase : {};
  return {
    version: PLAN_FORMAT_VERSION,
    generatedAt: typeof generatedAt === 'string' ? generatedAt : '',
    roster: {
      students: Array.isArray(rosterState.students) ? rosterState.students : [],
      headers: Array.isArray(rosterState.headers) ? rosterState.headers : [],
      delimiter: typeof rosterState.delimiter === 'string' ? rosterState.delimiter : ',',
      csvName: typeof rosterState.csvName === 'string' ? rosterState.csvName : '',
    },
    groups: normalizeGroupsPlan(groups),
    randomPicker: {
      autoDisableSelected: pickerState.autoDisableSelected === true,
    },
    workPhase: normalizeWorkPhasePlan(workPhaseState),
  };
}

export function serializePlan(plan) {
  const source = assertPlanRoot(plan);
  const roster = assertPlanRoot(source.roster);
  const groups = assertPlanRoot(source.groups);
  const randomPicker = assertPlanRoot(source.randomPicker);
  const workPhase = assertPlanRoot(source.workPhase);
  return JSON.stringify({
    version: source.version,
    generatedAt: source.generatedAt,
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
    randomPickerAutoDisableSelected: randomPicker.autoDisableSelected,
    headers: roster.headers,
    delim: roster.delimiter,
    csvName: roster.csvName,
    minGroupSize: groups.minGroupSize,
    maxGroupSize: groups.maxGroupSize,
  }, null, 2);
}

export function deserializePlan(text) {
  const normalizedText = normalizeSerializedPlanText(text);
  assertJsonNestingAtMost(normalizedText);
  let data;
  try {
    data = JSON.parse(normalizedText);
  } catch (error) {
    throw new Error('Datei ist kein gültiges JSON.');
  }
  return normalizePlanDocument(data);
}
