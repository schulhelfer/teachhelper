import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [schoolDataSource, storeSource, planningSource, htmlSource, cssSource] = await Promise.all([
  readFile(new URL('../src/shared/school-data/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/workspace/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/planning/app.css', import.meta.url), 'utf8'),
]);

const schoolData = await import(`data:text/javascript;base64,${Buffer.from(schoolDataSource).toString('base64')}`);

function extractClassMethod(source, name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(source);
  assert.ok(match, `${name} muss vorhanden sein`);
  const start = match.index + 1;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} ist unvollständig`);
}

const qualificationPhaseEndDateKeys = [
  'qualificationPhaseFirstHalfYearEndDate',
  'qualificationPhaseThirdHalfYearEndDate',
  'qualificationPhaseFourthHalfYearEndDate',
];
const setQualificationPhaseEndDate = Function(
  'QUALIFICATION_PHASE_END_DATE_KEYS',
  `"use strict"; return ({${extractClassMethod(storeSource, 'setQualificationPhaseEndDate')}}).setQualificationPhaseEndDate;`,
)(qualificationPhaseEndDateKeys);

test('der Qualifikationsphasen-Stichtag wird je Schuljahr normalisiert und für alte Datenbanken ergänzt', () => {
  const normalized = schoolData.normalizePublicSchoolData({
    schoolYears: [
      {
        id: 1,
        name: '2026/2027',
        startDate: '2026-08-01',
        endDate: '2027-07-31',
        qualificationPhaseFourthHalfYearEndDate: '2027-04-30',
      },
      {
        id: 2,
        name: '2027/2028',
        startDate: '2027-08-01',
        endDate: '2028-07-31',
      },
    ],
    freeRanges: [{ id: 1, schoolYearId: 1, label: 'Osterferien', startDate: '2027-03-22', endDate: '2027-04-02' }],
    specialDays: [{ id: 1, name: 'Tag der Arbeit', dayDate: '2027-05-01' }],
  });

  assert.equal(normalized.schoolYears[0].qualificationPhaseFourthHalfYearEndDate, '2027-04-30');
  assert.equal(normalized.schoolYears[0].qualificationPhaseFirstHalfYearEndDate, '2026-12-22');
  assert.equal(normalized.schoolYears[0].qualificationPhaseThirdHalfYearEndDate, '2026-12-22');
  assert.equal(normalized.schoolYears[1].qualificationPhaseFirstHalfYearEndDate, '');
  assert.equal(normalized.schoolYears[1].qualificationPhaseThirdHalfYearEndDate, '');
  assert.equal(normalized.schoolYears[1].qualificationPhaseFourthHalfYearEndDate, '2028-04-06');
  assert.deepEqual(normalized.freeRanges, [{
    id: 1,
    schoolYearId: 1,
    label: 'Osterferien',
    startDate: '2027-03-22',
    endDate: '2027-04-02',
  }]);
  assert.deepEqual(normalized.specialDays, [{ id: 1, name: 'Tag der Arbeit', dayDate: '2027-05-01' }]);
});

test('Setzen und Leeren der Oberstufenregelungen speichert nur erlaubte Werte im gewählten Schuljahr', () => {
  const firstYear = {
    id: 1,
    qualificationPhaseFirstHalfYearEndDate: '',
    qualificationPhaseThirdHalfYearEndDate: '',
    qualificationPhaseFourthHalfYearEndDate: '',
  };
  const secondYear = {
    id: 2,
    qualificationPhaseFirstHalfYearEndDate: '2028-12-20',
    qualificationPhaseThirdHalfYearEndDate: '2028-12-20',
    qualificationPhaseFourthHalfYearEndDate: '2029-04-30',
  };
  let saves = 0;
  const store = {
    getSchoolYear: (id) => [firstYear, secondYear].find((year) => year.id === Number(id)) || null,
    _save: () => { saves += 1; },
  };

  assert.equal(setQualificationPhaseEndDate.call(store, 1, qualificationPhaseEndDateKeys[0], '2026-12-22'), true);
  assert.equal(setQualificationPhaseEndDate.call(store, 1, qualificationPhaseEndDateKeys[1], '2026-12-22'), true);
  assert.equal(setQualificationPhaseEndDate.call(store, 1, qualificationPhaseEndDateKeys[2], '2027-03-18'), true);
  assert.equal(firstYear.qualificationPhaseFirstHalfYearEndDate, '2026-12-22');
  assert.equal(firstYear.qualificationPhaseThirdHalfYearEndDate, '2026-12-22');
  assert.equal(firstYear.qualificationPhaseFourthHalfYearEndDate, '2027-03-18');
  assert.equal(secondYear.qualificationPhaseFourthHalfYearEndDate, '2029-04-30');
  assert.equal(saves, 3);

  assert.equal(setQualificationPhaseEndDate.call(store, 1, qualificationPhaseEndDateKeys[1], ''), true);
  assert.equal(firstYear.qualificationPhaseThirdHalfYearEndDate, '');
  assert.equal(saves, 4);
  assert.equal(setQualificationPhaseEndDate.call(store, 1, 'unknown', '2027-04-30'), false);
  assert.equal(setQualificationPhaseEndDate.call(store, 99, qualificationPhaseEndDateKeys[0], '2027-04-30'), false);
});

test('die hinterlegten Standardtermine sind dem jeweiligen Schuljahr zugeordnet', () => {
  assert.deepEqual(schoolData.getDefaultQualificationPhaseEndDates(2025), {
    qualificationPhaseFirstHalfYearEndDate: '2025-12-19',
    qualificationPhaseThirdHalfYearEndDate: '2025-12-19',
    qualificationPhaseFourthHalfYearEndDate: '2026-04-08',
  });
  assert.deepEqual(schoolData.getDefaultQualificationPhaseEndDates(2026), {
    qualificationPhaseFirstHalfYearEndDate: '2026-12-22',
    qualificationPhaseThirdHalfYearEndDate: '2026-12-22',
    qualificationPhaseFourthHalfYearEndDate: '2027-03-18',
  });
  assert.deepEqual(schoolData.getDefaultQualificationPhaseEndDates(2027), {
    qualificationPhaseFirstHalfYearEndDate: '',
    qualificationPhaseThirdHalfYearEndDate: '',
    qualificationPhaseFourthHalfYearEndDate: '2028-04-06',
  });
});

test('ein bereits gespeicherter leerer Wert bleibt bei der Migration leer', () => {
  const normalized = schoolData.normalizePublicSchoolData({
    schoolYears: [{
      id: 1,
      name: '2026/2027',
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      qualificationPhaseFourthHalfYearEndDate: '',
    }],
  });

  assert.equal(normalized.schoolYears[0].qualificationPhaseFirstHalfYearEndDate, '2026-12-22');
  assert.equal(normalized.schoolYears[0].qualificationPhaseThirdHalfYearEndDate, '2026-12-22');
  assert.equal(normalized.schoolYears[0].qualificationPhaseFourthHalfYearEndDate, '');
});

test('die Einstellungen zeigen drei feste Qualifikationsphasen-Regeln mit passenden Quellen', () => {
  assert.match(
    htmlSource,
    /<h3 class="settings-panel-title">Abweichende Regelungen für die Qualifikationsphase<\/h3>\s*<ul id="qualification-phase-end-date-list" class="list"><\/ul>/,
  );
  assert.doesNotMatch(htmlSource, /abiturprufung\/abiturpruefung-6441\.html/);
  assert.match(htmlSource, /id="qualification-phase-end-date-dialog"/);
  assert.match(htmlSource, /id="qualification-phase-end-date-dialog-date" type="date"/);
  assert.match(cssSource, /#settings-tab-dayoff \.settings-grid \{\s+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(planningSource, /Ende von Schulhalbjahr 1/);
  assert.match(planningSource, /Ende von Schulhalbjahr 3/);
  assert.match(planningSource, /Ende von Schulhalbjahr 4/);
  assert.match(planningSource, /Ausgabe der Studienbücher/);
  assert.match(planningSource, /schulverwaltungsblatt_amtlicher_teil\/schulverwaltungsblatt-amtlicher-teil-6525\.html/);
  assert.match(planningSource, /Abiturtermine/);
  assert.match(planningSource, /abiturprufung\/abiturpruefung-6441\.html/);
  assert.match(planningSource, /persistExplicitDatabaseSave\("planning-qualification-phase-end-date-save"\)/);
  assert.match(planningSource, /openQualificationPhaseEndDateDialog/);
});
