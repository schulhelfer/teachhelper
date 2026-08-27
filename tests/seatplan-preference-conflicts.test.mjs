import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [appSource, htmlSource] = await Promise.all([
  readFile(new URL('../src/modules/seatplan/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/seatplan/app.html', import.meta.url), 'utf8'),
]);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} muss existieren`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} ist unvollständig`);
}

const findBuddyFoeConflicts = Function(
  'getBuddyList',
  '"use strict"; return (' + extractFunction(appSource, 'findBuddyFoeConflicts') + ');',
)(student => (student?.prefersAlone ? [] : (student?.buddies || [])));

test('Sitzwunsch-Konflikte enthalten alle widersprüchlichen Richtungen', () => {
  const students = [
    { id: 'a', buddies: ['b'], foes: ['b', 'c'] },
    { id: 'b', buddies: ['a'], foes: ['a'] },
    { id: 'c', buddies: ['a'], foes: ['a'] },
    { id: 'd', buddies: ['a'], foes: [] },
  ];

  const conflicts = findBuddyFoeConflicts(students);

  assert.deepEqual(
    conflicts.map(({ buddyOwner, foeOwner }) => [buddyOwner.id, foeOwner.id]),
    [['a', 'b'], ['b', 'a'], ['c', 'a']],
  );
});

test('Konflikt-Dialog zeigt eine richtungsgetreue Tabelle statt des Text-Hinweises', () => {
  assert.match(
    htmlSource,
    /<dialog id="preference-conflicts-dialog"[\s\S]*?<table class="preference-conflicts-table"[\s\S]*?id="preference-conflicts-tbody"[\s\S]*?id="preference-conflicts-dialog-close"/,
  );
  assert.match(appSource, /function buildPreferenceConflictsTable\(conflicts\)/);
  assert.match(appSource, /function openPreferenceConflictsDialog\(conflicts\)/);
  assert.match(appSource, /const conflicts = savePreferencesFromForm\(\);[\s\S]*?openPreferenceConflictsDialog\(conflicts\)/);
  assert.match(appSource, /\[\s*buddyOwnerName,\s*foeOwnerName,\s*foeOwnerName,\s*`nicht \$\{buddyOwnerName\}`/);
  assert.doesNotMatch(appSource, /gut neben \$\{foeOwnerName\}/);
  assert.doesNotMatch(appSource, /const primary = conflicts\[0\]/);
});

test('Konfliktfreie Sitzwünsche liefern keine Dialogdaten', () => {
  const conflicts = findBuddyFoeConflicts([
    { id: 'a', buddies: ['b'], foes: [] },
    { id: 'b', buddies: [], foes: [] },
  ]);

  assert.deepEqual(conflicts, []);
});
