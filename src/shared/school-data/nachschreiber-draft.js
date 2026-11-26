export const NACHSCHREIBER_DRAFT_SETTING = 'nachschreiberDraft';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const text = (value) => typeof value === 'string' ? value : '';
const list = (value) => Array.isArray(value) ? value : [];
const isLesson = (value) => Number.isSafeInteger(value) && value > 0;

export function normalizeNachschreiberSenderName(value) {
  if (typeof value === 'string') {
    const name = value.trim();
    const separator = name.search(/\s/);
    return separator === -1
      ? { firstName: name, lastName: '' }
      : { firstName: name.slice(0, separator), lastName: name.slice(separator).trim() };
  }
  return { firstName: text(value?.firstName).trim(), lastName: text(value?.lastName).trim() };
}

function validDate(value) {
  if (!ISO_DATE.test(text(value))) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function normalizeSuggestion(raw) {
  const date = validDate(raw?.date);
  const startTime = text(raw?.startTime);
  const endTime = text(raw?.endTime);
  const makeupLessons = list(raw?.makeupLessons).filter(isLesson);
  const pdf = raw?.source === 'pdf';
  if (!date || !CLOCK_TIME.test(startTime)
    || (pdf ? !makeupLessons.length : !CLOCK_TIME.test(endTime) || startTime >= endTime)) return null;
  return {
    source: pdf ? 'pdf' : 'csv', date, startTime, endTime,
    title: text(raw.title), groups: text(raw.groups), teacher: text(raw.teacher),
    ownExamCount: pdf ? null : Number.isInteger(raw.ownExamCount) && raw.ownExamCount >= 0 ? raw.ownExamCount : 0,
    freePeriodLessons: list(raw.freePeriodLessons).filter(isLesson), makeupLessons,
    fullyCoveredByFreePeriods: raw.fullyCoveredByFreePeriods === true,
  };
}

export function normalizeNachschreiberDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const students = list(value.students).filter((row) => row && typeof row === 'object').map((row) => ({
    name: text(row.name),
    year: /^(?:[5-9]|1[0-3])$/.test(text(row.year)) ? row.year : '',
    classLetter: /^[a-e]$/.test(text(row.classLetter)) ? row.classLetter : '',
  }));
  const freePeriods = new Map();
  for (const row of list(value.freePeriods)) {
    if (Number.isInteger(row?.weekday) && row.weekday >= 1 && row.weekday <= 5 && isLesson(row.lesson)) {
      freePeriods.set(`${row.weekday}-${row.lesson}`, { weekday: row.weekday, lesson: row.lesson });
    }
  }
  const result = Array.isArray(value.result?.suggestions) && students.length > 0
    && students.every((row) => row.year && row.classLetter) ? {
      suggestions: value.result.suggestions.map(normalizeSuggestion).filter(Boolean),
      missingPdfLessonTimes: value.result.missingPdfLessonTimes === true,
      hasPdfTimingNotes: value.result.hasPdfTimingNotes === true,
    } : null;
  const sender = normalizeNachschreiberSenderName(value.sender ?? value.senderName);
  const draft = {
    students, freePeriods: [...freePeriods.values()], result,
    duration: /^[1-4]$/.test(text(value.duration)) ? value.duration : '1',
    startDate: validDate(value.startDate), endDate: validDate(value.endDate),
    iservPrefix: text(value.iservPrefix), sender,
  };
  const hasStudent = students.length > 1 || students.some((row) => row.name || row.year || row.classLetter);
  return hasStudent || freePeriods.size || result || draft.duration !== '1'
    || draft.startDate || draft.endDate || draft.iservPrefix || sender.firstName || sender.lastName ? draft : null;
}
