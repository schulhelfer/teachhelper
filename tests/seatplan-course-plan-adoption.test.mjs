import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function importEsmSource(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const {
  buildStudentNameMatchKey,
  remapCourseSeatPlan,
} = await importEsmSource('../src/shared/school-data/seatplan-transfer.js');

const sourcePlan = () => ({
  version: 1,
  generatedAt: '2026-08-20T10:00:00.000Z',
  grid: { rows: 3, cols: 4 },
  activeSeats: ['1-1', '1-2', '2-1', '2-2'],
  seats: { '1-1': '11', '1-2': '12', '2-1': '13', '2-2': 'TEACHER' },
  mergedPairs: [['1-1', '1-2']],
  students: [{ id: '11', first: 'Anna', last: 'Meier', portrait: { mime: 'image/webp', data: 'AAAA' } }],
  headers: ['Nachname', 'Vorname'],
  delim: ',',
  csvName: 'Kurs A (Notenmodul)',
  conditions: {
    teacherDistances: [{ studentId: '11', maxDistance: 2 }, { studentId: '13', maxDistance: 3 }],
    genderAlternation: true,
  },
  mergeSettings: { toggleValue: 'zulässig', mode: 'allow', symbolsHidden: false },
  seatScoresHidden: true,
});

const sourceStudents = [
  { id: 11, courseId: 1, lastName: 'Meier', firstName: 'Anna' },
  { id: 12, courseId: 1, lastName: 'Schulz', firstName: 'Ben' },
  { id: 13, courseId: 1, lastName: 'Weber', firstName: 'Carla' },
];

const targetStudents = [
  { id: 41, courseId: 2, lastName: 'weber', firstName: '  Carla ' },
  { id: 42, courseId: 2, lastName: 'Meier', firstName: 'Anna' },
  { id: 43, courseId: 2, lastName: 'Neu', firstName: 'Dora' },
];

test('der Namensschlüssel ignoriert Groß-/Kleinschreibung und doppelte Leerzeichen', () => {
  assert.equal(
    buildStudentNameMatchKey(' Meier ', 'Anna   Lena'),
    buildStudentNameMatchKey('meier', 'anna lena'),
  );
  assert.notEqual(buildStudentNameMatchKey('Meier', 'Anna'), buildStudentNameMatchKey('Meier', 'Anne'));
});

test('gleiche Personen behalten ihren Platz, fremde Plätze bleiben leer', () => {
  const result = remapCourseSeatPlan({ plan: sourcePlan(), sourceStudents, targetStudents });

  assert.deepEqual(result.plan.seats, {
    '1-1': '42',
    '1-2': null,
    '2-1': '41',
    '2-2': 'TEACHER',
  });
  assert.equal(result.matchedCount, 2);
  assert.equal(result.sourceSeatedCount, 3);
});

test('die Übernahme reicht niemals Teilnehmende weiter', () => {
  const result = remapCourseSeatPlan({ plan: sourcePlan(), sourceStudents, targetStudents });
  const targetIds = new Set(targetStudents.map((student) => String(student.id)));

  assert.ok(!Object.hasOwn(result.plan, 'students'));
  assert.ok(!Object.hasOwn(result.plan, 'csvName'));
  assert.ok(!Object.hasOwn(result.plan, 'headers'));
  assert.ok(!Object.hasOwn(result.plan, 'delim'));
  for (const value of Object.values(result.plan.seats)) {
    if (value === null || value === 'TEACHER') continue;
    assert.ok(targetIds.has(value), `unbekannte Sitzbelegung: ${value}`);
  }
});

test('das Raumlayout kommt unverändert mit', () => {
  const result = remapCourseSeatPlan({ plan: sourcePlan(), sourceStudents, targetStudents });

  assert.deepEqual(result.plan.grid, { rows: 3, cols: 4 });
  assert.deepEqual(result.plan.activeSeats, ['1-1', '1-2', '2-1', '2-2']);
  assert.deepEqual(result.plan.mergedPairs, [['1-1', '1-2']]);
  assert.deepEqual(result.plan.mergeSettings, { toggleValue: 'zulässig', mode: 'allow', symbolsHidden: false });
  assert.equal(result.plan.seatScoresHidden, true);
});

test('Lehrerabstände werden mitgenommen oder verworfen, in beiden Speicherformen', () => {
  const fromArray = remapCourseSeatPlan({ plan: sourcePlan(), sourceStudents, targetStudents });
  assert.deepEqual(fromArray.plan.conditions.teacherDistances, [
    { studentId: '42', maxDistance: 2 },
    { studentId: '41', maxDistance: 3 },
  ]);

  const objectPlan = sourcePlan();
  objectPlan.conditions.teacherDistances = { 11: 2, 12: 4 };
  const fromObject = remapCourseSeatPlan({ plan: objectPlan, sourceStudents, targetStudents });
  assert.deepEqual(fromObject.plan.conditions.teacherDistances, [{ studentId: '42', maxDistance: 2 }]);
});

test('individuelle Sitzkriterien werden nur für passende Personen und Referenzen übernommen', () => {
  const plan = sourcePlan();
  plan.preferences = {
    11: { genderPref: 'm', prefersAlone: false, buddies: ['12', '13'], foes: ['13'] },
    12: { genderPref: 'w', prefersAlone: true, buddies: ['11'], foes: [] },
    13: { genderPref: 'd', prefersAlone: false, buddies: ['11', '12'], foes: ['11', '13'] },
  };

  const result = remapCourseSeatPlan({ plan, sourceStudents, targetStudents });

  assert.deepEqual(result.plan.preferences, {
    41: { genderPref: 'd', prefersAlone: false, buddies: ['42'], foes: ['42'] },
    42: { genderPref: 'm', prefersAlone: false, buddies: ['41'], foes: ['41'] },
  });
});

test('ein doppelter Name im Quellkurs belegt den Zielplatz nur einmal', () => {
  const plan = sourcePlan();
  plan.seats = { '1-1': '11', '1-2': '12' };
  const doubledSource = [
    { id: 11, lastName: 'Meier', firstName: 'Anna' },
    { id: 12, lastName: 'Meier', firstName: 'Anna' },
  ];

  const result = remapCourseSeatPlan({ plan, sourceStudents: doubledSource, targetStudents });

  assert.deepEqual(result.plan.seats, { '1-1': '42', '1-2': null });
  assert.equal(result.matchedCount, 1);
  assert.equal(result.sourceSeatedCount, 2);
});

test('Platzhalter und namenlose Zeilen erben keinen Sitzplatz', () => {
  const plan = sourcePlan();
  plan.seats = { '1-1': '11', '1-2': '14' };
  const withPlaceholders = remapCourseSeatPlan({
    plan,
    sourceStudents: [...sourceStudents, { id: 14, lastName: '', firstName: '' }],
    targetStudents: [
      { id: 40, lastName: 'Meier', firstName: 'Anna', isPlaceholder: true },
      ...targetStudents,
    ],
  });

  assert.deepEqual(withPlaceholders.plan.seats, { '1-1': '42', '1-2': null });
});

test('ein unlesbarer Plan liefert nichts zurück', () => {
  assert.equal(remapCourseSeatPlan({ plan: null, sourceStudents, targetStudents }), null);
  assert.equal(remapCourseSeatPlan(), null);

  const emptyPlan = remapCourseSeatPlan({ plan: {}, sourceStudents, targetStudents });
  assert.deepEqual(emptyPlan.plan.seats, {});
  assert.equal(emptyPlan.matchedCount, 0);
  assert.equal(emptyPlan.sourceSeatedCount, 0);
});
