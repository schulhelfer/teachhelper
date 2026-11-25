import { assertFileSizeAtMost, FILE_LIMITS, readFileArrayBufferWithTimeout } from '../../shared/file-guards.js';
import { dataTransferHasFiles, isCsvFile, stripFileExtension } from '../../shared/file-io.js';
import { WORKSPACE_STATE_EVENT } from '../../shared/school-data/messages.js';
import { mountDateCalendar } from './date-calendar.js';
import { getUsableLessonTimes, parseExamSchedule, rankExamSuggestions } from './schedule.js';

const lessonListFormat = new Intl.ListFormat('de');
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function formatTime(time) {
  return time.endsWith(':00') ? time.slice(0, 5) : time;
}

function formatLessonRange({ start, end }) {
  return `${formatTime(start)}–${formatTime(end)}`;
}

function formatLessons(lessons) {
  return `${lessonListFormat.format(lessons.map((number) => `${number}.`))} Stunde`;
}

function formatLessonNumbers(lessons) {
  const consecutive = lessons.every((lesson, index) => index === 0 || lesson === lessons[index - 1] + 1);
  return consecutive && lessons.length > 1 ? `${lessons[0]}–${lessons.at(-1)}` : lessons.join(', ');
}

function formatLessonPhrase(lessons) {
  return lessons.length ? formatLessons(lessons) : '[XXX]. Stunde';
}

function buildTeacherNotice(date, { makeupLessons }, studentClass, studentName, senderName) {
  return [
    'Hallo [Name der Lehrkraft],',
    `am ${date} würde ich gerne ${studentName} (${studentClass}) in der ${formatLessonPhrase(makeupLessons)} eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    'Da der Nachschreibtermin in deinen Unterricht fällt, würde ich dich bitten, das Fehlen für diesen Zeitraum zu entschuldigen.',
    'Vielen Dank und viele Grüße',
    senderName,
  ].join('\n');
}

function buildSupervisionRequest(date, { teacher, groups, makeupLessons }, studentClass, studentName, senderName) {
  const [firstName] = teacher.split(/\s+/, 1);
  return [
    `Hallo ${firstName},`,
    `am ${date} würde ich gerne in der ${formatLessonPhrase(makeupLessons)} eine versäumte schriftliche Arbeit nachschreiben lassen.`,
    `Wäre es möglich, dass ${studentName} (${studentClass}) die Arbeit parallel zu deiner schriftlichen Arbeit in der Lerngruppe „${groups}“ unter deiner Aufsicht nachschreibt? Falls ja, in welchem Raum schreibst du die Arbeit?`,
    'Vielen Dank und viele Grüße',
    senderName,
  ].join('\n');
}

function buildStudentNotice(date, { teacher, makeupLessons, fullyCoveredByFreePeriods }, studentName, senderName) {
  const lastName = teacher.replace(/^\S+\s*/, '') || '[Nachname der Lehrkraft]';
  const lesson = makeupLessons.length ? formatLessons(makeupLessons) : '[Stunde]';
  const paragraphs = [
    `Hallo ${studentName},`,
    'hoffentlich geht es Dir bald wieder besser!',
    `Für das Nachschreiben Deiner versäumten schriftlichen Arbeit habe ich Dich für einen Termin angemeldet, an dem Herr/Frau ${lastName} bereits eine schriftliche Arbeit in einer anderen Lerngruppe durchführt. Du erhältst dort Deine Arbeit und schreibst diese unter der Aufsicht der Lehrkraft nach.`,
  ];
  if (!fullyCoveredByFreePeriods) {
    paragraphs.push('Die Lehrkraft, bei der Du zu diesem Zeitpunkt regulär Unterricht hättest, habe ich bereits informiert. Dennoch würde ich Dich bitten, sie auch selbst über Deinen Nachschreibtermin in Kenntnis zu setzen.');
  }
  paragraphs.push(
    `Dein Nachschreibtermin:\n\n- Datum: ${date}\n- Raum: [XXX]\n- Stunde: ${lesson}`,
    'Bitte denk daran, dass Du in der Sekundarstufe I (Jahrgänge 5–10) eine schriftliche Entschuldigung bzw. in der Sekundarstufe II (Jahrgänge 11–13) eine ärztliche Bescheinigung vorlegen musst, um nachschreiben zu können.',
    `Viele Grüße\n${senderName}`,
  );
  return paragraphs.join('\n\n');
}

export function mountNachschreiber(root, { sidebar, getLessonTimes = () => [] }) {
  const doc = root.ownerDocument;
  const fileInput = sidebar.querySelector('#nachschreiber-file');
  const upload = sidebar.querySelector('#nachschreiber-drop-zone');
  const csvStatus = sidebar.querySelector('#nachschreiber-csv-status');
  const iservPrefix = sidebar.querySelector('#nachschreiber-iserv-prefix');
  const iservLink = sidebar.querySelector('#nachschreiber-iserv-link');
  const iservLinkHint = sidebar.querySelector('#nachschreiber-iserv-link-hint');
  const form = sidebar.querySelector('#nachschreiber-form');
  const year = sidebar.querySelector('#nachschreiber-year');
  const classLetter = sidebar.querySelector('#nachschreiber-class');
  const studentName = sidebar.querySelector('#nachschreiber-student-name');
  const senderName = sidebar.querySelector('#nachschreiber-sender-name');
  const periodEditor = sidebar.querySelector('#nachschreiber-period-editor');
  const periodError = periodEditor.querySelector('#nachschreiber-period-error');
  const periodWeekday = periodEditor.querySelector('#nachschreiber-period-weekday');
  const periodLesson = periodEditor.querySelector('#nachschreiber-period-lesson');
  const cancelPeriod = periodEditor.querySelector('#nachschreiber-period-cancel');
  const deletePeriod = periodEditor.querySelector('#nachschreiber-period-delete');
  const savePeriod = periodEditor.querySelector('#nachschreiber-period-save');
  const addPeriod = sidebar.querySelector('#nachschreiber-add-period');
  const periodHint = sidebar.querySelector('#nachschreiber-period-hint');
  const periodList = sidebar.querySelector('#nachschreiber-period-list');
  const duration = sidebar.querySelector('#nachschreiber-duration');
  const submit = sidebar.querySelector('#nachschreiber-submit');
  const resultStatus = root.querySelector('#nachschreiber-result-status');
  const results = root.querySelector('#nachschreiber-results');
  const resultRows = root.querySelector('#nachschreiber-result-rows');
  const noticeDialog = root.querySelector('#nachschreiber-notice-dialog');
  const noticeTitle = root.querySelector('#nachschreiber-notice-title');
  const noticeText = root.querySelector('#nachschreiber-notice-text');
  const noticeStatus = root.querySelector('#nachschreiber-notice-status');
  const noticeClose = root.querySelector('#nachschreiber-notice-close');
  const noticeCopy = root.querySelector('#nachschreiber-notice-copy');
  const controller = new AbortController();
  const { signal } = controller;
  const weekdayLabels = new Map(Array.from(periodWeekday.options, (option) => [Number(option.value), option.textContent]));
  const freePeriods = new Map();
  const noticeBuilders = new WeakMap();
  let lessonTimes = [];
  let lessonTimesSignature = '';
  let editingPeriodKey = '';
  let exams = [];
  let importId = 0;
  let noticeCopyId = 0;
  const { endDate, endDateTrigger, updateDateBounds, close: closeDateCalendar } = mountDateCalendar(root, sidebar, {
    signal, onDateChange: clearResults,
  });

  function updateIservLink() {
    const address = iservPrefix.value.trim();
    const prefix = address.replace(/\.de$/i, '');
    const valid = prefix.length <= 250 && prefix.split('.').every((part) => (
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)
    ));
    iservLink.hidden = !valid;
    iservLinkHint.hidden = !address || valid;
    if (valid) {
      iservLink.href = `https://${prefix}.de/iserv/examplan?filter%5BTyp%5D%5B%5D=1`;
    } else {
      iservLink.removeAttribute('href');
    }
    if (iservLinkHint.hidden) iservPrefix.removeAttribute('aria-invalid');
    else iservPrefix.setAttribute('aria-invalid', 'true');
  }

  function renderCsvStatus(text = '', { error = false } = {}) {
    csvStatus.classList.toggle('empty-state-box', !text);
    csvStatus.classList.toggle('is-error', error);
    if (text) {
      csvStatus.textContent = text;
      return;
    }
    const title = doc.createElement('span');
    title.className = 'empty-state-title';
    title.textContent = 'Noch keine Datei';
    csvStatus.replaceChildren(title);
  }

  function clearResults() {
    resultStatus.textContent = '';
    resultRows.replaceChildren();
    results.hidden = true;
  }

  function createNoticeButton(title, date, buildText) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ghost nachschreiber-notice-trigger';
    noticeBuilders.set(button, buildText);
    button.textContent = title;
    button.setAttribute('aria-label', `${title} für den Termin am ${date}`);
    button.setAttribute('aria-haspopup', 'dialog');
    return button;
  }

  function fitNoticeText() {
    noticeText.style.height = 'auto';
    noticeText.style.height = `${noticeText.scrollHeight + noticeText.offsetHeight - noticeText.clientHeight}px`;
  }

  function closeNoticeDialog() {
    noticeDialog.close();
    noticeCopyId += 1;
    noticeText.value = '';
    noticeStatus.textContent = '';
  }

  async function copyNoticeText() {
    const currentCopy = ++noticeCopyId;
    noticeStatus.textContent = '';
    let copied = false;
    try {
      const clipboard = doc.defaultView?.navigator.clipboard;
      if (typeof clipboard?.writeText === 'function') {
        await clipboard.writeText(noticeText.value);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!noticeDialog.open || currentCopy !== noticeCopyId) return;
    if (copied) {
      noticeStatus.textContent = 'Text kopiert.';
      return;
    }
    noticeText.focus();
    noticeText.select();
    noticeStatus.textContent = 'Kopiere den markierten Text manuell.';
  }

  function periodKey(weekday, lesson) {
    return `${weekday}-${lesson}`;
  }

  function updatePeriodTriggers() {
    addPeriod.setAttribute('aria-expanded', String(!periodEditor.hidden && !editingPeriodKey));
    for (const entry of periodList.querySelectorAll('button[data-period-key]')) {
      entry.setAttribute('aria-expanded', String(!periodEditor.hidden && entry.dataset.periodKey === editingPeriodKey));
    }
  }

  function renderFreePeriods() {
    const periods = Array.from(freePeriods.values()).sort((left, right) => left.weekday - right.weekday || left.lesson - right.lesson);
    const items = periods.map(({ weekday, lesson }) => {
      const item = doc.createElement('li');
      const edit = doc.createElement('button');
      const day = doc.createElement('span');
      const time = doc.createElement('span');
      const slot = lessonTimes.find((entry) => entry.lesson === lesson);
      day.textContent = weekdayLabels.get(weekday);
      time.className = 'nachschreiber-period-time';
      time.textContent = slot ? `${lesson}. Stunde · ${formatLessonRange(slot)}` : `${lesson}. Stunde (ohne Uhrzeit)`;
      edit.type = 'button';
      edit.className = 'nachschreiber-period-entry';
      edit.dataset.periodKey = periodKey(weekday, lesson);
      edit.setAttribute('aria-controls', periodEditor.id);
      edit.setAttribute('aria-label', `${day.textContent}, ${lesson}. Stunde bearbeiten`);
      edit.append(day, time);
      item.append(edit);
      return item;
    });
    periodList.replaceChildren(...items);
    periodList.hidden = items.length === 0;
    updatePeriodTriggers();
  }

  function renderPeriodOptions(selectedLesson = periodLesson.value) {
    const options = lessonTimes.map((entry) => {
      const option = doc.createElement('option');
      option.value = entry.lesson;
      option.textContent = `${entry.lesson}. Stunde (${formatLessonRange(entry)})`;
      return option;
    });
    if (selectedLesson && !options.some((option) => option.value === selectedLesson)) {
      const unavailable = doc.createElement('option');
      unavailable.value = selectedLesson;
      unavailable.textContent = `${selectedLesson}. Stunde (ohne Uhrzeit)`;
      unavailable.disabled = true;
      options.push(unavailable);
    }
    periodLesson.replaceChildren(periodLesson.options[0], ...options);
    periodLesson.value = selectedLesson;
    periodLesson.disabled = lessonTimes.length === 0;
  }

  function refreshLessonTimes() {
    const currentTimes = getUsableLessonTimes(getLessonTimes());
    const signature = JSON.stringify(currentTimes);
    if (signature === lessonTimesSignature) return;
    lessonTimes = currentTimes;
    lessonTimesSignature = signature;

    renderPeriodOptions();
    addPeriod.disabled = lessonTimes.length === 0;
    savePeriod.disabled = addPeriod.disabled;
    periodHint.hidden = lessonTimes.length > 0;
    periodHint.textContent = lessonTimes.length ? '' : 'Für Freistunden werden hinterlegte Unterrichtszeiten benötigt.';
    renderFreePeriods();
    clearResults();
  }

  function openPeriodEditor(key = '') {
    if (!periodEditor.hidden && editingPeriodKey === key) {
      closePeriodEditor();
      return;
    }
    const period = freePeriods.get(key);
    editingPeriodKey = period ? key : '';
    periodEditor.setAttribute('aria-label', period ? 'Freistunde bearbeiten' : 'Freistunde hinzufügen');
    periodError.textContent = '';
    periodWeekday.value = period ? String(period.weekday) : '';
    renderPeriodOptions(period ? String(period.lesson) : '');
    deletePeriod.hidden = !period;
    periodEditor.hidden = false;
    updatePeriodTriggers();
    periodWeekday.focus();
  }

  function closePeriodEditor(focusKey = editingPeriodKey) {
    periodEditor.hidden = true;
    editingPeriodKey = '';
    updatePeriodTriggers();
    const entry = periodList.querySelector(`[data-period-key="${focusKey}"]`);
    const fallback = addPeriod.disabled ? periodList.querySelector('button') || endDateTrigger : addPeriod;
    (entry || fallback).focus();
  }

  function submitPeriod() {
    const weekday = Number(periodWeekday.value);
    const lesson = Number(periodLesson.value);
    if (!periodWeekday.value) {
      periodError.textContent = 'Wähle einen Wochentag.';
      periodWeekday.focus();
      return;
    }
    if (!lessonTimes.some((entry) => entry.lesson === lesson)) {
      periodError.textContent = 'Wähle eine Stunde mit hinterlegten Uhrzeiten.';
      periodLesson.focus();
      return;
    }
    const key = periodKey(weekday, lesson);
    if (key !== editingPeriodKey) {
      if (freePeriods.has(key)) {
        periodError.textContent = 'Diese Freistunde ist bereits eingetragen.';
        return;
      }
      freePeriods.delete(editingPeriodKey);
      freePeriods.set(key, { weekday, lesson });
      renderFreePeriods();
      clearResults();
    }
    closePeriodEditor(editingPeriodKey ? key : '');
  }

  async function importFiles(files) {
    const currentImport = ++importId;
    exams = [];
    submit.disabled = true;
    clearResults();
    renderCsvStatus('CSV wird gelesen …');

    try {
      const file = files[0];
      if (files.length !== 1 || !isCsvFile(file)) throw new Error('Bitte eine einzelne CSV-Datei auswählen.');
      assertFileSizeAtMost(file, FILE_LIMITS.CSV_BYTES, 'CSV-Datei');
      const buffer = await readFileArrayBufferWithTimeout(file, { signal });
      if (signal.aborted || currentImport !== importId) return;

      exams = parseExamSchedule(decodeCsv(buffer));
      const examCount = exams.length === 1 ? '1 Klassenarbeit' : `${exams.length} Klassenarbeiten`;
      renderCsvStatus(`${stripFileExtension(file.name) || 'CSV'}\n${examCount}`);
      submit.disabled = false;
    } catch (error) {
      if (signal.aborted || currentImport !== importId) return;
      renderCsvStatus(error.message || 'Die CSV-Datei konnte nicht gelesen werden.', { error: true });
    }
  }

  function showSuggestions(event) {
    event.preventDefault();
    if (!exams.length) return;
    refreshLessonTimes();
    const startDate = updateDateBounds();
    if (!form.reportValidity()) return;

    const suggestions = rankExamSuggestions(exams, {
      year: year.value,
      classLetter: classLetter.value,
      startDate,
      endDate: endDate.value,
      requiredLessons: Number(duration.value),
      freePeriods: Array.from(freePeriods.values()),
      lessonTimes,
    });
    const studentClass = `${year.value}${classLetter.value}`;
    const rows = suggestions.map((exam) => {
      const row = doc.createElement('tr');
      const weekday = WEEKDAYS[new Date(`${exam.date}T00:00:00Z`).getUTCDay()];
      const date = `${weekday}, ${exam.date.split('-').reverse().join('.')}`;
      const time = exam.makeupLessons.length
        ? formatLessonNumbers(exam.makeupLessons)
        : `${formatTime(exam.startTime)}–${formatTime(exam.endTime)}`;
      row.insertCell().textContent = `${weekday.slice(0, 2)}${date.slice(weekday.length)}`;
      const timeCell = row.insertCell();
      const timeLabel = doc.createElement('span');
      timeLabel.className = 'nachschreiber-result-time';
      timeLabel.textContent = time;
      timeCell.append(timeLabel);
      if (exam.freePeriodLessons.length) {
        const match = doc.createElement('span');
        const labels = exam.freePeriodLessons.map((lesson) => `${lesson}. Stunde`).join(', ');
        match.className = 'nachschreiber-period-match';
        match.textContent = `Überschneidung mit ${exam.freePeriodLessons.length === 1 ? 'Freistunde' : 'Freistunden'} (${labels})`;
        timeCell.append(match);
      }
      for (const value of [exam.title || '–', exam.groups, exam.teacher, exam.ownExamCount]) {
        row.insertCell().textContent = value;
      }
      const noticeCell = row.insertCell();
      noticeCell.className = 'nachschreiber-notice-cell';
      noticeCell.append(createNoticeButton('Aufsicht anfragen', date, (...names) => buildSupervisionRequest(date, exam, studentClass, ...names)));
      if (!exam.fullyCoveredByFreePeriods) {
        noticeCell.append(createNoticeButton('Reguläre Lehrkraft informieren', date, (...names) => buildTeacherNotice(date, exam, studentClass, ...names)));
      }
      noticeCell.append(createNoticeButton('Prüfling informieren', date, (...names) => buildStudentNotice(date, exam, ...names)));
      return row;
    });
    resultRows.replaceChildren(...rows);
    results.hidden = rows.length === 0;
    if (rows.length === 0) resultStatus.textContent = 'Im gewählten Zeitraum gibt es keine passenden Termine.';
    else resultStatus.textContent = rows.length === 1 ? '1 passender Termin' : `${rows.length} passende Termine`;
  }

  iservPrefix.addEventListener('input', updateIservLink, { signal });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) void importFiles(fileInput.files);
    fileInput.value = '';
  }, { signal });
  for (const type of ['dragenter', 'dragover']) {
    upload.addEventListener(type, (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      upload.classList.add('drag-over-file');
    }, { signal });
  }
  upload.addEventListener('dragleave', (event) => {
    if (!upload.contains(event.relatedTarget)) upload.classList.remove('drag-over-file');
  }, { signal });
  upload.addEventListener('drop', (event) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    upload.classList.remove('drag-over-file');
    void importFiles(event.dataTransfer.files);
  }, { signal });
  for (const input of [year, classLetter, duration]) input.addEventListener('input', clearResults, { signal });
  addPeriod.addEventListener('click', () => openPeriodEditor(), { signal });
  periodList.addEventListener('click', (event) => {
    const entry = event.target.closest('button[data-period-key]');
    if (entry) openPeriodEditor(entry.dataset.periodKey);
  }, { signal });
  savePeriod.addEventListener('click', submitPeriod, { signal });
  periodEditor.addEventListener('change', () => { periodError.textContent = ''; }, { signal });
  cancelPeriod.addEventListener('click', () => closePeriodEditor(), { signal });
  deletePeriod.addEventListener('click', () => {
    if (!freePeriods.delete(editingPeriodKey)) return;
    renderFreePeriods();
    clearResults();
    closePeriodEditor('');
  }, { signal });
  periodEditor.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closePeriodEditor();
  }, { signal });
  resultRows.addEventListener('click', (event) => {
    const notice = event.target.closest('button.nachschreiber-notice-trigger');
    const buildText = noticeBuilders.get(notice);
    if (!buildText) return;
    noticeTitle.textContent = notice.textContent;
    noticeText.value = buildText(studentName.value.trim() || '[Prüflingsname]', senderName.value.trim() || '[Absender]');
    noticeDialog.showModal();
    fitNoticeText();
  }, { signal });
  noticeClose.addEventListener('click', closeNoticeDialog, { signal });
  noticeCopy.addEventListener('click', copyNoticeText, { signal });
  noticeText.addEventListener('input', () => {
    fitNoticeText();
    noticeCopyId += 1;
    noticeStatus.textContent = '';
  }, { signal });
  noticeDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeNoticeDialog();
  }, { signal });
  doc.defaultView?.addEventListener(WORKSPACE_STATE_EVENT, (event) => {
    if (event.detail?.scope === 'shell') refreshLessonTimes();
  }, { signal });
  form.addEventListener('submit', showSuggestions, { signal });
  updateIservLink();
  refreshLessonTimes();

  return () => {
    controller.abort();
    closeDateCalendar();
    periodEditor.hidden = true;
    updatePeriodTriggers();
    if (noticeDialog.open) closeNoticeDialog();
  };
}
