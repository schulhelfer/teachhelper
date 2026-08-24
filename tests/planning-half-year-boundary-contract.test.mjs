import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(
  new URL('../src/modules/planning/app.js', import.meta.url),
  'utf8',
);
const cssSource = await readFile(
  new URL('../src/modules/planning/app.css', import.meta.url),
  'utf8',
);
const themeSource = await readFile(
  new URL('../src/shared/theme.css', import.meta.url),
  'utf8',
);
const htmlSource = await readFile(
  new URL('../src/modules/planning/app.html', import.meta.url),
  'utf8',
);
const runtimeSource = await readFile(
  new URL('../src/modules/workspace/runtime.js', import.meta.url),
  'utf8',
);
const defaultsSource = await readFile(
  new URL('../src/shared/school-data/defaults.js', import.meta.url),
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

const toIso = (date) => [
  String(date.getFullYear()),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const parseIso = (iso) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (iso, days) => {
  const value = parseIso(iso);
  value.setDate(value.getDate() + days);
  return toIso(value);
};

const isoInDateRange = (targetIso, startIso, endIso) => {
  if (!targetIso || !startIso || !endIso) return false;
  if (startIso <= endIso) return targetIso >= startIso && targetIso <= endIso;
  return targetIso >= startIso || targetIso <= endIso;
};

const isSchoolWeekdayIso = (iso) => {
  const weekday = parseIso(iso).getDay();
  return weekday >= 1 && weekday <= 5;
};

const getHalfYearBreakInfo = Function(
  'addDays',
  'isoInDateRange',
  'isSchoolWeekdayIso',
  'HALF_YEAR_BREAK_LABEL',
  'HALF_YEAR_BREAK_LOOKBACK_DAYS',
  `"use strict"; return ({${extractClassMethod('_getHalfYearBreakInfo')}})._getHalfYearBreakInfo;`,
)(addDays, isoInDateRange, isSchoolWeekdayIso, 'Halbjahresferien', 60);

const isHalfYearBoundaryMarkerEnabled = Function(
  'SHOW_HALF_YEAR_BOUNDARY_MARKERS_DEFAULT',
  `"use strict"; return ({${extractClassMethod('isHalfYearBoundaryMarkerEnabled')}}).isHalfYearBoundaryMarkerEnabled;`,
)(true);

const qualificationPhaseBoundaryRules = [
  {
    key: 'qualificationPhaseFirstHalfYearEndDate',
    courseGradeLevel: 12,
    label: 'Ende von Schulhalbjahr 1 der Qualifikationsphase',
  },
  {
    key: 'qualificationPhaseThirdHalfYearEndDate',
    courseGradeLevel: 13,
    label: 'Ende von Schulhalbjahr 3 der Qualifikationsphase',
  },
];

const getQualificationPhaseBoundaryMarkers = Function(
  'QUALIFICATION_PHASE_BOUNDARY_MARKERS',
  `"use strict"; return ({${extractClassMethod('_getQualificationPhaseBoundaryMarkers')}})._getQualificationPhaseBoundaryMarkers;`,
)(qualificationPhaseBoundaryRules);

const getCourseHalfYearBoundaryMarker = Function(
  'HALF_YEAR_END_COURSE_TOOLTIP',
  'formatDate',
  `"use strict"; return ({${extractClassMethod('_getCourseHalfYearBoundaryMarker')}})._getCourseHalfYearBoundaryMarker;`,
)('Letzter Termin im 1. Halbjahr – danach beginnt das 2. Halbjahr', (iso) => iso);

function createHarness({ freeRanges = [], specialDays = [], settings = {}, year = { id: 1, startDate: '2025-08-01', endDate: '2026-07-31' } } = {}) {
  return {
    activeSchoolYear: year,
    store: {
      listFreeRanges: () => freeRanges,
      listSpecialDays: () => specialDays,
      getSetting: (key, fallback = null) => {
        const value = settings[key];
        return value === undefined || value === null ? fallback : value;
      },
    },
  };
}

// Niedersachsen 2025/26: Halbjahresferien Mo 02.02. + Di 03.02.2026.
const defaultRanges = [
  { label: 'Herbstferien', startDate: '2025-10-13', endDate: '2025-10-25' },
  { label: 'Weihnachtsferien', startDate: '2025-12-22', endDate: '2026-01-05' },
  { label: 'Halbjahresferien', startDate: '2026-02-02', endDate: '2026-02-03' },
  { label: 'Osterferien', startDate: '2026-03-23', endDate: '2026-04-07' },
];

test('der letzte Schultag ist der Freitag vor den Halbjahresferien', () => {
  const info = getHalfYearBreakInfo.call(createHarness({ freeRanges: defaultRanges }));

  assert.deepEqual(info, {
    breakStartIso: '2026-02-02',
    breakEndIso: '2026-02-03',
    lastSchoolDayIso: '2026-01-30',
    label: 'Halbjahresferien',
  });
});

test('unterrichtsfreie Einzeltage vor den Ferien werden übersprungen', () => {
  const info = getHalfYearBreakInfo.call(createHarness({
    freeRanges: defaultRanges,
    specialDays: [
      { name: 'Zeugniskonferenz', dayDate: '2026-01-30' },
      { name: 'Beweglicher Ferientag', dayDate: '2026-01-29' },
    ],
  }));

  assert.equal(info.lastSchoolDayIso, '2026-01-28');
});

test('ein direkt angrenzender Ferienzeitraum wird übersprungen', () => {
  const info = getHalfYearBreakInfo.call(createHarness({
    freeRanges: [
      ...defaultRanges,
      { label: 'Projektwoche', startDate: '2026-01-26', endDate: '2026-01-30' },
    ],
  }));

  assert.equal(info.lastSchoolDayIso, '2026-01-23');
});

test('ohne Halbjahresferien-Eintrag oder ohne Schuljahr wird nichts gekennzeichnet', () => {
  assert.equal(getHalfYearBreakInfo.call(createHarness({ freeRanges: [] })), null);
  assert.equal(
    getHalfYearBreakInfo.call(createHarness({
      freeRanges: [{ label: 'Halbjahresferien', startDate: '', endDate: '' }],
    })),
    null,
  );
  assert.equal(getHalfYearBreakInfo.call(createHarness({ year: null })), null);
});

test('der Rückwärtslauf endet am Schuljahresanfang statt endlos zu laufen', () => {
  const info = getHalfYearBreakInfo.call(createHarness({
    year: { id: 1, startDate: '2026-02-01', endDate: '2026-07-31' },
    freeRanges: [{ label: 'Halbjahresferien', startDate: '2026-02-02', endDate: '2026-02-03' }],
  }));

  assert.equal(info.breakStartIso, '2026-02-02');
  assert.equal(info.lastSchoolDayIso, '');
});

test('die Wochenansicht kennzeichnet den Spaltenkopf mit Tooltip', () => {
  const renderWeekTable = extractClassMethod('renderWeekTable');

  assert.match(
    renderWeekTable,
    /const qualificationPhaseBoundaryMarkers = showHalfYearBoundaryMarkers\s+\? this\._getQualificationPhaseBoundaryMarkers\(\)\s+: \[\];/,
  );
  assert.match(renderWeekTable, /const boundaryLabels = \[\];/);
  assert.match(renderWeekTable, /boundaryLabels\.push\(HALF_YEAR_END_WEEK_TOOLTIP\);/);
  assert.match(renderWeekTable, /marker\.dateIso === dayIso/);
  assert.match(renderWeekTable, /boundaryLabels\.join\(" · "\)/);
  assert.match(appSource, /HALF_YEAR_END_WEEK_TOOLTIP = "Letzter Schultag vor den Halbjahresferien/);
});

test('die Oberstufen-Stichtage gelten nur im zugehörigen Schuljahr', () => {
  const markers = getQualificationPhaseBoundaryMarkers.call({
    activeSchoolYear: {
      id: 1,
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      qualificationPhaseFirstHalfYearEndDate: '2025-12-19',
      qualificationPhaseThirdHalfYearEndDate: '2025-12-19',
    },
  });

  assert.deepEqual(markers.map((marker) => [marker.courseGradeLevel, marker.dateIso]), [
    [12, '2025-12-19'],
    [13, '2025-12-19'],
  ]);
  assert.deepEqual(
    getQualificationPhaseBoundaryMarkers.call({
      activeSchoolYear: {
        id: 2,
        startDate: '2025-08-01',
        endDate: '2026-07-31',
        qualificationPhaseFirstHalfYearEndDate: '',
        qualificationPhaseThirdHalfYearEndDate: '2027-12-22',
      },
    }),
    [],
  );
});

test('die Kursansicht folgt dem Oberstufen-Stichtag und fällt sonst auf die Feriengrenze zurück', () => {
  const halfYearBreak = getHalfYearBreakInfo.call(createHarness({ freeRanges: defaultRanges }));
  const markers = getQualificationPhaseBoundaryMarkers.call({
    activeSchoolYear: {
      id: 1,
      startDate: '2025-08-01',
      endDate: '2026-07-31',
      qualificationPhaseFirstHalfYearEndDate: '2025-12-19',
      qualificationPhaseThirdHalfYearEndDate: '2026-01-15',
    },
  });

  const gradeTwelve = getCourseHalfYearBoundaryMarker(
    { gradeLevel: 12 }, halfYearBreak, markers,
  );
  assert.equal(gradeTwelve.dateIso, '2025-12-19');
  assert.equal(gradeTwelve.includesBoundaryDate, true);
  assert.match(gradeTwelve.tooltip, /Schulhalbjahr 1 der Qualifikationsphase/);

  const gradeThirteen = getCourseHalfYearBoundaryMarker(
    { gradeLevel: 13 }, halfYearBreak, markers,
  );
  assert.equal(gradeThirteen.dateIso, '2026-01-15');
  assert.equal(gradeThirteen.includesBoundaryDate, true);

  for (const course of [{ gradeLevel: 11 }, { gradeLevel: null }, { gradeLevel: 13 }]) {
    const fallback = getCourseHalfYearBoundaryMarker(course, halfYearBreak, course.gradeLevel === 13 ? [] : markers);
    assert.equal(fallback.dateIso, '2026-02-02');
    assert.equal(fallback.includesBoundaryDate, false);
  }
});

test('die Kursansicht markiert nur eine Zeile, die einen Folgetermin hat', () => {
  const renderCourseTimeline = extractClassMethod('renderCourseTimeline');

  assert.match(
    renderCourseTimeline,
    /const halfYearBoundaryMarker = this\._getCourseHalfYearBoundaryMarker\(/,
  );
  assert.match(renderCourseTimeline, /topLesson\.lessonDate <= halfYearBoundaryMarker\.dateIso/);
  assert.match(renderCourseTimeline, /topLesson\.lessonDate < halfYearBoundaryMarker\.dateIso/);
  assert.match(
    renderCourseTimeline,
    /if \(halfYearBoundaryRow && halfYearBoundaryRow !== lastRow\) \{\s+halfYearBoundaryRow\.classList\.add\("half-year-boundary-row"\);\s+halfYearBoundaryRow\.dataset\.appTooltip =/,
  );
  assert.match(appSource, /HALF_YEAR_END_COURSE_TOOLTIP = "Letzter Termin im 1\. Halbjahr/);
});

test('beide Ansichten zeichnen die Grenze golden und layoutneutral', () => {
  const weekHead = cssSource.match(
    /#week-table th\.day-head\.half-year-end-head \{([\s\S]*?)\n        \}/,
  )?.[1] || '';
  const courseRow = cssSource.match(
    /#course-table tbody tr\.half-year-boundary-row > td \{([\s\S]*?)\n        \}/,
  )?.[1] || '';

  assert.match(weekHead, /background: var\(--half-year-end-surface\) !important;/);
  assert.match(weekHead, /inset 0 -3px 0 var\(--half-year-end-line\)/);
  assert.doesNotMatch(weekHead, /(?:^|[^-])border(?:-\w+)?:/, 'die Kopfzeilenhöhe darf sich nicht ändern');
  assert.doesNotMatch(weekHead, /padding:/, 'die Kopfzeilenhöhe darf sich nicht ändern');
  assert.match(courseRow, /border-bottom: 3px solid var\(--half-year-end-line\);/);
  assert.match(cssSource, /\.day-head\.half-year-end-head \.day-name,/);

  const boundaryRuleIndex = cssSource.indexOf('#course-table tbody tr.half-year-boundary-row > td');
  const lastChildRuleIndex = cssSource.indexOf('#course-table tbody tr:last-child>td');
  assert.ok(lastChildRuleIndex >= 0);
  assert.ok(
    boundaryRuleIndex > lastChildRuleIndex,
    'die Grenzregel muss nach der last-child-Regel stehen, sonst verliert sie den Spezifitätsgleichstand',
  );
});

test('die Kennzeichnung ist ohne gespeicherte Einstellung eingeschaltet', () => {
  assert.equal(isHalfYearBoundaryMarkerEnabled.call(createHarness()), true);
  assert.equal(
    isHalfYearBoundaryMarkerEnabled.call(createHarness({ settings: { showHalfYearBoundaryMarkers: true } })),
    true,
  );
  assert.equal(
    isHalfYearBoundaryMarkerEnabled.call(createHarness({ settings: { showHalfYearBoundaryMarkers: false } })),
    false,
  );
  assert.match(defaultsSource, /export const SHOW_HALF_YEAR_BOUNDARY_MARKERS_DEFAULT = true;/);
  assert.match(appSource, /const SHOW_HALF_YEAR_BOUNDARY_MARKERS_DEFAULT = true;/);
});

test('beide Ansichten fragen den Schalter ab, der Datums-Helfer bleibt rein', () => {
  const gatedCall = /const showHalfYearBoundaryMarkers = this\.isHalfYearBoundaryMarkerEnabled\(\);\s+const halfYearBreak = showHalfYearBoundaryMarkers \? this\._getHalfYearBreakInfo\(\) : null;/;

  assert.match(extractClassMethod('renderWeekTable'), gatedCall);
  assert.match(extractClassMethod('renderCourseTimeline'), gatedCall);
  assert.doesNotMatch(
    extractClassMethod('_getHalfYearBreakInfo'),
    /getSetting/,
    '_getHalfYearBreakInfo muss frei von Anzeigeentscheidungen bleiben',
  );
  assert.doesNotMatch(
    extractClassMethod('_getQualificationPhaseBoundaryMarkers'),
    /getSetting/,
    'die Oberstufen-Stichtage dürfen keine Anzeigeeinstellung auswerten',
  );
});

test('der Schalter sitzt im Anzeige-Tab und darf gespeichert werden', () => {
  const displayPanel = htmlSource.match(
    /<div id="settings-tab-display"[\s\S]*?\n {14}<\/div>/,
  )?.[0] || '';

  assert.match(displayPanel, /id="show-half-year-boundary-markers"/);
  assert.match(displayPanel, /Halbjahresgrenzen hervorheben/);

  const planningKeys = runtimeSource.match(/const PLANNING_SETTING_KEYS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const gradesKeys = runtimeSource.match(/const GRADES_SETTING_KEYS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';

  assert.match(planningKeys, /'showHalfYearBoundaryMarkers',/);
  assert.doesNotMatch(gradesKeys, /showHalfYearBoundaryMarkers/);
});

test('der Schalter durchläuft den vollständigen Einstellungs-Lebenszyklus', () => {
  const key = /showHalfYearBoundaryMarkers/;

  assert.match(extractClassMethod('buildSettingsDraftFromStore'), key);
  assert.match(extractClassMethod('isSettingsDraftDirty'), key);
  assert.match(extractClassMethod('applySettingsDefaultsForActiveTab'), key);
  assert.match(extractClassMethod('renderDisplaySection'), key);

  const applyDraft = extractClassMethod('applyValidatedSettingsDraftToStore');
  assert.match(applyDraft, /this\.store\.setSetting\("showHalfYearBoundaryMarkers", Boolean\(draft\.showHalfYearBoundaryMarkers\)\);/);
  assert.match(
    applyDraft,
    /\|\| Boolean\(this\.store\.getSetting\("showHalfYearBoundaryMarkers"[\s\S]*?\n\s+!== Boolean\(draft\.showHalfYearBoundaryMarkers\)/,
    'die Nachprüfung nach dem Speichern muss den Schalter einschließen',
  );

  assert.match(
    extractClassMethod('renderDisplaySection'),
    /const draftHalfYearMarkers = this\.settingsDraft\s+\? Boolean\(this\.settingsDraft\.showHalfYearBoundaryMarkers\)\s+: this\.isHalfYearBoundaryMarkerEnabled\(\);/,
    'ohne Entwurf muss der Store-Wert gelten, nicht false',
  );
});

test('die Gold-Tokens sind in beiden Themes definiert', () => {
  const darkBlock = themeSource.match(/^:root \{([\s\S]*?)^\}/m)?.[1] || '';
  const lightBlock = themeSource.match(/^:root\[data-theme="light"\] \{([\s\S]*?)^\}/m)?.[1] || '';

  for (const block of [darkBlock, lightBlock]) {
    assert.match(block, /--half-year-end-line:/);
    assert.match(block, /--half-year-end-surface:/);
    assert.match(block, /--half-year-end-text:/);
  }
});
