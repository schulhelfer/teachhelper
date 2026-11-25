import { detectDelimiter, normalizeCsvCell, parseCSV } from '../../shared/csv.js';

const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const SECONDS_PER_EXAM_LESSON = 45 * 60;

export function parseExamDate(value) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!parts) return null;
  const [, day, month, year] = parts;
  const date = `${year}-${month}-${day}`;
  const utc = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) return null;

  const { weekNumber, weekKey } = getIsoWeek(utc);
  return { date, weekNumber, weekKey };
}

export function getIsoWeek(date) {
  const utc = new Date(date);
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const weekYear = utc.getUTCFullYear();
  const yearStart = new Date(utc);
  yearStart.setUTCMonth(0, 1);
  const weekNumber = 1 + Math.floor((utc - yearStart) / MILLISECONDS_PER_WEEK);
  return { weekNumber, weekKey: `${weekYear}-${weekNumber}` };
}

function normalizeTime(value) {
  if (!value) return '';
  const time = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return time ? `${time[1]}:${time[2]}:${time[3] ?? '00'}` : null;
}

function timeInSeconds(time) {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

export function getUsableLessonTimes(lessonTimes) {
  return lessonTimes.flatMap(({ lesson, start, end }) => {
    const startTime = normalizeTime(start);
    const endTime = normalizeTime(end);
    return startTime && endTime && startTime < endTime
      ? [{ lesson, start: startTime, end: endTime }]
      : [];
  });
}

export function parseExamSchedule(text) {
  const delimiter = detectDelimiter(text, 1);
  const { rows } = parseCSV(text, { delimiter, strictQuotes: true });
  if (!rows[0] || rows[0].length < 7) {
    throw new Error('Die CSV braucht eine Kopfzeile mit mindestens sieben Spalten.');
  }

  const exams = [];
  rows.slice(1).forEach((row, index) => {
    const cells = row.map(normalizeCsvCell);
    if (cells.every((cell) => !cell)) return;
    const rowLabel = `CSV-Zeile ${index + 2}`;
    if (cells.length < 7) throw new Error(`${rowLabel} hat weniger als sieben Spalten.`);

    const [title, week, date, start, end, groups, teacher] = cells;
    const examDate = parseExamDate(date);
    if (!examDate) throw new Error(`${rowLabel} braucht ein gültiges Datum im Format TT.MM.JJJJ.`);
    if (!/^\d{1,2}$/.test(week) || Number(week) !== examDate.weekNumber) {
      throw new Error(`Die Kalenderwoche in ${rowLabel} passt nicht zum Datum.`);
    }

    const startTime = normalizeTime(start);
    const endTime = normalizeTime(end);
    const allDay = startTime === '' && endTime === '';
    if (!allDay && (!startTime || !endTime || startTime >= endTime)) {
      throw new Error(`${rowLabel} braucht eine gültige Start- und Endzeit oder zwei leere Zeitfelder.`);
    }
    if (!groups || !teacher) throw new Error(`${rowLabel} braucht eine Gruppe und eine Lehrkraft.`);

    exams.push({ ...examDate, title, startTime, endTime, groups, teacher });
  });

  if (!exams.length) throw new Error('Die CSV enthält keine Klassenarbeiten.');
  return exams;
}

export function mergeExamSchedules(schedules) {
  const uniqueExams = new Map();
  for (const schedule of schedules) {
    for (const exam of schedule) {
      const timeFields = exam.source === 'pdf'
        ? ['pdf', exam.startLesson, exam.endLesson, exam.durationMinutes]
        : ['csv', exam.startTime, exam.endTime];
      const key = JSON.stringify([exam.date, exam.title, exam.groups, exam.teacher, ...timeFields]);
      if (!uniqueExams.has(key)) uniqueExams.set(key, exam);
    }
  }
  return [...uniqueExams.values()];
}

function getExamGroups(groups) {
  return new Set(Array.from(
    groups.matchAll(/(?:^|[^\p{L}\p{N}])(jahrgang\.\d+|\d+[a-e])(?![\p{L}\p{N}])/giu),
    ([, group]) => group.toLowerCase(),
  ));
}

export function getTomorrowDate(now = new Date()) {
  const tomorrow = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

function groupFreePeriodsByDay(freePeriods, lessonIntervals) {
  const byLesson = new Map(lessonIntervals.map((entry) => [entry.lesson, entry]));
  const byDay = new Map();
  for (const { weekday, lesson } of freePeriods) {
    const entry = byLesson.get(lesson);
    if (!entry) continue;
    if (!byDay.has(weekday)) byDay.set(weekday, new Map());
    byDay.get(weekday).set(lesson, entry);
  }
  return new Map(Array.from(byDay, ([weekday, periods]) => [
    weekday,
    Array.from(periods.values()).sort((left, right) => left.startSeconds - right.startSeconds),
  ]));
}

function findOverlappingLessons(periods, startSeconds, endSeconds) {
  return periods
    .filter((period) => startSeconds < period.endSeconds && endSeconds > period.startSeconds)
    .map(({ lesson }) => lesson)
    .sort((left, right) => left - right);
}

function isFullyCoveredByFreePeriods(periods, startSeconds, endSeconds) {
  let coveredUntil = startSeconds;
  for (const period of periods) {
    if (period.startSeconds > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, period.endSeconds);
    if (coveredUntil >= endSeconds) return true;
  }
  return false;
}

function lessonsUsedForDuration(intervals, durationSeconds) {
  const lessons = [];
  for (const { lesson, startSeconds, endSeconds } of intervals) {
    if (durationSeconds <= 0) break;
    lessons.push(lesson);
    durationSeconds -= endSeconds - startSeconds;
  }
  return lessons;
}

function rankPdfExam(exam, { intervalsByLesson, periods, requiredSeconds, onMissingPdfLessonTimes }) {
  const intervals = [];
  let gridSeconds = 0;
  for (let number = exam.startLesson; number <= exam.endLesson; number += 1) {
    const interval = intervalsByLesson.get(number);
    if (!interval || interval.startSeconds < (intervals.at(-1)?.endSeconds ?? 0)) {
      onMissingPdfLessonTimes?.();
      break;
    }
    intervals.push(interval);
    gridSeconds += interval.endSeconds - interval.startSeconds;
  }
  const durationUnits = exam.durationMinutes === null
    ? intervals.length
    : Math.floor(exam.durationMinutes * 60 / SECONDS_PER_EXAM_LESSON);
  const availableUnits = Math.min(
    intervals.length,
    durationUnits,
    Math.floor(gridSeconds / SECONDS_PER_EXAM_LESSON),
  );
  const availableSeconds = availableUnits * SECONDS_PER_EXAM_LESSON;
  if (!availableSeconds || availableSeconds < requiredSeconds) return null;

  const availableLessons = lessonsUsedForDuration(intervals, availableSeconds);
  const makeupLessons = lessonsUsedForDuration(intervals, requiredSeconds);
  const freeLessonNumbers = new Set(periods.map(({ lesson }) => lesson));
  return {
    ...exam,
    startTime: intervals[0].startTime,
    ownExamCount: null,
    freePeriodLessons: availableLessons.filter((lesson) => freeLessonNumbers.has(lesson)),
    fullyCoveredByFreePeriods: makeupLessons.every((lesson) => freeLessonNumbers.has(lesson)),
    makeupLessons,
  };
}

export function rankExamSuggestions(exams, {
  year, classLetter, studentGroups = [{ year, classLetter }],
  startDate, endDate = '', requiredLessons = 1, freePeriods = [], lessonTimes = [], onMissingPdfLessonTimes,
}) {
  const selectedGroups = new Map(studentGroups.map((group) => [
    `${group.year}${group.classLetter}`.toLowerCase(), `jahrgang.${group.year}`,
  ]));
  const ownDays = new Set();
  const ownExamsByWeekAndClass = new Map();

  for (const exam of exams) {
    if (exam.source === 'pdf') continue;
    const examGroups = getExamGroups(exam.groups);
    for (const [classGroup, yearGroup] of selectedGroups) {
      if (!examGroups.has(classGroup) && !examGroups.has(yearGroup)) continue;
      ownDays.add(exam.date);
      if (!ownExamsByWeekAndClass.has(exam.weekKey)) ownExamsByWeekAndClass.set(exam.weekKey, new Map());
      const weeklyCounts = ownExamsByWeekAndClass.get(exam.weekKey);
      weeklyCounts.set(classGroup, (weeklyCounts.get(classGroup) ?? 0) + 1);
    }
  }
  const maxOwnExamsByWeek = new Map(Array.from(ownExamsByWeekAndClass, ([week, counts]) => [week, Math.max(...counts.values())]));

  const lessonIntervals = getUsableLessonTimes(lessonTimes).map(({ lesson, start, end }) => ({
    lesson,
    startTime: start,
    startSeconds: timeInSeconds(start),
    endSeconds: timeInSeconds(end),
  }));
  const intervalsByLesson = new Map(lessonIntervals.map((interval) => [interval.lesson, interval]));
  const freePeriodsByDay = groupFreePeriodsByDay(freePeriods, lessonIntervals);
  const requiredSeconds = requiredLessons * SECONDS_PER_EXAM_LESSON;
  const suggestions = [];
  for (const exam of exams) {
    if (exam.date < startDate || (endDate && exam.date > endDate)) continue;
    const weekday = new Date(`${exam.date}T00:00:00Z`).getUTCDay();
    const periods = freePeriodsByDay.get(weekday) ?? [];
    if (exam.source === 'pdf') {
      const suggestion = rankPdfExam(exam, { intervalsByLesson, periods, requiredSeconds, onMissingPdfLessonTimes });
      if (suggestion) suggestions.push(suggestion);
      continue;
    }
    if (ownDays.has(exam.date)) continue;
    const ownExamCount = maxOwnExamsByWeek.get(exam.weekKey) ?? 0;
    if (ownExamCount >= 3 || !exam.startTime || !exam.endTime) continue;
    const startSeconds = timeInSeconds(exam.startTime);
    const examEndSeconds = timeInSeconds(exam.endTime);
    const makeupEndSeconds = startSeconds + requiredSeconds;
    if (examEndSeconds < makeupEndSeconds) continue;
    suggestions.push({
      ...exam,
      ownExamCount,
      freePeriodLessons: findOverlappingLessons(periods, startSeconds, examEndSeconds),
      fullyCoveredByFreePeriods: isFullyCoveredByFreePeriods(periods, startSeconds, makeupEndSeconds),
      makeupLessons: findOverlappingLessons(lessonIntervals, startSeconds, makeupEndSeconds),
    });
  }

  return suggestions.sort((left, right) => (
    Number(left.ownExamCount === 2) - Number(right.ownExamCount === 2)
    || Number(right.freePeriodLessons.length > 0) - Number(left.freePeriodLessons.length > 0)
    || left.date.localeCompare(right.date)
    || left.startTime.localeCompare(right.startTime)
  ));
}
