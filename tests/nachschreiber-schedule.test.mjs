import assert from 'node:assert/strict';
import test from 'node:test';
import { getTomorrowDate, parseExamSchedule, rankExamSuggestions } from '../src/modules/nachschreiber/schedule.js';

const header = ['Titel', 'KW', 'Datum', 'Start', 'Ende', 'Gruppen', 'Lehrkraft'];

function csv(rows, delimiter = ';') {
  return [header, ...rows].map((row) => row.map((cell) => {
    const value = String(cell);
    return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }).join(delimiter)).join('\r\n');
}

function exam(week, date, groups, teacher = 'Kürzel A', start = '08:45:00', end = '09:30:00') {
  return ['', week, date, start, end, groups, teacher];
}

function search(rows, startDate, endDate, options = {}) {
  return rankExamSuggestions(parseExamSchedule(csv(rows)), { year: '9', classLetter: 'b', startDate, endDate, ...options });
}

test('der Import liest die festen Spalten und erhält Trennzeichen in den Gruppenangaben', () => {
  const groups = ['9b', '10a', '11a', '12a', '13a', '5a', '6a', '7a', '8a'].join(', ');
  const rows = [exam(48, '24.11.2026', groups, 'Kürzel "A"'), exam(48, '25.11.2026', '5b; 5c', 'Kürzel B', '', '')];
  rows[0][0] = 'Schriftliche Arbeit; Teil 2';
  for (const delimiter of [';', ',', '\t']) {
    const [timed, allDay] = parseExamSchedule(`\uFEFF${csv(rows, delimiter)}\r\n`);
    assert.deepEqual(timed, {
      date: '2026-11-24', weekNumber: 48, weekKey: '2026-48', title: 'Schriftliche Arbeit; Teil 2',
      startTime: '08:45:00', endTime: '09:30:00',
      groups, teacher: 'Kürzel "A"',
    });
    assert.equal(allDay.startTime, '');
    assert.equal(allDay.endTime, '');
    assert.equal(allDay.title, '');
    assert.equal(allDay.groups, '5b; 5c');
  }
  const competingDelimiters = Array.from({ length: 7 }, () => exam(48, '24.11.2026', groups));
  assert.equal(parseExamSchedule(csv(competingDelimiters)).length, 7);
});

test('Zeilen mit ungültigem Datum, falscher KW oder unvollständigen Angaben verhindern den Import', () => {
  for (const badRow of [
    exam(48, '31.11.2026', '9b'),
    exam(49, '24.11.2026', '9b'),
    exam(48, '24.11.2026', '9b', 'Kürzel A', '', '09:30'),
    exam(48, '24.11.2026', '9b', 'Kürzel A', '10:00', '09:30'),
    exam(48, '24.11.2026', ''),
    exam(48, '24.11.2026', '9b').slice(0, -1),
  ]) {
    assert.throws(() => parseExamSchedule(csv([exam(48, '24.11.2026', '9c'), badRow])), /CSV-Zeile 3/);
  }
  assert.throws(() => parseExamSchedule(`${csv([])}\n;48;24.11.2026;08:45;09:30;9b;"Kürzel A`), /CSV-Zeile 2/);
  assert.throws(() => parseExamSchedule(`${csv([])}\n;48;24.11.2026;08:45;09:30;"9b"10a;Kürzel A`), /CSV-Zeile 2/);
  assert.throws(() => parseExamSchedule(csv([])), /keine Klassenarbeiten/);
});

test('eigene Gruppen blockieren ganze Tage, und die gesamte Woche bestimmt die Rangstufe', () => {
  const suggestions = search([
    exam(48, '23.11.2026', 'Mathematik [9B, Jahrgang.9]'),
    exam(48, '24.11.2026', '9a / JAHRGANG.9', 'Kürzel A', '', ''),
    exam(48, '25.11.2026', '10b', 'Stufe 2'),
    exam(49, '30.11.2026', 'x9b / 19b / Jahrgang.90', 'Erster Gleichstand'),
    exam(49, '30.11.2026', '9c', 'Zweiter Gleichstand'),
    exam(49, '30.11.2026', '9d', 'Früher', '08:00', '08:45'),
    exam(49, '30.11.2026', '8b', 'Ganztägig', '', ''),
    exam(50, '07.12.2026', 'Wahlpflicht [9b], 10a'),
    exam(50, '07.12.2026', '13a', 'Gesperrter Tag', '15:00', '15:45'),
    exam(50, '08.12.2026', 'Jahrgang.10', 'Stufe 1'),
    exam(51, '14.12.2026', '9b'),
    exam(51, '15.12.2026', '13e', 'Gesperrte Woche'),
    exam(51, '16.12.2026', 'Jahrgang.9'),
    exam(51, '17.12.2026', '9b'),
  ], '2026-11-25', '2026-12-15');

  assert.deepEqual(suggestions.map(({ teacher, ownExamCount }) => [teacher, ownExamCount]), [
    ['Früher', 0], ['Erster Gleichstand', 0], ['Zweiter Gleichstand', 0],
    ['Stufe 1', 1], ['Stufe 2', 2],
  ]);
});

test('Suchgrenzen sind inklusive und ISO-Wochen bleiben über den Jahreswechsel zusammen', () => {
  assert.equal(getTomorrowDate(new Date(2026, 11, 31, 23, 59)), '2027-01-01');
  const rows = [
    exam(1, '01.01.2026', '9b'),
    exam(53, '30.12.2026', '9c', 'Vor Suchbeginn'),
    exam(53, '31.12.2026', 'Jahrgang.9'),
    exam(53, '01.01.2027', '9b'),
    exam(53, '02.01.2027', '9e', 'Am Suchbeginn'),
    exam(1, '04.01.2027', '5c', 'Am Enddatum'),
    exam(1, '05.01.2027', '5a', 'Nach dem Enddatum'),
  ];
  const suggestions = search(rows, '2027-01-02', '2027-01-04');

  assert.deepEqual(suggestions.map(({ teacher, ownExamCount }) => [teacher, ownExamCount]), [
    ['Am Enddatum', 0], ['Am Suchbeginn', 2],
  ]);
  assert.deepEqual(search(rows, '2027-01-02', '').map(({ teacher }) => teacher), [
    'Am Enddatum', 'Nach dem Enddatum', 'Am Suchbeginn',
  ]);
});

test('ein gemeinsamer CSV-Termin muss für jede Lerngruppe passen und zeigt den höchsten Wochenwert', () => {
  const schedules = parseExamSchedule(csv([
    exam(7, '11.02.2031', '9b, Jahrgang.9'),
    exam(7, '12.02.2031', '11c'),
    exam(7, '11.02.2031', '6a', 'Tagessperre A'),
    exam(7, '12.02.2031', '6a', 'Tagessperre B'),
    exam(7, '14.02.2031', '6a', 'Termin bei je einer Klausur'),
    exam(8, '17.02.2031', '9b, Jahrgang.11'),
    exam(8, '18.02.2031', '11c'),
    exam(8, '19.02.2031', '6a', 'Termin bei höchstens zwei Klausuren'),
    exam(9, '24.02.2031', '11c'),
    exam(9, '25.02.2031', '11c'),
    exam(9, '26.02.2031', '11c'),
    exam(9, '27.02.2031', '6a', 'Wochensperre'),
  ]));
  schedules.push({
    source: 'pdf', date: '2031-02-25', weekKey: '2031-9', groups: '11c', teacher: 'PDF-Termin',
    startLesson: 2, endLesson: 2, durationMinutes: 45,
  });
  const suggestions = rankExamSuggestions(schedules, {
    studentGroups: [{ year: '9', classLetter: 'b' }, { year: '11', classLetter: 'c' }, { year: '9', classLetter: 'b' }],
    startDate: '2031-02-10',
    lessonTimes: [{ lesson: 2, start: '08:45', end: '09:30' }],
  });
  assert.deepEqual(suggestions.map(({ teacher, ownExamCount }) => [teacher, ownExamCount]), [
    ['Termin bei je einer Klausur', 1], ['PDF-Termin', null], ['Termin bei höchstens zwei Klausuren', 2],
  ]);
});

test('Freistunden treffen wöchentlich bei zeitlicher Überschneidung mit derselben Unterrichtsstunde', () => {
  const freePeriods = [
    { weekday: 1, lesson: 3 }, { weekday: 1, lesson: 2 }, { weekday: 1, lesson: 2 }, { weekday: 2, lesson: 4 },
  ];
  const lessonTimes = [
    { lesson: 2, start: '08:45', end: '09:30' },
    { lesson: 3, start: '09:45', end: '10:30' },
    { lesson: 4, start: '10:35', end: '' },
  ];
  const suggestions = search([
    exam(48, '23.11.2026', '5a', 'Grenze am Beginn', '08:00', '08:45'),
    exam(48, '23.11.2026', '5a', 'Teilweise', '08:10', '08:55'),
    exam(48, '23.11.2026', '5a', 'Zwei Stunden', '09:29:59', '10:14:59'),
    exam(48, '23.11.2026', '5a', 'Grenze am Ende', '10:30', '11:15'),
    exam(48, '23.11.2026', '5a', 'Zu kurzer Freistundentreffer', '08:45', '08:55'),
    exam(48, '23.11.2026', '5a', 'Ganztägig', '', ''),
    exam(48, '24.11.2026', '5a', 'Anderer Wochentag', '08:10', '08:55'),
    exam(48, '24.11.2026', '5a', 'Fehlende Uhrzeit', '10:40', '11:25'),
    exam(49, '30.11.2026', '5a', 'Folgewoche'),
  ], '2026-11-23', '2026-11-30', { freePeriods, lessonTimes });

  assert.deepEqual(suggestions.map(({ teacher, freePeriodLessons }) => [teacher, freePeriodLessons]), [
    ['Teilweise', [2]], ['Zwei Stunden', [2, 3]], ['Folgewoche', [2]],
    ['Grenze am Beginn', []], ['Grenze am Ende', []],
    ['Anderer Wochentag', []], ['Fehlende Uhrzeit', []],
  ]);
});

test('Wochenstufen und Tagessperren gelten auch bei einem Freistundentreffer', () => {
  const suggestions = search([
    exam(48, '23.11.2026', '9b'),
    exam(48, '24.11.2026', 'Jahrgang.9'),
    exam(48, '25.11.2026', '5a', 'Treffer in Woche mit zwei Arbeiten'),
    exam(48, '26.11.2026', '5a', 'Woche mit zwei Arbeiten'),
    exam(49, '30.11.2026', '5a', 'Ruhigere Woche'),
    exam(49, '02.12.2026', '5a', 'Treffer in ruhigerer Woche'),
    exam(50, '09.12.2026', '9b'),
    exam(50, '09.12.2026', '5a', 'Treffer an gesperrtem Tag'),
  ], '2026-11-23', '2026-12-09', {
    freePeriods: [{ weekday: 3, lesson: 2 }],
    lessonTimes: [{ lesson: 2, start: '08:45', end: '09:30' }],
  });

  assert.deepEqual(suggestions.map(({ teacher }) => teacher), [
    'Treffer in ruhigerer Woche', 'Ruhigere Woche', 'Treffer in Woche mit zwei Arbeiten', 'Woche mit zwei Arbeiten',
  ]);
});

test('eine bis vier Unterrichtsstunden müssen sekundengenau in den CSV-Zeitraum passen', () => {
  for (const [requiredLessons, exactEnd, shortEnd] of [
    [1, '08:45:17', '08:45:16'],
    [2, '09:30:17', '09:30:16'],
    [3, '10:15:17', '10:15:16'],
    [4, '11:00:17', '11:00:16'],
  ]) {
    const suggestions = search([
      exam(48, '24.11.2026', '5a', 'Eine Sekunde zu kurz', '08:00:17', shortEnd),
      exam(48, '24.11.2026', '5a', 'Exakt passend', '08:00:17', exactEnd),
      exam(48, '24.11.2026', '5a', 'Längerer Termin', '08:00:17', '11:15'),
      exam(48, '24.11.2026', '5a', 'Ganztägig', '', ''),
    ], '2026-11-24', '2026-11-24', { requiredLessons });

    assert.deepEqual(suggestions.map(({ teacher }) => teacher), ['Exakt passend', 'Längerer Termin']);
  }
});

test('PDF-Klausuren zählen als fremd und verwenden nur volle Einheiten im vorhandenen Raster', () => {
  const pdfExam = (groups, startLesson, endLesson, durationMinutes) => ({
    source: 'pdf', date: '2031-02-11', weekKey: '2031-7', groups, startLesson, endLesson, durationMinutes,
  });
  const exams = [
    pdfExam('9b-TEST-A', 2, 4, 112),
    pdfExam('9b-TEST-B', 2, 4, 89),
    pdfExam('9b-TEST-C', 2, 2, 120),
    pdfExam('9b-TEST-D', 1, 4, 120),
    pdfExam('9b-TEST-E', 2, 5, 270),
    pdfExam('9b-TEST-F', 2, 5, null),
  ];
  const lessonTimes = [
    { lesson: 2, start: '07:35', end: '08:20' },
    { lesson: 3, start: '08:35', end: '09:20' },
    { lesson: 5, start: '10:05', end: '10:50' },
  ];
  let reportedMissingTime = false;
  const options = {
    year: '9', classLetter: 'b', startDate: '2031-02-10', requiredLessons: 2, lessonTimes,
    freePeriods: [{ weekday: 2, lesson: 2 }, { weekday: 2, lesson: 3 }],
    onMissingPdfLessonTimes: () => { reportedMissingTime = true; },
  };
  const suggestions = rankExamSuggestions(exams, options);
  assert.deepEqual(suggestions.map((exam) => exam.groups), ['9b-TEST-A', '9b-TEST-E', '9b-TEST-F']);
  assert.equal(reportedMissingTime, true);
  for (const exam of suggestions) {
    assert.deepEqual(exam.makeupLessons, [2, 3]);
    assert.deepEqual(exam.freePeriodLessons, [2, 3]);
    assert.equal(exam.fullyCoveredByFreePeriods, true);
    assert.equal(exam.ownExamCount, null);
  }
  assert.deepEqual(rankExamSuggestions(exams, { ...options, requiredLessons: 3 }), []);
  const shortGrid = [lessonTimes[0], { ...lessonTimes[1], end: '09:19:59' }];
  assert.deepEqual(rankExamSuggestions(exams, { ...options, lessonTimes: shortGrid }), []);
});

test('kurze und ganztägige eigene Arbeiten zählen für Tages- und Wochensperren', () => {
  const suggestions = search([
    exam(48, '23.11.2026', '9b', 'Eigene kurze Arbeit', '08:00', '08:15'),
    exam(48, '23.11.2026', '5a', 'Gesperrt wegen kurzer Arbeit', '09:00', '10:30'),
    exam(48, '24.11.2026', 'Jahrgang.9', 'Eigene ganztägige Arbeit', '', ''),
    exam(48, '24.11.2026', '5a', 'Gesperrt wegen ganztägiger Arbeit', '09:00', '10:30'),
    exam(48, '25.11.2026', '5a', 'Terminvorschlag', '09:00', '10:30'),
  ], '2026-11-23', '2026-11-25', { requiredLessons: 2 });

  assert.deepEqual(suggestions.map(({ teacher, ownExamCount }) => [teacher, ownExamCount]), [['Terminvorschlag', 2]]);
});

test('nur die gewählte Nachschreibdauer ab CSV-Start muss lückenlos durch Freistunden abgedeckt sein', () => {
  const rows = [
    exam(48, '23.11.2026', '5a', 'Längeres CSV-Fenster', '08:00', '10:30'),
    exam(48, '23.11.2026', '5a', 'Exakte Grenzen', '08:45', '09:30'),
    exam(48, '23.11.2026', '5a', 'Eine Sekunde vor der Freistunde', '07:59:59', '08:45'),
    exam(48, '23.11.2026', '5a', 'Pause im Zeitraum', '09:00', '10:30'),
    exam(48, '24.11.2026', '5a', 'Stunde ohne Uhrzeit', '08:45', '09:30'),
    exam(48, '25.11.2026', '5a', 'Wochentag ohne Freistunde', '08:45', '09:30'),
  ];
  const options = {
    freePeriods: [
      { weekday: 1, lesson: 3 }, { weekday: 1, lesson: 2 }, { weekday: 1, lesson: 1 }, { weekday: 2, lesson: 4 },
    ],
    lessonTimes: [
      { lesson: 1, start: '08:00', end: '08:45' },
      { lesson: 2, start: '08:45', end: '09:30' },
      { lesson: 3, start: '09:45', end: '10:30' },
      { lesson: 4, start: '', end: '' },
    ],
  };
  const coverage = (requiredLessons) => Object.fromEntries(search(rows, '2026-11-23', '2026-11-25', { ...options, requiredLessons })
    .map(({ teacher, fullyCoveredByFreePeriods }) => [teacher, fullyCoveredByFreePeriods]));

  assert.deepEqual(coverage(1), {
    'Längeres CSV-Fenster': true,
    'Exakte Grenzen': true,
    'Eine Sekunde vor der Freistunde': false,
    'Pause im Zeitraum': false,
    'Stunde ohne Uhrzeit': false,
    'Wochentag ohne Freistunde': false,
  });
  assert.deepEqual(coverage(2), { 'Längeres CSV-Fenster': true, 'Pause im Zeitraum': false });
  assert.deepEqual(coverage(3), { 'Längeres CSV-Fenster': false });
});

test('die Nachricht nennt alle Stunden mit tatsächlicher Überschneidung zur gewählten Nachschreibdauer', () => {
  const rows = [exam(48, '24.11.2026', '5a', 'Kürzel A', '08:45', '11:30')];
  const lessonTimes = [
    { lesson: 4, start: '10:30', end: '11:15' },
    { lesson: 2, start: '08:45', end: '09:30' },
    { lesson: 1, start: '08:00', end: '08:45' },
    { lesson: 3, start: '09:30', end: '10:15' },
  ];
  for (const [requiredLessons, expected] of [[1, [2]], [2, [2, 3]], [3, [2, 3, 4]]]) {
    const [suggestion] = search(rows, '2026-11-24', '2026-11-24', { lessonTimes, requiredLessons });
    assert.deepEqual(suggestion.makeupLessons, expected);
  }

  const [withoutRaster] = search(rows, '2026-11-24', '2026-11-24');
  assert.deepEqual(withoutRaster.makeupLessons, []);
});
