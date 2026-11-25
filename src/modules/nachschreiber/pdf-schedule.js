import { FILE_LIMITS, FILE_TIMEOUTS, readFileArrayBufferWithTimeout, validatePdfFile, withTimeout } from '../../shared/file-guards.js';
import { ensurePdfJsLoaded } from '../../shared/pdf-vendor.js';
import { getIsoWeek, parseExamDate } from './schedule.js';

const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'];
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_RANGE = /^(?:(?:KW\s*)?(\d{1,2})\s+)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})?\s*[-–—−]\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/i;
const HOUR_PREFIX = /^\d{1,2}\s*(?:\.|[-–—−]\s*\d)/;
const EXAM_ENTRY = /^(\d{1,2})\s*\.?\s*(?:[-–—−]\s*(\d{1,2})\s*\.?)?\s+([\p{L}\p{N}][\p{L}\p{N} ._/+&-]*?)(?:\s*\(\s*(\d+)\s*(?:min(?:uten)?\.?)?\s*\))?$/iu;
const DURATION_SUFFIX = /\(\s*\d+\s*(?:min(?:uten)?\.?)?\s*\)$/i;
const COURSE_CODE = /^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}][\p{L}\p{N}._/+&-]*$/u;
const CLOCK_TIME = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;

function groupTextLines(items) {
  const runs = items.flatMap(({ str, transform, width, height }) => {
    const text = str?.trim();
    const [, , , , x, y] = transform || [];
    return text && Number.isFinite(x) && Number.isFinite(y)
      ? [{ text, x, y, width: Math.max(0, width || 0), height: Math.max(1, height || 0) }]
      : [];
  }).sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const run of runs) {
    const previous = lines.at(-1);
    if (previous && previous.y - run.y <= Math.max(1, Math.min(run.height, previous.height) / 4)) {
      previous.runs.push(run);
    } else {
      lines.push({ y: run.y, height: run.height, runs: [run] });
    }
  }
  for (const line of lines) line.runs.sort((a, b) => a.x - b.x);
  return lines;
}

function findWeekdayColumns(lines) {
  for (const [lineIndex, line] of lines.entries()) {
    const weekdays = line.runs.filter(({ text }) => WEEKDAYS.includes(text.toLowerCase()));
    if (weekdays.length !== WEEKDAYS.length || weekdays.some(({ text }, index) => text.toLowerCase() !== WEEKDAYS[index])) continue;
    const centers = weekdays.map(({ x, width }) => x + width / 2);
    if (centers.some((center, index) => index > 0 && center <= centers[index - 1])) continue;
    const edges = centers.slice(1).map((right, index) => (right + centers[index]) / 2);
    edges.unshift(2 * centers[0] - edges[0]);
    edges.push(2 * centers.at(-1) - edges.at(-1));
    return { lineIndex, edges };
  }
  return null;
}

function readWeek(text, pageNumber) {
  const match = WEEK_RANGE.exec(text);
  if (!match) return null;
  const [, number, firstDay, firstMonth, firstYear, lastDay, lastMonth, lastYear] = match;
  const startYear = firstYear ?? String(Number(lastYear) - Number(Number(firstMonth) > Number(lastMonth)));
  const dateString = (day, month, year) => `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
  const start = parseExamDate(dateString(firstDay, firstMonth, startYear));
  const end = parseExamDate(dateString(lastDay, lastMonth, lastYear));
  const monday = Date.parse(start?.date);
  const friday = Date.parse(end?.date);
  if (new Date(monday).getUTCDay() !== 1 || friday - monday !== 4 * MILLISECONDS_PER_DAY
    || (number && Number(number) !== start.weekNumber)) {
    throw new Error(`Der Wochenbereich auf PDF-Seite ${pageNumber} ist ungültig.`);
  }
  return monday;
}

function readCell(lines, date, pageNumber) {
  const entries = [];
  const { weekKey, weekNumber } = getIsoWeek(date);
  for (let index = 0; index < lines.length; index += 1) {
    const { text, y, height } = lines[index];
    let { crossesColumn } = lines[index];
    const startsExam = HOUR_PREFIX.test(text);
    if (!startsExam && !DURATION_SUFFIX.test(text)) continue;
    let match = EXAM_ENTRY.exec(text);
    const next = lines[index + 1];
    if (!match?.[4] && startsExam && next && !HOUR_PREFIX.test(next.text) && y - next.y <= 1.6 * Math.max(height, next.height)) {
      const wrapped = EXAM_ENTRY.exec(`${text} ${next.text}`);
      if (wrapped?.[4]) {
        match = wrapped;
        crossesColumn ||= next.crossesColumn;
        index += 1;
      } else if (next.text.startsWith('(')) {
        match = null;
      }
    }
    if (!match || crossesColumn) throw new Error(`Ein Klausureintrag auf PDF-Seite ${pageNumber} ist nicht eindeutig lesbar.`);
    const startLesson = Number(match[1]);
    const endLesson = Number(match[2] ?? match[1]);
    const durationMinutes = match[4] === undefined ? null : Number(match[4]);
    if (startLesson < 1 || endLesson < startLesson
      || (durationMinutes !== null && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1))) {
      throw new Error(`Ein Klausureintrag auf PDF-Seite ${pageNumber} hat ungültige Stunden oder eine ungültige Dauer.`);
    }
    const course = match[3].trim();
    const tokens = course.split(/\s+/);
    const courses = tokens.every((token) => COURSE_CODE.test(token)) ? new Set(tokens) : [course];
    for (const groups of courses) {
      entries.push({
        source: 'pdf', date: date.toISOString().slice(0, 10), weekKey, weekNumber,
        startLesson, endLesson, durationMinutes, groups, title: '', teacher: '',
      });
    }
  }
  return entries;
}

export function parseWeeklyPdfPage(items, pageNumber) {
  const lines = groupTextLines(items);
  if (lines.length === 0) throw new Error(`PDF-Seite ${pageNumber} enthält keinen lesbaren Text. Bitte einen Klausurenplan mit Textschicht wählen.`);
  const columns = findWeekdayColumns(lines);
  if (!columns) throw new Error(`Auf PDF-Seite ${pageNumber} wurde kein Wochenraster von Montag bis Freitag erkannt.`);

  const weeks = [];
  let hasTimingNotes = false;
  for (const { runs, y, height } of lines.slice(columns.lineIndex + 1)) {
    const label = [];
    const dayRuns = WEEKDAYS.map(() => []);
    for (const run of runs) {
      if (run.x < columns.edges[0]) {
        label.push(run.text);
        continue;
      }
      const column = columns.edges.findIndex((edge) => run.x < edge) - 1;
      if (column >= 0) dayRuns[column].push(run);
      else if (HOUR_PREFIX.test(run.text) || DURATION_SUFFIX.test(run.text)) {
        throw new Error(`Ein Klausureintrag auf PDF-Seite ${pageNumber} liegt außerhalb der Wochentagsspalten.`);
      } else if (CLOCK_TIME.test(run.text)) {
        hasTimingNotes = true;
      }
    }

    if (label.length > 0) {
      const weekText = label.join(' ');
      const monday = readWeek(weekText, pageNumber);
      if (monday !== null) {
        if (weeks.length && monday <= weeks.at(-1).monday) throw new Error(`Die Wochenzeilen auf PDF-Seite ${pageNumber} sind nicht eindeutig.`);
        weeks.push({ monday, cells: WEEKDAYS.map(() => []) });
      } else if (/^(?:KW\s*)?\d{1,2}\s+\d{1,2}\s*\./i.test(weekText)
        || /^\d{1,2}\s*\.\s*\d{1,2}\s*\..*[-–—−]/.test(weekText)) {
        throw new Error(`Der Wochenbereich auf PDF-Seite ${pageNumber} konnte nicht gelesen werden.`);
      } else if (CLOCK_TIME.test(weekText)) {
        hasTimingNotes = true;
      }
    }

    for (const [column, columnRuns] of dayRuns.entries()) {
      if (!columnRuns.length) continue;
      const text = columnRuns.map((run) => run.text).join(' ');
      if (!weeks.length) {
        if (HOUR_PREFIX.test(text) || DURATION_SUFFIX.test(text)) throw new Error(`Einem Klausureintrag auf PDF-Seite ${pageNumber} fehlt der Wochenbereich.`);
        continue;
      }
      const crossesColumn = columnRuns.some((run) => run.x + run.width > columns.edges[column + 1] + height / 2);
      weeks.at(-1).cells[column].push({ text, y, height, crossesColumn });
    }
  }

  if (!weeks.length) throw new Error(`Auf PDF-Seite ${pageNumber} wurden keine Wochenbereiche erkannt.`);
  const exams = weeks.flatMap(({ monday, cells }) => cells.flatMap((lines, column) => (
    readCell(lines, new Date(monday + column * MILLISECONDS_PER_DAY), pageNumber)
  )));
  return { exams, hasTimingNotes };
}

async function readPdfPages(document, signal) {
  const exams = [];
  let hasTimingNotes = false;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    signal?.throwIfAborted();
    const page = await document.getPage(pageNumber);
    try {
      const { items } = await page.getTextContent();
      signal?.throwIfAborted();
      const parsed = parseWeeklyPdfPage(items, pageNumber);
      for (const exam of parsed.exams) exams.push(exam);
      hasTimingNotes ||= parsed.hasTimingNotes;
    } finally {
      page.cleanup();
    }
  }
  if (exams.length === 0) throw new Error('Die PDF enthält keine Klassenarbeiten im erkannten Wochenraster.');
  return { exams, hasTimingNotes };
}

export async function readPdfExamSchedule(file, { signal } = {}) {
  await validatePdfFile(file, { signal });
  const bytes = await readFileArrayBufferWithTimeout(file, { signal });
  const pdfJs = await withTimeout(ensurePdfJsLoaded, FILE_TIMEOUTS.PDF_PROBE_MS, 'Die PDF-Engine konnte nicht rechtzeitig geladen werden.', { signal });
  signal?.throwIfAborted();
  const task = pdfJs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWasm: false, stopAtErrors: true });
  try {
    const document = await withTimeout(task.promise, FILE_TIMEOUTS.PDF_PROBE_MS, 'Die PDF konnte nicht rechtzeitig geöffnet werden.', { signal });
    if (document.numPages > FILE_LIMITS.PDF_MAX_PAGES) throw new Error(`Die PDF darf höchstens ${FILE_LIMITS.PDF_MAX_PAGES} Seiten enthalten.`);
    return await withTimeout(() => readPdfPages(document, signal), FILE_TIMEOUTS.PDF_OPERATION_MS, 'Das Wochenraster konnte nicht rechtzeitig gelesen werden.', { signal });
  } catch (error) {
    if (error?.name === 'PasswordException') throw new Error('Die PDF ist passwortgeschützt. Bitte eine entsperrte Kopie auswählen.');
    if (error?.name === 'InvalidPDFException') throw new Error('Die PDF konnte nicht geöffnet werden.');
    throw error;
  } finally {
    await task.destroy().catch(() => {});
  }
}
