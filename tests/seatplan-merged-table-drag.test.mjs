import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/seatplan/app.js', import.meta.url),
  'utf8',
);

function extractFunction(name) {
  const match = new RegExp(`function ${name}\\(`).exec(appSource);
  assert.ok(match, `function ${name} must exist`);
  const start = match.index;
  const bodyStart = appSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === '{') depth += 1;
    if (appSource[index] === '}') depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`function ${name} is incomplete`);
}

function createTableHarness({ activeSeats, seats, mergedPairs, gridRows = 5, gridCols = 5 }) {
  const state = {
    activeSeats: new Set(activeSeats),
    seats: { ...seats },
    mergedPairs: new Set(mergedPairs),
    gridRows,
    gridCols,
  };
  const pairKey = (a, b) => [a, b].sort().join('|');
  const seatId = (row, column) => `${row}-${column}`;
  const getSeatCoordinates = Function('state', `return (${extractFunction('getSeatCoordinates')});`)(state);
  const getMergedTableDescriptor = Function(
    'state',
    'getSeatCoordinates',
    `return (${extractFunction('getMergedTableDescriptor')});`,
  )(state, getSeatCoordinates);
  const getMergedTableDropTarget = Function(
    'state',
    'getSeatCoordinates',
    'getMergedTableDescriptor',
    'seatId',
    `return (${extractFunction('getMergedTableDropTarget')});`,
  )(state, getSeatCoordinates, getMergedTableDescriptor, seatId);
  const calls = [];
  const applyMergedTableDropAction = Function(
    'state',
    'pairKey',
    'getMergedTableDescriptor',
    'getMergedTableDropTarget',
    'markOptimalScoreStale',
    'renderSeats',
    'refreshUnseated',
    `return (${extractFunction('applyMergedTableDropAction')});`,
  )(
    state,
    pairKey,
    getMergedTableDescriptor,
    getMergedTableDropTarget,
    () => calls.push('stale'),
    () => calls.push('render'),
    () => calls.push('refresh'),
  );
  return { state, pairKey, getMergedTableDescriptor, getMergedTableDropTarget, applyMergedTableDropAction, calls };
}

test('recognizes a merged table from either seat and preserves its orientation', () => {
  const harness = createTableHarness({
    activeSeats: ['2-9', '2-10'],
    seats: { '2-9': 'a', '2-10': 'b' },
    mergedPairs: ['2-10|2-9'],
    gridCols: 10,
  });

  assert.deepEqual(harness.getMergedTableDescriptor('2-10'), {
    key: '2-10|2-9',
    anchorId: '2-9',
    partnerId: '2-10',
    seatIds: ['2-9', '2-10'],
    orientation: 'horizontal',
  });
});

test('moves a merged table with both assignments to two free target positions', () => {
  const harness = createTableHarness({
    activeSeats: ['1-1', '1-2'],
    seats: { '1-1': 'a', '1-2': 'b' },
    mergedPairs: ['1-1|1-2'],
  });

  assert.equal(
    harness.applyMergedTableDropAction({ anchorId: '1-1', partnerId: '1-2' }, '3-2'),
    true,
  );
  assert.deepEqual([...harness.state.activeSeats].sort(), ['3-2', '3-3']);
  assert.equal(harness.state.seats['1-1'], null);
  assert.equal(harness.state.seats['1-2'], null);
  assert.equal(harness.state.seats['3-2'], 'a');
  assert.equal(harness.state.seats['3-3'], 'b');
  assert.deepEqual([...harness.state.mergedPairs], ['3-2|3-3']);
  assert.deepEqual(harness.calls, ['stale', 'render', 'refresh']);
});

test('swaps two merged tables of the same orientation with their assignments', () => {
  const harness = createTableHarness({
    activeSeats: ['1-1', '1-2', '3-2', '3-3'],
    seats: { '1-1': 'a', '1-2': 'b', '3-2': 'c', '3-3': 'd' },
    mergedPairs: ['1-1|1-2', '3-2|3-3'],
  });

  assert.equal(
    harness.applyMergedTableDropAction({ anchorId: '1-1', partnerId: '1-2' }, '3-3'),
    true,
  );
  assert.equal(harness.state.seats['1-1'], 'c');
  assert.equal(harness.state.seats['1-2'], 'd');
  assert.equal(harness.state.seats['3-2'], 'a');
  assert.equal(harness.state.seats['3-3'], 'b');
  assert.deepEqual([...harness.state.mergedPairs].sort(), ['1-1|1-2', '3-2|3-3']);
});

test('uses the alternate orientation when the current one cannot fit', () => {
  const harness = createTableHarness({
    activeSeats: ['1-1', '1-2'],
    seats: { '1-1': 'a', '1-2': 'b' },
    mergedPairs: ['1-1|1-2'],
    gridCols: 3,
  });

  assert.equal(
    harness.applyMergedTableDropAction({ anchorId: '1-1', partnerId: '1-2' }, '3-3'),
    true,
  );
  assert.deepEqual([...harness.state.activeSeats].sort(), ['3-3', '4-3']);
  assert.equal(harness.state.seats['3-3'], 'a');
  assert.equal(harness.state.seats['4-3'], 'b');
  assert.deepEqual([...harness.state.mergedPairs], ['3-3|4-3']);
});

test('swaps with a table of the other orientation when that is the target orientation', () => {
  const harness = createTableHarness({
    activeSeats: ['1-1', '1-2', '3-1', '4-1'],
    seats: { '1-1': 'a', '1-2': 'b', '3-1': 'c', '4-1': 'd' },
    mergedPairs: ['1-1|1-2', '3-1|4-1'],
    gridCols: 3,
  });

  assert.equal(
    harness.applyMergedTableDropAction({ anchorId: '1-1', partnerId: '1-2' }, '3-1'),
    true,
  );
  assert.equal(harness.state.seats['1-1'], 'c');
  assert.equal(harness.state.seats['1-2'], 'd');
  assert.equal(harness.state.seats['3-1'], 'a');
  assert.equal(harness.state.seats['4-1'], 'b');
});

test('rejects a target at the grid edge without changing the seating state', () => {
  const harness = createTableHarness({
    activeSeats: ['1-1', '1-2'],
    seats: { '1-1': 'a', '1-2': 'b' },
    mergedPairs: ['1-1|1-2'],
    gridRows: 3,
    gridCols: 3,
  });
  const before = JSON.stringify({ activeSeats: [...harness.state.activeSeats], seats: harness.state.seats });

  assert.equal(
    harness.applyMergedTableDropAction({ anchorId: '1-1', partnerId: '1-2' }, '3-3'),
    false,
  );
  assert.equal(JSON.stringify({ activeSeats: [...harness.state.activeSeats], seats: harness.state.seats }), before);
});

test('merged table symbols expose dedicated mouse and touch drag payloads', () => {
  assert.match(appSource, /TABLE:\$\{table\.anchorId\}\|\$\{table\.partnerId\}/);
  assert.match(appSource, /type: 'table',[\s\S]*?label: 'Zweiertisch'/);
  assert.match(appSource, /descriptor\.type === 'table'/);
  assert.match(appSource, /node\.setAttribute\('draggable', 'true'\)/);
  assert.match(appSource, /table\.key !== pairKey\(aId, bId\)/);
  assert.match(appSource, /seat\.classList\.toggle\('active', state\.activeSeats\.has\(id\)\)/);
});

test('merged table dragging renders and highlights the complete two-seat table', () => {
  assert.match(appSource, /function createMergedTableDragPreview\(table/);
  assert.match(appSource, /table-drag-preview--\$\{table\.orientation\}/);
  assert.match(appSource, /function showMergedTableDropPreview\(tablePayload, targetId\)/);
  assert.match(appSource, /classList\.add\('table-drop-target'\)/);
  assert.match(appSource, /clearMergedTableDropPreview\(\);/);
});
