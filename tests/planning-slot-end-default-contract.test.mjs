import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const planningSource = await readFile(new URL('../src/modules/planning/app.js', import.meta.url), 'utf8');

function extractClassMethod(name) {
  const match = new RegExp(`\\n  (?:async )?${name}\\(`).exec(planningSource);
  assert.ok(match, `${name} muss vorhanden sein`);
  const start = match.index + 1;
  const bodyStart = planningSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < planningSource.length; index += 1) {
    if (planningSource[index] === '{') depth += 1;
    if (planningSource[index] === '}') depth -= 1;
    if (depth === 0) return planningSource.slice(start, index + 1);
  }
  throw new Error(`${name} ist unvollständig`);
}

const addDays = (iso, amount) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const isSchoolWeekdayIso = (iso) => {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return weekday >= 1 && weekday <= 5;
};
const isoInDateRange = (iso, start, end) => iso >= start && iso <= end;

const getSecondSummerBreakStart = Function(
  `"use strict"; return ({${extractClassMethod('_getSecondSummerBreakStart')}})._getSecondSummerBreakStart;`,
)();
const findLastSchoolDayBefore = Function(
  'addDays',
  'isoInDateRange',
  'isSchoolWeekdayIso',
  `"use strict"; return ({${extractClassMethod('_findLastSchoolDayBefore')}})._findLastSchoolDayBefore;`,
)(addDays, isoInDateRange, isSchoolWeekdayIso);
const computeLessonSlotEndDefault = Function(
  'addDays',
  `"use strict"; return ({${extractClassMethod('_computeLessonSlotEndDefault')}})._computeLessonSlotEndDefault;`,
)(addDays);

function createHarness({ gradeLevel = 12, qualificationPhaseEnd = '', ranges = [], specialDays = [] } = {}) {
  const year = {
    id: 1,
    startDate: '2025-08-01',
    endDate: '2026-07-31',
    qualificationPhaseFourthHalfYearEndDate: qualificationPhaseEnd,
  };
  return {
    activeSchoolYear: year,
    store: {
      listCourses: () => [{ id: 7, gradeLevel }],
      listFreeRanges: () => ranges,
      listSpecialDays: () => specialDays,
    },
    _summerBreakBounds: () => ({ start: '2026-07-02', end: '2025-08-13' }),
    _getSecondSummerBreakStart: getSecondSummerBreakStart,
    _findLastSchoolDayBefore: findLastSchoolDayBefore,
  };
}

test('Jahrgang 13 nutzt den gesetzten Q4-Stichtag, alle anderen Kurse den letzten Schultag vor den zweiten Sommerferien', () => {
  const ranges = [{ label: 'Sommerferien', startDate: '2026-07-02', endDate: '2026-08-12' }];
  const grade13 = createHarness({ gradeLevel: 13, qualificationPhaseEnd: '2026-04-08', ranges });
  const grade12 = createHarness({ gradeLevel: 12, qualificationPhaseEnd: '2026-04-08', ranges });
  const grade13WithoutDate = createHarness({ gradeLevel: 13, ranges });

  assert.equal(computeLessonSlotEndDefault.call(grade13, '2025-08-04', 7), '2026-04-08');
  assert.equal(computeLessonSlotEndDefault.call(grade12, '2025-08-04', 7), '2026-07-01');
  assert.equal(computeLessonSlotEndDefault.call(grade13WithoutDate, '2025-08-04', 7), '2026-07-01');
});

test('der allgemeine Wert überspringt Wochenenden, freie Tage und Ferien', () => {
  const harness = createHarness({
    ranges: [
      { label: 'Sommerferien', startDate: '2026-07-06', endDate: '2026-08-12' },
      { label: 'Projekttag', startDate: '2026-07-02', endDate: '2026-07-02' },
    ],
    specialDays: [{ dayDate: '2026-07-03' }],
  });

  assert.equal(computeLessonSlotEndDefault.call(harness, '2025-08-04', 7), '2026-07-01');
});

test('der Q4-Stichtag wird innerhalb des neuen Serienzeitraums begrenzt und nur der Unterrichtsstundendialog verwendet die neue Berechnung', () => {
  const harness = createHarness({ gradeLevel: 13, qualificationPhaseEnd: '2026-04-08' });

  assert.equal(computeLessonSlotEndDefault.call(harness, '2026-05-04', 7), '2026-05-04');
  assert.match(planningSource, /const endDefault = this\._computeLessonSlotEndDefault\(\s*startDefault,\s*this\.refs\.slotDialogCourse\.value\s*\);/);
  assert.match(planningSource, /async openBreakSupervisionDialog[\s\S]*?const endDefault = this\._computeSlotEndDefault\(startDefault\);/);
});
